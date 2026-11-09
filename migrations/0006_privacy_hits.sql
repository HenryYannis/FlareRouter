-- FlareRouter 迁移 0006：call_logs 增加 redacted_hits (隐私脱敏拦截词数)
ALTER TABLE call_logs ADD COLUMN redacted_hits INTEGER DEFAULT 0;
