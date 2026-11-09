-- FlareRouter 迁移 0007：call_logs 增加 redacted_items (脱敏明细 JSON)
ALTER TABLE call_logs ADD COLUMN redacted_items TEXT;
