# FlareRouter

English | [中文](README.md)

A personal AI gateway on a single Cloudflare Worker. It serves both an OpenAI-compatible API and the Anthropic Messages API, puts all your providers behind one URL and one key, and fails over to the next provider when one fails.
Built for one person: no user accounts, billing or quotas, no build step, and the admin page is a single HTML file (Chinese UI, light/dark mode).

## Features

- **Providers**: name, ID, protocol (OpenAI-compatible or Anthropic), base URL, API key (shown masked), model list (can be pulled from the provider's `/models`), enabled, order, timeout
- **OpenAI-compatible API**: `/v1/chat/completions` (SSE streaming passed through), `/v1/embeddings`, `/v1/models`
- **Anthropic API**: `/v1/messages` (with streaming) and `/v1/messages/count_tokens`; works with Claude Code
- **Protocol conversion**: either entry point can call either kind of provider; requests, responses, stream events and tool calls are converted
- **Model addressing**: `providerId/model` (e.g. `openrouter/google/gemini-2.5-pro`), a bare model name, or `auto` to walk the failover chain
- **Failover**: network error, timeout or any non-2xx moves to the next entry; streams switch only before the first byte; `x-gateway-fallback: off` disables it per request
- **Gateway keys**: `Authorization: Bearer` or `x-api-key`; create, revoke and delete in the admin page; D1 stores only SHA-256 hashes
- **Logs**: in D1, written with `ctx.waitUntil`; filter by status, failover, provider, key, model or error text; every failed attempt keeps the upstream's raw error
- **Admin page**: `/admin` on the same Worker, password sign-in

## Deploy (local Wrangler)

Needs Node.js 18+ and a Cloudflare account (the free plan works).

```bash
git clone https://github.com/HenryYannis/FlareRouter.git
cd FlareRouter
npm install
npx wrangler login

# 1. KV for provider config: put the returned id in wrangler.toml [[kv_namespaces]]
npx wrangler kv namespace create flarerouter-config

# 2. D1 for keys and logs: put the returned database_id in wrangler.toml [[d1_databases]]
npx wrangler d1 create flarerouter

# 3. Tables
npm run db:migrate

# 4. Admin password (typed interactively, never written to a file)
npx wrangler secret put ADMIN_PASSWORD

# 5. Deploy
npx wrangler deploy
```

It deploys to `https://flarerouter.<your-subdomain>.workers.dev`. To use your own domain, set `workers_dev = false` in `wrangler.toml` and uncomment `routes` with your hostname (the zone must be in the same Cloudflare account); `wrangler deploy` creates the DNS record and certificate.

Then open `https://your-host/admin`, sign in, add providers (leave the model list empty and saving pulls every model from the provider), arrange the failover chain, create a gateway key, and send a test message.

To update, pull and run `npx wrangler deploy`; run `npm run db:migrate` again when a new migration ships.

To deploy on every push, connect the repo's `main` branch under your Worker → Settings → Build in the Cloudflare dashboard, with the deploy command `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.

### Keep a private config and follow upstream (optional)

Keep a private repo that changes only `wrangler.toml` (your KV/D1 IDs and domain) and merges this repo's `main` on a schedule. For instant sync, set the secrets `DOWNSTREAM_REPO` and `DOWNSTREAM_TOKEN` on your fork; `.github/workflows/notify-downstream.yml` then sends a `repository_dispatch` of type `flarerouter-updated`. Without those secrets the step is skipped.

## Usage

```bash
export GATEWAY_KEY=sk-gw-...   # created in the admin page
curl https://ai.example.com/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"Hello"}]}'
```

In Cherry Studio, Chatbox, Cursor and similar clients: base URL `https://your-host/v1`, key `sk-gw-...`, model `providerId/model` or `auto`.

Response headers `x-gateway-provider`, `x-gateway-model`, `x-gateway-attempts`, `x-gateway-fallback` and `x-gateway-protocol` show which provider served the request.

### Claude Code

```bash
export ANTHROPIC_BASE_URL=https://your-host
export ANTHROPIC_AUTH_TOKEN=sk-gw-your-key
export ANTHROPIC_MODEL=anthropic/claude-sonnet-4-5          # providerId/model, or auto
export ANTHROPIC_DEFAULT_HAIKU_MODEL=anthropic/claude-haiku-4-5
claude
```

`anthropic` is the provider ID you chose in the admin page. The model can also point at an OpenAI-compatible provider (e.g. `openrouter/google/gemini-2.5-pro`) and the gateway converts the protocol.

## Development

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npx wrangler dev        # http://localhost:8787/admin
npm test                # Miniflare with fake OpenAI and Anthropic upstreams
npm run check           # wrangler deploy --dry-run
```

## Limits

- Only chat/completions, embeddings and messages are proxied; no image, audio or Workers AI binding. Anthropic providers are skipped for embeddings.
- Anthropic → OpenAI drops `thinking`, `cache_control`, `top_k`, server tools and citations.
- OpenAI → Anthropic defaults `max_tokens` to 8192, clamps `temperature` to 0–1, and drops `n`, `logprobs`, `response_format` and `seed`.
- `count_tokens` against an OpenAI-compatible upstream is an estimate.
- The timeout covers only the wait for response headers; streams are not time-limited.
- Provider config and key checks are cached for 30 seconds per Worker instance.

See the Chinese README for the full notes.

## Related

- [FlarePanel](https://github.com/HenryYannis/FlarePanel): one dashboard for all your Cloudflare Pages sites (comments, page views, user accounts, R2 files), also build-free and Cloudflare-only.

## License

[MIT](LICENSE) © 2026 Cheng Xiaobao
