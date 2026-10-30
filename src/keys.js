// 调用密钥：D1 表 api_keys 只存 SHA-256 哈希与脱敏预览，明文只在生成时返回一次

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
    row = await env.DB.prepare('SELECT id, name, revoked FROM api_keys WHERE key_hash = ?').bind(hash).first();
    authCache.set(hash, { key: row || null, at: now });
  }
  if (!row || row.revoked) return null;
  // 异步更新最近使用时间，不拖慢请求
  ctx.waitUntil(
    env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, row.id).run().catch(() => {})
  );
  return { id: row.id, name: row.name };
}

export async function listKeys(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, preview, created_at, last_used_at, revoked FROM api_keys ORDER BY created_at DESC'
  ).all();
  return results || [];
}

export async function createKey(env, name) {
  const key = `sk-gw-${randomHex(24)}`;
  const id = `key_${randomHex(6)}`;
  const hash = await sha256Hex(key);
  const preview = `${key.slice(0, 9)}…${key.slice(-4)}`;
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO api_keys (id, name, key_hash, preview, created_at, revoked) VALUES (?, ?, ?, ?, ?, 0)'
  ).bind(id, String(name || '未命名').slice(0, 60), hash, preview, now).run();
  authCache.clear();
  return { id, name, key, preview, created_at: now };
}

export async function revokeKey(env, id) {
  await env.DB.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?').bind(id).run();
  authCache.clear();
}

export async function deleteKey(env, id) {
  await env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
  authCache.clear();
}
