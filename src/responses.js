// OpenAI Responses API 协议 (/v1/responses) ⇄ Chat Completions / Anthropic Messages 协议互转
// 只做协议格式与流式事件转换，网关的寻址、容灾、鉴权、日志在 gateway.js

import { estimateMessagesTokens, estimateTokens, randomHex } from './util.js';
import {
  anthropicToOpenAIRequest,
  anthropicToOpenAIResponse,
  openAIToAnthropicRequest,
  openAIToAnthropicResponse,
} from './anthropic.js';

export function responsesUrl(baseUrl, endpoint = 'responses') {
  let b = String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|embeddings|messages|responses)$/, '');
  if (!/\/v1$/.test(b)) b += '/v1';
  return `${b}/${endpoint}`;
}

export function responsesHeaders(apiKey, { stream } = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || ''}`,
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
}

// ---------------------------------------------------------------- 请求体互转

/**
 * 将 Responses API 请求转为 OpenAI Chat Completions 请求
 */
export function responsesToOpenAIRequest(body, model, { stream, streamUsage } = {}) {
  const msgs = [];

  if (typeof body.instructions === 'string' && body.instructions) {
    msgs.push({ role: 'system', content: body.instructions });
  }

  if (typeof body.input === 'string') {
    msgs.push({ role: 'user', content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!item) continue;
      if (typeof item === 'string') {
        msgs.push({ role: 'user', content: item });
      } else if (typeof item === 'object') {
        if (item.type === 'message' || item.role) {
          const role = item.role || 'user';
          let content = item.content;
          if (Array.isArray(content)) {
            content = content.map((p) => {
              if (typeof p === 'string') return { type: 'text', text: p };
              if (p && (p.type === 'text' || p.type === 'input_text' || p.type === 'output_text')) {
                return { type: 'text', text: p.text || '' };
              }
              if (p && p.type === 'image_url') return p;
              return { type: 'text', text: String(p?.text || '') };
            });
          }
          const m = { role, content: content ?? '' };
          if (Array.isArray(item.tool_calls)) m.tool_calls = item.tool_calls;
          msgs.push(m);
        } else if (item.type === 'function_call_output' || item.type === 'tool_result') {
          msgs.push({
            role: 'tool',
            tool_call_id: item.call_id || item.tool_call_id || item.id || `call_${randomHex(8)}`,
            content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
          });
        }
      }
    }
  }

  const out = {
    model,
    messages: msgs,
  };

  const maxTokens = body.max_output_tokens ?? body.max_tokens ?? body.max_completion_tokens;
  if (maxTokens != null) out.max_tokens = maxTokens;
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.stop != null) out.stop = body.stop;
  if (body.user != null) out.user = String(body.user);

  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t) => {
      if (t && t.type === 'function' && t.function) return t;
      if (t && (t.type === 'function' || !t.type) && t.name) {
        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description || '',
            parameters: t.parameters || t.input_schema || { type: 'object', properties: {} },
          },
        };
      }
      return t;
    });
    if (body.tool_choice != null) out.tool_choice = body.tool_choice;
  }

  if (body.response_format) {
    out.response_format = body.response_format;
  } else if (body.text?.format) {
    out.response_format = typeof body.text.format === 'string' ? { type: body.text.format } : body.text.format;
  }

  if (stream) {
    out.stream = true;
    if (streamUsage) out.stream_options = { include_usage: true };
  }

  return out;
}

/**
 * 将 OpenAI Chat Completions 请求转为 Responses API 请求
 */
export function openAIToResponsesRequest(body, model, { stream } = {}) {
  const input = [];
  let instructions = undefined;

  const msgs = Array.isArray(body.messages) ? body.messages : [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m) continue;
    if ((m.role === 'system' || m.role === 'developer') && instructions === undefined) {
      instructions = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c) => c.text || '').join('\n') : '';
      continue;
    }
    if (m.role === 'tool' || m.role === 'function') {
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id || m.name || '',
        output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      });
    } else {
      let content = m.content;
      const partType = m.role === 'assistant' ? 'output_text' : 'input_text';
      if (typeof content === 'string') {
        content = [{ type: partType, text: content }];
      } else if (Array.isArray(content)) {
        content = content.map((p) => {
          if (typeof p === 'string') return { type: partType, text: p };
          if (p && (p.type === 'text' || p.type === 'input_text' || p.type === 'output_text')) {
            return { type: partType, text: p.text || '' };
          }
          return p;
        });
      }
      input.push({
        type: 'message',
        role: m.role || 'user',
        content,
        ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls } : {}),
      });
    }
  }

  const out = {
    model,
    input,
  };

  if (instructions) out.instructions = instructions;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (maxTokens != null) out.max_output_tokens = maxTokens;
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;

  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t) => {
      if (t && t.type === 'function' && t.function) {
        return {
          type: 'function',
          name: t.function.name,
          description: t.function.description || '',
          parameters: t.function.parameters || { type: 'object', properties: {} },
        };
      }
      return t;
    });
    if (body.tool_choice != null) out.tool_choice = body.tool_choice;
  }

  if (body.response_format) {
    out.text = { format: body.response_format.type || 'text' };
  }

  if (stream) out.stream = true;
  return out;
}

export function responsesToAnthropicRequest(body, model, opts = {}) {
  const oaReq = responsesToOpenAIRequest(body, model, opts);
  return openAIToAnthropicRequest(oaReq, model, opts);
}

export function anthropicToResponsesRequest(body, model, opts = {}) {
  const oaReq = anthropicToOpenAIRequest(body, model, opts);
  return openAIToResponsesRequest(oaReq, model, opts);
}

// ---------------------------------------------------------------- 响应体互转 (非流式)

/**
 * 将 OpenAI Chat Completions 响应转换为 Responses API 格式
 */
export function openAIToResponsesResponse(body, model) {
  const choice = (body.choices && body.choices[0]) || {};
  const msg = choice.message || {};
  const output = [];

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    for (const tc of msg.tool_calls) {
      if (!tc || !tc.function) continue;
      output.push({
        id: tc.id || `call_${randomHex(12)}`,
        type: 'function_call',
        name: tc.function.name || '',
        arguments: tc.function.arguments || '{}',
        call_id: tc.id || `call_${randomHex(12)}`,
      });
    }
  }

  const text = msg.content ?? '';
  if (text || !output.length) {
    output.unshift({
      id: `item_${randomHex(12)}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: String(text) }],
    });
  }

  const usage = body.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens || usage.cache_read_input_tokens || 0;

  return {
    id: body.id && body.id.startsWith('resp_') ? body.id : `resp_${randomHex(12)}`,
    object: 'response',
    created_at: body.created || Math.floor(Date.now() / 1000),
    status: 'completed',
    model: model || body.model || 'auto',
    output,
    usage: {
      total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_token_details: {
        cached_tokens: cachedTokens,
      },
      output_token_details: {
        reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
      },
    },
  };
}

