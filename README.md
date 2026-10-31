# FlareRouter

简体中文 | [繁體中文](README.zh-Hant.md) | [English](README.en.md)

部署在单个 Cloudflare Worker 上的个人 AI 网关：同时提供 OpenAI 兼容接口和 Anthropic Messages 接口，把多家服务商收拢到一个地址、一把密钥，失败自动切换到下一家。

[![CI](https://github.com/HenryYannis/FlareRouter/actions/workflows/check.yml/badge.svg)](https://github.com/HenryYannis/FlareRouter/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![FlareRouter](docs/social-preview.png)

面向一个人自用：没有用户体系、计费和配额，零构建，管理页拆成 HTML/CSS/JS 后由入口注入成单页打进 Worker。错误信息一律原文返回、原文显示，不做隐藏。

## 功能

- **服务商管理**：名称、ID、协议类型（OpenAI 兼容 / Anthropic）、Base URL、API Key（页面只显示脱敏预览）、模型列表（可从服务商 `/models` 拉取勾选）、启用、顺序、超时
- **OpenAI 兼容接口**：`/v1/chat/completions`（流式 SSE 原样透传）、`/v1/embeddings`、`/v1/models`
- **Anthropic 接口**：`/v1/messages`（含流式）、`/v1/messages/count_tokens`，Claude Code 可直接接入
- **协议互转**：两种入口都能调两种协议的服务商，请求、响应、流式事件、工具调用自动转换
- **模型寻址**：`服务商ID/模型`，例如 `openrouter/google/gemini-2.5-pro`；也可只写模型名（在已启用服务商的模型列表里找，不区分大小写）；写 `auto` 按容灾链从头尝试
- **容灾切换**：失败（网络错误、超时、任何非 2xx）就按容灾链换下一个；流式请求只在上游开始返回之前切换；请求头 `x-gateway-fallback: off` 可单次关闭，设置里也可整体关闭
- **调用密钥**：`Authorization: Bearer`、`x-api-key` 或 `api-key` 鉴权；管理页可生成多个、随时查看明文、一键复制、吊销、删除；D1 存储明文与哈希
- **调用日志**：存 D1，`ctx.waitUntil` 异步写；可按状态、容灾、协议、服务商、密钥、模型、错误关键词筛选，可清空；失败的每次尝试都记录上游原始报错
- **管理页**：同一个 Worker 的 `/admin`，管理员密码登录；概览、服务商、容灾、调用密钥、日志、测试、设置；源码在 `src/admin/`（`index.html`、`style.css`、`app.js`）；支持简体/繁體/English 三语切换；日夜模式默认跟随系统（与 FlarePanel 一致），可手动切换，含星空与玻璃风格

## 部署

需要 Node.js 22+ 和一个 Cloudflare 账号（免费版即可）。

```bash
git clone https://github.com/HenryYannis/FlareRouter.git
cd FlareRouter
npm install
npx wrangler login

# 1. 创建 KV（服务商配置）：把输出的 id 填进 wrangler.toml 的 [[kv_namespaces]]
npx wrangler kv namespace create flarerouter-config

# 2. 创建 D1（调用密钥 + 日志）：把输出的 database_id 填进 wrangler.toml 的 [[d1_databases]]
npx wrangler d1 create flarerouter

# 3. 建表
npm run db:migrate

# 4. 设置管理员密码（交互输入，不会写进文件）
npx wrangler secret put ADMIN_PASSWORD

# 5. 部署
npx wrangler deploy
```

默认部署到 `https://flarerouter.<你的子域>.workers.dev`。想用自己的域名：在 `wrangler.toml` 里把 `workers_dev` 改成 `false`，取消 `routes` 的注释并填上域名（域名要在同一个 Cloudflare 账号下），`wrangler deploy` 会自动创建 DNS 记录和证书；该子域名已有 DNS 记录的话先删掉。

部署后打开 `https://你的地址/admin`，用管理员密码登录：

1. 「服务商」里添加服务商（Base URL 一般以 `/v1` 结尾）。模型列表留空直接保存会自动拉取并写入全部模型；也可点「从服务商拉取」再勾选，勾选随点随写入
2. 「容灾」里按顺序排好容灾链（留空则按服务商顺序取每家第一个模型）
3. 「调用密钥」里生成密钥，明文只显示一次
4. 「测试」里发一条试试，「日志」里看结果

以后更新代码只需要 `npx wrangler deploy`；有新的数据库迁移时再跑一次 `npm run db:migrate`（已执行过的迁移会自动跳过）。

想推送即部署：Cloudflare 面板 → Workers & Pages → 你的 Worker → 设置 → 构建，连接 GitHub 仓库的 `main`，部署命令填 `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`。

### 保留个人配置并跟随上游更新（可选）

想把自己的 KV/D1 ID、域名提交到 Git 又不想公开时，可以建一个私有仓库作为下游：

1. 私有仓库里只改 `wrangler.toml` 等个人配置，其余文件不动，用 `git merge` 合并本仓库的 `main`（不要 squash）
2. 在私有仓库加一个定时工作流：`git fetch` 本仓库 → `git merge upstream/main` → 无冲突就推送，有冲突就开 issue
3. 想上游一更新就立即同步：在你的 fork 设置 Secrets `DOWNSTREAM_REPO`（如 `you/flarerouter-private`）和 `DOWNSTREAM_TOKEN`（对下游有 Contents 读写权限的细粒度 PAT），`.github/workflows/notify-downstream.yml` 会发 `repository_dispatch`（类型 `flarerouter-updated`）；没配这两个 Secrets 时自动跳过

## 配置

### wrangler.toml

| 项 | 作用 |
| --- | --- |
| `[[kv_namespaces]]` `binding = "CONFIG"` | 服务商配置、设置、登录失败计数；`id` 换成自己创建的 KV ID |
| `[[d1_databases]]` `binding = "DB"` | 调用密钥、调用日志；`database_id` 换成自己创建的 D1 ID，表结构在 `migrations/` |
| `workers_dev` / `routes` | 用 workers.dev 子域还是自己的域名 |
| `[triggers] crons = ["0 19 * * *"]` | 每天 UTC 19:00 按「日志保留天数」清理旧日志 |
| `[observability]` | Workers 日志与可观测性，默认开启 |

### 机密与本地变量

唯一的机密是 `ADMIN_PASSWORD`（管理页登录密码）：

- 线上：`npx wrangler secret put ADMIN_PASSWORD`，不要写进 `wrangler.toml`
- 本地：`cp .dev.vars.example .dev.vars`，把 `ADMIN_PASSWORD=change-me` 改成自己的密码（`.dev.vars` 已在 `.gitignore`）

没设置 `ADMIN_PASSWORD` 时管理页无法登录。改密码会让所有旧会话失效。

### 管理页里的设置

服务商、容灾链和下面这些设置都存在 KV 里，在管理页修改：

- 容灾开关（默认开）
- 日志保留天数（默认 30，0 为永久）
- 是否记录消息原文（默认关，只记元数据）
- 每个服务商的超时（默认 60 秒，最长 300 秒）和流式时是否补 `stream_options.include_usage`（默认开）

「设置 → 备份」可以导出/导入配置（导出文件含上游 Key 明文，注意保管；导入会整体覆盖当前服务商与设置）。

## 调用示例

### OpenAI 兼容接口

```bash
# 列出模型
curl https://ai.example.com/v1/models \
  -H "Authorization: Bearer sk-gw-你的密钥"

# 非流式
curl https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-gw-你的密钥" \
  -H "Content-Type: application/json" \
  -d '{"model":"openrouter/google/gemini-2.5-pro","messages":[{"role":"user","content":"你好"}]}'

# 流式
curl -N https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-gw-你的密钥" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"写一句诗"}]}'

# 本次不容灾（失败直接返回上游原始错误）
curl https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-gw-你的密钥" \
  -H "x-gateway-fallback: off" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini/gemini-2.5-flash","messages":[{"role":"user","content":"hi"}]}'
```

在 Cherry Studio、Chatbox、Cursor 等客户端里：API 地址填 `https://ai.example.com/v1`，密钥填 `sk-gw-...`，模型填 `服务商ID/模型` 或 `auto`。

响应头会带上 `x-gateway-provider`、`x-gateway-model`、`x-gateway-attempts`、`x-gateway-fallback`、`x-gateway-protocol`，方便看这次实际走了哪家。
全部候选都失败时，HTTP 状态取最后一次上游的状态码（没有则 502），`error.message` 和 `error.attempts` 里有每一次尝试的原始报错。

`GET /health` 不需要密钥，返回 `{"status":"ok","name":"flarerouter"}`，可用于存活检查。

### Anthropic 接口

#### 添加 Anthropic 服务商

管理页「服务商 → 添加服务商」，协议类型选「Anthropic Messages」：

- Base URL：`https://api.anthropic.com`（带不带 `/v1` 都行）
- API Key：`sk-ant-...`（网关用 `x-api-key` 发给上游；`anthropic-version` 默认 `2023-06-01`，调用方带了就沿用调用方的）
- 「从服务商拉取」会请求上游 `/v1/models`

其它提供 Anthropic 兼容接口的服务商也可以按这个类型添加。

#### 两种入口 × 两种上游

| 入口 | 上游是 Anthropic | 上游是 OpenAI 兼容 |
| --- | --- | --- |
| `POST /v1/messages` | 原样透传（只换 model，`anthropic-version`、`anthropic-beta` 沿用调用方的） | 转成 chat/completions，响应和流式转回 Anthropic 事件 |
| `POST /v1/chat/completions` | 转成 Messages，响应和流式转回 OpenAI chunk | 原样透传 |

转换覆盖：system、多轮、图片（base64 / URL）、tools / tool_use / tool_result、tool_choice、stop_reason ⇄ finish_reason、usage（含缓存命中）。
容灾链对两种入口都生效，可以跨协议切换（例如 Claude 官方 529 过载 → 换到 OpenRouter 上的模型），流式开始返回后不再切换。
响应头 `x-gateway-protocol` 显示这次是 `入口->上游`，例如 `anthropic->openai`；日志里也记录入口协议和上游协议。

`/v1/messages/count_tokens`：上游是 Anthropic 时直接转发；上游是 OpenAI 兼容时返回本地估算（响应头 `x-gateway-estimated: 1`）。

错误按入口协议的格式返回（`/v1/messages` 返回 `{"type":"error","error":{...}}`），`message` 里保留上游原始报错。

```bash
curl https://ai.example.com/v1/messages \
  -H "x-api-key: sk-gw-你的密钥" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","max_tokens":256,"messages":[{"role":"user","content":"你好"}]}'
```

#### Claude Code 接入

```bash
export ANTHROPIC_BASE_URL=https://ai.example.com
export ANTHROPIC_AUTH_TOKEN=sk-gw-你的调用密钥
# 指定模型（Claude Code 默认会发 claude-sonnet-… 这类官方名，网关里找不到就会 404）
export ANTHROPIC_MODEL=anthropic/claude-sonnet-4-5                # 服务商ID/模型，或 auto
export ANTHROPIC_DEFAULT_HAIKU_MODEL=anthropic/claude-haiku-4-5   # 后台小任务用的快速模型
claude
```

也可以写进 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://ai.example.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-gw-你的调用密钥",
    "ANTHROPIC_MODEL": "anthropic/claude-sonnet-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "anthropic/claude-haiku-4-5"
  }
}
```

- 上面的 `anthropic` 是你在管理页给服务商起的 ID，换成自己的；模型也可以指向 OpenAI 兼容的服务商（如 `openrouter/google/gemini-2.5-pro`），网关会自动转协议。
- 用 `ANTHROPIC_API_KEY` 代替 `ANTHROPIC_AUTH_TOKEN` 也行（发的是 `x-api-key` 头），网关两种都认。
- 也可以不设 `ANTHROPIC_MODEL`，而是把 Claude Code 发出的官方模型名（如 `claude-sonnet-4-5`）直接写进某个服务商的模型列表，网关按模型名匹配。

## 本地开发与自测

```bash
cp .dev.vars.example .dev.vars          # 改成本地用的管理员密码
npm run db:migrate:local
npx wrangler dev                         # http://localhost:8787/admin

