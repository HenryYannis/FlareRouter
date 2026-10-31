// 调用日志：D1 表 call_logs，写入一律走 ctx.waitUntil 异步

const MAX_TEXT = 4000;
const cut = (s, n = MAX_TEXT) => (s == null ? null : String(s).slice(0, n));

// 含 cache_read_tokens（0004）；缺列时退回 COLS_LEGACY
const COLS = `ts, key_id, key_name, endpoint, requested_model, provider_id, provider_name, model,
       stream, status, latency_ms, ttfb_ms, prompt_tokens, completion_tokens, total_tokens, cache_read_tokens,
       fallback, attempts, trail, error, prompt`;

const COLS_LEGACY = `ts, key_id, key_name, endpoint, requested_model, provider_id, provider_name, model,
       stream, status, latency_ms, ttfb_ms, prompt_tokens, completion_tokens, total_tokens,
       fallback, attempts, trail, error, prompt`;

const missingCol = (e) => /no column|no such column|has no column/i.test((e && e.message) || '');

export function writeLog(env, ctx, entry) {
  let p;
  try {
  const baseLegacy = [
    entry.ts,
    entry.keyId || null,
    entry.keyName || null,
    entry.endpoint || '',
    entry.requestedModel || null,
    entry.providerId || null,
    entry.providerName || null,
    entry.model || null,
    entry.stream ? 1 : 0,
    entry.status || 0,
    entry.latencyMs || 0,
    entry.ttfbMs ?? null,
    entry.promptTokens ?? null,
    entry.completionTokens ?? null,
    entry.totalTokens ?? null,
    entry.fallback ? 1 : 0,
    entry.attempts || 1,
    entry.trail && entry.trail.length ? cut(JSON.stringify(entry.trail), 8000) : null,
    cut(entry.error),
    cut(entry.prompt),
  ];
  // cache_read_tokens 插在 total_tokens 之后
  const base = [
    ...baseLegacy.slice(0, 15),
    entry.cacheReadTokens ?? null,
    ...baseLegacy.slice(15),
  ];
  const proto = [entry.clientProtocol || null, entry.upstreamProtocol || null];
  p = env.DB.prepare(`INSERT INTO call_logs (${COLS}, client_protocol, upstream_protocol) VALUES (${Array(23).fill('?').join(', ')})`)
    .bind(...base, ...proto)
    .run()
    .catch((e) => {
      if (!missingCol(e)) throw e;
      // 缺 cache_read_tokens：退回 0002 形态（协议列仍在）
      return env.DB.prepare(`INSERT INTO call_logs (${COLS_LEGACY}, client_protocol, upstream_protocol) VALUES (${Array(22).fill('?').join(', ')})`)
        .bind(...baseLegacy, ...proto)
        .run()
        .catch((e2) => {
          // 还没跑 0002（缺协议列）：再退回最旧 20 列
          if (!missingCol(e2)) throw e2;
          return env.DB.prepare(`INSERT INTO call_logs (${COLS_LEGACY}) VALUES (${Array(20).fill('?').join(', ')})`).bind(...baseLegacy).run();
        });
    })
    .catch((e) => console.error('写日志失败', e && e.message));
  ctx.waitUntil(p);
  } catch (e) {
    console.error('写日志失败', e && e.message);
    p = Promise.resolve();
  }
  return p;
}

const SORTABLE = new Set(['ts', 'latency_ms', 'total_tokens', 'status']);

function buildWhere(q) {
  const where = [];
  const args = [];
  if (q.status === 'ok') where.push('status >= 200 AND status < 300');
  if (q.status === 'fail') where.push('(status < 200 OR status >= 300)');
  if (q.fallback === '1') where.push('fallback = 1');
  if (q.protocol) { where.push('(client_protocol = ? OR upstream_protocol = ?)'); args.push(q.protocol, q.protocol); }
  if (q.provider) { where.push('provider_id = ?'); args.push(q.provider); }
  if (q.key) { where.push('key_id = ?'); args.push(q.key); }
  if (q.model) { where.push('(model LIKE ? OR requested_model LIKE ?)'); args.push(`%${q.model}%`, `%${q.model}%`); }
  if (q.q) { where.push('(error LIKE ? OR trail LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.from) { where.push('ts >= ?'); args.push(Number(q.from)); }
  if (q.to) { where.push('ts <= ?'); args.push(Number(q.to)); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

export async function queryLogs(env, q) {
  const limit = Math.min(Math.max(parseInt(q.limit || '50', 10) || 50, 1), 500);
  const offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);
  const sort = SORTABLE.has(q.sort) ? q.sort : 'ts';
  const { sql, args } = buildWhere(q);
  const rows = await env.DB.prepare(
    `SELECT * FROM call_logs ${sql} ORDER BY ${sort} DESC, id DESC LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM call_logs ${sql}`).bind(...args).first();
  return {
    total: total ? total.n : 0,
    limit,
    offset,
    items: (rows.results || []).map((r) => ({ ...r, trail: r.trail ? safeParse(r.trail) : [] })),
  };
}

export async function statsSummary(env, sinceTs) {
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN fallback = 1 THEN 1 ELSE 0 END) AS fallback,
              SUM(COALESCE(total_tokens, 0)) AS tokens,
              AVG(latency_ms) AS avg_latency,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(CASE WHEN cache_read_tokens IS NOT NULL THEN COALESCE(prompt_tokens, 0) ELSE 0 END) AS prompt_tokens_for_cache
         FROM call_logs WHERE ts >= ?`
    ).bind(sinceTs).first();
  } catch (e) {
    if (!missingCol(e)) throw e;
    row = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN fallback = 1 THEN 1 ELSE 0 END) AS fallback,
              SUM(COALESCE(total_tokens, 0)) AS tokens,
              AVG(latency_ms) AS avg_latency
         FROM call_logs WHERE ts >= ?`
    ).bind(sinceTs).first();
  }
  const byProvider = await env.DB.prepare(
    `SELECT provider_id, provider_name, COUNT(*) AS total,
            SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS ok,
            SUM(COALESCE(total_tokens, 0)) AS tokens
       FROM call_logs WHERE ts >= ? GROUP BY provider_id ORDER BY total DESC`
  ).bind(sinceTs).all();
  return { ...(row || {}), byProvider: byProvider.results || [] };
}

export async function clearLogs(env, beforeTs) {
  if (beforeTs) {
    const r = await env.DB.prepare('DELETE FROM call_logs WHERE ts < ?').bind(Number(beforeTs)).run();
    return r.meta ? r.meta.changes : null;
  }
  const r = await env.DB.prepare('DELETE FROM call_logs').run();
  return r.meta ? r.meta.changes : null;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return [{ raw: s }]; }
}
