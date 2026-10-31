# FlareRouter

[简体中文](README.md) | [繁體中文](README.zh-Hant.md) | English

A personal AI gateway on a single Cloudflare Worker: it serves both an OpenAI-compatible API and the Anthropic Messages API, puts all your providers behind one URL and one key, and fails over to the next provider when one fails.

[![CI](https://github.com/HenryYannis/FlareRouter/actions/workflows/check.yml/badge.svg)](https://github.com/HenryYannis/FlareRouter/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![FlareRouter](docs/social-preview.png)

Built for one person: no user accounts, billing or quotas, no build step. The admin UI is HTML/CSS/JS injected into one page and bundled into the Worker. Errors are always returned and shown verbatim, never hidden.

## Features

- **Providers**: name, ID, protocol (OpenAI-compatible or Anthropic), base URL, API key (shown masked), model list (can be pulled from the provider's `/models` and ticked), enabled, order, timeout
- **OpenAI-compatible API**: `/v1/chat/completions` (SSE streaming passed through), `/v1/embeddings`, `/v1/models`; images and audio: `/v1/images/generations`, `/v1/images/edits`, `/v1/audio/transcriptions`, `/v1/audio/speech` (TTS; aligned with the FlarePanel console gateway plus speech synthesis; forwarded as-is to the provider that lists the model)
- **Anthropic API**: `/v1/messages` (with streaming) and `/v1/messages/count_tokens`; works with Claude Code
- **Protocol conversion**: either entry point can call either kind of provider; requests, responses, stream events and tool calls are converted
- **Model addressing**: `providerId/model` (e.g. `openrouter/google/gemini-2.5-pro`); a bare model name (looked up, case-insensitively, in the model lists of enabled providers); or `auto` to walk the failover chain from the top
- **Failover**: a network error, timeout or any non-2xx moves to the next entry in the chain; streams switch only before the upstream starts responding; the header `x-gateway-fallback: off` disables it for one request, and a setting disables it globally
- **Gateway keys**: authenticate with `Authorization: Bearer`, `x-api-key` or `api-key`; create several, view raw keys, copy anytime, revoke and delete in the admin page; D1 stores raw keys and hashes
- **Logs**: stored in D1, written asynchronously with `ctx.waitUntil`; filter by status, failover, protocol, provider, key, model or error text, and clear them; every failed attempt keeps the upstream's raw error
- **Admin page**: `/admin` on the same Worker, admin-password sign-in; tabs for overview, providers, failover, gateway keys, logs, test and settings; sources in `src/admin/` (`index.html`, `style.css`, `app.js`); supports Simplified Chinese, Traditional Chinese, and English; day/night theme follows the system like FlarePanel; Test supports multi-turn streaming, collapsible thinking, and Markdown (stored only in this browser)

## Deploy

Needs Node.js 22+ and a Cloudflare account (the free plan works).

```bash
git clone https://github.com/HenryYannis/FlareRouter.git
cd FlareRouter
npm install
npx wrangler login

# 1. KV for provider config: put the returned id in wrangler.toml [[kv_namespaces]]
npx wrangler kv namespace create flarerouter-config

# 2. D1 for gateway keys and logs: put the returned database_id in wrangler.toml [[d1_databases]]
npx wrangler d1 create flarerouter

# 3. Create the tables
npm run db:migrate

# 4. Admin password (typed interactively, never written to a file)
npx wrangler secret put ADMIN_PASSWORD

# 5. Deploy
npx wrangler deploy
```

It deploys to `https://flarerouter.<your-subdomain>.workers.dev`. To use your own domain, set `workers_dev = false` in `wrangler.toml` and uncomment `routes` with your hostname (the zone must be in the same Cloudflare account); `wrangler deploy` creates the DNS record and certificate. Delete any existing DNS record for that hostname first.

Then open `https://your-host/admin` and sign in with the admin password:

1. Under 服务商 (Providers), add providers (the base URL usually ends in `/v1`). You can save with an empty model list, then click 从服务商拉取 (pull from provider) and tick models; ticks are saved as you go
2. Under 容灾 (Failover), order the failover chain (if empty, the first model of each provider is used, in provider order)
3. Under 调用密钥 (Gateway keys), create a key; the plain text is shown only once
4. Use 测试 (Test) for multi-turn streaming chats (real proxy/failover/logging); check results under 日志 (Logs)

To update, run `npx wrangler deploy`; when a new migration ships, run `npm run db:migrate` again (migrations already applied are skipped).

To deploy on every push: Cloudflare dashboard → Workers & Pages → your Worker → Settings → Build, connect the repo's `main` branch, and use the deploy command `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.

### Keep a private config and follow upstream (optional)

To commit your own KV/D1 IDs and domain to Git without making them public, keep a private repo as a downstream:

1. In the private repo, change only personal config such as `wrangler.toml`, leave every other file alone, and `git merge` this repo's `main` (don't squash)
2. Add a scheduled workflow to the private repo: `git fetch` this repo → `git merge upstream/main` → push if there are no conflicts, open an issue if there are
3. For instant sync when upstream changes, set the secrets `DOWNSTREAM_REPO` (e.g. `you/flarerouter-private`) and `DOWNSTREAM_TOKEN` (a fine-grained PAT with Contents read/write on the downstream) on your fork; `.github/workflows/notify-downstream.yml` then sends a `repository_dispatch` of type `flarerouter-updated`. Without those two secrets the step is skipped

## Configuration

### wrangler.toml

| Setting | Purpose |
| --- | --- |
| `[[kv_namespaces]]` `binding = "CONFIG"` | Provider config, settings, failed-login counters; replace `id` with your KV ID |
| `[[d1_databases]]` `binding = "DB"` | Gateway keys and call logs; replace `database_id` with your D1 ID; schema in `migrations/` |
| `workers_dev` / `routes` | workers.dev subdomain or your own domain |
| `[triggers] crons = ["0 19 * * *"]` | Daily at 19:00 UTC, delete logs older than the retention setting |
| `[observability]` | Workers logs and observability, on by default |

### Secrets and local variables

The only secret is `ADMIN_PASSWORD` (the admin page password):

- Production: `npx wrangler secret put ADMIN_PASSWORD`; never put it in `wrangler.toml`
- Local: `cp .dev.vars.example .dev.vars` and change `ADMIN_PASSWORD=change-me` to your own password (`.dev.vars` is in `.gitignore`)

Without `ADMIN_PASSWORD` the admin page can't be signed in to. Changing it signs out every session.

### Settings in the admin page

Providers, the failover chain and these settings are stored in KV and edited in the admin page:

- Failover on/off (on by default)
- Log retention in days (default 30, 0 keeps logs forever)
- Whether to log message text (off by default; only metadata is logged)
- Per-provider timeout (default 60 seconds, at most 300) and whether to add `stream_options.include_usage` to streams (on by default)

设置 → 备份 (Settings → Backup) exports and imports the config. The export contains upstream keys in plain text, so keep it safe; an import replaces all current providers and settings.

## Usage

### OpenAI-compatible API

```bash
export GATEWAY_KEY=sk-gw-...   # a gateway key created in the admin page

# List models
curl https://ai.example.com/v1/models \
  -H "Authorization: Bearer $GATEWAY_KEY"

# Non-streaming
curl https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openrouter/google/gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}]}'

# Streaming
curl -N https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"Write a line of poetry"}]}'

# No failover for this request (a failure returns the upstream's raw error)
curl https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H "x-gateway-fallback: off" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini/gemini-2.5-flash","messages":[{"role":"user","content":"hi"}]}'
```

In Cherry Studio, Chatbox, Cursor and similar clients: base URL `https://ai.example.com/v1`, key `sk-gw-...`, model `providerId/model` or `auto`.

Response headers `x-gateway-provider`, `x-gateway-model`, `x-gateway-attempts`, `x-gateway-fallback` and `x-gateway-protocol` show which provider actually served the request.
When every candidate fails, the HTTP status is the last upstream's status (502 if there was none), and `error.message` and `error.attempts` carry the raw error of every attempt.

`GET /health` needs no key and returns `{"status":"ok","name":"flarerouter"}`, for uptime checks.

### Anthropic API

#### Add an Anthropic provider

In the admin page, 服务商 → 添加服务商 (Providers → Add provider), with protocol 「Anthropic Messages」:

- Base URL: `https://api.anthropic.com` (with or without `/v1`)
- API key: `sk-ant-...` (sent upstream as `x-api-key`; `anthropic-version` defaults to `2023-06-01`, or the caller's value when it sends one)
- 从服务商拉取 (pull from provider) requests the upstream's `/v1/models`

Other providers with an Anthropic-compatible API can be added the same way.

#### Two entry points × two upstreams

| Entry point | Anthropic upstream | OpenAI-compatible upstream |
| --- | --- | --- |
| `POST /v1/messages` | Passed through (only `model` is replaced; the caller's `anthropic-version` and `anthropic-beta` are kept) | Converted to chat/completions; responses and streams converted back to Anthropic events |
| `POST /v1/chat/completions` | Converted to Messages; responses and streams converted back to OpenAI chunks | Passed through |

Conversion covers: system, multi-turn, images (base64 / URL), tools / tool_use / tool_result, tool_choice, stop_reason ⇄ finish_reason, and usage (including cache hits).
The failover chain applies to both entry points and can cross protocols (e.g. an official Claude 529 overload → a model on OpenRouter); once a stream starts, it no longer switches.
The response header `x-gateway-protocol` shows `entry->upstream`, e.g. `anthropic->openai`; logs also record both protocols.

`/v1/messages/count_tokens`: forwarded when the upstream is Anthropic; a local estimate when it is OpenAI-compatible (response header `x-gateway-estimated: 1`).

Errors use the entry point's format (`/v1/messages` returns `{"type":"error","error":{...}}`), and `message` keeps the upstream's raw error.

```bash
curl https://ai.example.com/v1/messages \
  -H "x-api-key: $GATEWAY_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```

#### Claude Code

```bash
export ANTHROPIC_BASE_URL=https://ai.example.com
export ANTHROPIC_AUTH_TOKEN=sk-gw-your-gateway-key
# Set a model (Claude Code sends official names like claude-sonnet-…; if the gateway can't find one it returns 404)
export ANTHROPIC_MODEL=anthropic/claude-sonnet-4-5                # providerId/model, or auto
export ANTHROPIC_DEFAULT_HAIKU_MODEL=anthropic/claude-haiku-4-5   # fast model for background tasks
claude
```

Or put it in `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://ai.example.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-gw-your-gateway-key",
    "ANTHROPIC_MODEL": "anthropic/claude-sonnet-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "anthropic/claude-haiku-4-5"
  }
}
```

- `anthropic` above is the provider ID you chose in the admin page; use your own. The model can also point at an OpenAI-compatible provider (e.g. `openrouter/google/gemini-2.5-pro`) and the gateway converts the protocol.
- `ANTHROPIC_API_KEY` works in place of `ANTHROPIC_AUTH_TOKEN` (it sends an `x-api-key` header); the gateway accepts both.
- Instead of setting `ANTHROPIC_MODEL`, you can add the official model names Claude Code sends (e.g. `claude-sonnet-4-5`) to a provider's model list; the gateway matches by model name.

## Development

```bash
cp .dev.vars.example .dev.vars          # set a local admin password
npm run db:migrate:local
npx wrangler dev                         # http://localhost:8787/admin

npm test                                 # Miniflare tests (fake OpenAI + fake Anthropic upstreams): auth, proxying, protocol conversion, streaming, failover, logs, cron cleanup and more
npm run check                            # wrangler deploy --dry-run
```

GitHub Actions (`.github/workflows/check.yml`) runs on every pull request and every push to `main`: syntax check, `npm test`, `npm run check` and a gitleaks secret scan.

## Notes and limits

- Apart from `model` being replaced with the upstream's real model name, the request body is forwarded as is; streaming requests get `stream_options.include_usage` by default (turn it off in a provider's settings if that provider rejects it).
- When the upstream returns no usage, token counts are a rough estimate from the text length.
- The timeout covers only the wait for response headers; streamed output after that is not time-limited.
- Provider config is cached for 30 seconds per Worker instance, and gateway-key checks for 30 seconds (a revoked key may keep working on other instances for up to 30 seconds).
- Admin sign-in: 10 wrong passwords in a row lock that IP out for 15 minutes; sessions last 7 days, with an HttpOnly + Secure + SameSite=Strict cookie.
- Logs are kept for 30 days by default and cleaned up daily at 19:00 UTC by the cron trigger; message text is not logged by default.
- Image generation / edits, speech transcription and TTS use the same gateway keys as chat; they are forwarded as-is after resolving the provider by model (failover supported). Anthropic providers skip embeddings and media endpoints. Default body limit 25 MB and media timeout 120 s (override with `MAX_MEDIA_BYTES`, `MEDIA_TIMEOUT_MS`). No Cloudflare Workers AI binding.
- Protocol conversion limits:
  - Anthropic → OpenAI: `thinking` (extended thinking), `cache_control`, `top_k`, server tools (web_search etc.) and citations are dropped; `reasoning_content` from an OpenAI upstream is not turned into thinking blocks (so the next turn doesn't send unsigned thinking back to Anthropic and fail); PDF documents become OpenAI `file` parts, which fail on upstreams that don't support them.
  - OpenAI → Anthropic: `max_tokens` defaults to 8192 when neither `max_tokens` nor `max_completion_tokens` is sent; `temperature` is clamped to 0–1; parameters Anthropic lacks, such as `n`, `logprobs`, `response_format` and `seed`, are not forwarded; thinking blocks become `reasoning_content`.
  - Across protocols, a `stop_sequence` stop is reported as a normal stop (OpenAI doesn't distinguish them).
  - Tool JSON Schemas are forwarded as is; some OpenAI-compatible providers are strict about schemas (e.g. reject `$schema` or `format`), so Claude Code against such an upstream may get a 400, shown verbatim.
- `/v1/messages/count_tokens` is not logged; against an OpenAI upstream it is a rough estimate.

## Related

- [FlarePanel](https://github.com/HenryYannis/FlarePanel): one admin dashboard for several Cloudflare Pages sites (comments, page views, member accounts, R2 files), also build-free and Cloudflare-only.

## License

[MIT](LICENSE) © 2026 Henry Yannis
