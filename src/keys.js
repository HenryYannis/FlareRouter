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
    try {
      row = await env.DB.prepare('SELECT id, name, revoked, quota_limit, quota_used FROM api_keys WHERE key_hash = ?').bind(hash).first();
    } catch (e) {
      if (/no column|no such column/i.test((e && e.message) || '')) {
        row = await env.DB.prepare('SELECT id, name, revoked FROM api_keys WHERE key_hash = ?').bind(hash).first();
      } else {
        throw e;
      }
    }
    authCache.set(hash, { key: row || null, at: now });
  }
  if (!row || row.revoked) return null;
  const quotaLimit = Number(row.quota_limit) || 0;
  const quotaUsed = Number(row.quota_used) || 0;
  if (quotaLimit > 0 && quotaUsed >= quotaLimit) {
    return { id: row.id, name: row.name, quotaExceeded: true, quotaUsed, quotaLimit };
  }
  // 异步更新最近使用时间，不拖慢请求
  if (ctx && ctx.waitUntil) ctx.waitUntil(
    env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, row.id).run().catch(() => {})
  );
  return { id: row.id, name: row.name };
}

export async function listKeys(env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, name, preview, raw_key, created_at, last_used_at, revoked, quota_limit, quota_used FROM api_keys ORDER BY created_at DESC'
    ).all();
    return results || [];
  } catch (e) {
    if (/no column|no such column/i.test((e && e.message) || '')) {
      try {
        const { results } = await env.DB.prepare(
          'SELECT id, name, preview, raw_key, created_at, last_used_at, revoked FROM api_keys ORDER BY created_at DESC'
        ).all();
        return results || [];
      } catch (e2) {
        const { results } = await env.DB.prepare(
          'SELECT id, name, preview, created_at, last_used_at, revoked FROM api_keys ORDER BY created_at DESC'
        ).all();
        return results || [];
      }
    }
    throw e;
  }
}

export async function createKey(env, name) {
  const key = `sk-gw-${randomHex(24)}`;
  const id = `key_${randomHex(6)}`;
  const hash = await sha256Hex(key);
  const preview = `${key.slice(0, 9)}…${key.slice(-4)}`;
  const now = Date.now();
  const nameVal = String(name || '未命名').slice(0, 60);
  try {
    await env.DB.prepare(
      'INSERT INTO api_keys (id, name, key_hash, preview, raw_key, created_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).bind(id, nameVal, hash, preview, key, now).run();
  } catch (e) {
    if (/no column|no such column/i.test((e && e.message) || '')) {
      await env.DB.prepare(
        'INSERT INTO api_keys (id, name, key_hash, preview, created_at, revoked) VALUES (?, ?, ?, ?, ?, 0)'
      ).bind(id, nameVal, hash, preview, now).run();
    } else {
      throw e;
    }
  }
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
  const key = `sk-gw-${randomHex(24)}`;
  const hash = await sha256Hex(key);
  const preview = `${key.slice(0, 9)}…${key.slice(-4)}`;
  try {
    const r = await env.DB.prepare(
      'UPDATE api_keys SET key_hash = ?, preview = ?, raw_key = ?, revoked = 0 WHERE id = ?'
    ).bind(hash, preview, key, id).run();
    if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
  } catch (e) {
    if (/no column|no such column/i.test((e && e.message) || '')) {
      const r = await env.DB.prepare(
        'UPDATE api_keys SET key_hash = ?, preview = ?, revoked = 0 WHERE id = ?'
      ).bind(hash, preview, id).run();
      if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
    } else {
      throw e;
    }
  }
  authCache.clear();
  return { id, key, raw_key: key, preview };
}

export async function setKeyQuota(env, id, { quotaLimit, resetUsed } = {}) {
  if (!id) throw new Error('缺少密钥 id');
  const limit = Math.max(0, parseInt(quotaLimit, 10) || 0);
  try {
    if (resetUsed) {
      const r = await env.DB.prepare('UPDATE api_keys SET quota_limit = ?, quota_used = 0 WHERE id = ?').bind(limit, id).run();
      if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
    } else {
      const r = await env.DB.prepare('UPDATE api_keys SET quota_limit = ? WHERE id = ?').bind(limit, id).run();
      if (!r.meta || !r.meta.changes) throw new Error('密钥不存在');
    }
  } catch (e) {
    if (/no column|no such column/i.test((e && e.message) || '')) {
      throw new Error('请先执行数据库迁移 0005_key_quota.sql');
    }
    throw e;
  }
  authCache.clear();
  return { id, quotaLimit: limit, resetUsed: !!resetUsed };
}