/**
 * 将 Responses API 响应转换为 OpenAI Chat Completions 格式
 */
export function responsesToOpenAIResponse(body, model) {
  const output = Array.isArray(body.output) ? body.output : [];
  let textContent = '';
  const toolCalls = [];

  for (const item of output) {
    if (!item) continue;
    if (item.type === 'message') {
      const parts = Array.isArray(item.content) ? item.content : [];
      for (const p of parts) {
        if (p && (p.type === 'text' || p.type === 'output_text' || p.type === 'input_text')) textContent += p.text || '';
        else if (typeof p === 'string') textContent += p;
      }
    } else if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id || item.id || `call_${randomHex(12)}`,
        type: 'function',
        function: {
          name: item.name || '',
          arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
        },
      });
    }
  }

  const usage = body.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;

  return {
    id: body.id && body.id.startsWith('chatcmpl-') ? body.id : `chatcmpl-${randomHex(12)}`,
    object: 'chat.completion',
    created: body.created_at || Math.floor(Date.now() / 1000),
    model: model || body.model || 'auto',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent || (toolCalls.length ? null : ''),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      prompt_tokens_details: {
        cached_tokens: usage.input_token_details?.cached_tokens || 0,
      },
    },
  };
}

export function anthropicToResponsesResponse(body, model) {
  const oa = anthropicToOpenAIResponse(body, model);
  return openAIToResponsesResponse(oa, model);
}

export function responsesToAnthropicResponse(body, model) {
  const oa = responsesToOpenAIResponse(body, model);
  return openAIToAnthropicResponse(oa, model);
}

// ---------------------------------------------------------------- 流式 SSE 事件与处理器

