// 转发 + 协议互转（OpenAI ⇄ Anthropic）+ 容灾切换 + 流式透传 + 调用日志

import { getConfig } from './config.js';
import { writeLog } from './logs.js';
import {
  anthropicErrorBody,
  anthropicHeaders,
  anthropicToOpenAIRequest,
  anthropicToOpenAIResponse,
  anthropicUrl,
  createStreamHandler,
  estimateAnthropicInputTokens,
  openAIToAnthropicRequest,
  openAIToAnthropicResponse,
  sanitizeAnthropicPayload,
  usageForLog,
} from './anthropic.js';
import { CORS_HEADERS, apiError, errText, estimateMessagesTokens, estimateTokens, json, readBodyLimited } from './util.js';

const ERROR_TEXT_LIMIT = 2000;

// 同时带 OpenAI（object/created/owned_by）和 Anthropic（type/display_name/created_at/has_more）字段，两种客户端都能读
export function listModels(cfg) {
  const now = Math.floor(Date.now() / 1000);
  const iso = new Date(now * 1000).toISOString();
  const item = (id, owner) => ({ id, object: 'model', type: 'model', display_name: id, created: now, created_at: iso, owned_by: owner });
  const data = [item('auto', 'gateway')];
  for (const p of cfg.providers) {
    if (!p.enabled) continue;
    for (const m of p.models) data.push(item(`${p.id}/${m}`, p.id));
  }
  return { object: 'list', data, has_more: false, first_id: data[0].id, last_id: data[data.length - 1].id };
}

function findProviderById(cfg, id) {
  const low = String(id || '').toLowerCase();
  return cfg.providers.find((p) => p.id.toLowerCase() === low) || null;
}

// 把「服务商 ID/模型」解析成 {provider, model}；前缀不是服务商 ID 时返回 null
export function parseScoped(cfg, scoped) {
  const s = String(scoped || '').trim();
  const i = s.indexOf('/');
  if (i <= 0) return null;
  const p = findProviderById(cfg, s.slice(0, i));
  if (!p) return null;
  return { provider: p, model: s.slice(i + 1) };
}

function defaultChain(cfg) {
  const chain = [];
  for (const p of cfg.providers) {
    if (p.enabled && p.models.length) chain.push({ provider: p, model: p.models[0] });
  }
  return chain;
}

function resolveChain(cfg) {
  const list = cfg.settings.fallbackChain || [];
  if (!list.length) return defaultChain(cfg);
  const out = [];
  for (const item of list) {
    const t = parseScoped(cfg, item);
    if (t && t.provider.enabled) out.push(t);
  }
  return out;
}

/**
 * 计算本次请求要依次尝试的目标
 * 返回 { targets: [{provider, model}], error?: {status, message} }
 */
export function resolveTargets(cfg, requestedModel, { allowFallback = true } = {}) {
  const req = String(requestedModel || '').trim();
  const fallbackOn = allowFallback && cfg.settings.fallbackEnabled !== false;
  let primary = [];

  if (!req || req.toLowerCase() === 'auto') {
    const chain = resolveChain(cfg);
    if (!chain.length) return { targets: [], error: { status: 503, message: '没有可用的服务商：请先在管理页添加并启用服务商、填写模型列表。' } };
    return { targets: fallbackOn ? chain : chain.slice(0, 1) };
  }

  const scoped = parseScoped(cfg, req);
  if (scoped) {
    if (!scoped.provider.enabled) {
      return { targets: [], error: { status: 400, message: `服务商「${scoped.provider.name}」(${scoped.provider.id}) 已停用` } };
    }
    if (!scoped.model) return { targets: [], error: { status: 400, message: `模型名为空：${req}` } };
    primary = [scoped];
  } else {
    const low = req.toLowerCase();
    for (const p of cfg.providers) {
      if (!p.enabled) continue;
      const hit = p.models.find((m) => m.toLowerCase() === low);
      if (hit) primary.push({ provider: p, model: hit });
    }
    if (!primary.length) {
      return {
        targets: [],
        error: { status: 404, message: `找不到模型「${req}」：请用「服务商 ID/模型」格式，或先把该模型加进某个已启用服务商的模型列表。可用列表见 GET /v1/models` },
      };
    }
  }

  const targets = [...primary];
  if (fallbackOn) {
    for (const t of resolveChain(cfg)) {
      if (!targets.some((x) => x.provider.id === t.provider.id && x.model === t.model)) targets.push(t);
    }
  }
  return { targets };
}

function lastUserText(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) return m.content.map((c) => (c && c.text) || '').join(' ');
    }
  }
  return null;
}

