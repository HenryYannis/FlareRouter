// Anthropic Messages 协议 ⇄ OpenAI Chat Completions 协议互转
// 只做格式转换，不做业务判断；网关的寻址、容灾、日志在 gateway.js

import { estimateTokens, randomHex } from './util.js';

export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
// chat/completions → anthropic 上游时，调用方没给 max_tokens 的默认值（Anthropic 要求必填）
// 不少模型的输出上限是 4096。默认再高会直接 400，然后被容灾换到别的模型。
// 需要更长输出的调用方自己传 max_tokens / max_completion_tokens。
// 上游模型列表给了该模型的上限（存在服务商 modelLimits 里）时，优先用那个值。
export const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------- 地址与请求头

// Base URL 可写 https://api.anthropic.com 或 https://api.anthropic.com/v1，两种都能用
export function anthropicUrl(baseUrl, path) {
  let b = String(baseUrl || '').replace(/\/+$/, '').replace(/\/(messages(\/count_tokens)?|models)$/, '');
  if (!/\/v1$/.test(b)) b += '/v1';
  return `${b}/${path}`;
}

export function anthropicHeaders(apiKey, { version, beta, stream } = {}) {
  const h = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey || '',
    'anthropic-version': version || DEFAULT_ANTHROPIC_VERSION,
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
  if (beta) h['anthropic-beta'] = beta;
  return h;
}

// Anthropic 的 tool_use id 只允许 [A-Za-z0-9_-]
export function safeToolId(id) {
  const s = String(id || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return s || `toolu_${randomHex(12)}`;
}

// 空 id 按出现顺序配对：同一次请求里第 n 个空的 tool call 与第 n 个空的 tool result 共用一个 id。
function createToolIdAssigner() {
  const calls = [];
  let resultN = 0;
  let seq = 0;
  const sanitize = (id) => String(id || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return {
    call(id) {
      const s = sanitize(id);
      if (s) return s;
      const gen = `toolu_e${seq++}`;
      calls.push(gen);
      return gen;
    },
    result(id) {
      const s = sanitize(id);
      if (s) return s;
      return calls[resultN++] || `toolu_e${seq++}`;
    },
  };
}

const newMsgId = () => `msg_${randomHex(12)}`;

// ---------------------------------------------------------------- 错误格式

const ANTHROPIC_ERROR_TYPES = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  413: 'request_too_large',
  429: 'rate_limit_error',
  500: 'api_error',
  529: 'overloaded_error',
};

export function anthropicErrorType(status) {
  return ANTHROPIC_ERROR_TYPES[status] || (status >= 500 ? 'api_error' : 'invalid_request_error');
}

export function anthropicErrorBody(message, status, extra = {}) {
  return { type: 'error', error: { type: anthropicErrorType(status), message, ...extra } };
}

// ---------------------------------------------------------------- 工具函数

function textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : c && (c.type === 'text' || typeof c.text === 'string') ? c.text || '' : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object' && typeof content.text === 'string') return content.text;
  return '';
}

function parseArgs(s) {
  if (s && typeof s === 'object') return s;
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v };
  } catch {
    return { _raw_arguments: String(s) };
  }
}

// ================================================================ 请求：Anthropic → OpenAI

function anthImageToOpenAI(block) {
  const src = block.source || {};
  if (src.type === 'base64') return { type: 'image_url', image_url: { url: `data:${src.media_type || 'image/png'};base64,${src.data || ''}` } };
  if (src.type === 'url') return { type: 'image_url', image_url: { url: src.url } };
  return null;
}

function anthDocToOpenAI(block) {
  const src = block.source || {};
  if (src.type === 'base64') {
    return { type: 'file', file: { filename: block.title || 'document.pdf', file_data: `data:${src.media_type || 'application/pdf'};base64,${src.data || ''}` } };
  }
  if (src.type === 'text') return { type: 'text', text: src.data || '' };
  if (src.type === 'url') return { type: 'text', text: `[文档] ${src.url}` };
  return null;
}

