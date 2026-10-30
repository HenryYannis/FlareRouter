# 安全策略 / Security Policy

## 报告漏洞 / Reporting a vulnerability

发现安全问题时，请**不要**公开提 Issue。请到仓库的 **Security → Report a vulnerability** 私下提交，我会尽快回复并修复。

Please **do not** open a public issue for security problems. Use **Security → Report a vulnerability** on this repository to report it privately. I'll reply and fix it as soon as possible.

请尽量附上 / Please include:

- 受影响的文件或接口 / the affected file or endpoint
- 复现步骤 / steps to reproduce
- 可能的影响 / the possible impact

## 支持的版本 / Supported versions

只维护最新版本（`main` 分支和最新 Release）。
Only the latest version (`main` and the latest release) receives fixes.

## 部署建议 / Deployment notes

- `ADMIN_PASSWORD` 用 `wrangler secret put` 设置，选一个足够长的随机密码；改密码会让所有旧会话失效。
  Set `ADMIN_PASSWORD` with `wrangler secret put` and use a long random password. Changing it signs out every session.
- 调用密钥（`sk-gw-...`）等同于你所有上游 Key 的使用权，只放在自己的设备上；泄露后在管理页吊销。
  A gateway key (`sk-gw-...`) can spend every upstream key you added. Keep it on your own devices and revoke it in the admin page if it leaks.
- 「设置 → 备份」导出的文件含上游 Key 明文，不要提交到任何仓库。
  The backup export contains upstream keys in plain text. Never commit it.