// 按入口协议返回错误体（message 保留原文）
export function protocolError(clientProtocol, message, status, type = 'invalid_request_error', extra = {}) {
  if (clientProtocol === 'anthropic') return json(anthropicErrorBody(message, status, extra), status, CORS_HEADERS);
  return apiError(message, status, type, extra);
}

const upstreamProtocolOf = (provider) => (provider.protocol === 'anthropic' ? 'anthropic' : 'openai');

function openAIUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/(chat\/completions|embeddings)$/, '')}/${endpoint}`;
}

/**
 * 为某个目标构造上游请求
 * 返回 { url, headers, payload, upstreamProtocol } 或 { skip: '原因' }
 */
function buildUpstream({ clientProtocol, endpoint, provider, model, body, request, stream }) {
  const upstreamProtocol = upstreamProtocolOf(provider);
  const version = request.headers.get('anthropic-version') || undefined;
  const beta = request.headers.get('anthropic-beta') || undefined;

  if (endpoint === 'embeddings') {
    if (upstreamProtocol === 'anthropic') return { skip: 'Anthropic 协议的服务商不支持 /embeddings，已跳过' };
    return {
      upstreamProtocol,
      url: openAIUrl(provider.baseUrl, 'embeddings'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}`, Accept: 'application/json' },
      payload: { ...body, model },
    };
  }

  if (clientProtocol === 'openai' && upstreamProtocol === 'openai') {
    const payload = { ...body, model };
    if (stream && provider.streamUsage && !payload.stream_options) payload.stream_options = { include_usage: true };
    return {
      upstreamProtocol,
      url: openAIUrl(provider.baseUrl, 'chat/completions'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}`, Accept: stream ? 'text/event-stream' : 'application/json' },
      payload,
    };
  }
  if (clientProtocol === 'anthropic' && upstreamProtocol === 'anthropic') {
    // 原样透传，只换 model；anthropic-version / anthropic-beta 沿用调用方的
    return {
      upstreamProtocol,
      url: anthropicUrl(provider.baseUrl, 'messages'),
      headers: anthropicHeaders(provider.apiKey, { version, beta, stream }),
      payload: sanitizeAnthropicPayload({ ...body, model }),
    };
  }
  if (clientProtocol === 'anthropic' && upstreamProtocol === 'openai') {
    return {
      upstreamProtocol,
      url: openAIUrl(provider.baseUrl, 'chat/completions'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}`, Accept: stream ? 'text/event-stream' : 'application/json' },
      payload: anthropicToOpenAIRequest(body, model, { stream, streamUsage: provider.streamUsage }),
    };
  }
  // openai 入口 → anthropic 上游
  return {
    upstreamProtocol,
    url: anthropicUrl(provider.baseUrl, 'messages'),
    headers: anthropicHeaders(provider.apiKey, { stream }),
    payload: openAIToAnthropicRequest(body, model, { stream, maxTokens: provider.modelLimits?.[model] }),
  };
}

function estimatePrompt(clientProtocol, body) {
  return clientProtocol === 'anthropic' ? estimateAnthropicInputTokens(body) : estimateMessagesTokens(body.messages);
}

function formatUpstreamErrorValue(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

// HTTP 200 但没有 choices/content/data、只有 error 时，视为失败（部分聚合上游会这样返回）
function upstreamErrorMessage(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.choices || parsed.content || parsed.data) return null;
  if (parsed.type === 'error' && parsed.error) return formatUpstreamErrorValue(parsed.error);
  if (parsed.error) return formatUpstreamErrorValue(parsed.error);
  return null;
}

/**
 * 处理 /v1/chat/completions、/v1/embeddings（OpenAI 入口）与 /v1/messages（Anthropic 入口）
 * endpoint: 'chat/completions' | 'embeddings' | 'messages'
 */
