// 通用小工具

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, api-key, anthropic-version, anthropic-beta, x-gateway-fallback',
  'Access-Control-Max-Age': '86400',
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

// OpenAI 风格的错误体；message 保留原文，方便自己排查
export function apiError(message, status = 400, type = 'gateway_error', extra = {}) {
  return json({ error: { message, type, ...extra } }, status, CORS_HEADERS);
}

export function errText(e) {
  if (!e) return '未知错误';
  if (e.name === 'AbortError') return '请求超时（AbortError）';
  return `${e.name || 'Error'}: ${e.message || String(e)}`;
}

export function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 8) return k.slice(0, 2) + '****';
  return `${k.slice(0, 4)}****${k.slice(-4)}`;
}

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualStr(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function extractBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return (request.headers.get('x-api-key') || request.headers.get('api-key') || '').trim();
}

// 粗略估算 token（上游没返回 usage 时兜底）
export function estimateTokens(text = '') {
  const s = String(text || '');
  const cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  return Math.ceil(cn * 0.9 + (s.length - cn) * 0.3);
}

export function estimateMessagesTokens(messages = []) {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) {
    const c = m && m.content;
    if (typeof c === 'string') n += estimateTokens(c);
    else if (Array.isArray(c)) for (const part of c) if (part && typeof part.text === 'string') n += estimateTokens(part.text);
    n += 4;
  }
  return n;
}
