-- FlareRouter 迁移 0005：api_keys 增加 quota_limit (Token上限) 与 quota_used (已消耗Token)
ALTER TABLE api_keys ADD COLUMN quota_limit INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN quota_used INTEGER DEFAULT 0;

-- 自动根据历史 call_logs 初始化已有密钥的已用额度
UPDATE api_keys SET quota_used = (
  SELECT COALESCE(SUM(total_tokens), 0)
  FROM call_logs
  WHERE call_logs.key_id = api_keys.id
) WHERE quota_used = 0 OR quota_used IS NULL;