// 一组 Anthropic 内容块 → OpenAI content（全是文字时合成字符串，兼容只认字符串的服务商）
function partsToOpenAIContent(parts) {
  if (!parts.length) return '';
  if (parts.every((p) => p.type === 'text')) return parts.map((p) => p.text).join('\n');
  return parts;
}

const SERVER_TOOL_RESULTS = new Set([
  'web_search_tool_result',
  'code_execution_tool_result',
  'mcp_tool_result',
  'bash_code_execution_tool_result',
  'text_editor_code_execution_tool_result',
  'tool_search_tool_result',
]);

function looseBlockText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (!c) return '';
      if (typeof c === 'string') return c;
      if (typeof c.text === 'string' && c.text) return c.text;
      if (c.title || c.url) return [c.title, c.url].filter(Boolean).join(' ');
      try { return JSON.stringify(c); } catch { return ''; }
    }).filter(Boolean).join('\n');
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    try { return JSON.stringify(content); } catch { return ''; }
  }
  return String(content);
}

function convertAnthUserMessage(m, out, ids) {
  if (typeof m.content === 'string') { out.push({ role: 'user', content: m.content }); return; }
  const blocks = Array.isArray(m.content) ? m.content : [];
  const parts = [];
  const extraImages = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'tool_result' || SERVER_TOOL_RESULTS.has(b.type)) {
      // tool 消息必须紧跟在 assistant 的 tool_calls 后面，所以先输出
      let content;
      if (b.type !== 'tool_result') content = looseBlockText(b.content);
      else if (typeof b.content === 'string') content = b.content;
      else if (Array.isArray(b.content)) {
        content = b.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
        for (const c of b.content) if (c && c.type === 'image') { const im = anthImageToOpenAI(c); if (im) extraImages.push(im); }
      } else content = '';
      if (b.is_error) content = `[工具执行出错] ${content}`;
      out.push({ role: 'tool', tool_call_id: ids.result(b.tool_use_id), content: content || '' });
    } else if (b.type === 'text') parts.push({ type: 'text', text: b.text || '' });
    else if (b.type === 'image') { const im = anthImageToOpenAI(b); if (im) parts.push(im); }
    else if (b.type === 'document') { const d = anthDocToOpenAI(b); if (d) parts.push(d); }
    // thinking / redacted_thinking / 其它块：OpenAI 协议没有对应，丢弃
  }
  const all = [...extraImages, ...parts];
  if (all.length) out.push({ role: 'user', content: partsToOpenAIContent(all) });
}

function convertAnthAssistantMessage(m, out, ids) {
  if (typeof m.content === 'string') { out.push({ role: 'assistant', content: m.content }); return; }
  const blocks = Array.isArray(m.content) ? m.content : [];
  const texts = [];
  const toolCalls = [];
  const thinkings = [];
  const signatures = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text) texts.push(b.text);
    else if (b.type === 'thinking') {
      if (b.thinking) thinkings.push(b.thinking);
      if (typeof b.signature === 'string' && b.signature) signatures.push(b.signature);
    } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
      toolCalls.push({ id: ids.call(b.id), type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
    }
  }
  const msg = { role: 'assistant', content: texts.length ? texts.join('\n') : null };
  if (thinkings.length) msg.reasoning_content = thinkings.join('');
  if (signatures.length) msg.reasoning_signature = signatures[0];
  if (toolCalls.length) msg.tool_calls = toolCalls;
  if (msg.content == null && !toolCalls.length && !thinkings.length) return;
  out.push(msg);
}

function useMaxCompletionTokens(model) {
  const name = String(model || '').split('/').pop().toLowerCase();
  return /^o\d/.test(name);
}