const sseEvent = (event, obj) => `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;

function tryJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * 原生 Responses SSE 流扫描器（同协议透传，提取 usage 和异常）
 */
export function responsesScanner() {
  const stats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, inbandError: null };
  return {
    raw: true,
    stats,
    start: () => '',
    onEvent(event, data) {
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;
      if (type === 'response.completed' || (o.response && o.response.status === 'completed')) {
        const u = o.response?.usage || o.usage;
        if (u) {
          stats.promptTokens = u.input_tokens || stats.promptTokens;
          stats.completionTokens = u.output_tokens || stats.completionTokens;
          stats.totalTokens = u.total_tokens || stats.totalTokens;
          stats.cacheReadTokens = u.input_token_details?.cached_tokens || stats.cacheReadTokens;
        }
      } else if (type === 'response.failed' || type === 'error') {
        stats.inbandError = o.error?.message || (typeof o.error === 'string' ? o.error : JSON.stringify(o.error || o));
      }
      return '';
    },
    finish: () => '',
  };
}

/**
 * OpenAI Chat Completions chunk 流 → Responses API SSE 流
 */
export function openAIToResponsesStream({ clientModel }) {
  const stats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, inbandError: null };
  const respId = `resp_${randomHex(12)}`;
  const itemId = `item_${randomHex(12)}`;
  let seq = 0;
  let initialized = false;
  let textAccum = '';
  let finished = false;

  const emit = (event, payload) => sseEvent(event, { ...payload, sequence_number: seq++ });

  return {
    raw: false,
    stats,
    start() {
      initialized = true;
      let out = '';
      out += emit('response.created', {
        type: 'response.created',
        response: {
          id: respId,
          object: 'response',
          status: 'in_progress',
          model: clientModel,
          output: [],
          usage: null,
        },
      });
      out += emit('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: itemId,
          type: 'message',
          status: 'in_progress',
          role: 'assistant',
          content: [],
        },
      });
      out += emit('response.content_part.added', {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '' },
      });
      return out;
    },
    onEvent(event, data) {
      if (data === '[DONE]') return '';
      const o = tryJson(data);
      if (!o) return '';

      if (o.error) {
        stats.inbandError = o.error.message || JSON.stringify(o.error);
        return emit('response.failed', {
          type: 'response.failed',
          error: o.error,
        });
      }

      let out = '';
      const choice = (o.choices && o.choices[0]) || {};
      const delta = choice.delta || {};

      if (typeof delta.content === 'string' && delta.content) {
        textAccum += delta.content;
        out += emit('response.output_text.delta', {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: delta.content,
        });
      }

      if (o.usage) {
        stats.promptTokens = o.usage.prompt_tokens || stats.promptTokens;
        stats.completionTokens = o.usage.completion_tokens || stats.completionTokens;
        stats.totalTokens = o.usage.total_tokens || stats.totalTokens;
        stats.cacheReadTokens = o.usage.prompt_tokens_details?.cached_tokens || stats.cacheReadTokens;
      }

      return out;
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      if (errMsg) {
        return emit('response.failed', {
          type: 'response.failed',
          error: { message: errMsg, type: 'upstream_error' },
        });
      }

      let out = '';
      out += emit('response.output_text.done', {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        text: textAccum,
      });
      out += emit('response.content_part.done', {
        type: 'response.content_part.done',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: textAccum },
      });
      out += emit('response.output_item.done', {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: itemId,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: textAccum }],
        },
      });

      const promptTokens = stats.promptTokens || estimateTokens(clientModel);
      const completionTokens = stats.completionTokens || estimateTokens(textAccum);
      const totalTokens = stats.totalTokens || promptTokens + completionTokens;

      out += emit('response.completed', {
        type: 'response.completed',
        response: {
          id: respId,
          object: 'response',
          status: 'completed',
          model: clientModel,
          output: [
            {
              id: itemId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: textAccum }],
            },
          ],
          usage: {
            total_tokens: totalTokens,
            input_tokens: promptTokens,
            output_tokens: completionTokens,
            input_token_details: { cached_tokens: stats.cacheReadTokens || 0 },
            output_token_details: { reasoning_tokens: 0 },
          },
        },
      });

      return out;
    },
  };
}

/**
 * Responses API SSE 流 → OpenAI Chat Completions chunk 流
 */
export function responsesToOpenAIStream({ clientModel, includeUsage }) {
  const stats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, inbandError: null };
  const id = `chatcmpl-${randomHex(12)}`;
  const created = Math.floor(Date.now() / 1000);
  let finished = false;

  const dataLine = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
  const chunk = (delta, finish = null, extra = {}) =>
    dataLine({
      id,
      object: 'chat.completion.chunk',
      created,
      model: clientModel,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...extra,
    });

  return {
    raw: false,
    stats,
    start() {
      return chunk({ role: 'assistant', content: '' });
    },
    onEvent(event, data) {
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;

      if (type === 'response.output_text.delta') {
        const deltaText = o.delta ?? '';
        if (deltaText) return chunk({ content: deltaText });
      } else if (type === 'response.completed' || (o.response && o.response.status === 'completed')) {
        const u = o.response?.usage || o.usage;
        if (u) {
          stats.promptTokens = u.input_tokens || stats.promptTokens;
          stats.completionTokens = u.output_tokens || stats.completionTokens;
          stats.totalTokens = u.total_tokens || stats.totalTokens;
          stats.cacheReadTokens = u.input_token_details?.cached_tokens || stats.cacheReadTokens;
        }
      } else if (type === 'response.failed' || type === 'error') {
        stats.inbandError = o.error?.message || JSON.stringify(o.error || o);
        return dataLine({ error: { message: `上游在流中返回错误：${stats.inbandError}`, type: 'upstream_error' } });
      }
      return '';
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      let out = '';
      if (errMsg) {
        out += dataLine({ error: { message: errMsg, type: 'upstream_error' } });
      } else {
        out += chunk({}, 'stop');
        if (includeUsage && stats.totalTokens) {
          out += dataLine({
            id,
            object: 'chat.completion.chunk',
            created,
            model: clientModel,
            choices: [],
            usage: {
              prompt_tokens: stats.promptTokens,
              completion_tokens: stats.completionTokens,
              total_tokens: stats.totalTokens,
            },
          });
        }
      }
      out += 'data: [DONE]\n\n';
      return out;
    },
  };
}

/**
 * Anthropic SSE 流 → Responses API SSE 流
 */
export function anthropicToResponsesStream({ clientModel }) {
  const stats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, inbandError: null };
  const respId = `resp_${randomHex(12)}`;
  const itemId = `item_${randomHex(12)}`;
  let seq = 0;
  let textAccum = '';
  let finished = false;

  const emit = (event, payload) => sseEvent(event, { ...payload, sequence_number: seq++ });

  return {
    raw: false,
    stats,
    start() {
      let out = '';
      out += emit('response.created', {
        type: 'response.created',
        response: {
          id: respId,
          object: 'response',
          status: 'in_progress',
          model: clientModel,
          output: [],
          usage: null,
        },
      });
      out += emit('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: itemId,
          type: 'message',
          status: 'in_progress',
          role: 'assistant',
          content: [],
        },
      });
      out += emit('response.content_part.added', {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '' },
      });
      return out;
    },
    onEvent(event, data) {
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;

      if (type === 'message_start' && o.message?.usage) {
        stats.promptTokens = o.message.usage.input_tokens || stats.promptTokens;
      } else if (type === 'content_block_delta') {
        const d = o.delta || {};
        if (d.type === 'text_delta' && d.text) {
          textAccum += d.text;
          return emit('response.output_text.delta', {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            delta: d.text,
          });
        }
      } else if (type === 'message_delta') {
        if (o.usage) {
          stats.completionTokens = o.usage.output_tokens || stats.completionTokens;
          stats.totalTokens = (stats.promptTokens || 0) + (stats.completionTokens || 0);
        }
      } else if (type === 'error') {
        stats.inbandError = o.error?.message || JSON.stringify(o.error || o);
        return emit('response.failed', {
          type: 'response.failed',
          error: o.error || { message: stats.inbandError },
        });
      }
      return '';
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      if (errMsg) {
        return emit('response.failed', {
          type: 'response.failed',
          error: { message: errMsg, type: 'upstream_error' },
        });
      }

      let out = '';
      out += emit('response.output_text.done', {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        text: textAccum,
      });
      out += emit('response.content_part.done', {
        type: 'response.content_part.done',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: textAccum },
      });
      out += emit('response.output_item.done', {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: itemId,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: textAccum }],
        },
      });

      const promptTokens = stats.promptTokens || estimateTokens(clientModel);
      const completionTokens = stats.completionTokens || estimateTokens(textAccum);
      const totalTokens = stats.totalTokens || promptTokens + completionTokens;

      out += emit('response.completed', {
        type: 'response.completed',
        response: {
          id: respId,
          object: 'response',
          status: 'completed',
          model: clientModel,
          output: [
            {
              id: itemId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: textAccum }],
            },
          ],
          usage: {
            total_tokens: totalTokens,
            input_tokens: promptTokens,
            output_tokens: completionTokens,
            input_token_details: { cached_tokens: stats.cacheReadTokens || 0 },
            output_token_details: { reasoning_tokens: 0 },
          },
        },
      });

      return out;
    },
  };
}

/**
 * Responses API SSE 流 → Anthropic SSE 流
 */
export function responsesToAnthropicStream({ clientModel }) {
  const stats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, inbandError: null };
  const msgId = `msg_${randomHex(12)}`;
  let textAccum = '';
  let finished = false;

  const anthSse = (ev, obj) => `event: ${ev}\ndata: ${JSON.stringify(obj)}\n\n`;

  return {
    raw: false,
    stats,
    start() {
      let out = '';
      out += anthSse('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          model: clientModel,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      out += anthSse('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      return out;
    },
    onEvent(event, data) {
      const o = tryJson(data);
      if (!o) return '';
      const type = o.type || event;

      if (type === 'response.output_text.delta') {
        const deltaText = o.delta ?? '';
        if (deltaText) {
          textAccum += deltaText;
          return anthSse('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: deltaText },
          });
        }
      } else if (type === 'response.completed' || (o.response && o.response.status === 'completed')) {
        const u = o.response?.usage || o.usage;
        if (u) {
          stats.promptTokens = u.input_tokens || stats.promptTokens;
          stats.completionTokens = u.output_tokens || stats.completionTokens;
          stats.totalTokens = u.total_tokens || stats.totalTokens;
          stats.cacheReadTokens = u.input_token_details?.cached_tokens || stats.cacheReadTokens;
        }
      } else if (type === 'response.failed' || type === 'error') {
        stats.inbandError = o.error?.message || JSON.stringify(o.error || o);
        return anthSse('error', {
          type: 'error',
          error: { type: 'api_error', message: `上游在流中返回错误：${stats.inbandError}` },
        });
      }
      return '';
    },
    finish(errMsg) {
      if (finished) return '';
      finished = true;
      let out = '';
      if (errMsg) {
        out += anthSse('error', {
          type: 'error',
          error: { type: 'api_error', message: errMsg },
        });
      } else {
        out += anthSse('content_block_stop', { type: 'content_block_stop', index: 0 });
        out += anthSse('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: stats.completionTokens || estimateTokens(textAccum) },
        });
        out += anthSse('message_stop', { type: 'message_stop' });
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- 辅助工具

export function usageForResponsesLog(u) {
  if (!u || typeof u !== 'object') return {};
  const promptTokens = u.input_tokens;
  const completionTokens = u.output_tokens;
  const totalTokens = typeof u.total_tokens === 'number' ? u.total_tokens : (typeof promptTokens === 'number' && typeof completionTokens === 'number' ? promptTokens + completionTokens : undefined);
  const cacheReadTokens = u.input_token_details?.cached_tokens;
  return { promptTokens, completionTokens, totalTokens, cacheReadTokens };
}

export function estimateResponsesPrompt(body) {
  if (!body) return 0;
  let n = 0;
  if (typeof body.instructions === 'string') n += estimateTokens(body.instructions);
  if (typeof body.input === 'string') {
    n += estimateTokens(body.input);
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (typeof item === 'string') n += estimateTokens(item);
      else if (item && typeof item === 'object') {
        if (typeof item.content === 'string') n += estimateTokens(item.content);
        else if (Array.isArray(item.content)) {
          for (const p of item.content) if (p && typeof p.text === 'string') n += estimateTokens(p.text);
        }
      }
    }
  }
  return n + 4;
}

export function lastResponsesUserText(body) {
  if (!body) return null;
  if (typeof body.input === 'string') return body.input;
  if (Array.isArray(body.input)) {
    for (let i = body.input.length - 1; i >= 0; i--) {
      const item = body.input[i];
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        if (typeof item.content === 'string') return item.content;
        if (Array.isArray(item.content)) return item.content.map((c) => c?.text || '').join(' ');
      }
    }
  }
  return null;
}
