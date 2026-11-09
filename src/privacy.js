// FlareRouter 隐私与数据脱敏模块
// MIT License © 2026 FlareRouter

// 64 位 FNV-1a 同步哈希算法，生成稳定、确定性的 8 字符十六进制暗号
function fnv1a64(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1.slice(0, 4) + hex2.slice(0, 4)).toLowerCase();
}

// 常见 API Key、凭据与私钥特征正则
const REGEX_API_KEY = /\b(sk-[a-zA-Z0-9_\-]{20,}|ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,}|xox[baprs]-[a-zA-Z0-9]{10,}|AIza[0-9A-Za-z\-_]{35}|bearer\s+[a-zA-Z0-9_\-\.]{25,})\b/gi;
const REGEX_DB_CONN = /((?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s]+:)([^@\s]{3,})(@)/gi;
const REGEX_IPV4 = /(?<![\w\.])(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?![\w\.])/g;

/**
 * 判定指定服务商与全局设置下，本次请求是否应当启用隐私脱敏
 * @param {object} cfg - 全局配置
 * @param {object} provider - 目标上游服务商
 * @returns {boolean}
 */
export function resolvePrivacyPolicy(cfg, provider) {
  const provPolicy = provider?.privacy || 'inherit';
  if (provPolicy === 'on') return true;
  if (provPolicy === 'off') return false;
  return Boolean(cfg?.settings?.privacy?.enabled);
}

/**
 * 隐私脱敏处理器
 */
export class PrivacyManager {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled ?? false,
      maskSecrets: options.maskSecrets ?? true,
      maskIp: options.maskIp ?? true,
      customWords: Array.isArray(options.customWords) ? options.customWords.filter(Boolean) : [],
    };
    // placeholder -> original
    this.secretMap = new Map();
    // original -> placeholder
    this.reverseMap = new Map();
    this.hits = 0;
  }

  getPlaceholder(kind, original) {
    if (this.reverseMap.has(original)) {
      return this.reverseMap.get(original);
    }
    const hash = fnv1a64(original);
    const placeholder = `{{MASK_${kind.toUpperCase()}_${hash}}}`;
    this.secretMap.set(placeholder, original);
    this.reverseMap.set(original, placeholder);
    this.hits++;
    return placeholder;
  }

  maskText(text) {
    if (typeof text !== 'string' || !text) return text;
    let res = text;

    // 1. 自定义敏感词（按长度倒序匹配，避免前缀被提前切断）
    if (this.options.customWords.length) {
      const sorted = [...this.options.customWords].sort((a, b) => b.length - a.length);
      for (const word of sorted) {
        if (!word) continue;
        if (res.includes(word)) {
          const ph = this.getPlaceholder('CUSTOM', word);
          res = res.replaceAll(word, ph);
        }
      }
    }

    // 2. 数据库连接串密码脱敏
    if (this.options.maskSecrets) {
      res = res.replace(REGEX_DB_CONN, (match, prefix, pass, suffix) => {
        const ph = this.getPlaceholder('DBPASS', pass);
        return `${prefix}${ph}${suffix}`;
      });

      // API Key / 凭据
      res = res.replace(REGEX_API_KEY, (match) => {
        // 如果是带 Bearer 的，只脱敏 token 部分
        if (/^bearer\s+/i.test(match)) {
          const token = match.slice(7);
          return `Bearer ${this.getPlaceholder('KEY', token)}`;
        }
        return this.getPlaceholder('KEY', match);
      });
    }

    // 3. IPv4 地址
    if (this.options.maskIp) {
      res = res.replace(REGEX_IPV4, (match) => {
        // 排除常见无害本地 IP
        if (match === '127.0.0.1' || match === '0.0.0.0' || match === '255.255.255.255') {
          return match;
        }
        return this.getPlaceholder('IP', match);
      });
    }

    return res;
  }

  /**
   * 递归脱敏结构化 Payload 中的文本字段
   * 绝不破坏协议关键字段（如 role, model, tool_call_id, function name）
   */
  maskPayload(payload) {
    if (!payload || typeof payload !== 'object') return { maskedBody: payload, context: this };
    const clone = JSON.parse(JSON.stringify(payload));

    // 处理 system 字段（OpenAI / Anthropic）
    if (typeof clone.system === 'string') {
      clone.system = this.maskText(clone.system);
    } else if (Array.isArray(clone.system)) {
      for (const item of clone.system) {
        if (item && typeof item.text === 'string') {
          item.text = this.maskText(item.text);
        }
      }
    }

    // 处理 messages 列表
    if (Array.isArray(clone.messages)) {
      for (const msg of clone.messages) {
        if (!msg || typeof msg !== 'object') continue;
        if (typeof msg.content === 'string') {
          msg.content = this.maskText(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (!part || typeof part !== 'object') continue;
            if (part.type === 'text' && typeof part.text === 'string') {
              part.text = this.maskText(part.text);
            }
          }
        }
      }
    }

    // 处理 prompt 字段（针对 legacy completions）
    if (typeof clone.prompt === 'string') {
      clone.prompt = this.maskText(clone.prompt);
    } else if (Array.isArray(clone.prompt)) {
      clone.prompt = clone.prompt.map((p) => (typeof p === 'string' ? this.maskText(p) : p));
    }

    return { maskedBody: clone, context: this };
  }

  /**
   * 还原返回文本中的占位符
   */
  restoreText(text) {
    if (typeof text !== 'string' || !text || this.secretMap.size === 0) return text;
    let res = text;
    for (const [placeholder, original] of this.secretMap.entries()) {
      if (res.includes(placeholder)) {
        res = res.replaceAll(placeholder, original);
      }
    }
    return res;
  }

  /**
   * 创建流式 SSE 事件行还原器
   * 针对跨 SSE 事件被截断的占位符（如 event 1 末尾输出 {{MASK_，event 2 开头输出 KEY_123}}）
   */
  createStreamRestorer() {
    if (this.secretMap.size === 0) {
      return (line) => line;
    }
    const self = this;
    let pendingTail = ''; // 暂扣的未闭合暗号前缀
    const HOLD_LIMIT = 48;

    return (chunk) => {
      if (!chunk) return chunk;
      let text = pendingTail + chunk;
      pendingTail = '';

      // 检查当前 chunk 末尾是否包含未闭合的 {{ 疑似暗号前缀
      const lastOpen = text.lastIndexOf('{{');
      if (lastOpen >= 0 && text.length - lastOpen <= HOLD_LIMIT) {
        const afterOpen = text.slice(lastOpen);
        if (!afterOpen.includes('}}')) {
          // 结尾有未闭合的 {{ 暗号，暂扣到下一个 chunk
          pendingTail = afterOpen;
          text = text.slice(0, lastOpen);
        }
      }

      return self.restoreText(text);
    };
  }
}

