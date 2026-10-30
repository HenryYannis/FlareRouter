-- FlareRouter：调用密钥与调用日志

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,   -- SHA-256(明文密钥)，明文不落库
  preview       TEXT NOT NULL,          -- 脱敏预览，如 sk-gw-ab12…9f3c
  created_at    INTEGER NOT NULL,       -- 毫秒时间戳
  last_used_at  INTEGER,
  revoked       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS call_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                 INTEGER NOT NULL,  -- 请求开始，毫秒时间戳
  key_id             TEXT,
  key_name           TEXT,
  endpoint           TEXT NOT NULL,     -- chat/completions | embeddings
  requested_model    TEXT,              -- 调用方传入的 model
  provider_id        TEXT,              -- 最终（或最后一次尝试）的服务商
  provider_name      TEXT,
  model              TEXT,              -- 实际发给上游的模型名
  stream             INTEGER NOT NULL DEFAULT 0,
  status             INTEGER NOT NULL,
  latency_ms         INTEGER,
  ttfb_ms            INTEGER,           -- 最终那次上游的首包耗时
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  total_tokens       INTEGER,
  fallback           INTEGER NOT NULL DEFAULT 0,
  attempts           INTEGER NOT NULL DEFAULT 1,
  trail              TEXT,              -- JSON：失败尝试列表（含上游原始报错）
  error              TEXT,              -- 最终错误原文
  prompt             TEXT               -- 仅在设置里开启「记录消息原文」时写入
);

CREATE INDEX IF NOT EXISTS idx_call_logs_ts ON call_logs (ts);
CREATE INDEX IF NOT EXISTS idx_call_logs_status_ts ON call_logs (status, ts);
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_ts ON call_logs (provider_id, ts);
CREATE INDEX IF NOT EXISTS idx_call_logs_key_ts ON call_logs (key_id, ts);