export function anthropicToOpenAIRequest(body, model, { stream, streamUsage } = {}) {
  const messages = [];
  const ids = createToolIdAssigner();
  const sys = textOf(body.system);
  if (sys) messages.push({ role: 'system', content: sys });
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    if (!m) continue;
    if (m.role === 'assistant') convertAnthAssistantMessage(m, messages, ids);
    else convertAnthUserMessage(m, messages, ids);
  }

  const out = { model, messages };
  if (body.max_tokens != null) {
    if (useMaxCompletionTokens(model)) out.max_completion_tokens = body.max_tokens;
    else out.max_tokens = body.max_tokens;
  }
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) out.stop = body.stop_sequences;
  if (body.metadata && body.metadata.user_id) out.user = String(body.metadata.user_id);

  const tools = (Array.isArray(body.tools) ? body.tools : []).filter((t) => t && t.name && (t.input_schema || !t.type || t.type === 'custom'));
  if (tools.length) {
    out.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } },
    }));
    const tc = body.tool_choice;
    if (tc && typeof tc === 'object') {
      if (tc.type === 'auto') out.tool_choice = 'auto';
      else if (tc.type === 'any') out.tool_choice = 'required';
      else if (tc.type === 'none') out.tool_choice = 'none';
      else if (tc.type === 'tool' && tc.name) out.tool_choice = { type: 'function', function: { name: tc.name } };
      if (tc.disable_parallel_tool_use) out.parallel_tool_calls = false;
    }
  }

  if (stream) {
    out.stream = true;
    if (streamUsage) out.stream_options = { include_usage: true };
  }
  return out;
}

// ================================================================ 请求：OpenAI → Anthropic

function oaPartToAnth(p) {
  if (typeof p === 'string') return { type: 'text', text: p };
  if (!p || typeof p !== 'object') return null;
  if (p.type === 'text') return { type: 'text', text: p.text || '' };
  if (p.type === 'image_url') {
    const url = typeof p.image_url === 'string' ? p.image_url : p.image_url && p.image_url.url;
    if (!url) return null;
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
    if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
    return { type: 'image', source: { type: 'url', url } };
  }
  if (p.type === 'file' && p.file && p.file.file_data) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(p.file.file_data);
    if (m) return { type: 'document', source: { type: 'base64', media_type: m[1], data: m[2] } };
  }
  return null;
}

function jsonFormatHint(fmt) {
  if (!fmt || typeof fmt !== 'object') return '';
  if (fmt.type === 'json_object') return '请只输出一个 JSON 对象，不要输出其它文字。';
  if (fmt.type === 'json_schema') {
    let extra = '';
    try { extra = fmt.json_schema ? `\n${JSON.stringify(fmt.json_schema)}` : ''; } catch { extra = ''; }
    return `请只输出符合下列 JSON Schema 的 JSON。${extra}`;
  }
  return '';
}

function oaContentToAnthBlocks(content) {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  if (Array.isArray(content)) return content.map(oaPartToAnth).filter((b) => b && !(b.type === 'text' && !b.text));
  return [];
}

