// 管理接口：管理员密码登录（Worker secret ADMIN_PASSWORD），HMAC 签名的会话 Cookie

import { getConfig, saveConfig, normalizeProvider, parseModels } from './config.js';
import { createKey, deleteKey, listKeys, revokeKey } from './keys.js';
import { clearLogs, queryLogs, statsSummary } from './logs.js';
import { handleProxy, listModels } from './gateway.js';
import { anthropicHeaders, anthropicUrl } from './anthropic.js';
import { errText, json, maskKey, timingSafeEqualStr } from './util.js';

const COOKIE = 'gw_admin';
const SESSION_TTL_S = 7 * 24 * 3600;
const LOGIN_MAX_FAILS = 10;
const LOGIN_LOCK_S = 15 * 60;
const ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;

const err = (message, status = 400) => json({ error: message }, status);

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeSession(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  return `${exp}.${await hmacHex(env.ADMIN_PASSWORD, `admin-session:${exp}`)}`;
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const tok = readCookie(request, COOKIE);
  const [expStr, sig] = tok.split('.');
  const exp = parseInt(expStr, 10);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  const expect = await hmacHex(env.ADMIN_PASSWORD, `admin-session:${exp}`);
  return timingSafeEqualStr(sig, expect);
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function handleLogin(request, env) {
  if (!env.ADMIN_PASSWORD) return err('Worker 未设置 ADMIN_PASSWORD：请先执行 npx wrangler secret put ADMIN_PASSWORD', 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const failKey = `login_fail:${ip}`;
  const fails = parseInt((await env.CONFIG.get(failKey)) || '0', 10);
  if (fails >= LOGIN_MAX_FAILS) return err(`密码连续错误 ${fails} 次，已锁定 15 分钟（按 IP ${ip}）`, 429);
  let body = {};
  try { body = await request.json(); } catch { /* 空 */ }
  if (!timingSafeEqualStr(String(body.password || ''), env.ADMIN_PASSWORD)) {
    await env.CONFIG.put(failKey, String(fails + 1), { expirationTtl: LOGIN_LOCK_S });
    return err(`密码错误（剩余 ${LOGIN_MAX_FAILS - fails - 1} 次）`, 401);
  }
  if (fails) await env.CONFIG.delete(failKey);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(await makeSession(env), SESSION_TTL_S) });
}

function publicProvider(p) {
  const { apiKey, ...rest } = p;
  return { ...rest, hasKey: !!apiKey, apiKeyPreview: maskKey(apiKey) };
}

