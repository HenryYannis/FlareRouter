// 本地自测：Miniflare 跑 Worker + Node 起一个假的上游服务商
// 用法：npm test
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';

const ADMIN_PASSWORD = 'test-admin-pass';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); }
};

// ---------- 假上游 ----------
const seen = []; // 记录上游收到的请求
const upstream = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : null;
  seen.push({ path: req.url, auth: req.headers.authorization, xkey: req.headers['x-api-key'], ver: req.headers['anthropic-version'], beta: req.headers['anthropic-beta'], body });
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const lastText = () => {
    const m = (body && body.messages || []).filter((x) => x.role === 'user').at(-1);
    if (!m) return '';
    return typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join(' ');
  };
  const wantTool = () => body && Array.isArray(body.tools) && body.tools.length && /weather/.test(lastText());

  // ---- 假 Anthropic 上游 ----
  if (req.url === '/anth/v1/models?limit=1000') return send(200, { data: [{ id: 'claude-x', type: 'model', display_name: 'Claude X' }, { id: 'claude-y', type: 'model' }], has_more: false });
  if (req.url.startsWith('/anthbad/')) return send(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded upstream anth 原文' } });
  if (req.url === '/anth/v1/messages/count_tokens') return send(200, { input_tokens: 42 });
  if (req.url === '/anth/v1/messages') {
    const sse = (ev, o) => res.write(`event: ${ev}\ndata: ${JSON.stringify(o)}\n\n`);
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      sse('message_start', { type: 'message_start', message: { id: 'msg_up1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 21, output_tokens: 1 } } });
      sse('ping', { type: 'ping' });
      if (wantTool()) {
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '查一下' } });
        sse('content_block_stop', { type: 'content_block_stop', index: 0 });
        sse('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_s1', name: 'get_weather', input: {} } });
        for (const pj of ['{"ci', 'ty":"上', '海"}']) sse('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: pj } });
        sse('content_block_stop', { type: 'content_block_stop', index: 1 });
        sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 9 } });
      } else {
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        for (const p of ['克', '劳', '德']) {
          const line = `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } })}\n\n`;
          res.write(line.slice(0, 15)); await sleep(5); res.write(line.slice(15));
        }
        sse('content_block_stop', { type: 'content_block_stop', index: 0 });
        sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } });
      }
      sse('message_stop', { type: 'message_stop' });
      return res.end();
    }
    if (wantTool()) {
      return send(200, { id: 'msg_up2', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '好的' }, { type: 'tool_use', id: 'toolu_n1', name: 'get_weather', input: { city: '北京' } }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 30, output_tokens: 12 } });
    }
    return send(200, { id: 'msg_up3', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: `claude pong from ${body.model}` }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 11, output_tokens: 4, cache_read_input_tokens: 5 }, echo_beta: req.headers['anthropic-beta'] || null });
  }

  if (req.url === '/good/v1/models') return send(200, { data: [{ id: 'm1' }, { id: 'm2' }, { id: 'vendor/m3' }] });
  if (req.url.startsWith('/bad/')) return send(500, { error: { message: 'upstream exploded: quota of key sk-xxx exhausted' } });
  if (req.url.startsWith('/slow/')) { await sleep(3000); return send(200, {}); }
  if (req.url.startsWith('/brokenstream/')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"半"}}]}\n\n');
    setTimeout(() => res.destroy(), 50);
    return;
  }
  if (req.url === '/good/v1/embeddings') return send(200, { object: 'list', data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 3, total_tokens: 3 } });
  if (req.url === '/good/v1/chat/completions' && wantTool()) {
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      const chunks = [
        { choices: [{ delta: { role: 'assistant', content: '让我查' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_s1', type: 'function', function: { name: 'get_weather', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"杭州"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 } },
      ];
      for (const c of chunks) { res.write(`data: ${JSON.stringify(c)}\n\n`); await sleep(3); }
      return res.end('data: [DONE]\n\n');
    }
    return send(200, {
      id: 'tc1', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'call.n1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"广州"}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
    });
  }
  if (req.url === '/good/v1/chat/completions') {
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      const parts = ['你', '好', '，世界'];
      for (const p of parts) {
        // 故意把一行拆成两次写，验证跨 chunk 解析
        const line = `data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: p } }] })}\n\n`;
        res.write(line.slice(0, 10));
        await sleep(5);
        res.write(line.slice(10));
      }
      if (body.stream_options && body.stream_options.include_usage) {
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 } })}\n\n`);
      }
      res.end('data: [DONE]\n\n');
      return;
    }
    return send(200, {
      id: 'x', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: `pong from ${body.model}` } }],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      echo: { temperature: body.temperature, tools: body.tools, custom: body.custom_field },
    });
  }
  send(404, { error: { message: `mock: no route ${req.url}` } });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const UP = `http://127.0.0.1:${upstream.address().port}`;

// ---------- Worker ----------
const mf = new Miniflare({
  modules: true,
  scriptPath: 'src/index.js',
  modulesRules: [
    { type: 'Text', include: ['**/*.html', '**/*.css', '**/admin/app.js'] },
    { type: 'ESModule', include: ['**/*.js'] },
  ],
  compatibilityDate: '2026-03-15',
  kvNamespaces: ['CONFIG'],
  d1Databases: ['DB'],
  bindings: { ADMIN_PASSWORD },
});
const db = await mf.getD1Database('DB');
for (const f of readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) {
  const sql = readFileSync(`migrations/${f}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) await db.prepare(stmt).run();
}

const B = 'https://gateway.example.com';
const req = (path, init = {}) => mf.dispatchFetch(B + path, init);
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

try {
  // ---- 管理页与登录 ----
  let r = await req('/admin');
  let t = await r.text();
  ok(
    r.status === 200 &&
      t.includes('FlareRouter') &&
      t.includes('night-theme') &&
      t.includes('data-theme-toggle') &&
      t.includes('data-lang-select') &&
      t.includes('data-i18n') &&
      t.includes('var $$ = function') &&
      !/gradient/i.test(t),
    'GET /admin 返回管理页（主题、三语国际化、保留 var $$、无渐变）',
  );
  let rFavicon = await req('/favicon.ico');
  ok(rFavicon.status === 204, 'GET /favicon.ico -> 204');
  r = await req('/admin/api/config');
  ok(r.status === 401, '未登录访问管理接口 -> 401');
  r = await req('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  ok(r.status === 401 && (await j(r)).error.includes('密码错误'), '错误密码 -> 401');
  r = await req('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  const setCookie = r.headers.get('set-cookie') || '';
  ok(r.status === 200 && /HttpOnly/.test(setCookie) && /SameSite=Strict/.test(setCookie), '正确密码 -> 会话 Cookie');
  const cookie = setCookie.split(';')[0];
  const admin = (path, body, method) => req(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { Cookie: cookie, 'X-Admin': '1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  r = await req('/admin/api/providers', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  ok(r.status === 403, '写操作缺 X-Admin -> 403（防 CSRF）');
  r = await req('/admin/api/me', { headers: { Cookie: cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) } });
  ok(r.status === 401, '篡改的 Cookie -> 401');

  // ---- 服务商 ----
  const providers = [
    { id: 'good', name: '好服务商', baseUrl: `${UP}/good/v1`, apiKey: 'sk-good-secret-1234567890', models: 'm1, m2\nvendor/m3' },
    { id: 'bad', name: '坏服务商', baseUrl: `${UP}/bad/v1`, apiKey: 'sk-bad-secret-abcdefghij', models: 'x' },
    { id: 'slow', name: '慢服务商', baseUrl: `${UP}/slow/v1`, apiKey: 'sk-slow-secret-zzzzzzzzz', models: 'y', timeoutMs: 1000 },
    { id: 'off', name: '停用的', baseUrl: `${UP}/good/v1`, apiKey: 'sk-off', models: 'm1', enabled: false },
    { id: 'broken', name: '流中断', baseUrl: `${UP}/brokenstream/v1`, apiKey: 'k', models: 'z' },
  ];
  for (const p of providers) {
    r = await admin('/admin/api/providers', { provider: p });
    if (r.status !== 200) console.log(await r.text());
  }
  r = await admin('/admin/api/providers', { provider: { id: 'a/b', baseUrl: UP } });
  ok(r.status === 400, '服务商 ID 含「/」被拒');
  r = await admin('/admin/api/config');
  t = await r.text();
  let cfg = JSON.parse(t);
  ok(cfg.providers.length === 5 && !t.includes('sk-good-secret-1234567890') && cfg.providers[0].apiKeyPreview === 'sk-g****7890', '配置接口只返回脱敏 Key', t.slice(0, 300));
  ok(JSON.stringify(cfg.providers[0].models) === '["m1","m2","vendor/m3"]', '模型列表按逗号/换行解析');
  // 编辑时 Key 留空 -> 保留原 Key
  r = await admin('/admin/api/providers', { originalId: 'good', provider: { ...providers[0], apiKey: '', note: '备注' } });
  r = await admin('/admin/api/fetch-nothing');
  ok(r.status === 404, '未知管理接口 -> 404');
  r = await admin('/admin/api/providers/fetch-models', { id: 'good' });
  let d = await j(r);
  ok(r.status === 200 && d.models.includes('vendor/m3') && seen.at(-1).auth === 'Bearer sk-good-secret-1234567890', '拉取模型用已保存 Key（编辑留空未清掉 Key）', JSON.stringify(d));
  // 模型列表留空保存 -> 自动拉取全部写入；拉取失败照常保存并返回原因
  r = await admin('/admin/api/providers', { provider: { id: 'autom', baseUrl: `${UP}/good/v1`, apiKey: 'sk-auto' } });
  d = await j(r);
  { const ap = d.providers.find((x) => x.id === 'autom'); ok(r.status === 200 && ap && ap.models.includes('vendor/m3') && /自动拉取并写入/.test(d.modelsNotice), '模型留空保存时自动拉取全部', JSON.stringify(d).slice(0, 300)); }
  r = await admin('/admin/api/providers', { provider: { id: 'autobad', baseUrl: `${UP}/bad/v1`, apiKey: 'sk-x' } });
  d = await j(r);
  { const ap = d.providers.find((x) => x.id === 'autobad'); ok(r.status === 200 && ap && ap.models.length === 0 && /自动拉取失败/.test(d.modelsNotice), '自动拉取失败仍保存并说明原因', JSON.stringify(d).slice(0, 300)); }
  await admin('/admin/api/providers/delete', { id: 'autom' });
  await admin('/admin/api/providers/delete', { id: 'autobad' });
  r = await admin('/admin/api/providers/fetch-models', { id: 'bad' });
  d = await j(r);
  ok(r.status === 502 && d.error.includes('upstream exploded'), '拉取模型失败时返回上游原文', JSON.stringify(d));

  // ---- 调用密钥 ----
  r = await req('/v1/models');
  ok(r.status === 401, '无调用密钥 -> 401');
  r = await req('/v1/models', { headers: { Authorization: 'Bearer sk-gw-nope' } });
  ok(r.status === 401, '错误调用密钥 -> 401');
  r = await admin('/admin/api/keys', { name: '笔记本' });
  const key = (await j(r)).key;
  ok(/^sk-gw-[0-9a-f]{48}$/.test(key), '生成调用密钥');
  const keyRow = await db.prepare('SELECT * FROM api_keys').first();
  ok(keyRow && keyRow.raw_key === key, 'D1 记录明文密钥供自用随时查看');
  const listKeysRes = await admin('/admin/api/keys');
  const listKeysData = await j(listKeysRes);
  ok(listKeysData.items && listKeysData.items[0].raw_key === key, '密钥列表包含 raw_key 供前端一键复制与查看');
  const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const chat = (body, extra = {}) => req('/v1/chat/completions', { method: 'POST', headers: { ...H, ...extra }, body: JSON.stringify(body) });

  r = await req('/v1/models', { headers: H });
  d = await j(r);
  const ids = d.data.map((m) => m.id);
  ok(r.status === 200 && ids.includes('good/m1') && ids.includes('good/vendor/m3') && !ids.some((i) => i.startsWith('off/')) && ids.includes('auto'), '/v1/models 只列启用服务商，带前缀', ids.join(','));

  // ---- 转发 ----
  r = await chat({ model: 'good/m1', messages: [{ role: 'user', content: 'hi' }], temperature: 0.2, tools: [{ type: 'function' }], custom_field: 'keep' });
  d = await j(r);
  let up = seen.at(-1);
  ok(r.status === 200 && d.choices[0].message.content === 'pong from m1' && r.headers.get('x-gateway-provider') === 'good', '服务商/模型 寻址，非流式转发');
  ok(up.body.model === 'm1' && up.auth === 'Bearer sk-good-secret-1234567890' && d.echo.temperature === 0.2 && d.echo.tools && d.echo.custom === 'keep', '上游收到去前缀模型名、上游 Key、参数原样透传');
  r = await chat({ model: 'good/vendor/m3', messages: [{ role: 'user', content: 'hi' }] });
  ok(r.status === 200 && seen.at(-1).body.model === 'vendor/m3', '模型名自身带斜杠也能寻址');
  r = await chat({ model: 'm2', messages: [{ role: 'user', content: 'hi' }] });
  ok(r.status === 200 && r.headers.get('x-gateway-model') === 'm2', '不带前缀的模型名按模型列表匹配');
  r = await chat({ model: 'nope/zzz', messages: [] });
  d = await j(r);
  ok(r.status === 404 && d.error.message.includes('找不到模型'), '未知模型 -> 404 + 原因');
  r = await chat({ model: 'off/m1', messages: [] });
  ok(r.status === 400 && (await j(r)).error.message.includes('已停用'), '停用的服务商 -> 400');
  r = await req('/v1/chat/completions', { method: 'POST', headers: H, body: '{bad json' });
  ok(r.status === 400 && (await j(r)).error.message.includes('不是合法 JSON'), '非法 JSON -> 400 带原文');

  // ---- 容灾 ----
  await admin('/admin/api/settings', { fallbackEnabled: true, fallbackChain: ['bad/x', 'slow/y', 'off/m1', 'good/m1'] });
  r = await chat({ model: 'bad/x', messages: [{ role: 'user', content: 'hi' }] });
  d = await j(r);
  ok(r.status === 200 && d.choices[0].message.content === 'pong from m1' && r.headers.get('x-gateway-attempts') === '3' && r.headers.get('x-gateway-fallback') === '1', '容灾：bad -> slow(超时) -> 跳过停用 -> good', JSON.stringify([...r.headers]));
  r = await chat({ model: 'bad/x', messages: [{ role: 'user', content: 'hi' }] }, { 'x-gateway-fallback': 'off' });
  d = await j(r);
  ok(r.status === 500 && d.error.message.includes('upstream exploded') && d.error.attempts.length === 1, '关闭容灾时直接返回上游原始错误', JSON.stringify(d));
  r = await chat({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] });
  ok(r.status === 200 && r.headers.get('x-gateway-provider') === 'good', 'auto 按容灾链');

  // 全部失败
  await admin('/admin/api/settings', { fallbackChain: ['bad/x', 'slow/y'] });
  r = await chat({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] });
  d = await j(r);
  ok(r.status === 502 && d.error.attempts.length === 2 && d.error.message.includes('请求超时') && d.error.message.includes('upstream exploded'), '全部失败：返回每次尝试的原文', JSON.stringify(d).slice(0, 400));

  // ---- 流式 ----
  await admin('/admin/api/settings', { fallbackChain: ['bad/x', 'good/m1'] });
  r = await chat({ model: 'good/m2', stream: true, messages: [{ role: 'user', content: '你好' }] });
  t = await r.text();
  const content = (s) => s.split('\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6))).map((o) => o.choices?.[0]?.delta?.content || '').join('');
  ok(r.status === 200 && r.headers.get('content-type').includes('text/event-stream') && content(t) === '你好，世界' && t.includes('[DONE]'), '流式原样透传', t.slice(0, 200));
  ok(seen.at(-1).body.stream_options?.include_usage === true, '流式自动加 include_usage');
  r = await chat({ model: 'bad/x', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  t = await r.text();
  ok(r.status === 200 && content(t) === '你好，世界' && r.headers.get('x-gateway-provider') === 'good', '流式容灾：开始返回前切换到 good');
  r = await chat({ model: 'broken/z', stream: true, messages: [{ role: 'user', content: 'hi' }] }, { 'x-gateway-fallback': 'off' });
  t = await r.text().catch((e) => `ERR ${e}`);
  ok(r.status === 200, '上游流中途断开不致崩溃', t.slice(0, 100));

  // ---- embeddings ----
  r = await req('/v1/embeddings', { method: 'POST', headers: H, body: JSON.stringify({ model: 'good/m1', input: 'abc' }) });
  d = await j(r);
  ok(r.status === 200 && d.data[0].embedding.length === 2 && seen.at(-1).path === '/good/v1/embeddings', '/v1/embeddings 转发');

  // ================= Anthropic 协议 =================
  r = await admin('/admin/api/providers', { provider: { id: 'anth', name: 'Claude 官方', protocol: 'anthropic', baseUrl: `${UP}/anth`, apiKey: 'sk-ant-secret-1234567890', models: 'claude-x\nclaude-y' } });
  cfg = await j(r);
  const anthP = cfg.providers && cfg.providers.find((p) => p.id === 'anth');
  ok(r.status === 200 && anthP && anthP.protocol === 'anthropic' && cfg.providers.find((p) => p.id === 'good').protocol === 'openai', '服务商协议类型：anthropic 可保存，旧配置默认 openai', JSON.stringify(cfg).slice(0, 300));
  await admin('/admin/api/providers', { provider: { id: 'anthbad', name: '过载的 Claude', protocol: 'anthropic', baseUrl: `${UP}/anthbad/v1`, apiKey: 'sk-ant-bad', models: 'claude-z' } });
  r = await admin('/admin/api/providers/fetch-models', { id: 'anth' });
  d = await j(r);
  up = seen.at(-1);
  ok(r.status === 200 && JSON.stringify(d.models) === '["claude-x","claude-y"]' && up.path === '/anth/v1/models?limit=1000' && up.xkey === 'sk-ant-secret-1234567890' && up.ver === '2023-06-01' && !up.auth, 'anthropic 拉取模型：/v1/models + x-api-key + anthropic-version', JSON.stringify({ d, up }));

  const XH = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
  const msgs = (b, extra = {}) => req('/v1/messages', { method: 'POST', headers: { ...XH, ...extra }, body: JSON.stringify(b) });
  const parseSSE = (s) => s.split('\n\n').filter((x) => x.trim()).map((blk) => {
    const ev = (blk.match(/^event: (.*)$/m) || [])[1];
    const da = (blk.match(/^data: (.*)$/m) || [])[1];
    let data = null; try { data = JSON.parse(da); } catch { data = da; }
    return { ev, data };
  });

  // 鉴权
  r = await req('/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  d = await j(r);
  ok(r.status === 401 && d.type === 'error' && d.error.type === 'authentication_error', '/v1/messages 无密钥 -> 401（Anthropic 错误格式）', JSON.stringify(d));
  r = await req('/v1/messages', { method: 'POST', headers: { ...XH, 'x-api-key': 'sk-gw-wrong' }, body: '{}' });
  ok(r.status === 401, '/v1/messages 错误 x-api-key -> 401');

  // 透传（非流式）
  const anthBody = { model: 'anth/claude-x', max_tokens: 100, system: [{ type: 'text', text: '你是助手', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'hi' }], thinking: { type: 'enabled', budget_tokens: 1024 } };
  r = await msgs(anthBody, { 'anthropic-beta': 'interleaved-thinking-2025-05-14' });
  d = await j(r);
  up = seen.at(-1);
  ok(r.status === 200 && d.type === 'message' && d.content[0].text === 'claude pong from claude-x' && r.headers.get('x-gateway-protocol') === 'anthropic->anthropic', 'x-api-key 鉴权 + Anthropic 透传（非流式）', JSON.stringify(d));
  ok(up.path === '/anth/v1/messages' && up.body.model === 'claude-x' && JSON.stringify({ ...up.body, model: anthBody.model }) === JSON.stringify(anthBody) && up.xkey === 'sk-ant-secret-1234567890' && up.beta === 'interleaved-thinking-2025-05-14' && !up.auth, '透传：只换 model，其余字段与 anthropic-beta 原样', JSON.stringify(up));
  r = await req('/v1/messages', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-y', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }) });
  ok(r.status === 200 && seen.at(-1).ver === '2023-06-01' && seen.at(-1).body.model === 'claude-y', '/v1/messages 也接受 Bearer；缺 anthropic-version 时补默认值');

  // 透传（流式）
  r = await msgs({ ...anthBody, stream: true });
  t = await r.text();
  let evs = parseSSE(t);
  ok(r.status === 200 && evs[0].ev === 'message_start' && evs.at(-1).ev === 'message_stop' && evs.filter((e) => e.ev === 'content_block_delta').map((e) => e.data.delta.text).join('') === '克劳德' && t.includes('event: ping'), 'Anthropic 流式原样透传', t.slice(0, 200));

  // /v1/messages → OpenAI 上游（非流式）
  const img = 'iVBORw0KGgo=';
  const convBody = {
    model: 'good/m1', max_tokens: 200, temperature: 0.3, stop_sequences: ['END'],
    system: '系统提示',
    tools: [{ name: 'get_weather', description: '查天气', input_schema: { type: 'object', properties: { city: { type: 'string' } } } }, { type: 'web_search_20250305', name: 'web_search' }],
    tool_choice: { type: 'auto' },
    messages: [
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: img } }] },
      { role: 'assistant', content: [{ type: 'text', text: '我查一下' }, { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { city: '上海' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: [{ type: 'text', text: '晴 25 度' }] }, { type: 'text', text: '谢谢，再说一句' }] },
    ],
  };
  r = await msgs(convBody);
  d = await j(r);
  up = seen.at(-1);
  const um = up.body.messages || [];
  ok(up.path === '/good/v1/chat/completions' && up.auth === 'Bearer sk-good-secret-1234567890' && um[0].role === 'system' && um[0].content === '系统提示'
    && um[1].content[1].type === 'image_url' && um[1].content[1].image_url.url === `data:image/png;base64,${img}`
    && um[2].role === 'assistant' && um[2].content === '我查一下' && um[2].tool_calls[0].id === 'toolu_01' && JSON.parse(um[2].tool_calls[0].function.arguments).city === '上海'
    && um[3].role === 'tool' && um[3].tool_call_id === 'toolu_01' && um[3].content === '晴 25 度' && um[4].role === 'user' && um[4].content === '谢谢，再说一句',
  'Anthropic→OpenAI 请求：system、多轮、图片、tool_use、tool_result 转换', JSON.stringify(um));
  ok(up.body.max_tokens === 200 && up.body.temperature === 0.3 && JSON.stringify(up.body.stop) === '["END"]' && up.body.tools.length === 1 && up.body.tools[0].function.parameters.properties.city && up.body.tool_choice === 'auto' && !up.body.system, 'Anthropic→OpenAI 请求：参数与 tools 转换（丢弃服务端工具）', JSON.stringify(up.body).slice(0, 400));
  ok(r.status === 200 && d.type === 'message' && d.role === 'assistant' && d.model === 'good/m1' && d.content[0].type === 'text' && d.content[0].text === 'pong from m1' && d.stop_reason === 'end_turn' && d.usage.input_tokens === 10 && d.usage.output_tokens === 3 && r.headers.get('x-gateway-protocol') === 'anthropic->openai', 'OpenAI→Anthropic 响应（非流式）', JSON.stringify(d));

  // tool_use 非流式
  const toolAsk = { model: 'good/m1', max_tokens: 100, tools: [convBody.tools[0]], messages: [{ role: 'user', content: 'weather in 广州?' }] };
  r = await msgs(toolAsk);
  d = await j(r);
  ok(r.status === 200 && d.stop_reason === 'tool_use' && d.content[0].type === 'tool_use' && d.content[0].id === 'call_n1' && d.content[0].name === 'get_weather' && d.content[0].input.city === '广州', 'OpenAI tool_calls → Anthropic tool_use（id 去掉非法字符）', JSON.stringify(d));

  // /v1/messages → OpenAI 上游（流式）
  r = await msgs({ model: 'good/m1', max_tokens: 50, stream: true, messages: [{ role: 'user', content: '你好' }] });
  t = await r.text();
  evs = parseSSE(t);
  const names = evs.map((e) => e.ev);
  ok(r.status === 200 && r.headers.get('content-type').includes('text/event-stream') && names[0] === 'message_start' && names[1] === 'content_block_start' && names.at(-3) === 'content_block_stop' && names.at(-2) === 'message_delta' && names.at(-1) === 'message_stop' && evs.every((e) => e.data && e.data.type === e.ev), 'OpenAI 流 → Anthropic 事件顺序', names.join(','));
  const md = evs.find((e) => e.ev === 'message_delta');
  ok(evs.filter((e) => e.ev === 'content_block_delta').map((e) => e.data.delta.text).join('') === '你好，世界' && md.data.delta.stop_reason === 'end_turn' && md.data.usage.output_tokens === 5 && seen.at(-1).body.stream_options?.include_usage === true, 'OpenAI 流 → Anthropic：文字、stop_reason、usage', JSON.stringify(md));

  // tool_use 流式
  r = await msgs({ ...toolAsk, stream: true });
  t = await r.text();
  evs = parseSSE(t);
  const toolStart = evs.find((e) => e.ev === 'content_block_start' && e.data.content_block.type === 'tool_use');
  const pj = evs.filter((e) => e.ev === 'content_block_delta' && e.data.delta.type === 'input_json_delta' && e.data.index === toolStart?.data.index).map((e) => e.data.delta.partial_json).join('');
  const md2 = evs.find((e) => e.ev === 'message_delta');
  ok(toolStart && toolStart.data.content_block.id === 'call_s1' && toolStart.data.content_block.name === 'get_weather' && JSON.parse(pj).city === '杭州' && md2.data.delta.stop_reason === 'tool_use' && evs.filter((e) => e.ev === 'content_block_start').length === 2, 'OpenAI 流式 tool_calls → Anthropic tool_use + input_json_delta', t.slice(0, 600));

  // /v1/chat/completions → Anthropic 上游（非流式）
  r = await chat({
    model: 'anth/claude-x', temperature: 1.5, stop: 'STOP', tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }], tool_choice: 'required',
    messages: [
      { role: 'system', content: '系统A' },
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }] },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'get_weather', arguments: '{"city":"深圳"}' } }] },
      { role: 'tool', tool_call_id: 'call_9', content: '多云' },
      { role: 'user', content: '然后呢' },
    ],
  });
  d = await j(r);
  up = seen.at(-1);
  const am = up.body.messages || [];
  ok(up.path === '/anth/v1/messages' && up.xkey === 'sk-ant-secret-1234567890' && up.body.system === '系统A' && up.body.max_tokens === 8192 && up.body.temperature === 1 && JSON.stringify(up.body.stop_sequences) === '["STOP"]'
    && up.body.tools[0].input_schema.properties.city && up.body.tool_choice.type === 'any'
    && am[0].role === 'user' && am[0].content[1].type === 'image' && am[0].content[1].source.media_type === 'image/jpeg'
    && am[1].role === 'assistant' && am[1].content[0].type === 'tool_use' && am[1].content[0].input.city === '深圳'
    && am[2].role === 'user' && am[2].content[0].type === 'tool_result' && am[2].content[0].tool_use_id === 'call_9' && am[2].content[1].text === '然后呢',
  'OpenAI→Anthropic 请求：system、图片、tool_calls、tool 消息合并、max_tokens 默认、温度截断', JSON.stringify(up.body).slice(0, 600));
  ok(r.status === 200 && d.object === 'chat.completion' && d.choices[0].message.content === 'claude pong from claude-x' && d.choices[0].finish_reason === 'stop' && d.usage.prompt_tokens === 16 && d.usage.completion_tokens === 4 && d.model === 'anth/claude-x', 'Anthropic→OpenAI 响应（非流式，usage 含缓存）', JSON.stringify(d));
  r = await chat({ model: 'anth/claude-x', tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }], messages: [{ role: 'user', content: 'weather?' }] });
  d = await j(r);
  ok(d.choices[0].finish_reason === 'tool_calls' && d.choices[0].message.content === '好的' && d.choices[0].message.tool_calls[0].id === 'toolu_n1' && JSON.parse(d.choices[0].message.tool_calls[0].function.arguments).city === '北京', 'Anthropic tool_use → OpenAI tool_calls', JSON.stringify(d));

  // /v1/chat/completions → Anthropic 上游（流式）
  r = await chat({ model: 'anth/claude-x', stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: 'hi' }] });
  t = await r.text();
  const chunks = t.split('\n\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6)));
  ok(r.status === 200 && content(t) === '克劳德' && t.trim().endsWith('data: [DONE]') && chunks[0].choices[0].delta.role === 'assistant' && chunks.some((c) => c.choices[0]?.finish_reason === 'stop') && chunks.at(-1).usage?.total_tokens === 27 && chunks.every((c) => c.object === 'chat.completion.chunk'), 'Anthropic 流 → OpenAI chunk（含 include_usage）', t.slice(0, 300));
  r = await chat({ model: 'anth/claude-x', stream: true, tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }], messages: [{ role: 'user', content: 'weather?' }] });
  t = await r.text();
  const tch = t.split('\n\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6)));
  const tcs = tch.flatMap((c) => c.choices?.[0]?.delta?.tool_calls || []);
  ok(tcs[0]?.id === 'toolu_s1' && tcs[0].function.name === 'get_weather' && JSON.parse(tcs.map((x) => x.function.arguments || '').join('')).city === '上海' && tch.some((c) => c.choices?.[0]?.finish_reason === 'tool_calls') && content(t) === '查一下' && !tch.some((c) => c.usage), 'Anthropic 流式 tool_use → OpenAI tool_calls（未要 usage 不发）', t.slice(0, 500));

  // count_tokens
  r = await req('/v1/messages/count_tokens', { method: 'POST', headers: XH, body: JSON.stringify({ model: 'anth/claude-x', messages: [{ role: 'user', content: 'hi' }] }) });
  d = await j(r);
  ok(r.status === 200 && d.input_tokens === 42 && seen.at(-1).path === '/anth/v1/messages/count_tokens' && seen.at(-1).body.model === 'claude-x', 'count_tokens：anthropic 上游直接转发');
  r = await req('/v1/messages/count_tokens', { method: 'POST', headers: XH, body: JSON.stringify({ model: 'good/m1', system: '系统', messages: [{ role: 'user', content: '你好你好你好' }] }) });
  d = await j(r);
  ok(r.status === 200 && d.input_tokens > 0 && r.headers.get('x-gateway-estimated') === '1', 'count_tokens：openai 上游返回估算', JSON.stringify(d));

  // 跨协议容灾
  await admin('/admin/api/settings', { fallbackEnabled: true, fallbackChain: ['anthbad/claude-z', 'good/m1', 'anth/claude-x'] });
  r = await msgs({ model: 'anthbad/claude-z', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
  d = await j(r);
  ok(r.status === 200 && d.type === 'message' && d.content[0].text === 'pong from m1' && r.headers.get('x-gateway-attempts') === '2' && r.headers.get('x-gateway-protocol') === 'anthropic->openai', '跨协议容灾：/v1/messages anthropic(529) → openai', JSON.stringify(d));
  await admin('/admin/api/settings', { fallbackChain: ['bad/x', 'anth/claude-x'] });
  r = await chat({ model: 'bad/x', messages: [{ role: 'user', content: 'hi' }] });
  d = await j(r);
  ok(r.status === 200 && d.choices[0].message.content === 'claude pong from claude-x' && r.headers.get('x-gateway-protocol') === 'openai->anthropic' && r.headers.get('x-gateway-fallback') === '1', '跨协议容灾：/v1/chat/completions openai(500) → anthropic', JSON.stringify(d));
  r = await chat({ model: 'bad/x', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  t = await r.text();
  ok(r.status === 200 && content(t) === '克劳德' && r.headers.get('x-gateway-provider') === 'anth', '跨协议容灾（流式）：开始前切到 anthropic 并转成 OpenAI chunk', t.slice(0, 200));

  // 错误格式：保留上游原文
  r = await msgs({ model: 'anthbad/claude-z', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, { 'x-gateway-fallback': 'off' });
  d = await j(r);
  ok(r.status === 529 && d.type === 'error' && d.error.type === 'overloaded_error' && d.error.message.includes('Overloaded upstream anth 原文') && d.error.attempts.length === 1, '入口 Anthropic：错误按 Anthropic 格式，保留上游原文', JSON.stringify(d));
  await admin('/admin/api/settings', { fallbackChain: ['anthbad/claude-z', 'bad/x'] });
  r = await msgs({ model: 'auto', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
  d = await j(r);
  ok(r.status === 500 && d.type === 'error' && d.error.message.includes('Overloaded upstream anth 原文') && d.error.message.includes('upstream exploded'), '入口 Anthropic 全部失败：每次尝试原文都在', JSON.stringify(d).slice(0, 300));
  r = await chat({ model: 'anthbad/claude-z', messages: [{ role: 'user', content: 'hi' }] }, { 'x-gateway-fallback': 'off' });
  d = await j(r);
  ok(r.status === 529 && d.error && d.error.type === 'upstream_error' && d.error.message.includes('Overloaded upstream anth 原文'), '入口 OpenAI 调 anthropic 失败：OpenAI 格式 + 上游原文', JSON.stringify(d));
  r = await msgs({ model: 'nope/zz', messages: [] });
  d = await j(r);
  ok(r.status === 404 && d.type === 'error' && d.error.type === 'not_found_error' && d.error.message.includes('找不到模型'), '/v1/messages 未知模型 -> Anthropic 格式 404');
  r = await req('/v1/messages', { method: 'POST', headers: XH, body: '{bad' });
  d = await j(r);
  ok(r.status === 400 && d.type === 'error' && d.error.message.includes('不是合法 JSON'), '/v1/messages 非法 JSON -> Anthropic 格式 400');

  // embeddings 不发给 anthropic 服务商
  r = await req('/v1/embeddings', { method: 'POST', headers: { ...H, 'x-gateway-fallback': 'off' }, body: JSON.stringify({ model: 'anth/claude-x', input: 'a' }) });
  d = await j(r);
  ok(r.status === 502 && d.error.message.includes('不支持 /embeddings'), 'anthropic 服务商不接 embeddings（跳过并说明）', JSON.stringify(d));

  // /v1/models 兼容两种格式
  r = await req('/v1/models', { headers: XH });
  d = await j(r);
  ok(r.status === 200 && d.has_more === false && d.data.some((m) => m.id === 'anth/claude-x' && m.type === 'model' && m.display_name && m.object === 'model'), '/v1/models 带 Anthropic 字段，x-api-key 可用');

  // 日志协议字段
  await sleep(400);
  r = await admin('/admin/api/logs?limit=200');
  d = await j(r);
  ok(d.items.some((l) => l.endpoint === 'messages' && l.client_protocol === 'anthropic' && l.upstream_protocol === 'openai' && l.status === 200)
    && d.items.some((l) => l.endpoint === 'chat/completions' && l.client_protocol === 'openai' && l.upstream_protocol === 'anthropic')
    && d.items.some((l) => l.client_protocol === 'anthropic' && l.upstream_protocol === 'anthropic' && l.stream && l.prompt_tokens === 21 && l.completion_tokens === 6), '日志记录入口协议与上游协议（含 Anthropic 流式 usage）');
  const crossLog = d.items.find((l) => l.client_protocol === 'anthropic' && l.fallback && l.upstream_protocol === 'openai');
  ok(crossLog && crossLog.trail[0].protocol === 'anthropic' && crossLog.trail[0].error.includes('Overloaded upstream anth 原文'), '跨协议容灾日志：失败尝试带协议与原文', JSON.stringify(crossLog && crossLog.trail));
  r = await admin('/admin/api/logs?protocol=anthropic');
  d = await j(r);
  ok(d.items.length > 0 && d.items.every((l) => l.client_protocol === 'anthropic' || l.upstream_protocol === 'anthropic'), '日志按协议筛选');
  await admin('/admin/api/settings', { fallbackChain: ['bad/x', 'good/m1'] });

  // 转换后的流中途断开：给客户端补一个 Anthropic error 事件
  r = await msgs({ model: 'broken/z', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'hi' }] }, { 'x-gateway-fallback': 'off' });
  t = await r.text().catch((e) => `ERR ${e}`);
  evs = parseSSE(t);
  ok(r.status === 200 && evs[0].ev === 'message_start' && evs.some((e) => e.ev === 'content_block_delta' && e.data.delta.text === '半') && evs.at(-1).ev === 'error' && /流读取中断/.test(evs.at(-1).data.error.message), '转换流中途断开：先转发已收到内容，再发 error 事件（原文）', t.slice(0, 400));

  // 管理页带协议选项
  t = await (await req('/admin')).text();
  ok(t.includes('id="p-protocol"') && t.includes('Anthropic Messages'), '管理页服务商表单有协议类型选项');

  // ---- 管理页测试调用 ----
  r = await admin('/admin/api/test', { model: 'good/m1', prompt: 'ping' });
  d = await j(r);
  ok(r.status === 200 && d.choices[0].message.content === 'pong from m1', '管理页测试调用走同一链路');

  // ---- 日志 ----
  await sleep(500);
  r = await admin('/admin/api/logs?limit=100');
  d = await j(r);
  ok(r.status === 200 && d.total >= 12, `日志异步写入 D1（${d.total} 条）`);
  const streamLog = d.items.find((l) => l.stream && l.model === 'm2');
  ok(streamLog && streamLog.total_tokens === 12 && streamLog.prompt_tokens === 7 && streamLog.key_name === '笔记本' && streamLog.ttfb_ms != null, '流式日志带上游 usage、密钥名、首包', JSON.stringify(streamLog));
  const fbLog = d.items.find((l) => l.fallback && l.status === 200 && l.attempts === 3);
  ok(fbLog && fbLog.trail.length === 2 && fbLog.trail[0].error.includes('upstream exploded') && fbLog.trail[1].error.includes('AbortError'), '容灾日志记录失败服务商、模型与原始错误', JSON.stringify(fbLog && fbLog.trail));
  const brokenLog = d.items.find((l) => l.provider_id === 'broken');
  ok(brokenLog && /流读取中断|客户端提前断开/.test(brokenLog.error || ''), '流中断写入错误原因', JSON.stringify(brokenLog));
  ok(d.items.some((l) => l.key_id === 'admin'), '管理页测试调用也写日志');
  ok(d.items.every((l) => !JSON.stringify(l).includes('sk-good-secret')), '日志不含上游 Key');
  r = await admin('/admin/api/logs?status=fail');
  d = await j(r);
  ok(d.items.length > 0 && d.items.every((l) => l.status < 200 || l.status >= 300), '日志按失败筛选');
  r = await admin('/admin/api/logs?provider=good&model=m2');
  d = await j(r);
  ok(d.items.length > 0 && d.items.every((l) => l.provider_id === 'good'), '日志按服务商/模型筛选');
  r = await admin('/admin/api/logs?q=exploded');
  d = await j(r);
  ok(d.items.length > 0, '日志按错误关键词筛选');
  r = await admin('/admin/api/stats?days=1');
  d = await j(r);
  ok(r.status === 200 && d.total > 0 && d.byProvider.length > 0, '统计接口');

  // 日志保留清理（Cron）
  await db.prepare("INSERT INTO call_logs (ts, endpoint, status) VALUES (?, 'chat/completions', 200)").bind(Date.now() - 40 * 86400000).run();
  const before = (await db.prepare('SELECT COUNT(*) AS n FROM call_logs').first()).n;
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: '0 19 * * *' });
  await sleep(200);
  const after = (await db.prepare('SELECT COUNT(*) AS n FROM call_logs').first()).n;
  ok(after === before - 1, `Cron 按保留天数清理（${before} -> ${after}）`);

  r = await admin('/admin/api/logs/clear', {});
  d = await j(r);
  ok(r.status === 200 && (await db.prepare('SELECT COUNT(*) AS n FROM call_logs').first()).n === 0, '清空日志');

  // ---- 吊销 ----
  await admin('/admin/api/keys/revoke', { id: keyRow.id });
  r = await req('/v1/models', { headers: H });
  ok(r.status === 401, '吊销后立即 401');

  // ---- 导出含明文、导入 ----
  r = await admin('/admin/api/export');
  t = await r.text();
  ok(t.includes('sk-good-secret-1234567890'), '导出配置含明文 Key（仅手动导出）');
  r = await admin('/admin/api/providers/delete', { id: 'bad' });
  cfg = await j(r);
  ok(!cfg.providers.some((p) => p.id === 'bad') && !cfg.settings.fallbackChain.some((s) => s.startsWith('bad/')), '删除服务商同步清理容灾链');

  // ---- 登录锁定 ----
  for (let i = 0; i < 10; i++) {
    await req('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: '{"password":"x"}' });
  }
  r = await req('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  ok(r.status === 429, '连续 10 次错误后锁定');
  // 未跑 0002 迁移时日志退回旧列
  {
    const { writeLog } = await import('../src/logs.js');
    const calls = [];
    const fakeDb = { prepare: (q) => ({ bind: (...a) => ({ run: async () => { calls.push({ q, n: a.length }); if (q.includes('client_protocol')) throw new Error('D1_ERROR: table call_logs has no column named client_protocol'); return {}; } }) }) };
    const waits = [];
    await writeLog({ DB: fakeDb }, { waitUntil: (p) => waits.push(p) }, { ts: 1, endpoint: 'messages', status: 200, clientProtocol: 'anthropic', upstreamProtocol: 'openai' });
    ok(calls.length === 2 && calls[0].n === 22 && calls[1].n === 20 && !calls[1].q.includes('client_protocol'), '日志：缺协议列时自动退回旧列写入，不丢日志', JSON.stringify(calls.map((c) => c.n)));
  }
} catch (e) {
  fail++;
  console.log('FAIL 测试异常', e && e.stack);
} finally {
  await mf.dispose();
  upstream.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