export function openAIToAnthropicRequest(body, model, { stream, maxTokens } = {}) {
  const system = [];
  const msgs = [];
  const ids = createToolIdAssigner();
  let skipMerge = false;
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const last = msgs[msgs.length - 1];
    // 抽走中间的 system 之后，原来不相邻的消息不要粘在一起。tool 结果和紧随的 user 仍合并。
    if (!skipMerge && last && last.role === role) last.content.push(...blocks);
    else msgs.push({ role, content: [...blocks] });
    skipMerge = false;
  };

  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    if (!m) continue;
    if (m.role === 'system' || m.role === 'developer') {
      const t = textOf(m.content);
      if (t) system.push(t);
      skipMerge = true;
    } else if (m.role === 'assistant') {
      const blocks = oaContentToAnthBlocks(m.content).filter((b) => b.type === 'text');
      if (typeof m.reasoning_content === 'string' && m.reasoning_content && typeof m.reasoning_signature === 'string' && m.reasoning_signature) {
        blocks.unshift({ type: 'thinking', thinking: m.reasoning_content, signature: m.reasoning_signature });
      }
      for (const tc of Array.isArray(m.tool_calls) ? m.tool_calls : []) {
        if (!tc || !tc.function) continue;
        blocks.push({ type: 'tool_use', id: ids.call(tc.id), name: tc.function.name, input: parseArgs(tc.function.arguments) });
      }
      push('assistant', blocks);
    } else if (m.role === 'tool' || m.role === 'function') {
      push('user', [{ type: 'tool_result', tool_use_id: ids.result(m.tool_call_id || m.name), content: textOf(m.content) }]);
    } else {
      push('user', oaContentToAnthBlocks(m.content));
    }
  }

  const formatHint = jsonFormatHint(body.response_format);
  if (formatHint) system.push(formatHint);
  const requestedMax = body.max_tokens ?? body.max_completion_tokens;
  const out = { model, max_tokens: requestedMax ?? (maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS), messages: msgs };
  if (system.length) out.system = system.join('\n\n');
  if (body.temperature != null) out.temperature = Math.min(1, Math.max(0, Number(body.temperature)));
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.top_k != null) out.top_k = body.top_k;
  if (body.stop != null) out.stop_sequences = (Array.isArray(body.stop) ? body.stop : [body.stop]).filter(Boolean);
  if (body.user) out.metadata = { user_id: String(body.user) };

  const tools = (Array.isArray(body.tools) ? body.tools : []).filter((t) => t && t.type === 'function' && t.function && t.function.name);
  if (tools.length) {
    out.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));
    const tc = body.tool_choice;
    let choice = null;
    if (tc === 'auto') choice = { type: 'auto' };
    else if (tc === 'required') choice = { type: 'any' };
    else if (tc === 'none') choice = { type: 'none' };
    else if (tc && typeof tc === 'object' && tc.function && tc.function.name) choice = { type: 'tool', name: tc.function.name };
    if (body.parallel_tool_calls === false) choice = { ...(choice || { type: 'auto' }), disable_parallel_tool_use: true };
    if (choice) out.tool_choice = choice;
  }
  if (stream) out.stream = true;
  return out;
}

// ================================================================ 响应（非流式）