export async function handleProxy(request, env, ctx, { endpoint, caller }) {
  const t0 = Date.now();
  const clientProtocol = endpoint === 'messages' ? 'anthropic' : 'openai';
  const fail = (message, status, type) => protocolError(clientProtocol, message, status, type);
  const limited = await readBodyLimited(request, env);
  if (limited.tooLarge) return fail(`请求体过大（上限 ${limited.tooLarge} 字节）`, 413, 'invalid_request_error');
  if (limited.readError) return fail(`读取请求体失败：${errText(limited.readError)}`, 400, 'invalid_request_error');
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(limited.bytes));
  } catch (e) {
    return fail(`请求体不是合法 JSON：${errText(e)}`, 400, 'invalid_request_error');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('请求体必须是 JSON 对象', 400, 'invalid_request_error');

  const cfg = await getConfig(env);
  const noFallback = /^(0|off|false|no)$/i.test(request.headers.get('x-gateway-fallback') || '');
  const { targets, error } = resolveTargets(cfg, body.model, { allowFallback: !noFallback });
  const isChat = endpoint !== 'embeddings';
  const stream = isChat && body.stream === true;
  const includeUsage = !!(body.stream_options && body.stream_options.include_usage);

  const baseLog = {
    ts: t0,
    keyId: caller && caller.id,
    keyName: caller && caller.name,
    endpoint,
    clientProtocol,
    requestedModel: body.model || 'auto',
    stream,
    prompt: cfg.settings.logPrompts ? (isChat ? lastUserText(body.messages) : JSON.stringify(body.input || '')) : null,
  };

  if (error) {
    writeLog(env, ctx, { ...baseLog, status: error.status, latencyMs: Date.now() - t0, error: error.message, attempts: 0 });
    return fail(error.message, error.status, 'invalid_request_error');
  }

  const trail = [];
  let lastStatus = 502;

  for (let i = 0; i < targets.length; i++) {
    const { provider, model } = targets[i];
    const tA = Date.now();
    const upProto = upstreamProtocolOf(provider);
    const fail1 = (status, msg) => trail.push({ provider: provider.id, providerName: provider.name, model, protocol: upProto, status, error: msg, ms: Date.now() - tA });

    if (!provider.baseUrl) { fail1(0, '服务商未填写 Base URL'); continue; }
    const up = buildUpstream({ clientProtocol, endpoint, provider, model, body, request, stream });
    if (up.skip) { fail1(0, up.skip); continue; }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    let res;
    try {
      res = await fetch(up.url, { method: 'POST', headers: up.headers, body: JSON.stringify(up.payload), signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      fail1(0, `${errText(e)}（${up.url}）`);
      lastStatus = 502;
      continue;
    }
    // 拿到响应头即停止超时计时（流式回答可以很长）
    clearTimeout(timer);

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch (e) { text = `读取错误响应失败：${errText(e)}`; }
      fail1(res.status, `HTTP ${res.status} ${res.statusText || ''} ${text}`.trim().slice(0, ERROR_TEXT_LIMIT));
      lastStatus = res.status;
      continue;
    }

    const isFallback = i > 0;
    const gwHeaders = {
      'x-gateway-provider': provider.id,
      'x-gateway-model': model,
      'x-gateway-fallback': isFallback ? '1' : '0',
      'x-gateway-attempts': String(i + 1),
      'x-gateway-protocol': `${clientProtocol}->${up.upstreamProtocol}`,
    };
    const logCommon = {
      ...baseLog,
      upstreamProtocol: up.upstreamProtocol,
      providerId: provider.id,
      providerName: provider.name,
      model,
      fallback: isFallback,
      attempts: i + 1,
      trail,
    };

    let prefetchedText = null;
    if (stream) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const jsonNotSse = ct.includes('application/json') && !ct.includes('text/event-stream');
      if (!jsonNotSse) {
        const handler = createStreamHandler(clientProtocol, up.upstreamProtocol, { clientModel: body.model, includeUsage });
        return pipeStream(res, env, ctx, { t0, tA, handler, logCommon, gwHeaders, promptEstimate: () => estimatePrompt(clientProtocol, body) });
      }
      prefetchedText = await res.text();
      let peeked = null;
      try { peeked = JSON.parse(prefetchedText); } catch { /* 非 JSON 在下面当错误切换 */ }
      const streamErr = upstreamErrorMessage(peeked);
      if (streamErr || !peeked || typeof peeked !== 'object' || Array.isArray(peeked)) {
        const msg = streamErr
          ? `上游返回 HTTP 200 但正文是错误：${streamErr}`
          : `上游返回 200 但不是 SSE：${String(prefetchedText).slice(0, 1000)}`;
        fail1(502, msg.slice(0, ERROR_TEXT_LIMIT));
        lastStatus = 502;
        continue;
      }
    }

    const text = prefetchedText != null ? prefetchedText : await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* 同协议时原样返回 */ }
    const bodyErr = upstreamErrorMessage(parsed);
    if (bodyErr) {
      fail1(502, `上游返回 HTTP 200 但正文是错误：${bodyErr}`.slice(0, ERROR_TEXT_LIMIT));
      lastStatus = 502;
      continue;
    }
    let outText = text;
    let contentType = res.headers.get('content-type') || 'application/json; charset=utf-8';
    if (up.upstreamProtocol !== clientProtocol && endpoint !== 'embeddings') {
      if (!parsed || typeof parsed !== 'object') {
        // 上游已经以 200 处理过这次请求，再打下一跳会重复计费。直接把转换失败返回给客户端。
        const raw = `上游返回 200 但内容不是 JSON，无法转换协议：${text.slice(0, 1000)}`;
        fail1(502, raw.slice(0, ERROR_TEXT_LIMIT));
        const summary = trail.map((item, n) => `#${n + 1} ${item.providerName}/${item.model}：${item.error}`).join('\n');
        const message = `上游返回 200 但内容不是 JSON，已停止切换，避免对下一家重复请求。\n${summary}`;
        writeLog(env, ctx, {
          ...logCommon,
          status: 502,
          latencyMs: Date.now() - t0,
          ttfbMs: Date.now() - tA,
          error: message,
        });
        if (clientProtocol === 'anthropic') return json(anthropicErrorBody(message, 502, { attempts: trail }), 502, CORS_HEADERS);
        return json({ error: { message, type: 'upstream_error', attempts: trail } }, 502, CORS_HEADERS);
      }
      const converted = clientProtocol === 'anthropic' ? openAIToAnthropicResponse(parsed, body.model) : anthropicToOpenAIResponse(parsed, body.model);
      outText = JSON.stringify(converted);
      contentType = 'application/json; charset=utf-8';
    }

    let { promptTokens, completionTokens, cacheReadTokens } = usageForLog(up.upstreamProtocol, parsed && parsed.usage);
    let totalTokens = typeof promptTokens === 'number' && typeof completionTokens === 'number' ? promptTokens + completionTokens : parsed?.usage?.total_tokens;
    if (typeof totalTokens !== 'number' && isChat) {
      promptTokens = estimatePrompt(clientProtocol, body);
      const outStr = up.upstreamProtocol === 'anthropic'
        ? (parsed?.content || []).map((b) => b.text || '').join('')
        : parsed?.choices?.[0]?.message?.content || '';
      completionTokens = estimateTokens(outStr);
      totalTokens = promptTokens + completionTokens;
      cacheReadTokens = undefined; // 估算补全没有缓存信息
    }
    writeLog(env, ctx, {
      ...logCommon,
      status: res.status,
      latencyMs: Date.now() - t0,
      ttfbMs: Date.now() - tA,
      promptTokens,
      completionTokens,
      totalTokens,
      cacheReadTokens,
    });
    return new Response(outText, { status: res.status, headers: { 'Content-Type': contentType, ...CORS_HEADERS, ...gwHeaders } });
  }

  // 全部失败：把每一次尝试的原始错误都返回
  const summary = trail.map((t, i) => `#${i + 1} ${t.providerName}/${t.model}：${t.error}`).join('\n');
  const message = `全部 ${trail.length} 个候选均失败。\n${summary}`;
  const status = lastStatus >= 400 ? lastStatus : 502;
  const last = targets[targets.length - 1];
  writeLog(env, ctx, {
    ...baseLog,
    upstreamProtocol: last ? upstreamProtocolOf(last.provider) : null,
    providerId: last?.provider.id,
    providerName: last?.provider.name,
    model: last?.model,
    status,
    latencyMs: Date.now() - t0,
    fallback: targets.length > 1,
    attempts: trail.length,
    trail,
    error: message,
  });
  if (clientProtocol === 'anthropic') return json(anthropicErrorBody(message, status, { attempts: trail }), status, CORS_HEADERS);
  return json({ error: { message, type: 'upstream_error', attempts: trail } }, status, CORS_HEADERS);
}

