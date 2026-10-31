// 图片 / 语音透传：对齐 FlarePanel 控制台网关，并补充 TTS
// POST /v1/images/generations、/v1/images/edits、/v1/audio/transcriptions、/v1/audio/speech
// 仅 OpenAI 兼容上游；按模型解析服务商后原样转发（支持容灾）

import { getConfig } from './config.js';
import { resolveTargets, protocolError } from './gateway.js';
import { writeLog } from './logs.js';
import { CORS_HEADERS, errText } from './util.js';

const ERROR_TEXT_LIMIT = 2000;
const DEFAULT_MEDIA_TIMEOUT_MS = 120000;
const DEFAULT_MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export const MEDIA_ENDPOINTS = {
  'images/generations': { multipart: false },
  'images/edits': { multipart: true },
  'audio/transcriptions': { multipart: true },
  // TTS：JSON 入、音频字节出
  'audio/speech': { multipart: false, binary: true },
};

function mediaTimeoutMs(env, provider) {
  const fromEnv = parseInt(env.MEDIA_TIMEOUT_MS || '', 10);
  const floor = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MEDIA_TIMEOUT_MS;
  return Math.max(provider.timeoutMs || 0, floor);
}

function maxMediaBytes(env) {
  const fromEnv = parseInt(env.MAX_MEDIA_BYTES || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_MEDIA_BYTES;
}

function openAIMediaUrl(baseUrl, endpoint) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|embeddings)$/, '');
  return `${base}/${endpoint}`;
}

// 在 multipart 原始字节里替换某个文本字段的值（按 latin1 逐字节映射，二进制内容不受影响）
function replaceMultipartField(bytes, name, value) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const utf8 = Array.from(new TextEncoder().encode(value), (b) => String.fromCharCode(b)).join('');
  const safeName = name.replace(/[^a-z0-9_]/gi, '');
  const re = new RegExp(`(Content-Disposition:\\s*form-data;\\s*name="${safeName}"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n)[^\\r\\n]*`, 'i');
  bin = bin.replace(re, (m, head) => head + utf8);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {string} mediaPath 如 'images/generations'
 */
