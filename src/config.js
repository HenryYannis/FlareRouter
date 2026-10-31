// 网关配置：存 KV（键 CONFIG_KEY），内存短缓存

export const CONFIG_KEY = 'gateway_config_v1';
const CACHE_TTL_MS = 30 * 1000;

let cache = null;
let cacheAt = 0;

export const DEFAULT_SETTINGS = {
  // 请求的模型失败后，是否继续按「容灾链」尝试其它服务商/模型
  fallbackEnabled: true,
  // 容灾链：按顺序排列的「服务商 ID/模型」；为空时按服务商顺序取各家第一个模型
  fallbackChain: [],
  // 日志保留天数，0 = 永久保留（由每日 Cron 清理）
  logRetentionDays: 30,
  // 是否在日志里记录请求消息原文（默认关，只记元数据）
  logPrompts: false,
};

export function emptyConfig() {
  return { version: 1, providers: [], settings: { ...DEFAULT_SETTINGS } };
}

export function normalizeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : emptyConfig();
  cfg.version = 1;
  cfg.providers = Array.isArray(cfg.providers) ? cfg.providers.map(normalizeProvider).filter(Boolean) : [];
  cfg.settings = { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) };
  if (!Array.isArray(cfg.settings.fallbackChain)) cfg.settings.fallbackChain = [];
  return cfg;
}

export function parseModels(models) {
  const arr = Array.isArray(models) ? models : String(models || '').split(/[,\n]/);
  const out = [];
  for (const m of arr) {
    const s = String(m || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function normalizeProvider(p) {
  if (!p || typeof p !== 'object') return null;
  const id = String(p.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(p.name || id).trim(),
    // 协议类型：openai（默认，OpenAI 兼容 /chat/completions）或 anthropic（/v1/messages，x-api-key 鉴权）
    protocol: p.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: String(p.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(p.apiKey || ''),
    models: parseModels(p.models),
    enabled: p.enabled !== false,
    timeoutMs: Number(p.timeoutMs) > 0 ? Math.min(Number(p.timeoutMs), 300000) : 60000,
    // 流式请求时自动加 stream_options.include_usage（个别服务商不认可以关掉）
    streamUsage: p.streamUsage !== false,
    note: String(p.note || ''),
  };
}

export async function getConfig(env, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  const raw = await env.CONFIG.get(CONFIG_KEY, { type: 'json' });
  cache = normalizeConfig(raw);
  cacheAt = now;
  return cache;
}

export async function saveConfig(env, cfg) {
  const norm = normalizeConfig(cfg);
  await env.CONFIG.put(CONFIG_KEY, JSON.stringify(norm));
  cache = norm;
  cacheAt = Date.now();
  return norm;
}

export function _resetConfigCache() {
  cache = null;
  cacheAt = 0;
}
