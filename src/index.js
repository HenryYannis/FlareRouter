// FlareRouter 入口：单个 Cloudflare Worker 的个人 AI 网关
// MIT License © 2026 程小宝 (Cheng Xiaobao)

import { getConfig } from './config.js';
import { handleAdminApi } from './admin.js';
import { handleCountTokens, handleProxy, listModels, protocolError } from './gateway.js';
import { MEDIA_ENDPOINTS, handleMedia } from './media.js';
import { verifyApiKey } from './keys.js';
import { clearLogs } from './logs.js';
import ADMIN_HTML from './admin/index.html';
import ADMIN_CSS from './admin/style.css';
import ADMIN_APP from './admin/app.js';
import { CORS_HEADERS, apiError, errText, extractBearer, json } from './util.js';
import { APPLE_TOUCH_ICON_B64 } from './admin/apple-touch-icon.js';

function adminPage() {
  return ADMIN_HTML
    .replace('<!--INJECT_CSS-->', () => `<style>\n${ADMIN_CSS}\n</style>`)
    .replace('<!--INJECT_JS-->', () => `<script>\n${ADMIN_APP}\n</script>`);
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  let path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  if (path === '/apple-touch-icon.png' || path === '/apple-touch-icon-precomposed.png') {
    const bin = Uint8Array.from(atob(APPLE_TOUCH_ICON_B64), (c) => c.charCodeAt(0));
    return new Response(bin, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // ---- 管理页 ----
  if (path === '/admin' || path === '/') {
    if (request.method !== 'GET') return apiError('Method Not Allowed', 405);
    if (path === '/') return Response.redirect(new URL('/admin', url).toString(), 302);
    return new Response(adminPage(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (path.startsWith('/admin/api/')) return handleAdminApi(request, env, ctx, path);

  // ---- OpenAI 兼容接口 + Anthropic Messages 接口 ----
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (path === '/health' || path === '/v1') return json({ status: 'ok', name: 'flarerouter' }, 200, CORS_HEADERS);

  const isModels = path === '/v1/models';
  const isChat = path === '/v1/chat/completions';
  const isEmb = path === '/v1/embeddings';
  const isMessages = path === '/v1/messages';
  const isCount = path === '/v1/messages/count_tokens';
  const mediaPath = path.startsWith('/v1/') ? path.slice(4) : '';
  const isMedia = Object.prototype.hasOwnProperty.call(MEDIA_ENDPOINTS, mediaPath);
  if (!isModels && !isChat && !isEmb && !isMessages && !isCount && !isMedia) {
    return protocolError(path.startsWith('/v1/messages') ? 'anthropic' : 'openai', `未知接口 ${request.method} ${url.pathname}`, 404);
  }
  const proto = isMessages || isCount ? 'anthropic' : 'openai';

  // 鉴权：Authorization: Bearer 或 x-api-key（Claude Code 等 Anthropic 客户端用 x-api-key）
  const caller = await verifyApiKey(env, ctx, extractBearer(request));
  if (!caller) {
    return protocolError(proto, '调用密钥无效或已吊销：请在请求头带 Authorization: Bearer sk-gw-... 或 x-api-key: sk-gw-...（在管理页生成）', 401, 'authentication_error');
  }
  if (caller.quotaExceeded) {
    return protocolError(
      proto,
      `调用密钥额度已耗尽（已消耗 ${caller.quotaUsed} Tokens，上限 ${caller.quotaLimit} Tokens）`,
      429,
      'insufficient_quota'
    );
  }

  if (isModels) {
    if (request.method !== 'GET') return apiError('Method Not Allowed', 405);
    return json(listModels(await getConfig(env)), 200, CORS_HEADERS);
  }
  if (request.method !== 'POST') return protocolError(proto, 'Method Not Allowed', 405);
  if (isCount) return handleCountTokens(request, env);
  if (isMedia) return handleMedia(request, env, ctx, { mediaPath, caller });
  return handleProxy(request, env, ctx, { endpoint: isMessages ? 'messages' : isChat ? 'chat/completions' : 'embeddings', caller });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      // 单用户工具：异常原文直接返回
      if (new URL(request.url).pathname.startsWith('/v1/messages')) {
        return protocolError('anthropic', `网关内部异常：${errText(e)}\n${(e && e.stack) || ''}`, 500);
      }
      return apiError(`网关内部异常：${errText(e)}\n${(e && e.stack) || ''}`, 500, 'gateway_internal_error');
    }
  },

  // 每日 Cron：按设置的保留天数清理旧日志
  async scheduled(event, env, ctx) {
    const cfg = await getConfig(env, { fresh: true });
    const days = cfg.settings.logRetentionDays;
    if (days > 0) ctx.waitUntil(clearLogs(env, Date.now() - days * 86400000));
  },
};
