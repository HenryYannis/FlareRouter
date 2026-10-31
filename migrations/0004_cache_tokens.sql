-- Prompt Cache：上游返回的缓存读 Token（Anthropic cache_read / OpenAI cached_tokens）

ALTER TABLE call_logs ADD COLUMN cache_read_tokens INTEGER;