npm test                                 # Miniflare 自测（假 OpenAI + 假 Anthropic 上游）：鉴权、转发、协议互转、流式、容灾、日志、Cron 清理等
npm run check                            # wrangler deploy --dry-run
```

GitHub Actions（`.github/workflows/check.yml`）在每次 PR 和推送到 `main` 时运行：语法检查、`npm test`、`npm run check`、gitleaks 密钥扫描。

## 说明与限制

- 请求体除了 `model` 换成上游真实模型名，其余字段原样转发；流式请求默认补 `stream_options.include_usage`（某个服务商不认可在编辑里关掉）。
- 上游没返回 usage 时，token 数按字数粗略估算。
- 超时只计到上游返回响应头为止，之后的流式输出不限时长。
- 服务商配置在每个 Worker 实例里缓存 30 秒；调用密钥鉴权缓存 30 秒（吊销在别的实例最多 30 秒后生效）。
- 管理员登录：连续 10 次密码错误按 IP 锁定 15 分钟；会话 7 天，Cookie 为 HttpOnly + Secure + SameSite=Strict。
- 日志默认保留 30 天，每天 UTC 19:00 由 Cron 清理；默认不记录消息原文。
- 目前只转发 chat/completions、embeddings、messages，不含图片生成、语音识别等媒体接口，也不支持 Cloudflare Workers AI 绑定。Anthropic 协议的服务商不接 embeddings（容灾时自动跳过）。
- 协议互转的限制：
  - Anthropic → OpenAI：`thinking`（扩展思考）、`cache_control`、`top_k`、服务端工具（web_search 等）、引用（citations）会被丢弃；OpenAI 上游返回的 `reasoning_content` 不转成 thinking 块（避免下一轮带着无签名的 thinking 发回 Anthropic 报错）；PDF 文档转成 OpenAI `file` 片段，上游不支持时会报错。
  - OpenAI → Anthropic：没传 `max_tokens`（或 `max_completion_tokens`）时默认 8192；`temperature` 截到 0–1；`n`、`logprobs`、`response_format`、`seed` 等 Anthropic 没有的参数不转发；thinking 块转成 `reasoning_content`。
  - 跨协议时 `stop_sequence` 命中会报成普通结束（OpenAI 不区分）。
  - 工具的 JSON Schema 原样转发；个别 OpenAI 兼容服务商对 Schema 较挑剔（如不认 `$schema`、`format`），用 Claude Code 调这类上游时可能报 400，报错原文会直接显示。
- `/v1/messages/count_tokens` 不写调用日志；OpenAI 上游时是粗略估算。

## 相关项目

- [FlarePanel](https://github.com/HenryYannis/FlarePanel)：Cloudflare Pages 多站点管理后台，管理评论、浏览量、会员账号和 R2 文件，同样零构建、纯 Cloudflare 部署。

## 许可证

[MIT](LICENSE) © 2026 程小宝