/**
 * /v1/messages/count_tokens：anthropic 上游直接转发；openai 上游返回本地估算
 * 不写调用日志（Claude Code 会频繁调用）
 */
export async function handleCountTokens(request, env) {
  const limited = await readBodyLimited(request, env);
  if (limited.tooLarge) return protocolError('anthropic', `请求体过大（上限 ${limited.tooLarge} 字节）`, 413);
  if (limited.readError) return protocolError('anthropic', `读取请求体失败：${errText(limited.readError)}`, 400);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(limited.bytes)); } catch (e) { return protocolError('anthropic', `请求体不是合法 JSON：${errText(e)}`, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return protocolError('anthropic', '请求体必须是 JSON 对象', 400);
  const cfg = await getConfig(env);
  const noFallback = /^(0|off|false|no)$/i.test(request.headers.get('x-gateway-fallback') || '');
  const { targets, error } = resolveTargets(cfg, body.model, { allowFallback: !noFallback });
  if (error) return protocolError('anthropic', error.message, error.status);
  const trail = [];
  for (let i = 0; i < targets.length; i++) {
    const { provider, model } = targets[i];
    if (upstreamProtocolOf(provider) === 'openai') {
      // 只有主目标就是 OpenAI 时才本地估算。容灾链里的 OpenAI 不能挡住后面的 Anthropic。
      if (i === 0) {
        return json({ input_tokens: estimateAnthropicInputTokens(body) }, 200, { ...CORS_HEADERS, 'x-gateway-provider': provider.id, 'x-gateway-estimated': '1' });
      }
      trail.push({ provider: provider.id, model, status: 0, error: 'count_tokens 仅在主目标是 OpenAI 兼容上游时做本地估算，已跳过' });
      continue;
    }
    const url = anthropicUrl(provider.baseUrl, 'messages/count_tokens');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: anthropicHeaders(provider.apiKey, { version: request.headers.get('anthropic-version'), beta: request.headers.get('anthropic-beta') }),
        body: JSON.stringify({ ...body, model }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      if (res.ok) {
        return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, 'x-gateway-provider': provider.id } });
      }
      trail.push({ provider: provider.id, model, status: res.status, error: `HTTP ${res.status} ${text}`.slice(0, ERROR_TEXT_LIMIT) });
    } catch (e) {
      clearTimeout(timer);
      trail.push({ provider: provider.id, model, status: 0, error: `${errText(e)}（${url}）` });
    }
  }
  const message = `count_tokens 全部 ${trail.length} 个候选均失败。\n${trail.map((t, i) => `#${i + 1} ${t.provider}/${t.model}：${t.error}`).join('\n')}`;
  const st = trail.length ? trail[trail.length - 1].status : 502;
  return json(anthropicErrorBody(message, st >= 400 ? st : 502, { attempts: trail }), st >= 400 ? st : 502, CORS_HEADERS);
}

