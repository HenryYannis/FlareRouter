// 调用密钥：D1 表 api_keys 存储哈希、脱敏预览与明文（自用方便随时查看与复制）

import { randomHex, sha256Hex } from './util.js';

const AUTH_CACHE_TTL_MS = 30 * 1000;
const authCache = new Map(); // hash -> { key|null, at }

export function _resetKeyCache() {
  authCache.clear();
}

export async function verifyApiKey(env, ctx, token) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const hit = authCache.get(hash);
  let row;
  if (hit && now - hit.at < AUTH_CACHE_TTL_MS) {
    row = hit.key;
  } else {
    row = await env.DB.prepare('SELECT id, name, revoked, quota_limit, quota_used, model_policy, model_patterns FROM api_keys WHERE key_hash = ?').bind(hash).first();
    authCache.set(hash, { key: row || null, at: now });
  }
  if (!row || row.revoked) return null;
  const quotaLimit = Number(row.quota_limit) || 0;
  const quotaUsed = Number(row.quota_used) || 0;
  const modelPolicy = row.model_policy || 'all';
  const modelPatterns = row.model_patterns || '';
  if (quotaLimit > 0 && quotaUsed >= quotaLimit) {
    return { id: row.id, name: row.name, quotaExceeded: true, quotaUsed, quotaLimit, modelPolicy, modelPatterns };
  }
  // 异步更新最近使用时间，不拖慢请求
  if (ctx && ctx.waitUntil) ctx.waitUntil(
    env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, row.id).run().catch(() => {})
  );
  return { id: row.id, name: row.name, modelPolicy, modelPatterns };
}

export async function listKeys(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, preview, raw_key, created_at, last_used_at, revoked, quota_limit, quota_used, model_policy, model_patterns FROM api_keys ORDER BY created_at DESC'
  ).all();
  return results || [];
}

export async function createKey(env, name) {
  const key = `sk-fr-${randomHex(24)}`;
  const id = `key_${randomHex(6)}`;
  const hash = await sha256Hex(key);
  const preview = `${key.slice(0, 9)}…${key.slice(-4)}`;
  const now = Date.now();
  const nameVal = String(name || '未命名').slice(0, 60);
  await env.DB.prepare(
    'INSERT INTO api_keys (id, name, key_hash, preview, raw_key, created_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).bind(id, nameVal, hash, preview, key, now).run();
  authCache.clear();
  return { id, name: nameVal, key, raw_key: key, preview, created_at: now };
}

export async function renameKey(env, id, name) {
  const nameVal = String(name || '').trim().slice(0, 60);
  if (!id) throw new Error('缺少密钥 id');
  if (!nameVal) throw new Error('名称不能为空');
  const r = await env.DB.prepare('UPDATE api_keys SET name = ? WHERE id = ?').bind(nameVal, id).run();
  if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
  authCache.clear();
  return nameVal;
}

export async function revokeKey(env, id) {
  await env.DB.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?').bind(id).run();
  authCache.clear();
}

export async function deleteKey(env, id) {
  await env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
  authCache.clear();
}

export async function rotateKey(env, id) {
  if (!id) throw new Error('缺少密钥 id');
  const key = `sk-fr-${randomHex(24)}`;
  const hash = await sha256Hex(key);
  const preview = `${key.slice(0, 9)}…${key.slice(-4)}`;
  const r = await env.DB.prepare(
    'UPDATE api_keys SET key_hash = ?, preview = ?, raw_key = ?, revoked = 0 WHERE id = ?'
  ).bind(hash, preview, key, id).run();
  if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
  authCache.clear();
  return { id, key, raw_key: key, preview };
}

export async function setKeyQuota(env, id, { quotaLimit, resetUsed } = {}) {
  if (!id) throw new Error('缺少密钥 id');
  const limit = Math.max(0, parseInt(quotaLimit, 10) || 0);
  const sql = resetUsed
    ? 'UPDATE api_keys SET quota_limit = ?, quota_used = 0 WHERE id = ?'
    : 'UPDATE api_keys SET quota_limit = ? WHERE id = ?';
  const r = await env.DB.prepare(sql).bind(limit, id).run();
  if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
  authCache.clear();
  return { id, quotaLimit: limit, resetUsed: !!resetUsed };
}

export async function updateKeyConfig(env, id, { name, quotaLimit, resetUsed, modelPolicy, modelPatterns } = {}) {
  if (!id) throw new Error('缺少密钥 id');
  const nameVal = String(name || '').trim().slice(0, 60);
  if (!nameVal) throw new Error('名称不能为空');
  const limit = Math.max(0, parseInt(quotaLimit, 10) || 0);
  const policy = ['all', 'allow', 'deny'].includes(modelPolicy) ? modelPolicy : 'all';
  const patterns = String(modelPatterns || '').trim();

  const sql = resetUsed
    ? 'UPDATE api_keys SET name = ?, quota_limit = ?, quota_used = 0, model_policy = ?, model_patterns = ? WHERE id = ?'
    : 'UPDATE api_keys SET name = ?, quota_limit = ?, model_policy = ?, model_patterns = ? WHERE id = ?';
  const r = await env.DB.prepare(sql).bind(nameVal, limit, policy, patterns, id).run();
  if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
  authCache.clear();
  return { id, name: nameVal, quotaLimit: limit, resetUsed: !!resetUsed, modelPolicy: policy, modelPatterns: patterns };
}
