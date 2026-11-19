-- FlareRouter 迁移 0007：api_keys 增加 model_policy (all/allow/deny) 与 model_patterns (通配符或模型列表)
ALTER TABLE api_keys ADD COLUMN model_policy TEXT DEFAULT 'all';
ALTER TABLE api_keys ADD COLUMN model_patterns TEXT DEFAULT '';
