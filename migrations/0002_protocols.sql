-- 协议互转：记录入口协议与上游协议（openai | anthropic）

ALTER TABLE call_logs ADD COLUMN client_protocol TEXT;
ALTER TABLE call_logs ADD COLUMN upstream_protocol TEXT;