function publicConfig(cfg) {
  return { providers: cfg.providers.map(publicProvider), settings: cfg.settings };
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function fetchUpstreamModels(baseUrl, apiKey, protocol) {
  const isAnth = protocol === 'anthropic';
  const url = isAnth
    ? `${anthropicUrl(baseUrl, 'models')}?limit=1000`
    : `${String(baseUrl || '').replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '')}/models`;
  let res;
  try {
    const headers = isAnth ? anthropicHeaders(apiKey) : { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
    res = await fetch(url, { headers });
  } catch (e) {
    return { error: `${errText(e)}（${url}）` };
  }
  const text = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText || ''} ${text}`.slice(0, 3000) };
  try {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    const models = arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    return { models: [...new Set(models)].sort() };
  } catch (e) {
    return { error: `返回内容不是 JSON：${text.slice(0, 1000)}` };
  }
}

export async function handleAdminApi(request, env, ctx, path) {
  const method = request.method;
  if (path === '/admin/api/login' && method === 'POST') return handleLogin(request, env);
  if (path === '/admin/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
  if (!env.ADMIN_PASSWORD) return err('Worker 未设置 ADMIN_PASSWORD：请先执行 npx wrangler secret put ADMIN_PASSWORD', 503);
  if (!(await isAdmin(request, env))) return err('未登录或会话已过期', 401);
  // 防 CSRF：写操作必须带自定义头（跨站表单无法携带）
  if (method !== 'GET' && request.headers.get('X-Admin') !== '1') return err('缺少 X-Admin 请求头', 403);

  const url = new URL(request.url);

  if (path === '/admin/api/me' && method === 'GET') return json({ ok: true });

  // ---- 配置 / 服务商 ----
  if (path === '/admin/api/config' && method === 'GET') {
    const cfg = await getConfig(env, { fresh: true });
    return json({ ...publicConfig(cfg), models: listModels(cfg).data.map((m) => m.id) });
  }

  if (path === '/admin/api/providers' && method === 'POST') {
    const b = await readJson(request);
    const cfg = await getConfig(env, { fresh: true });
    const input = b.provider || {};
    const id = String(input.id || '').trim();
    if (!ID_RE.test(id)) return err('服务商 ID 只能用字母、数字、下划线、点、短横线，1–40 位，且不能含「/」');
    const originalId = String(b.originalId || '').trim();
    const idx = originalId ? cfg.providers.findIndex((p) => p.id === originalId) : -1;
    if (originalId && idx < 0) return err(`找不到原服务商 ${originalId}`, 404);
    const clash = cfg.providers.findIndex((p) => p.id.toLowerCase() === id.toLowerCase());
    if (clash >= 0 && clash !== idx) return err(`服务商 ID「${id}」已存在`);
    const old = idx >= 0 ? cfg.providers[idx] : null;
    let apiKey = old ? old.apiKey : '';
    if (b.clearKey) apiKey = '';
    else if (typeof input.apiKey === 'string' && input.apiKey.trim()) apiKey = input.apiKey.trim();
    const p = normalizeProvider({ ...(old || {}), ...input, id, apiKey });
    if (!p.baseUrl) return err('Base URL 不能为空');
    if (!/^https?:\/\//i.test(p.baseUrl)) return err('Base URL 需以 http:// 或 https:// 开头');
    if (idx >= 0) cfg.providers[idx] = p;
    else cfg.providers.push(p);
    if (old && old.id !== id) {
      cfg.settings.fallbackChain = cfg.settings.fallbackChain.map((s) => (s.startsWith(`${old.id}/`) ? `${id}/${s.slice(old.id.length + 1)}` : s));
    }
    const saved = await saveConfig(env, cfg);
    return json(publicConfig(saved));
  }

  if (path === '/admin/api/providers/delete' && method === 'POST') {
    const { id } = await readJson(request);
    const cfg = await getConfig(env, { fresh: true });
    cfg.providers = cfg.providers.filter((p) => p.id !== id);
    cfg.settings.fallbackChain = cfg.settings.fallbackChain.filter((s) => !s.startsWith(`${id}/`));
    return json(publicConfig(await saveConfig(env, cfg)));
  }

  if (path === '/admin/api/providers/toggle' && method === 'POST') {
    const { id, enabled } = await readJson(request);
    const cfg = await getConfig(env, { fresh: true });
    const p = cfg.providers.find((x) => x.id === id);
    if (!p) return err(`找不到服务商 ${id}`, 404);
    p.enabled = !!enabled;
    return json(publicConfig(await saveConfig(env, cfg)));
  }

  if (path === '/admin/api/providers/reorder' && method === 'POST') {
    const { ids } = await readJson(request);
    const cfg = await getConfig(env, { fresh: true });
    if (!Array.isArray(ids)) return err('ids 必须是数组');
    const map = new Map(cfg.providers.map((p) => [p.id, p]));
    const next = ids.map((i) => map.get(i)).filter(Boolean);
    for (const p of cfg.providers) if (!next.includes(p)) next.push(p);
    cfg.providers = next;
    return json(publicConfig(await saveConfig(env, cfg)));
  }

  if (path === '/admin/api/providers/fetch-models' && method === 'POST') {
    const b = await readJson(request);
    let { baseUrl, apiKey, protocol } = b;
    if (b.id && (!apiKey || !baseUrl || !protocol)) {
      const cfg = await getConfig(env, { fresh: true });
      const p = cfg.providers.find((x) => x.id === b.id);
      if (p) {
        apiKey = apiKey || p.apiKey;
        baseUrl = baseUrl || p.baseUrl;
        protocol = protocol || p.protocol;
      }
    }
    if (!baseUrl) return err('缺少 Base URL');
    const r = await fetchUpstreamModels(baseUrl, apiKey || '', protocol);
    return r.error ? err(r.error, 502) : json(r);
  }

  if (path === '/admin/api/settings' && method === 'POST') {
    const b = await readJson(request);
    const cfg = await getConfig(env, { fresh: true });
    const s = cfg.settings;
    if (typeof b.fallbackEnabled === 'boolean') s.fallbackEnabled = b.fallbackEnabled;
    if (typeof b.logPrompts === 'boolean') s.logPrompts = b.logPrompts;
    if (b.logRetentionDays !== undefined) s.logRetentionDays = Math.max(0, Math.min(3650, parseInt(b.logRetentionDays, 10) || 0));
    if (b.fallbackChain !== undefined) s.fallbackChain = parseModels(b.fallbackChain);
    return json(publicConfig(await saveConfig(env, cfg)));
  }

  // 导出完整配置（含上游明文 Key，只在用户点「导出」时）
  if (path === '/admin/api/export' && method === 'GET') {
    const cfg = await getConfig(env, { fresh: true });
    return new Response(JSON.stringify(cfg, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="ai-gateway-config.json"' },
    });
  }

  if (path === '/admin/api/import' && method === 'POST') {
    const b = await readJson(request);
    if (!b || !Array.isArray(b.providers)) return err('导入内容需包含 providers 数组');
    return json(publicConfig(await saveConfig(env, b)));
  }

  // ---- 测试调用（走同一条转发/容灾/日志链路）----
  if (path === '/admin/api/test' && method === 'POST') {
    const b = await readJson(request);
    const payload = {
      model: b.model || 'auto',
      stream: !!b.stream,
      messages: [{ role: 'user', content: String(b.prompt || '你好，用一句话介绍你自己。') }],
    };
    const headers = { 'Content-Type': 'application/json' };
    if (b.noFallback) headers['x-gateway-fallback'] = 'off';
    const req = new Request(new URL('/v1/chat/completions', request.url), { method: 'POST', headers, body: JSON.stringify(payload) });
    return handleProxy(req, env, ctx, { endpoint: 'chat/completions', caller: { id: 'admin', name: '管理页测试' } });
  }

  // ---- 调用密钥 ----
  if (path === '/admin/api/keys' && method === 'GET') return json({ items: await listKeys(env) });
  if (path === '/admin/api/keys' && method === 'POST') {
    const { name } = await readJson(request);
    return json(await createKey(env, String(name || '').trim() || '未命名'));
  }
  if (path === '/admin/api/keys/revoke' && method === 'POST') {
    const { id } = await readJson(request);
    await revokeKey(env, id);
    return json({ ok: true });
  }
  if (path === '/admin/api/keys/delete' && method === 'POST') {
    const { id } = await readJson(request);
    await deleteKey(env, id);
    return json({ ok: true });
  }

  // ---- 日志 ----
  if (path === '/admin/api/logs' && method === 'GET') {
    return json(await queryLogs(env, Object.fromEntries(url.searchParams)));
  }
  if (path === '/admin/api/logs/clear' && method === 'POST') {
    const { before } = await readJson(request);
    return json({ ok: true, deleted: await clearLogs(env, before) });
  }
  if (path === '/admin/api/stats' && method === 'GET') {
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days') || '1', 10) || 1));
    return json(await statsSummary(env, Date.now() - days * 86400000));
  }

  return err(`未知接口 ${method} ${path}`, 404);
}
