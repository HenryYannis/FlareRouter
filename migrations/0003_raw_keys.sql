-- FlareRouter 迁移 0003：api_keys 增加 raw_key 存储明文，自用方便随时查看与复制
ALTER TABLE api_keys ADD COLUMN raw_key TEXT;