function pipeStream(res, env, ctx, { t0, tA, handler, logCommon, gwHeaders, promptEstimate }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const ttfb = Date.now() - tA;

  const pump = (async () => {
    let buf = '';
    let curEvent = '';
    let streamError = null;
    let clientGone = false;
    const emit = async (s) => {
      if (!s || clientGone) return;
      try { await writer.write(encoder.encode(s)); } catch { clientGone = true; }
    };
    // 逐行解析 SSE：记住最近的 event: 行，每个 data: 行触发一次
    const handleLine = (line) => {
      const s = line.replace(/\r$/, '');
      if (!s) { curEvent = ''; return ''; }
      if (s.startsWith('event:')) { curEvent = s.slice(6).trim(); return ''; }
      if (!s.startsWith('data:')) return '';
      return handler.onEvent(curEvent, s.slice(5).trim()) || '';
    };
    try {
      await emit(handler.start());
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (handler.raw && !clientGone) {
          try { await writer.write(value); } catch { clientGone = true; }
        }
        buf += decoder.decode(value, { stream: true });
        let idx;
        let out = '';
        while ((idx = buf.indexOf('\n')) >= 0) {
          out += handleLine(buf.slice(0, idx));
          buf = buf.slice(idx + 1);
        }
        if (!handler.raw) await emit(out);
        if (clientGone) break;
      }
      if (buf) { const out = handleLine(buf); if (!handler.raw) await emit(out); }
      if (!handler.raw) await emit(handler.finish(null));
    } catch (e) {
      streamError = `流读取中断：${errText(e)}`;
      if (!handler.raw) await emit(handler.finish(streamError));
    } finally {
      try { await writer.close(); } catch { /* 客户端已断开 */ }
      if (clientGone) { try { await reader.cancel(); } catch { /* ignore */ } }
    }
    const st = handler.stats;
    let promptTokens = st.promptTokens;
    let completionTokens = st.completionTokens;
    let cacheReadTokens = st.cacheReadTokens;
    if (typeof promptTokens !== 'number') { promptTokens = promptEstimate(); cacheReadTokens = undefined; }
    if (typeof completionTokens !== 'number') completionTokens = estimateTokens(st.outText);
    await writeLog(env, ctx, {
      ...logCommon,
      status: st.error ? 502 : res.status,
      latencyMs: Date.now() - t0,
      ttfbMs: ttfb,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cacheReadTokens,
      error: streamError || st.error || (clientGone ? '客户端提前断开' : null),
    });
  })();
  ctx.waitUntil(pump);

  return new Response(readable, {
    status: res.status,
    headers: {
      'Content-Type': handler.raw ? res.headers.get('content-type') || 'text/event-stream; charset=utf-8' : 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
      ...gwHeaders,
    },
  });
}