const OA_TO_ANTH_STOP = { stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', function_call: 'tool_use', content_filter: 'refusal' };
const ANTH_TO_OA_STOP = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', tool_use: 'tool_calls', refusal: 'content_filter', pause_turn: 'stop' };

export const mapOpenAIStop = (r) => (r ? OA_TO_ANTH_STOP[r] || 'end_turn' : null);
export const mapAnthropicStop = (r) => (r ? ANTH_TO_OA_STOP[r] || 'stop' : null);

function oaUsageToAnth(u) {
  if (!u) return { input_tokens: 0, output_tokens: 0 };
  const cached = openAICachedTokens(u) || 0;
  const out = { input_tokens: Math.max(0, (u.prompt_tokens || 0) - cached), output_tokens: u.completion_tokens || 0 };
  if (cached) out.cache_read_input_tokens = cached;
  return out;
}

export function openAIToAnthropicResponse(oa, clientModel) {
  const choice = (oa && oa.choices && oa.choices[0]) || {};
  const msg = choice.message || {};
  const content = [];
  const reasoning = typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
  if (reasoning || (typeof msg.reasoning_signature === 'string' && msg.reasoning_signature)) {
    const block = { type: 'thinking', thinking: reasoning };
    if (typeof msg.reasoning_signature === 'string' && msg.reasoning_signature) block.signature = msg.reasoning_signature;
    content.push(block);
  }
  const text = textOf(msg.content);
  if (text) content.push({ type: 'text', text });
  for (const tc of Array.isArray(msg.tool_calls) ? msg.tool_calls : []) {
    if (!tc || !tc.function) continue;
    content.push({ type: 'tool_use', id: safeToolId(tc.id), name: tc.function.name, input: parseArgs(tc.function.arguments) });
  }
  let stop = mapOpenAIStop(choice.finish_reason) || 'end_turn';
  if (content.some((c) => c.type === 'tool_use') && stop === 'end_turn') stop = 'tool_use';
  return {
    id: oa && oa.id ? `msg_${String(oa.id).replace(/[^A-Za-z0-9_-]/g, '')}` : newMsgId(),
    type: 'message',
    role: 'assistant',
    model: clientModel,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: oaUsageToAnth(oa && oa.usage),
  };
}

function anthUsageToOA(u) {
  if (!u) return null;
  const prompt = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const completion = u.output_tokens || 0;
  const out = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  if (u.cache_read_input_tokens) out.prompt_tokens_details = { cached_tokens: u.cache_read_input_tokens };
  return out;
}

export function anthropicToOpenAIResponse(an, clientModel) {
  const blocks = Array.isArray(an && an.content) ? an.content : [];
  const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  const thinkingBlocks = blocks.filter((b) => b && b.type === 'thinking');
  const thinking = thinkingBlocks.map((b) => b.thinking || '').join('');
  const signature = thinkingBlocks.map((b) => b.signature).find((s) => typeof s === 'string' && s) || '';
  const toolCalls = blocks
    .filter((b) => b && b.type === 'tool_use')
    .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  const message = { role: 'assistant', content: text || (toolCalls.length ? null : '') };
  if (thinking) message.reasoning_content = thinking;
  if (signature) message.reasoning_signature = signature;
  if (toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: `chatcmpl-${(an && an.id) || randomHex(12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: clientModel,
    choices: [{ index: 0, message, finish_reason: mapAnthropicStop(an && an.stop_reason) || 'stop' }],
    usage: anthUsageToOA(an && an.usage) || undefined,
  };
}

// 两种 usage 统一成日志用的 {promptTokens, completionTokens, cacheReadTokens?}
export function usageForLog(protocol, u) {
  if (!u || typeof u !== 'object') return {};
  if (protocol === 'anthropic') {
    const o = anthUsageToOA(u);
    const out = { promptTokens: o.prompt_tokens, completionTokens: o.completion_tokens };
    if (typeof u.cache_read_input_tokens === 'number') out.cacheReadTokens = u.cache_read_input_tokens;
    return out;
  }
  const out = { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens };
  const cached = openAICachedTokens(u);
  if (typeof cached === 'number') out.cacheReadTokens = cached;
  return out;
}

// OpenAI 兼容服务商的缓存字段并不统一：
// OpenAI/OpenRouter prompt_tokens_details.cached_tokens；DeepSeek prompt_cache_hit_tokens；
// Moonshot/部分中转 cached_tokens；Responses 风格 input_tokens_details.cached_tokens；
// 少数中转直接透传 Anthropic 的 cache_read_input_tokens
export function openAICachedTokens(u) {
  if (!u || typeof u !== 'object') return undefined;
  const cands = [
    u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens,
    u.prompt_cache_hit_tokens,
    u.cached_tokens,
    u.input_tokens_details && u.input_tokens_details.cached_tokens,
    u.cache_read_input_tokens,
  ];
  for (const v of cands) if (typeof v === 'number') return v;
  return undefined;
}

// ================================================================ token 估算

export function estimateAnthropicInputTokens(body) {
  let n = estimateTokens(textOf(body && body.system));
  for (const m of Array.isArray(body && body.messages) ? body.messages : []) {
    if (!m || typeof m !== 'object') continue;
    n += 4;
    if (typeof m.content === 'string') { n += estimateTokens(m.content); continue; }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (!b) continue;
      if (b.type === 'text') n += estimateTokens(b.text);
      else if (b.type === 'tool_use') n += estimateTokens(JSON.stringify(b.input || {})) + 8;
      else if (b.type === 'tool_result') n += estimateTokens(textOf(b.content)) + 8;
      else if (b.type === 'image') n += 1500; // 粗估
      else if (b.type === 'document') n += 3000;
    }
  }
  if (Array.isArray(body && body.tools)) n += estimateTokens(JSON.stringify(body.tools));
  return n;
}

// ================================================================ 流式处理器
// 统一接口：
//   raw     true = 原样透传上游字节，只扫描统计；false = 用 start/onEvent/finish 的返回值替换输出
//   start() 流开始时要先写出的内容
//   onEvent(event, data) 每个 SSE data 行调用一次，返回要写给客户端的文本
//   finish(errMsg) 上游流结束（或中断，errMsg 非空）时调用，返回收尾文本
//   stats   { promptTokens, completionTokens, outText, error }

const sse = (event, obj) => `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;
const dataLine = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

function tryJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// OpenAI SSE 只扫描（透传）
function openAIScanner() {
  const stats = { outText: '', error: null };
  return {
    raw: true,
    stats,
    start: () => '',
    onEvent(_e, data) {
      if (!data || data === '[DONE]') return '';
      const o = tryJson(data);
      if (!o) return '';
      if (o.usage && typeof o.usage === 'object') Object.assign(stats, usageForLog('openai', o.usage));
      const d = o.choices && o.choices[0] && o.choices[0].delta;
      if (d) {
        if (typeof d.content === 'string') stats.outText += d.content;
        if (typeof d.reasoning_content === 'string') stats.outText += d.reasoning_content;
      }
      if (o.error) stats.error = `上游在流中返回错误：${JSON.stringify(o.error).slice(0, 2000)}`;
      return '';
    },
    finish: () => '',
  };
}

// Anthropic SSE 只扫描（透传）
function anthropicScanner() {
  const stats = { outText: '', error: null };
  let usage = {};
  return {
    raw: true,
    stats,
    start: () => '',
    onEvent(event, data) {
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;
      if (type === 'message_start' && o.message && o.message.usage) usage = { ...usage, ...o.message.usage };
      else if (type === 'message_delta' && o.usage) usage = { ...usage, ...o.usage };
      else if (type === 'content_block_delta' && o.delta) {
        if (typeof o.delta.text === 'string') stats.outText += o.delta.text;
        if (typeof o.delta.thinking === 'string') stats.outText += o.delta.thinking;
      } else if (type === 'error') stats.error = `上游在流中返回错误：${JSON.stringify(o.error || o).slice(0, 2000)}`;
      if (Object.keys(usage).length) Object.assign(stats, usageForLog('anthropic', usage));
      return '';
    },
    finish: () => '',
  };
}

// OpenAI 上游流 → Anthropic 事件流
function openAIToAnthropicStream({ clientModel }) {
  const scan = openAIScanner();
  const stats = scan.stats;
  const id = newMsgId();
  let blockIndex = -1;
  let current = null; // 只跟踪尚未关闭的文本块
  // OpenAI 会交错推送多个 tool index。先按 index 攒齐，结束时再逐块输出，避免对已 stop 的块继续发 delta。
  const toolAcc = new Map(); // index → { id, name, args }
  let stopReason = null;
  let usage = null;
  let finished = false;
  let inbandError = false;

  const closeCurrent = () => {
    if (!current) return '';
    const s = sse('content_block_stop', { type: 'content_block_stop', index: current.index });
    current = null;
    return s;
  };

  const emitBufferedTools = () => {
    let s = '';
    const indices = [...toolAcc.keys()].sort((a, b) => a - b);
    for (const oi of indices) {
      const acc = toolAcc.get(oi);
      blockIndex += 1;
      s += sse('content_block_start', {
        type: 'content_block_start',
        index: blockIndex,
        content_block: { type: 'tool_use', id: safeToolId(acc.id), name: acc.name || '', input: {} },
      });
      if (acc.args) {
        s += sse('content_block_delta', {
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'input_json_delta', partial_json: acc.args },
        });
      }
      s += sse('content_block_stop', { type: 'content_block_stop', index: blockIndex });
    }
    return s;
  };

  return {
    raw: false,
    stats,
    start: () => sse('message_start', {
      type: 'message_start',
      message: { id, type: 'message', role: 'assistant', model: clientModel, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
    }),
    onEvent(event, data) {
      scan.onEvent(event, data);
      if (!data || data === '[DONE]') return '';
      const o = tryJson(data);
      if (!o) return '';
      let out = '';
      if (o.error) {
        inbandError = true;
        out += closeCurrent();
        out += sse('error', { type: 'error', error: { type: 'api_error', message: `上游在流中返回错误：${JSON.stringify(o.error)}` } });
        return out;
      }
      if (o.usage) usage = o.usage;
      const choice = o.choices && o.choices[0];
      if (!choice) return out;
      const d = choice.delta || {};
      if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
        if (!current || current.kind !== 'thinking') {
          out += closeCurrent();
          blockIndex++;
          current = { kind: 'thinking', index: blockIndex };
          out += sse('content_block_start', { type: 'content_block_start', index: blockIndex, content_block: { type: 'thinking', thinking: '' } });
        }
        out += sse('content_block_delta', { type: 'content_block_delta', index: current.index, delta: { type: 'thinking_delta', thinking: d.reasoning_content } });
      }
      if (typeof d.reasoning_signature === 'string' && d.reasoning_signature) {
        if (!current || current.kind !== 'thinking') {
          out += closeCurrent();
          blockIndex++;
          current = { kind: 'thinking', index: blockIndex };
          out += sse('content_block_start', { type: 'content_block_start', index: blockIndex, content_block: { type: 'thinking', thinking: '' } });
        }
        out += sse('content_block_delta', { type: 'content_block_delta', index: current.index, delta: { type: 'signature_delta', signature: d.reasoning_signature } });
      }
      if (typeof d.content === 'string' && d.content) {
        if (!current || current.kind !== 'text') {
          out += closeCurrent();
          blockIndex++;
          current = { kind: 'text', index: blockIndex };
          out += sse('content_block_start', { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } });
        }
        out += sse('content_block_delta', { type: 'content_block_delta', index: current.index, delta: { type: 'text_delta', text: d.content } });
      }
      for (const tc of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
        const oi = tc.index ?? 0;
        let acc = toolAcc.get(oi);
        if (!acc) {
          acc = { id: '', name: '', args: '' };
          toolAcc.set(oi, acc);
        }
        if (tc.id) acc.id = tc.id;
        if (tc.function && tc.function.name) acc.name = tc.function.name;
        if (tc.function && typeof tc.function.arguments === 'string' && tc.function.arguments) {
          acc.args += tc.function.arguments;
          stats.outText += tc.function.arguments;
        }
      }
      if (choice.finish_reason) stopReason = mapOpenAIStop(choice.finish_reason);
      return out;
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      if (inbandError && !errMsg) return '';
      let out = closeCurrent();
      if (errMsg) {
        out += sse('error', { type: 'error', error: { type: 'api_error', message: errMsg } });
        return out;
      }
      out += emitBufferedTools();
      if (!stopReason) stopReason = toolAcc.size ? 'tool_use' : 'end_turn';
      if (stopReason === 'end_turn' && toolAcc.size) stopReason = 'tool_use';
      const u = usage ? oaUsageToAnth(usage) : { input_tokens: 0, output_tokens: estimateTokens(stats.outText) };
      out += sse('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: u });
      out += sse('message_stop', { type: 'message_stop' });
      return out;
    },
  };
}

// Anthropic 上游流 → OpenAI chunk 流
function anthropicToOpenAIStream({ clientModel, includeUsage }) {
  const scan = anthropicScanner();
  const stats = scan.stats;
  let id = `chatcmpl-${randomHex(12)}`;
  const created = Math.floor(Date.now() / 1000);
  const blockToTool = new Map(); // Anthropic 块序号 → OpenAI tool index
  let toolCount = 0;
  let usage = {};
  let finishReason = null;
  let finished = false;
  let inbandError = false;
  const chunk = (delta, finish = null, extra = {}) => dataLine({ id, object: 'chat.completion.chunk', created, model: clientModel, choices: [{ index: 0, delta, finish_reason: finish }], ...extra });

  return {
    raw: false,
    stats,
    start: () => '',
    onEvent(event, data) {
      scan.onEvent(event, data);
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;
      if (type === 'message_start') {
        if (o.message && o.message.id) id = `chatcmpl-${o.message.id}`;
        if (o.message && o.message.usage) usage = { ...usage, ...o.message.usage };
        return chunk({ role: 'assistant', content: '' });
      }
      if (type === 'content_block_start') {
        const b = o.content_block || {};
        if (b.type === 'tool_use') {
          const ti = toolCount++;
          blockToTool.set(o.index, ti);
          return chunk({ tool_calls: [{ index: ti, id: b.id, type: 'function', function: { name: b.name, arguments: '' } }] });
        }
        if (b.type === 'text' && b.text) return chunk({ content: b.text });
        return '';
      }
      if (type === 'content_block_delta') {
        const d = o.delta || {};
        if (d.type === 'text_delta') return chunk({ content: d.text || '' });
        if (d.type === 'thinking_delta') return chunk({ reasoning_content: d.thinking || '' });
        if (d.type === 'signature_delta') return chunk({ reasoning_signature: d.signature || '' });
        if (d.type === 'input_json_delta') {
          const ti = blockToTool.get(o.index);
          if (ti === undefined) return '';
          return chunk({ tool_calls: [{ index: ti, function: { arguments: d.partial_json || '' } }] });
        }
        return '';
      }
      if (type === 'message_delta') {
        if (o.usage) usage = { ...usage, ...o.usage };
        if (o.delta && o.delta.stop_reason) {
          finishReason = mapAnthropicStop(o.delta.stop_reason);
          return chunk({}, finishReason);
        }
        return '';
      }
      if (type === 'error') {
        inbandError = true;
        return dataLine({ error: { message: `上游在流中返回错误：${JSON.stringify(o.error || o)}`, type: (o.error && o.error.type) || 'upstream_error' } });
      }
      return ''; // ping / content_block_stop / message_stop
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      if (inbandError && !errMsg) return '';
      let out = '';
      if (errMsg) out += dataLine({ error: { message: errMsg, type: 'upstream_error' } });
      else if (!finishReason) out += chunk({}, toolCount ? 'tool_calls' : 'stop');
      if (includeUsage && !errMsg) {
        const u = anthUsageToOA(usage);
        if (u) out += dataLine({ id, object: 'chat.completion.chunk', created, model: clientModel, choices: [], usage: u });
      }
      out += 'data: [DONE]\n\n';
      return out;
    },
  };
}

// 没有 signature 的 thinking 发回 Anthropic 会被拒绝。转成普通文本，已签名的块原样保留。
export function sanitizeAnthropicPayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return body;
  return {
    ...body,
    messages: body.messages.map((m) => {
      if (!m || !Array.isArray(m.content)) return m;
      const content = [];
      for (const b of m.content) {
        if (b && b.type === 'thinking' && !(typeof b.signature === 'string' && b.signature)) {
          if (b.thinking) content.push({ type: 'text', text: b.thinking });
          continue;
        }
        content.push(b);
      }
      return { ...m, content: content.length ? content : m.content };
    }),
  };
}

export function createStreamHandler(clientProtocol, upstreamProtocol, opts = {}) {
  if (clientProtocol === upstreamProtocol) return upstreamProtocol === 'anthropic' ? anthropicScanner() : openAIScanner();
  if (clientProtocol === 'anthropic') return openAIToAnthropicStream(opts);
  return anthropicToOpenAIStream(opts);
}