export async function handleMedia(request, env, ctx, { mediaPath, caller }) {
  const t0 = Date.now();
  const spec = MEDIA_ENDPOINTS[mediaPath];
  if (!spec) return protocolError('openai', `未知媒体接口 ${mediaPath}`, 404);

  const maxBytes = maxMediaBytes(env);
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > maxBytes) return protocolError('openai', `请求体过大（上限 ${maxBytes} 字节）`, 413, 'invalid_request_error');

  const contentType = request.headers.get('Content-Type') || '';
  const isMultipart = contentType.toLowerCase().includes('multipart/form-data');
  if (spec.multipart && !isMultipart) {
    return protocolError('openai', '请求体须为 multipart/form-data', 400, 'invalid_request_error');
  }

  let jsonBody = null;
  let rawBytes = null;
  let requestedModel = '';
  try {
    if (isMultipart) {
      rawBytes = new Uint8Array(await request.arrayBuffer());
      if (rawBytes.length > maxBytes) {
        return protocolError('openai', `请求体过大（上限 ${maxBytes} 字节）`, 413, 'invalid_request_error');
      }
      const form = await new Response(rawBytes, { headers: { 'Content-Type': contentType } }).formData();
      requestedModel = String(form.get('model') || '').trim();
    } else {
      jsonBody = await request.json();
      if (!jsonBody || typeof jsonBody !== 'object' || Array.isArray(jsonBody)) {
        return protocolError('openai', '请求体必须是 JSON 对象', 400, 'invalid_request_error');
      }
      requestedModel = String(jsonBody.model || '').trim();
    }
  } catch (e) {
    return protocolError(
      'openai',
      spec.multipart ? `解析 multipart 失败：${errText(e)}` : `请求体不是合法 JSON：${errText(e)}`,
      400,
      'invalid_request_error'
    );
  }
  if (!requestedModel) return protocolError('openai', '缺少 model', 400, 'invalid_request_error');

  const cfg = await getConfig(env);
  const noFallback = /^(0|off|false|no)$/i.test(request.headers.get('x-gateway-fallback') || '');
  const { targets, error } = resolveTargets(cfg, requestedModel, { allowFallback: !noFallback });

  const baseLog = {
    ts: t0,
    keyId: caller && caller.id,
    keyName: caller && caller.name,
    endpoint: mediaPath,
    clientProtocol: 'openai',
    requestedModel,
    stream: false,
    prompt: null,
  };

  if (error) {
    writeLog(env, ctx, { ...baseLog, status: error.status, latencyMs: Date.now() - t0, error: error.message, attempts: 0 });
    return protocolError('openai', error.message, error.status, 'invalid_request_error');
  }

  const trail = [];
  let lastStatus = 502;

  for (let i = 0; i < targets.length; i++) {
    const { provider, model } = targets[i];
    const tA = Date.now();
    const fail1 = (status, msg) => trail.push({
      provider: provider.id, providerName: provider.name, model, protocol: 'openai', status, error: msg, ms: Date.now() - tA,
    });

    if (provider.protocol === 'anthropic') {
      fail1(0, 'Anthropic 协议的服务商不支持图片/语音接口，已跳过');
      continue;
    }
    if (!provider.baseUrl) {
      fail1(0, '服务商未填写 Base URL');
      continue;
    }

    const headers = { Authorization: `Bearer ${provider.apiKey}` };
    let body;
    if (rawBytes) {
      body = model === requestedModel ? rawBytes : replaceMultipartField(rawBytes, 'model', model);
      headers['Content-Type'] = contentType;
    } else {
      body = JSON.stringify({ ...jsonBody, model });
      headers['Content-Type'] = 'application/json';
    }

    const url = openAIMediaUrl(provider.baseUrl, mediaPath);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), mediaTimeoutMs(env, provider));
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      fail1(0, `${errText(e)}（${url}）`);
      lastStatus = 502;
      continue;
    }
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
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      'x-gateway-provider': provider.id,
      'x-gateway-model': model,
      'x-gateway-fallback': isFallback ? '1' : '0',
      'x-gateway-attempts': String(i + 1),
    };
    const logOk = (extra = {}) => writeLog(env, ctx, {
      ...baseLog,
      upstreamProtocol: 'openai',
      providerId: provider.id,
      providerName: provider.name,
      model,
      status: res.status,
      latencyMs: Date.now() - t0,
      ttfbMs: Date.now() - tA,
      fallback: isFallback,
      attempts: i + 1,
      trail,
      ...extra,
    });

    const upCt = res.headers.get('Content-Type') || '';
    const wantBinary = spec.binary || /^audio\//i.test(upCt) || /^application\/octet-stream/i.test(upCt);
    if (wantBinary) {
      const buf = await res.arrayBuffer();
      logOk();
      return new Response(buf, {
        status: res.status,
        headers: {
          'Content-Type': upCt || 'audio/mpeg',
          ...gwHeaders,
        },
      });
    }

    const text = await res.text();
    let usage = null;
    try { usage = JSON.parse(text).usage || null; } catch { /* 非 JSON 也原样返回 */ }
    const pt = usage?.prompt_tokens || usage?.input_tokens || null;
    const cpt = usage?.completion_tokens || usage?.output_tokens || null;
    const total = usage?.total_tokens ?? (typeof pt === 'number' && typeof cpt === 'number' ? pt + cpt : null);
    logOk({ promptTokens: pt, completionTokens: cpt, totalTokens: total });

    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': upCt || 'application/json; charset=utf-8',
        ...gwHeaders,
      },
    });
  }

  const summary = trail.map((t, i) => `#${i + 1} ${t.providerName}/${t.model}：${t.error}`).join('\n');
  const message = `全部 ${trail.length} 个候选均失败。\n${summary}`;
  const status = lastStatus >= 400 ? lastStatus : 502;
  const last = targets[targets.length - 1];
  writeLog(env, ctx, {
    ...baseLog,
    upstreamProtocol: 'openai',
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
  return protocolError('openai', message, status, 'upstream_error');
}
