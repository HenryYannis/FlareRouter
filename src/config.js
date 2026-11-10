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
  // 隐私与脱敏设置
  privacy: {
    enabled: false,
    maskSecrets: true,
    maskIp: true,
    customWords: [],
  },
};

export function emptyConfig() {
  return { version: 1, providers: [], settings: { ...DEFAULT_SETTINGS } };
}

export function normalizeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : emptyConfig();
  cfg.version = 1;
  cfg.providers = Array.isArray(cfg.providers) ? cfg.providers.map(normalizeProvider).filter(Boolean) : [];
  cfg.settings = { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) };
  cfg.settings.privacy = {
    ...DEFAULT_SETTINGS.privacy,
    ...(cfg.settings.privacy || {}),
  };
  if (!Array.isArray(cfg.settings.privacy.customWords)) {
    cfg.settings.privacy.customWords = [];
  }
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

export function normalizeConsoleUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-zA-Z0-9_-]+:/.test(u)) return '';
  return 'https://' + u;
}

export function normalizeProvider(p) {
  if (!p || typeof p !== 'object') return null;
  const id = String(p.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(p.name || id).trim(),
    // 协议类型：openai（默认，OpenAI 兼容 /chat/completions）、anthropic（/v1/messages）或 responses（/v1/responses）
    protocol: ['anthropic', 'responses'].includes(p.protocol) ? p.protocol : 'openai',
    baseUrl: String(p.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(p.apiKey || ''),
    consoleUrl: normalizeConsoleUrl(p.consoleUrl),
    models: parseModels(p.models),
    enabled: p.enabled !== false,
    timeoutMs: Number(p.timeoutMs) > 0 ? Math.min(Number(p.timeoutMs), 300000) : 60000,
    // 流式请求时自动加 stream_options.include_usage（个别服务商不认可以关掉）
    streamUsage: p.streamUsage !== false,
    note: String(p.note || ''),
    // 隐私策略：inherit（跟随全局）、on（强制开启）、off（强制关闭）
    privacy: ['inherit', 'on', 'off'].includes(p.privacy) ? p.privacy : 'inherit',
    // 各模型的输出上限（从上游模型列表拉取时记下），OpenAI 入口转 Anthropic 上游且没传 max_tokens 时用
    modelLimits: parseModelLimits(p.modelLimits),
    // 各模型真实测试嗅探到的能力（tools, thinking, vision 等）
    modelCaps: parseModelCaps(p.modelCaps),
  };
}

export function parseModelCaps(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (k && Array.isArray(v)) {
      const list = v.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
      if (list.length) out[String(k)] = list;
    }
  }
  return out;
}

export function parseModelLimits(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Math.floor(Number(v));
    if (k && Number.isFinite(n) && n > 0) out[String(k)] = n;
  }
  return out;
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
