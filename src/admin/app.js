function capsBadgeHtml(caps) {
  if (!Array.isArray(caps) || !caps.length) return '';
  var out = '';
  if (caps.indexOf('vision') >= 0) out += '<span class="cap-badge vision" title="' + t('fallback.capVision') + '">👁 ' + t('fallback.capVision') + '</span>';
  if (caps.indexOf('tools') >= 0) out += '<span class="cap-badge tools" title="' + t('fallback.capTools') + '">🛠 ' + t('fallback.capTools') + '</span>';
  if (caps.indexOf('thinking') >= 0) out += '<span class="cap-badge thinking" title="' + t('fallback.capThinking') + '">🧠 ' + t('fallback.capThinking') + '</span>';
  if (caps.indexOf('image') >= 0 || caps.indexOf('imageGen') >= 0) out += '<span class="cap-badge image" title="' + t('fallback.capImage') + '">🎨 ' + t('fallback.capImage') + '</span>';
  return out;
}

// FlareRouter 管理页面主干逻辑

var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

var state = { cfg: null, keys: [], logOffset: 0, logLimit: 50, logTotal: 0, editing: null, fetched: [], lang: 'zh', unmaskedKeys: {} };

  function t(path, params) {
    var lang = state.lang || 'zh';
    var dict = I18N[lang] || I18N.zh;
    var val = path.split('.').reduce(function (o, k) { return o && o[k]; }, dict);
    if (val == null) {
      val = path.split('.').reduce(function (o, k) { return o && o[k]; }, I18N.zh) || path;
    }
    if (typeof val === 'string' && params) {
      for (var k in params) {
        val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      }
    }
    return val;
  }

  function applyI18n() {
    document.title = t('title');
    document.documentElement.setAttribute('lang', state.lang === 'zh' ? 'zh-CN' : (state.lang === 'zh-Hant' ? 'zh-TW' : 'en-US'));
    $$('[data-i18n]').forEach(function (el) {
      var k = el.dataset.i18n;
      if (k) el.textContent = t(k);
    });
    $$('[data-i18n-title]').forEach(function (el) {
      var k = el.dataset.i18nTitle;
      if (k) el.setAttribute('title', t(k));
    });
    $$('[data-i18n-placeholder]').forEach(function (el) {
      var k = el.dataset.i18nPlaceholder;
      if (k) el.setAttribute('placeholder', t(k));
    });
    $$('[data-i18n-aria-label]').forEach(function (el) {
      var k = el.dataset.i18nAriaLabel;
      if (k) el.setAttribute('aria-label', t(k));
    });
    $$('.lang-select').forEach(function (s) {
      s.value = state.lang;
    });
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    updateThemeButtons(isDark);
    syncProtocol();
    renderUsageDocs();
    renderErrorTable();
    if ($('#c-messages') && chatState && Array.isArray(chatState.messages)) renderChatMessages();
  }

  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem('gw_lang'); } catch (e) {}
    if (saved === 'zh' || saved === 'zh-Hant' || saved === 'en') {
      state.lang = saved;
    } else {
      var nav = String((typeof navigator !== 'undefined' && (navigator.language || (navigator.languages || [])[0])) || '').toLowerCase();
      state.lang = /^zh-(hant|tw|hk|mo)/.test(nav) ? 'zh-Hant' : (nav.indexOf('zh') === 0 ? 'zh' : 'en');
    }
    $$('.lang-select').forEach(function (sel) {
      sel.value = state.lang;
      sel.addEventListener('change', function () {
        state.lang = this.value;
        try { localStorage.setItem('gw_lang', this.value); } catch (e) {}
        applyI18n();
        if (state.cfg) {
          renderProviders();
          renderChain();
          renderModelSelects();
          renderSettings();
        }
        if ($('#key-table').innerHTML) loadKeys();
        if ($('#log-table').innerHTML) loadLogs();
        if ($('#stats').innerHTML) loadStats();
      });
    });
    applyI18n();
  }

  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2600);
  }

  // ---- 自有弹窗（统一入口，文案走 i18n）----
  var DIALOG_ICONS = {
    danger: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  var dialogOverlay = null;
  var dialogResolve = null;
  function ensureDialogOverlay() {
    if (dialogOverlay && document.body.contains(dialogOverlay)) return;
    dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-dialog-overlay';
    dialogOverlay.addEventListener('click', function (e) {
      if (e.target === dialogOverlay) {
        var input = dialogOverlay.querySelector('input, textarea, select');
        if (input) { input.focus(); return; }
        closeDialog(null);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (!dialogOverlay || !dialogOverlay.classList.contains('active')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(null); }
      else if (e.key === 'Enter') {
        var active = document.activeElement;
        if (active && active.tagName === 'TEXTAREA') return;
        if (active && active.classList && active.classList.contains('custom-dialog-input')) return;
        var btn = dialogOverlay.querySelector('.custom-dialog-btn-confirm');
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
    document.body.appendChild(dialogOverlay);
  }
  function closeDialog(result) {
    if (!dialogOverlay) return;
    dialogOverlay.classList.remove('active');
    var res = dialogResolve;
    dialogResolve = null;
    if (res) setTimeout(function () { res(result); }, 100);
  }
  function showConfirm(options) {
    var opts = typeof options === 'string' ? { message: options } : (options || {});
    var isDanger = opts.danger !== false;
    var iconType = opts.icon || (isDanger ? 'danger' : 'warning');
    ensureDialogOverlay();
    if (dialogResolve) closeDialog(null);
    return new Promise(function (resolve) {
      dialogResolve = function (val) { resolve(val === true); };
      dialogOverlay.innerHTML =
        '<div class="custom-dialog-box" role="dialog" aria-modal="true">' +
        '<div class="custom-dialog-header"><div class="custom-dialog-icon ' + iconType + '">' + (DIALOG_ICONS[iconType] || DIALOG_ICONS.warning) + '</div>' +
        '<h3 class="custom-dialog-title">' + esc(opts.title || t('dialog.confirmTitle')) + '</h3></div>' +
        '<div class="custom-dialog-message">' + esc(opts.message || '') + '</div>' +
        '<div class="custom-dialog-actions">' +
        '<button type="button" class="custom-dialog-btn custom-dialog-btn-cancel">' + esc(opts.cancelText || t('common.cancel')) + '</button>' +
        '<button type="button" class="custom-dialog-btn custom-dialog-btn-confirm' + (isDanger ? ' danger' : '') + '">' + esc(opts.confirmText || t('common.confirm')) + '</button>' +
        '</div></div>';
      dialogOverlay.querySelector('.custom-dialog-btn-cancel').onclick = function () { this.disabled = true; var b = dialogOverlay.querySelector('.custom-dialog-btn-confirm'); if (b) b.disabled = true; closeDialog(false); };
      dialogOverlay.querySelector('.custom-dialog-btn-confirm').onclick = function () { this.disabled = true; var b = dialogOverlay.querySelector('.custom-dialog-btn-cancel'); if (b) b.disabled = true; closeDialog(true); };
      requestAnimationFrame(function () {
        dialogOverlay.classList.add('active');
        dialogOverlay.querySelector('.custom-dialog-btn-confirm').focus();
      });
    });
  }
  function showAlert(options) {
    var opts = typeof options === 'string' ? { message: options } : (options || {});
    var type = opts.type || 'info';
    ensureDialogOverlay();
    if (dialogResolve) closeDialog(null);
    return new Promise(function (resolve) {
      dialogResolve = function () { resolve(); };
      dialogOverlay.innerHTML =
        '<div class="custom-dialog-box" role="dialog" aria-modal="true">' +
        '<div class="custom-dialog-header"><div class="custom-dialog-icon ' + type + '">' + (DIALOG_ICONS[type] || DIALOG_ICONS.info) + '</div>' +
        '<h3 class="custom-dialog-title">' + esc(opts.title || t('dialog.alertTitle')) + '</h3></div>' +
        '<div class="custom-dialog-message">' + esc(opts.message || '') + '</div>' +
        '<div class="custom-dialog-actions">' +
        '<button type="button" class="custom-dialog-btn custom-dialog-btn-confirm">' + esc(opts.buttonText || t('dialog.alertOk')) + '</button>' +
        '</div></div>';
      dialogOverlay.querySelector('.custom-dialog-btn-confirm').onclick = function () { closeDialog(true); };
      requestAnimationFrame(function () {
        dialogOverlay.classList.add('active');
        dialogOverlay.querySelector('.custom-dialog-btn-confirm').focus();
      });
    });
  }
  function showPrompt(options) {
    var opts = typeof options === 'string' ? { message: options } : (options || {});
    ensureDialogOverlay();
    if (dialogResolve) closeDialog(null);
    return new Promise(function (resolve) {
      dialogResolve = resolve;
      dialogOverlay.innerHTML =
        '<div class="custom-dialog-box" role="dialog" aria-modal="true">' +
        '<div class="custom-dialog-header"><div class="custom-dialog-icon info">' + DIALOG_ICONS.info + '</div>' +
        '<h3 class="custom-dialog-title">' + esc(opts.title || t('dialog.promptTitle')) + '</h3></div>' +
        (opts.message ? '<div class="custom-dialog-message">' + esc(opts.message) + '</div>' : '') +
        '<div class="custom-dialog-prompt-wrap"><input type="text" class="custom-dialog-input" value="' + esc(opts.defaultValue || '') + '"></div>' +
        '<div class="custom-dialog-actions">' +
        '<button type="button" class="custom-dialog-btn custom-dialog-btn-cancel">' + esc(opts.cancelText || t('common.cancel')) + '</button>' +
        '<button type="button" class="custom-dialog-btn custom-dialog-btn-confirm">' + esc(opts.confirmText || t('common.confirm')) + '</button>' +
        '</div></div>';
      var input = dialogOverlay.querySelector('.custom-dialog-input');
      dialogOverlay.querySelector('.custom-dialog-btn-cancel').onclick = function () { closeDialog(null); };
      dialogOverlay.querySelector('.custom-dialog-btn-confirm').onclick = function () { closeDialog(input.value); };
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); closeDialog(input.value); }
      });
      requestAnimationFrame(function () {
        dialogOverlay.classList.add('active');
        input.focus();
        input.select();
      });
    });
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function num(n) { return n == null ? '—' : Number(n).toLocaleString(); }

  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'X-Admin': '1' }, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.method = opts.method || 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var res = await fetch(path, init);
    var text = await res.text(), data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    if (res.status === 401 && path !== '/admin/api/login') { show('login'); throw new Error((data && data.error) || t('login.unauth')); }
    if (!res.ok) throw new Error((data && (data.error && (data.error.message || data.error))) || ('HTTP ' + res.status + ' ' + text));
    return data;
  }

  // ---- 主题（对齐 FlarePanel：跟随系统 + 日月按钮） ----
  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function updateThemeButtons(isDark) {
    var label = isDark ? t('header.themeToLight') : t('header.themeToDark');
    $$('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('title', label);
      b.setAttribute('aria-label', label);
    });
  }
  function applyTheme(isDark) {
    document.documentElement.classList.remove('day-theme', 'night-theme');
    document.documentElement.classList.add(isDark ? 'night-theme' : 'day-theme');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    var col = isDark ? '#000000' : '#f5f5f7';
    $$('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', col); });
    updateThemeButtons(isDark);
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('gw-theme'); } catch (e) {}
    var isDark = saved ? (saved === 'dark') : systemPrefersDark();
    applyTheme(isDark);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        try { localStorage.removeItem('gw-theme'); } catch (err) {}
        applyTheme(e.matches);
      });
    }
    $$('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nextDark = document.documentElement.getAttribute('data-theme') !== 'dark';
        try {
          if (nextDark === systemPrefersDark()) localStorage.removeItem('gw-theme');
          else localStorage.setItem('gw-theme', nextDark ? 'dark' : 'light');
        } catch (err) {}
        applyTheme(nextDark);
      });
    });
  }
  var base = location.origin + '/v1';

  function usageRow(label, hint, method, url) {
    return '<div class="usage-row">' +
      '<div class="usage-row-head"><span class="usage-row-label">' + esc(label) + '</span>' +
      (hint ? '<span class="muted small">' + esc(hint) + '</span>' : '') + '</div>' +
      '<div class="usage-url-line">' +
      '<code class="mono">' + (method ? esc(method) + ' ' : '') + esc(url) + '</code>' +
      ' <button type="button" class="btn sm" data-ucopy="' + esc(url) + '">' + t('keys.copy') + '</button>' +
      '</div></div>';
  }
  
  var ERROR_CODES_DATA = [
    {
      code: 400,
      name: 'Bad Request',
      cls: 'c4xx',
      causes: {
        zh: '请求体 JSON 格式非法；缺少必填参数；上下文长度超出模型窗口（context length exceeded）；模型不支持传入的参数。',
        'zh-Hant': '請求體 JSON 格式非法；缺少必填參數；上下文長度超出模型上限；模型不支援傳入的參數。',
        en: 'Malformed JSON payload, missing required parameters, context length exceeded, or unsupported parameters.'
      },
      solutions: {
        zh: '检查客户端请求体与参数格式；适当截断历史对话开启滑窗；核对该模型文档规范。',
        'zh-Hant': '檢查客戶端請求體與參數格式；適當截斷歷史對話；核對該模型文檔規範。',
        en: 'Check request body syntax; truncate chat history; verify parameter compatibility against model docs.'
      }
    },
    {
      code: 401,
      name: 'Unauthorized',
      cls: 'c4xx',
      causes: {
        zh: '网关 API Key 错误或未传（缺少 Authorization 请求头）；上游服务商 API Key 无效、已失效或填写错误。',
        'zh-Hant': '網關 API Key 錯誤或未攜帶；上游服務商 API Key 無效、已過期或填錯。',
        en: 'Missing or invalid gateway API key (Authorization header); or upstream provider API key is invalid/expired.'
      },
      solutions: {
        zh: '检查客户端是否携带 Authorization: Bearer <key>；在后台「上游」编辑窗口核对服务商 Key 并重新测活。',
        'zh-Hant': '檢查客戶端是否攜帶 Authorization: Bearer <key>；在「上游」編輯視窗核對 Key 並重新測活。',
        en: 'Verify Authorization header in client; re-check and test provider API key under "Providers".'
      }
    },
    {
      code: 402,
      name: 'Payment Required',
      cls: 'c4xx',
      causes: {
        zh: '对应上游服务商账户欠费或可用余额不足。',
        'zh-Hant': '對應上游服務商帳戶欠費或可用餘額不足。',
        en: 'Upstream provider account out of credits, balance exhausted, or payment required.'
      },
      solutions: {
        zh: '前往服务商控制台充值。<div class="muted small" style="margin-top:3px">💡 <b>网关特性：</b>开启容灾链时，网关遇到 402 会自动 0ms 快速熔断跳过该服务商，尝试后续服务商。</div>',
        'zh-Hant': '前往服務商控制台儲值。<div class="muted small" style="margin-top:3px">💡 <b>網關特性：</b>開啟容災鏈時，遇到 402 會自動 0ms 快速熔斷跳過該商並嘗試下一家。</div>',
        en: 'Top up credits in upstream console.<div class="muted small" style="margin-top:3px">💡 <b>Gateway:</b> Automatically fast-fails over (0ms) to next provider if failover chain is enabled.</div>'
      }
    },
    {
      code: 404,
      name: 'Not Found',
      cls: 'c4xx',
      causes: {
        zh: '请求的模型名称不存在或拼写错误；Base URL 缺少 /v1；指定的服务商未配置该模型。',
        'zh-Hant': '請求的模型名稱不存在或拼寫錯誤；Base URL 缺少 /v1；指定的服務商未配置該模型。',
        en: 'Model name not found or misspelled; Base URL missing /v1 path; model not registered under provider.'
      },
      solutions: {
        zh: '访问 GET /v1/models 查看可用模型列表；按「服务商ID/模型」或 auto 调用；确认 Base URL 为 https://域名/v1。',
        'zh-Hant': '訪問 GET /v1/models 查看可用模型列表；按「服務商ID/模型」或 auto 調用；確認 Base URL 為 https://網域名稱/v1。',
        en: 'Query GET /v1/models for available list; use "provider/model" or "auto"; ensure Base URL ends with /v1.'
      }
    },
    {
      code: 429,
      name: 'Too Many Requests',
      cls: 'c4xx',
      causes: {
        zh: '① <b>网关限额超限</b>：当前 Key 消耗达到后台设置的 Token 限额（可在「密钥」页查看红色已超额标识）；② <b>上游限流/欠费</b>：上游并发超频（RPM/TPM）或配额耗尽。',
        'zh-Hant': '① <b>網關限額超額</b>：目前 Key 消耗達到後台設置的 Token 上限（可在「密鑰」頁檢視紅色已超額標記）；② <b>上游限流/超額</b>：上游併發超頻或配額用盡。',
        en: '① <b>Gateway Quota</b>: Key hit Token limit (marked red in "Keys"); ② <b>Upstream Rate Limit</b>: Provider RPM/TPM limit or credit exhausted.'
      },
      solutions: {
        zh: '若是网关限额，在「密钥」页提高上限或重置已用额度为 0；若是上游问题，网关会自动熔断并尝试容灾链下一家。<div class="muted small" style="margin-top:3px">💡 <b>提示：</b>网关密钥超额时，模型列表（/v1/models）仍保持可正常拉取。</div>',
        'zh-Hant': '若為網關密鑰超額，在「密鑰」頁調高限額或重置已用額度為 0；若為上游問題，網關會自動熔斷並嘗試容災鏈下一家。<div class="muted small" style="margin-top:3px">💡 <b>提示：</b>網關密鑰超額時，模型列表（/v1/models）仍可正常取得。</div>',
        en: 'If gateway quota, raise limit or reset usage in "Keys"; if upstream, gateway automatically failovers to the next provider.<div class="muted small" style="margin-top:3px">💡 <b>Tip:</b> GET /v1/models remains accessible even when quota is exceeded.</div>'
      }
    },
    {
      code: 500,
      name: 'Internal Server Error',
      cls: 'c5xx',
      causes: {
        zh: '上游服务商临时服务故障、模型端异常或解析异常。',
        'zh-Hant': '上游服務商暫時性故障、模型端異常或伺服器崩潰。',
        en: 'Upstream provider internal error, model server crash, or server overload.'
      },
      solutions: {
        zh: '在后台「日志」查看具体错误响应与堆栈；开启容灾链时网关会自动尝试后续备用服务商。',
        'zh-Hant': '在後台「日誌」查看具體錯誤訊息與堆疊；開啟容災鏈時網關會自動嘗試備用服務商。',
        en: 'Inspect upstream error details in "Logs" tab; gateway will automatically try fallback providers.'
      }
    },
    {
      code: 502,
      name: 'Bad Gateway',
      cls: 'c5xx',
      causes: {
        zh: '无法连接上游 Base URL；域名解析失败（DNS）；网络被阻断或反向代理服务下线。',
        'zh-Hant': '無法連線至上游 Base URL；DNS 解析失敗；網路阻斷或反向代理下線。',
        en: 'Unable to connect to upstream Base URL, DNS resolution failed, connection blocked, or proxy offline.'
      },
      solutions: {
        zh: '检查后台「上游」服务商的 Base URL 是否正确并包含 https://；在服务商编辑窗口测试模型连通性。',
        'zh-Hant': '檢查後台「上游」服務商的 Base URL 是否正確並包含 https://；在編輯視窗測試模型連通性。',
        en: 'Check provider Base URL and ensure https:// prefix; use test button under "Providers" to check connectivity.'
      }
    },
    {
      code: 503,
      name: 'Service Unavailable',
      cls: 'c5xx',
      causes: {
        zh: '网关未添加启用的服务商或模型为空；或容灾链中所有候选服务商依次尝试后全部失败。',
        'zh-Hant': '網關未添加啟用的服務商或模型為空；或容災鏈中所有候選服務商嘗試後全部失敗。',
        en: 'No enabled providers or models configured; or all candidates in failover chain were exhausted and failed.'
      },
      solutions: {
        zh: '前往「上游」启用服务商并配置模型；若为全链失败，在「日志」中查看每家服务商的失败明细。',
        'zh-Hant': '前往「上游」啟用服務商並配置模型；若為全鏈失敗，在「日誌」查看各家失敗原因。',
        en: 'Enable at least one provider with models in "Providers"; check "Logs" for root cause across providers.'
      }
    },
    {
      code: 504,
      name: 'Gateway Timeout',
      cls: 'c5xx',
      causes: {
        zh: '上游生成响应时间过长，超过 Cloudflare Workers 最大执行超时限制（通常约 100 秒）；上游无响应挂起。',
        'zh-Hant': '上游回應時間過長，超出 Cloudflare Workers 執行時間上限（通常約 100 秒）；上游無回應。',
        en: 'Upstream response exceeded Cloudflare Workers execution timeout (~100s); network stall.'
      },
      solutions: {
        zh: '在客户端开启流式传输（"stream": true）保持连接心跳；精简提示词或换用响应更快的模型。',
        'zh-Hant': '在客戶端開啟串流傳輸（"stream": true）保持心跳；精簡提示詞或換用更快的模型。',
        en: 'Enable streaming ("stream": true) to maintain active connection; reduce prompt tokens; use faster models.'
      }
    }
  ];

  function renderErrorTable() {
    var tbody = $('#error-table-body');
    if (!tbody) return;
    var lang = state.lang || 'zh';
    var l = (lang === 'zh-Hant' || lang === 'en') ? lang : 'zh';
    tbody.innerHTML = ERROR_CODES_DATA.map(function (item) {
      var cause = (item.causes && item.causes[l]) || item.causes.zh || '';
      var sol = (item.solutions && item.solutions[l]) || item.solutions.zh || '';
      return '<tr>' +
        '<td><span class="code-badge ' + esc(item.cls) + '">' + esc(String(item.code)) + '</span></td>' +
        '<td><code class="mono" style="font-weight:600;font-size:12.5px">' + esc(item.name) + '</code></td>' +
        '<td>' + cause + '</td>' +
        '<td>' + sol + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderUsageDocs() {
    var box = $('#usage-docs');
    if (!box) return;
    box.innerHTML =
      '<div class="usage-block">' +
        '<div class="usage-block-title">' + esc(t('overview.usageBaseLabel')) + '</div>' +
        '<p class="muted small usage-hint">' + esc(t('overview.usageBaseHint')) + '</p>' +
        '<div class="usage-url-line"><code class="mono">' + esc(base) + '</code> ' +
        '<button type="button" class="btn sm" data-ucopy="' + esc(base) + '">' + t('keys.copy') + '</button></div>' +
      '</div>' +
      '<div class="usage-block">' +
        '<div class="usage-block-title">' + esc(t('overview.usageProtoLabel')) + '</div>' +
        '<p class="muted small usage-hint">' + esc(t('overview.usageProtoHint')) + '</p>' +
        usageRow(t('overview.usageChatLabel'), t('overview.usageChatHint'), 'POST', base + '/chat/completions') +
        usageRow(t('overview.usageAnthLabel'), t('overview.usageAnthHint'), 'POST', base + '/messages') +
      '</div>' +
      '<div class="usage-block">' +
        '<div class="usage-block-title">' + esc(t('overview.usageOtherLabel')) + '</div>' +
        '<p class="muted small usage-hint">' + esc(t('overview.usageOtherHint')) + '</p>' +
        usageRow('Embeddings', '', 'POST', base + '/embeddings') +
        usageRow('Media', '', 'POST', base + '/images/generations') +
        usageRow('', '', 'POST', base + '/images/edits') +
        usageRow('', '', 'POST', base + '/audio/transcriptions') +
        usageRow('', '', 'POST', base + '/audio/speech') +
      '</div>' +
      '<div class="usage-block">' +
        '<div class="usage-block-title">' + esc(t('overview.usageModelsLabel')) + '</div>' +
        '<p class="muted small usage-hint">' + esc(t('overview.usageModelsHint')) + '</p>' +
        usageRow('', '', 'GET', base + '/models') +
      '</div>' +
      '<p class="muted small usage-note">' + esc(t('overview.usageAuth')) + '</p>' +
      '<p class="muted small usage-note">' + esc(t('overview.usageModelHint')) + '</p>';
  }
  $('#usage-docs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ucopy]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.ucopy).then(function () { toast(t('header.copied')); });
  });

  initTheme();
  initLang();

  function show(v) {
    $('#v-login').classList.toggle('hidden', v !== 'login');
    $('#v-main').classList.toggle('hidden', v !== 'main');
  }

  // ---- 登录 ----
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault(); $('#login-err').textContent = '';
    var submitBtn = this.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = t('login.submitting'); }
    try { await api('/admin/api/login', { body: { password: $('#pw').value } }); $('#pw').value = ''; boot(); }
    catch (err) { $('#login-err').textContent = err.message; }
    finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('login.submit'); } }
  });
  $('#logout').addEventListener('click', async function () { await api('/admin/api/logout', { body: {} }).catch(function () {}); show('login'); });

  // ---- 标签 ----
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    $$('section[data-pane]').forEach(function (s) { s.classList.toggle('hidden', s.dataset.pane !== b.dataset.tab); });
    var t = b.dataset.tab;
    if (t === 'overview') loadStats();
    if (t === 'keys') loadKeys();
    if (t === 'logs') { state.logOffset = 0; loadLogs(); }
  });

  // ---- 配置 ----
  async function loadConfig() {
    state.cfg = await api('/admin/api/config');
    renderProviders(); renderChain(); renderModelSelects(); renderSettings();
  }
  function setCfg(c) { state.cfg.providers = c.providers; state.cfg.settings = c.settings; state.cfg.models = modelsFrom(c.providers); renderProviders(); renderChain(); renderModelSelects(); renderSettings(); }
  function modelsFrom(providers) {
    var out = ['FlareRouter/auto'];
    providers.forEach(function (p) { if (p.enabled) p.models.forEach(function (m) { out.push(p.id + '/' + m); }); });
    return out;
  }

  function renderProviders() {
    var ps = state.cfg.providers;
    var h = '<tr><th>' + t('providers.thOrder') + '</th><th>' + t('providers.thNameId') + '</th><th class="hide-sm">' + t('providers.thBase') + '</th><th>' + t('providers.thKey') + '</th><th>' + t('providers.thModels') + '</th><th>' + t('providers.thEnable') + '</th><th class="col-actions">' + t('providers.thActions') + '</th></tr>';
    if (!ps.length) h += '<tr><td colspan="7" class="muted">' + t('providers.empty') + '</td></tr>';
    ps.forEach(function (p, i) {
      h += '<tr class="provider-row" draggable="true" data-drag-idx="' + i + '">' +
        '<td class="mono col-order">' +
          '<span class="drag-handle" title="' + esc(t('providers.dragOrder')) + '" aria-label="' + esc(t('providers.dragOrder')) + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>' +
          '</span>' +
          '<button class="btn sm" data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button> ' +
          '<button class="btn sm" data-down="' + i + '"' + (i === ps.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '</td>' +
        '<td><div>' + esc(p.name) + '</div><div class="muted mono small">' + esc(p.id) + '</div>' + (p.note ? '<div class="muted small">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td class="hide-sm mono small" style="word-break:break-all">' + esc(p.baseUrl) + (p.protocol === 'anthropic' ? ' <span class="tag">Anthropic</span>' : '') + '</td>' +
        '<td class="mono small">' + (p.hasKey ? esc(p.apiKeyPreview) : '<span class="tag warn">' + t('providers.keyEmptyTag') + '</span>') + '</td>' +
        '<td class="small" title="' + esc(p.models.join(', ')) + '">' + p.models.length + '<div class="muted mono">' + esc(p.models[0] || '') + '</div></td>' +
        '<td><label class="switch"><input type="checkbox" data-toggle="' + esc(p.id) + '"' + (p.enabled ? ' checked' : '') + '><span></span></label></td>' +
        '<td class="col-actions" style="white-space:nowrap">' +
          (p.consoleUrl ?
            '<a class="btn sm" href="' + esc(p.consoleUrl) + '" target="_blank" rel="noopener noreferrer">' + t('providers.visit') + '</a> ' :
            '<button class="btn sm" disabled title="' + t('providers.noConsoleUrl') + '">' + t('providers.visit') + '</button> ') +
          '<button class="btn sm" data-edit="' + i + '">' + t('providers.edit') + '</button> ' +
          '<button class="btn sm danger" data-del="' + esc(p.id) + '">' + t('providers.del') + '</button></td>' +
        '</tr>';
    });
    $('#prov-table').innerHTML = h;
  }
  var reorderSeq = 0;
  var reorderTimer = null;
  var reorderRollback = null;

  function scheduleReorderSync() {
    if (!reorderRollback) reorderRollback = state.cfg.providers.slice();
    var thisSeq = ++reorderSeq;
    clearTimeout(reorderTimer);
    reorderTimer = setTimeout(async function () {
      var rollback = reorderRollback;
      reorderTimer = null;
      var ids = state.cfg.providers.map(function (p) { return p.id; });
      try {
        var res = await api('/admin/api/providers/reorder', { body: { ids: ids } });
        // 静默同步：成功时无需销毁重绘表格，杜绝二次跳动！
        if (thisSeq === reorderSeq) {
          reorderRollback = null;
          if (res) {
            state.cfg.settings = res.settings;
            state.cfg.models = modelsFrom(res.providers);
            renderModelSelects();
          }
        }
      } catch (err) {
        // 只有当前版本报错时才回滚并重新渲染恢复
        if (thisSeq === reorderSeq && rollback) {
          reorderRollback = null;
          state.cfg.providers = rollback;
          state.cfg.models = modelsFrom(rollback);
          renderProviders();
          renderModelSelects();
          await showAlert({ message: err.message });
        }
      }
    }, 400);
  }

  var draggedProvIdx = null;

  function clearDragOverClasses() {
    $$('#prov-table tr.provider-row').forEach(function (r) {
      r.classList.remove('drag-over-top', 'drag-over-bottom', 'is-dragging');
    });
  }

  function reorderProvider(fromIdx, toIdx, insertAfter) {
    if (fromIdx === toIdx) return;
    var targetId = state.cfg.providers[toIdx].id;
    var item = state.cfg.providers.splice(fromIdx, 1)[0];
    var newToIdx = state.cfg.providers.findIndex(function (p) { return p.id === targetId; });
    var finalIdx = insertAfter ? newToIdx + 1 : newToIdx;
    state.cfg.providers.splice(finalIdx, 0, item);
    state.cfg.models = modelsFrom(state.cfg.providers);
    renderProviders();
    renderModelSelects();
    scheduleReorderSync();
  }

  var provTable = $('#prov-table');
  provTable.addEventListener('dragstart', function (e) {
    if (e.target.closest('button, input, label, a')) {
      e.preventDefault();
      return;
    }
    var row = e.target.closest('tr.provider-row');
    if (!row) return;
    draggedProvIdx = +row.dataset.dragIdx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(draggedProvIdx));
    setTimeout(function () {
      if (row) row.classList.add('is-dragging');
    }, 0);
  });

  provTable.addEventListener('dragover', function (e) {
    if (draggedProvIdx === null) return;
    var targetRow = e.target.closest('tr.provider-row');
    if (!targetRow) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var targetIdx = +targetRow.dataset.dragIdx;
    if (targetIdx === draggedProvIdx) {
      clearDragOverClasses();
      targetRow.classList.add('is-dragging');
      return;
    }
    var rect = targetRow.getBoundingClientRect();
    var isBelow = e.clientY >= (rect.top + rect.height / 2);
    $$('#prov-table tr.provider-row').forEach(function (r) {
      if (r !== targetRow) r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (isBelow) {
      targetRow.classList.remove('drag-over-top');
      targetRow.classList.add('drag-over-bottom');
    } else {
      targetRow.classList.remove('drag-over-bottom');
      targetRow.classList.add('drag-over-top');
    }
  });

  provTable.addEventListener('dragleave', function (e) {
    var related = e.relatedTarget;
    if (!related || !provTable.contains(related)) {
      clearDragOverClasses();
      if (draggedProvIdx !== null) {
        var dr = $('#prov-table tr.provider-row[data-drag-idx="' + draggedProvIdx + '"]');
        if (dr) dr.classList.add('is-dragging');
      }
    }
  });

  provTable.addEventListener('drop', function (e) {
    if (draggedProvIdx === null) return;
    e.preventDefault();
    var targetRow = e.target.closest('tr.provider-row');
    var fromIdx = draggedProvIdx;
    draggedProvIdx = null;
    clearDragOverClasses();
    if (!targetRow) return;
    var toIdx = +targetRow.dataset.dragIdx;
    if (fromIdx === toIdx) return;
    var rect = targetRow.getBoundingClientRect();
    var isBelow = e.clientY >= (rect.top + rect.height / 2);
    reorderProvider(fromIdx, toIdx, isBelow);
  });

  provTable.addEventListener('dragend', function () {
    draggedProvIdx = null;
    clearDragOverClasses();
  });

  $('#prov-table').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.up || b.dataset.down) {
        var i = +(b.dataset.up || b.dataset.down), j = b.dataset.up ? i - 1 : i + 1;
        if (j < 0 || j >= state.cfg.providers.length) return;
        var temp = state.cfg.providers[i];
        state.cfg.providers[i] = state.cfg.providers[j];
        state.cfg.providers[j] = temp;
        state.cfg.models = modelsFrom(state.cfg.providers);
        renderProviders();
        renderModelSelects();
        scheduleReorderSync();
      } else if (b.dataset.edit) openProv(state.cfg.providers[+b.dataset.edit]);
      else if (b.dataset.del) {
        var delId = b.dataset.del;
        if (!(await showConfirm({ message: t('providers.delConfirm', { name: delId }), danger: true }))) return;
        if (reorderTimer) { clearTimeout(reorderTimer); reorderRollback = null; }
        var prevProviders = state.cfg.providers.slice();
        state.cfg.providers = state.cfg.providers.filter(function (p) { return p.id !== delId; });
        state.cfg.models = modelsFrom(state.cfg.providers);
        renderProviders();
        renderModelSelects();
        try {
          var res = await api('/admin/api/providers/delete', { body: { id: delId } });
          toast(t('providers.deleted'));
          if (res && res.providers) {
            setCfg(res);
          }
        } catch (err) {
          state.cfg.providers = prevProviders;
          state.cfg.models = modelsFrom(prevProviders);
          renderProviders();
          renderModelSelects();
          await showAlert({ message: err.message });
        }
      }
    } catch (err) { await showAlert({ message: err.message }); }
  });
  $('#prov-table').addEventListener('change', async function (e) {
    var id = e.target.dataset.toggle; if (!id) return;
    var isEnabled = e.target.checked;
    var targetP = (state.cfg.providers || []).find(function (p) { return p.id === id; });
    var prevEnabled = targetP ? targetP.enabled : !isEnabled;
    if (targetP) {
      targetP.enabled = isEnabled;
      state.cfg.models = modelsFrom(state.cfg.providers);
      renderModelSelects();
    }
    try {
      var res = await api('/admin/api/providers/toggle', { body: { id: id, enabled: isEnabled } });
      if (res && res.providers) {
        state.cfg.providers = res.providers;
        state.cfg.settings = res.settings;
        state.cfg.models = modelsFrom(res.providers);
        renderChain();
        renderModelSelects();
      }
    } catch (err) {
      e.target.checked = prevEnabled;
      if (targetP) {
        targetP.enabled = prevEnabled;
        state.cfg.models = modelsFrom(state.cfg.providers);
        renderModelSelects();
      }
      await showAlert({ message: err.message });
    }
  });

  // ---- 服务商弹窗 ----
  $('#add-prov').addEventListener('click', function () { openProv(null); });
  function openProv(p) {
    state.editing = p ? p.id : null; state.fetched = []; state.fetchedLimits = {};
    $('#prov-title').textContent = p ? t('providers.dialogEdit') : t('providers.dialogAdd');
    $('#p-name').value = p ? p.name : '';
    $('#p-id').value = p ? p.id : '';
    $('#p-protocol').value = p && p.protocol === 'anthropic' ? 'anthropic' : 'openai';
    syncProtocol();
    $('#p-url').value = p ? p.baseUrl : '';
    $('#p-console').value = p ? (p.consoleUrl || '') : '';
    $('#p-key').value = p && p.apiKey ? p.apiKey : '';
    $('#p-key').type = 'password';
    $('#p-key-toggle').textContent = '👁';
    $('#p-key').placeholder = p && p.hasKey ? t('providers.keyPlaceholderEdit') : t('providers.keyPlaceholderNew');
    $('#p-models').value = p ? p.models.join('\n') : '';
    $('#p-timeout').value = p ? p.timeoutMs : 60000;
    $('#p-note').value = p ? p.note || '' : '';
    $('#p-privacy').value = (p && p.privacy) || 'inherit';
    $('#p-usage').checked = p ? p.streamUsage !== false : true;
    $('#prov-err').textContent = ''; $('#p-fetch-err').textContent = '';
    $('#prov-save').textContent = t('providers.save');
    $('#prov-save').disabled = false;
    $('#p-fetch').textContent = t('providers.fetchModels');
    $('#p-fetch').disabled = false;
    state.testResults = {};
    state.testingActive = false;
    $('#p-test-status').classList.add('hidden');
    $('#p-test-info').textContent = '';
    $('#p-fetch-test').textContent = t('providers.testModels');
    $('#p-fetch-test').classList.remove('danger');
    $('#p-fetch-test').disabled = false;
    $('#p-fetch-box').classList.add('hidden');
    $('#dlg-prov').showModal();
  }
  function syncProtocol() {
    var a = $('#p-protocol').value === 'anthropic';
    $('#p-url').placeholder = a ? 'https://api.anthropic.com' : 'https://api.example.com/v1';
    $('#p-protocol-tip').textContent = a ? t('providers.tipAnthropic') : t('providers.tipOpenAI');
    $('#p-usage').closest('label').classList.toggle('hidden', a);
  }
  $('#p-protocol').addEventListener('change', syncProtocol);
  $('#p-key-toggle').addEventListener('click', function () {
    var inp = $('#p-key');
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    this.textContent = show ? '🙈' : '👁';
    this.title = t('keys.showHide');
  });
  $('#p-key-copy').addEventListener('click', function () {
    var v = $('#p-key').value;
    if (!v) return;
    navigator.clipboard.writeText(v).then(function () { toast(t('header.copied')); });
  });
  $('#p-name').addEventListener('input', function () {
    if (state.editing) return;
    var slug = this.value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) $('#p-id').value = slug;
  });
  $('#prov-save').addEventListener('click', async function () {
    $('#prov-err').textContent = '';
    var saveBtn = $('#prov-save');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = t('providers.saving');
    var keyVal = $('#p-key').value.trim();
    var editingId = state.editing || '';
    var prev = editingId ? (state.cfg.providers || []).find(function (x) { return x.id === editingId; }) : null;
    var body = {
      originalId: editingId,
      clearKey: !!(editingId && !keyVal),
      provider: {
        id: $('#p-id').value.trim(), name: $('#p-name').value.trim(), protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(),
        consoleUrl: $('#p-console').value.trim(),
        apiKey: keyVal, models: $('#p-models').value, timeoutMs: +$('#p-timeout').value || 60000,
        note: $('#p-note').value.trim(), privacy: $('#p-privacy').value, streamUsage: $('#p-usage').checked,
        enabled: prev ? !!prev.enabled : true
      }
    };
    if (state.fetchedLimits && Object.keys(state.fetchedLimits).length) body.provider.modelLimits = Object.assign({}, prev && prev.modelLimits, state.fetchedLimits);
    if (state.editingModelCaps && Object.keys(state.editingModelCaps).length) body.provider.modelCaps = Object.assign({}, prev && prev.modelCaps, state.editingModelCaps);
    try {
      var res = await api('/admin/api/providers', { body: body });
      setCfg(res); $('#dlg-prov').close();
      var savedId = body.provider.id;
      var ap = (res.providers || []).find(function (p) { return p.id === savedId; });
      toast(ap && !ap.models.length ? t('providers.savedEmptyModels') : t('providers.saved'));
    }
    catch (err) {
      $('#prov-err').textContent = err.message;
    }
    finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('providers.save');
    }
  });
  $('#p-fetch').addEventListener('click', async function () {
    var fetchBtn = $('#p-fetch');
    if (fetchBtn.disabled) return;
    fetchBtn.disabled = true;
    fetchBtn.textContent = t('providers.fetching');
    $('#p-fetch-err').textContent = '';
    try {
      var r = await api('/admin/api/providers/fetch-models', { body: { id: state.editing, protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(), apiKey: $('#p-key').value.trim() } });
      state.fetched = r.models; state.fetchedLimits = r.limits || {}; $('#p-fetch-err').textContent = '';
      state.testResults = {}; state.testingActive = false;
      $('#p-test-status').classList.add('hidden');
      $('#p-fetch-test').textContent = t('providers.testModels');
      var cur = currentModels(), kept = cur.filter(function (m) { return r.models.indexOf(m) >= 0; });
      if (!kept.length && r.models.length) { $('#p-models').value = r.models.join('\n'); toast(t('providers.fetchPopulated', { count: r.models.length })); }
      else if (r.models.length && kept.length < cur.length) { $('#p-models').value = kept.join('\n'); toast(t('providers.fetchPruned', { count: cur.length - kept.length })); }
      $('#p-fetch-box').classList.remove('hidden'); renderFetched();
    } catch (err) {
      $('#p-fetch-err').textContent = err.message;
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = t('providers.fetchModels');
    }
  });
  function currentModels() { return $('#p-models').value.split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }

  function renderFetched() {
    var q = $('#p-fetch-q').value.trim().toLowerCase(), cur = currentModels();
    var list = state.fetched.filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
    $('#p-fetch-list').innerHTML = list.length ? list.map(function (m) {
      var isChecked = cur.indexOf(m) >= 0;
      var res = state.testResults ? state.testResults[m] : null;
      var badge = '';
      if (res) {
        if (res.testing) {
          badge = '<span class="model-badge testing" title="' + esc(t('providers.testing')) + '">⏳ ' + esc(t('providers.testing')) + '</span>';
        } else if (res.ok) {
          badge = '<span class="model-badge success" title="' + esc('HTTP ' + res.status + ' OK (' + res.latencyMs + 'ms)') + '">● ' + res.latencyMs + 'ms</span>';
        } else {
          var errDesc = res.error || ('HTTP ' + res.status);
          badge = '<span class="model-badge fail" title="' + esc(errDesc + (res.latencyMs ? ' (' + res.latencyMs + 'ms)' : '')) + '">✕ ' + esc(res.status ? String(res.status) : t('providers.testFailed')) + '</span>';
        }
      }
      var editingId = state.editing || '';
      var prev = editingId ? (state.cfg.providers || []).find(function (x) { return x.id === editingId; }) : null;
      var caps = (state.editingModelCaps && state.editingModelCaps[m]) || (prev && prev.modelCaps && prev.modelCaps[m]);
      return '<label class="model-item"><input type="checkbox" value="' + esc(m) + '"' + (isChecked ? ' checked' : '') + '> <span class="mono grow">' + esc(m) + '</span>' + capsBadgeHtml(caps) + badge + '</label>';
    }).join('') : '<span class="muted small">' + t('providers.noMatchModels', { count: state.fetched.length }) + '</span>';
  }
  $('#p-fetch-q').addEventListener('input', renderFetched);
  function syncFetched() {
    var cur = currentModels();
    $$('#p-fetch-list input').forEach(function (c) {
      var i = cur.indexOf(c.value);
      if (c.checked && i < 0) cur.push(c.value);
      if (!c.checked && i >= 0) cur.splice(i, 1);
    });
    $('#p-models').value = cur.join('\n');
  }
  $('#p-fetch-list').addEventListener('change', syncFetched);
  $('#p-fetch-all').addEventListener('click', function () { $$('#p-fetch-list input').forEach(function (c) { c.checked = true; }); syncFetched(); });
  $('#p-fetch-none').addEventListener('click', function () { $$('#p-fetch-list input').forEach(function (c) { c.checked = false; }); syncFetched(); });
  $('#p-models').addEventListener('input', function () { if (!$('#p-fetch-box').classList.contains('hidden')) renderFetched(); });

  // 停止测试
  if ($('#p-test-stop')) {
    $('#p-test-stop').addEventListener('click', function () {
      state.testingActive = false;
    });
  }

  // 测试模型
  $('#p-fetch-test').addEventListener('click', async function () {
    if (state.testingActive) {
      state.testingActive = false;
      return;
    }
    var baseUrl = $('#p-url').value.trim();
    if (!baseUrl) {
      $('#prov-err').textContent = t('providers.urlRequired');
      return;
    }
    var q = $('#p-fetch-q').value.trim().toLowerCase();
    var targets = (state.fetched || []).filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
    if (!targets.length) {
      targets = currentModels();
    }
    if (!targets.length) {
      toast(t('providers.noModelsToTest'));
      return;
    }

    if (!state.testResults) state.testResults = {};
    state.testingActive = true;
    var testBtn = $('#p-fetch-test');
    testBtn.textContent = t('providers.testStop');
    testBtn.classList.add('danger');
    var statusBox = $('#p-test-status');
    var infoSpan = $('#p-test-info');
    statusBox.classList.remove('hidden');

    var total = targets.length;
    var done = 0, okCount = 0, failCount = 0;
    infoSpan.textContent = t('providers.testRunning', { done: 0, total: total, ok: 0, fail: 0 });

    var protocol = $('#p-protocol').value;
    var apiKey = $('#p-key').value.trim();
    var provId = state.editing;

    var concurrency = 6;
    var index = 0;

    async function worker() {
      while (index < targets.length && state.testingActive) {
        var m = targets[index++];
        state.testResults[m] = { testing: true };
        renderFetched();
        try {
          var res = await api('/admin/api/providers/test-model', {
            body: { id: provId, protocol: protocol, baseUrl: baseUrl, apiKey: apiKey, model: m }
          });
          state.testResults[m] = res;
          if (res.ok) {
            okCount++;
            if (Array.isArray(res.caps)) {
              if (!state.editingModelCaps) state.editingModelCaps = {};
              state.editingModelCaps[m] = res.caps;
            }
          } else {
            failCount++;
          }
        } catch (e) {
          state.testResults[m] = { ok: false, status: 0, error: e.message || String(e) };
          failCount++;
        }
        done++;
        if (state.testingActive) {
          infoSpan.textContent = t('providers.testRunning', { done: done, total: total, ok: okCount, fail: failCount });
          renderFetched();
        }
      }
    }

    var workers = [];
    for (var i = 0; i < Math.min(concurrency, targets.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    state.testingActive = false;
    testBtn.textContent = t('providers.testModels');
    testBtn.classList.remove('danger');
    renderFetched();
    infoSpan.textContent = t('providers.testDone', { total: done, ok: okCount, fail: failCount });
    toast(t('providers.testDone', { total: done, ok: okCount, fail: failCount }));
  });

  // 只选可用
  $('#p-fetch-avail').addEventListener('click', function () {
    if (!state.testResults || !Object.keys(state.testResults).length) {
      toast(t('providers.testNoResults'));
      return;
    }
    var selectedCount = 0;
    $$('#p-fetch-list input').forEach(function (c) {
      var m = c.value;
      var res = state.testResults[m];
      if (res && res.ok) {
        c.checked = true;
        selectedCount++;
      } else {
        c.checked = false;
      }
    });

    syncFetched();
    if (selectedCount > 0) {
      toast(t('providers.testSelectedCount', { count: selectedCount }));
    } else {
      toast(t('providers.testNoneAvailable'));
    }
  });

  $('#dlg-prov').addEventListener('close', function () {
    state.testingActive = false;
    $('#p-fetch-test').textContent = t('providers.testModels');
    $('#p-fetch-test').classList.remove('danger');
  });

  // ---- 容灾链 ----
  var chainDraft = [];
  function renderChain() {
    $('#fb-on').checked = state.cfg.settings.fallbackEnabled !== false;
    chainDraft = state.cfg.settings.fallbackChain.slice();
    drawChain();
  }
  function drawChain() {
    var valid = state.cfg.models || modelsFrom(state.cfg.providers);
    $('#chain').innerHTML = chainDraft.length ? chainDraft.map(function (m, i) {
      var ok = valid.indexOf(m) >= 0;
      return '<li><span class="muted mono" style="width:24px">' + (i + 1) + '</span><span class="mono grow">' + esc(m) + '</span>' +
        (ok ? '' : '<span class="tag warn">' + t('fallback.chainInvalid') + '</span>') +
        '<button class="btn sm" data-cu="' + i + '"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button class="btn sm" data-cd="' + i + '"' + (i < chainDraft.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="btn sm danger" data-cx="' + i + '">' + t('fallback.remove') + '</button></li>';
    }).join('') : '<li class="muted small">' + t('fallback.chainEmpty', { models: esc(state.cfg.providers.filter(function (p) { return p.enabled && p.models.length; }).map(function (p) { return p.id + '/' + p.models[0]; }).join(' → ') || t('fallback.chainNone')) }) + '</li>';
  }
  $('#chain').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i, temp;
    if (b.dataset.cu) { i = +b.dataset.cu; temp = chainDraft[i - 1]; chainDraft[i - 1] = chainDraft[i]; chainDraft[i] = temp; }
    if (b.dataset.cd) { i = +b.dataset.cd; temp = chainDraft[i + 1]; chainDraft[i + 1] = chainDraft[i]; chainDraft[i] = temp; }
    if (b.dataset.cx) chainDraft.splice(+b.dataset.cx, 1);
    drawChain();
  });
  $('#chain-add-btn').addEventListener('click', function () {
    var v = $('#chain-add').value; if (v && chainDraft.indexOf(v) < 0) { chainDraft.push(v); drawChain(); }
  });
  $('#chain-save').addEventListener('click', async function () {
    var saveBtn = $('#chain-save');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving');
    try { setCfg(await api('/admin/api/settings', { body: { fallbackEnabled: $('#fb-on').checked, fallbackChain: chainDraft } })); toast(t('fallback.saved')); }
    catch (err) { await showAlert({ message: err.message }); }
    finally { saveBtn.disabled = false; saveBtn.textContent = t('fallback.save'); }
  });

  // ---- 批量选择模型加入容灾链 ----
  var pickerSelected = new Set();
  function openChainPicker() {
    pickerSelected = new Set(chainDraft);
    $('#chain-picker-q').value = '';
    renderChainPickerGroups();
    $('#dlg-chain-picker').showModal();
  }

  function renderChainPickerGroups() {
    var q = ($('#chain-picker-q').value || '').trim().toLowerCase();
    var providers = state.cfg.providers.filter(function (p) { return p.enabled && p.models && p.models.length; });
    var html = '';
    if (!providers.length) {
      html = '<div class="muted small" style="text-align:center;padding:20px">' + t('providers.empty') + '</div>';
    } else {
      providers.forEach(function (p) {
        var pMatch = p.name.toLowerCase().indexOf(q) >= 0 || p.id.toLowerCase().indexOf(q) >= 0;
        var modelsHtml = '';
        var visibleCount = 0;
        var visibleSelectedCount = 0;
        p.models.forEach(function (m) {
          var fullKey = p.id + '/' + m;
          var mMatch = pMatch || m.toLowerCase().indexOf(q) >= 0;
          if (mMatch) {
            visibleCount++;
            var isChecked = pickerSelected.has(fullKey);
            if (isChecked) visibleSelectedCount++;
            var caps = p.modelCaps && p.modelCaps[m];
            modelsHtml += '<label class="chain-picker-item" title="' + esc(fullKey) + '">' +
              '<input type="checkbox" data-pk="' + esc(fullKey) + '"' + (isChecked ? ' checked' : '') + '> ' +
              '<span class="mono" style="word-break:break-all">' + esc(m) + '</span>' + capsBadgeHtml(caps) +
              '</label>';
          }
        });
        if (visibleCount > 0) {
          html += '<div class="chain-picker-group" data-group-pid="' + esc(p.id) + '">' +
            '<div class="chain-picker-group-title">' +
              '<div><span class="fw-ui">' + esc(p.name) + '</span> <span class="muted small mono">(' + esc(p.id) + ')</span> <span class="muted small">· ' + visibleCount + ' 个模型</span></div>' +
              '<div class="row" style="gap:4px">' +
                '<button type="button" class="btn sm" data-g-all="' + esc(p.id) + '">' + t('fallback.groupAll') + '</button>' +
                '<button type="button" class="btn sm" data-g-none="' + esc(p.id) + '">' + t('fallback.groupNone') + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="chain-picker-grid">' + modelsHtml + '</div>' +
          '</div>';
        }
      });
      if (!html) {
        html = '<div class="muted small" style="text-align:center;padding:20px">' + t('providers.noMatchModels', { count: 0 }) + '</div>';
      }
    }
    $('#chain-picker-list').innerHTML = html;
    updateChainPickerSummary();
  }

  function updateChainPickerSummary() {
    $('#chain-picker-summary').textContent = t('fallback.pickerSelectedCount', { count: pickerSelected.size });
  }

  $('#chain-batch-btn').addEventListener('click', openChainPicker);
  $('#chain-picker-q').addEventListener('input', renderChainPickerGroups);

  $('#chain-picker-list').addEventListener('change', function (e) {
    var cb = e.target.closest('input[data-pk]');
    if (!cb) return;
    var k = cb.dataset.pk;
    if (cb.checked) pickerSelected.add(k);
    else pickerSelected.delete(k);
    updateChainPickerSummary();
  });

  $('#chain-picker-list').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.gAll) {
      var pid = b.dataset.gAll;
      var p = state.cfg.providers.find(function (x) { return x.id === pid; });
      if (p) { p.models.forEach(function (m) { pickerSelected.add(p.id + '/' + m); }); }
      renderChainPickerGroups();
    } else if (b.dataset.gNone) {
      var pid = b.dataset.gNone;
      var p = state.cfg.providers.find(function (x) { return x.id === pid; });
      if (p) { p.models.forEach(function (m) { pickerSelected.delete(p.id + '/' + m); }); }
      renderChainPickerGroups();
    }
  });

  $('#chain-picker-first').addEventListener('click', function () {
    state.cfg.providers.forEach(function (p) {
      if (p.enabled && p.models && p.models.length) {
        pickerSelected.add(p.id + '/' + p.models[0]);
      }
    });
    renderChainPickerGroups();
  });

  $('#chain-picker-vision').addEventListener('click', function () {
    state.cfg.providers.forEach(function (p) {
      if (p.enabled && p.models) {
        p.models.forEach(function (m) {
          if (p.modelCaps && Array.isArray(p.modelCaps[m]) && p.modelCaps[m].indexOf('vision') >= 0) pickerSelected.add(p.id + '/' + m);
        });
      }
    });
    renderChainPickerGroups();
  });

  $('#chain-picker-tools').addEventListener('click', function () {
    state.cfg.providers.forEach(function (p) {
      if (p.enabled && p.models) {
        p.models.forEach(function (m) {
          if (p.modelCaps && Array.isArray(p.modelCaps[m]) && p.modelCaps[m].indexOf('tools') >= 0) pickerSelected.add(p.id + '/' + m);
        });
      }
    });
    renderChainPickerGroups();
  });

  $('#chain-picker-image').addEventListener('click', function () {
    state.cfg.providers.forEach(function (p) {
      if (p.enabled && p.models) {
        p.models.forEach(function (m) {
          if (p.modelCaps && Array.isArray(p.modelCaps[m]) && (p.modelCaps[m].indexOf('image') >= 0 || p.modelCaps[m].indexOf('imageGen') >= 0)) pickerSelected.add(p.id + '/' + m);
        });
      }
    });
    renderChainPickerGroups();
  });

  $('#chain-picker-all').addEventListener('click', function () {
    $('#chain-picker-list').querySelectorAll('input[data-pk]').forEach(function (cb) {
      pickerSelected.add(cb.dataset.pk);
    });
    renderChainPickerGroups();
  });

  $('#chain-picker-none').addEventListener('click', function () {
    pickerSelected.clear();
    renderChainPickerGroups();
  });

  $('#chain-picker-confirm').addEventListener('click', function () {
    var nextDraft = chainDraft.filter(function (k) { return pickerSelected.has(k); });
    pickerSelected.forEach(function (k) {
      if (nextDraft.indexOf(k) < 0) nextDraft.push(k);
    });
    chainDraft = nextDraft;
    drawChain();
    $('#dlg-chain-picker').close();
    toast(t('fallback.pickerToastAdded', { count: chainDraft.length }));
  });

  function renderModelSelects() {
    var ms = state.cfg.models || modelsFrom(state.cfg.providers);
    ms = ms.filter(function (m) { return m !== 'auto'; });
    if (!ms.includes('FlareRouter/auto')) ms.unshift('FlareRouter/auto');
    state.cfg.models = ms;
    var opts = ms.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    var keepC = (chatState && chatState.model) || $('#c-model').value || 'FlareRouter/auto';
    if (keepC === 'auto') keepC = 'FlareRouter/auto';
    $('#c-model').innerHTML = opts;
    if (ms.includes(keepC)) {
      $('#c-model').value = keepC;
    } else {
      $('#c-model').value = 'FlareRouter/auto';
      if (chatState) chatState.model = 'FlareRouter/auto';
    }
    $('#chain-add').innerHTML = ms.filter(function (m) { return m !== 'FlareRouter/auto'; }).map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    $('#lf-provider').innerHTML = '<option value="">' + t('logs.allProviders') + '</option>' + state.cfg.providers.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    var ex = ms[1] || 'FlareRouter/auto';
    $('#curl-example').textContent =
      'curl ' + base + '/chat/completions \\\n  -H "Authorization: Bearer sk-fr-xxxx" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"' + ex + '","stream":true,"messages":[{"role":"user","content":"Hello"}]}\'';
  }

  function renderSettings() {
    $('#s-ret').value = state.cfg.settings.logRetentionDays;
    $('#s-prompts').checked = !!state.cfg.settings.logPrompts;
    var priv = state.cfg.settings.privacy || {};
    $('#priv-on').checked = !!priv.enabled;
    $('#priv-secrets').checked = priv.maskSecrets !== false;
    $('#priv-ip').checked = priv.maskIp !== false;
    $('#priv-words').value = (priv.customWords || []).join('\n');
  }
  $('#priv-save').addEventListener('click', async function () {
    try {
      var words = $('#priv-words').value.split('\n').map(function (w) { return w.trim(); }).filter(Boolean);
      var privacy = {
        enabled: $('#priv-on').checked,
        maskSecrets: $('#priv-secrets').checked,
        maskIp: $('#priv-ip').checked,
        customWords: words,
      };
      setCfg(await api('/admin/api/settings', { body: { privacy: privacy } }));
      toast(t('settings.privacySaved'));
    } catch (err) {
      await showAlert({ message: err.message });
    }
  });
  $('#s-save').addEventListener('click', async function () {
    var saveBtn = $('#s-save');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving');
    try { setCfg(await api('/admin/api/settings', { body: { logRetentionDays: +$('#s-ret').value, logPrompts: $('#s-prompts').checked } })); toast(t('settings.saved')); }
    catch (err) { await showAlert({ message: err.message }); }
    finally { saveBtn.disabled = false; saveBtn.textContent = t('settings.save'); }
  });
  $('#s-export').addEventListener('click', function () { location.href = '/admin/api/export'; });
  $('#s-import').addEventListener('change', async function () {
    var f = this.files[0]; if (!f) return;
    try {
      var data = JSON.parse(await f.text());
      if (!(await showConfirm({ message: t('settings.importConfirm', { count: (data.providers || []).length }), danger: true }))) return;
      setCfg(await api('/admin/api/import', { body: data })); toast(t('settings.importSuccess'));
    } catch (err) { await showAlert({ message: err.message }); }
    this.value = '';
  });

  // ---- 统计 ----
  async function loadStats() {
    try {
      var s = await api('/admin/api/stats?days=' + $('#stats-days').value);
      var total = s.total || 0, ok = s.ok || 0;
      var failCount = total - ok;
      var failRate = total ? ((failCount * 100) / total).toFixed(1) + '%' : '0%';
      var cacheVal = '—';
      if (s.cache_read_tokens != null && s.prompt_tokens_for_cache > 0) {
        cacheVal = (s.cache_read_tokens * 100 / s.prompt_tokens_for_cache).toFixed(1) + '%';
      } else if (s.cache_read_tokens != null) {
        cacheVal = '0%';
      }
      // 纯净 6 格指标严格对齐（原版 Commit 43f9ef81 顺序，精简去冗余，绝无 Emoji）：
      // 1. 平均耗时 · 2. 调用次数 · 3. 成功率 · 4. Tokens(对齐下方第4列) · 5. 容灾切换 · 6. 隐私脱敏
      var latencyHtml = s.avg_latency ? Math.round(s.avg_latency) + ' ms' : '—';
      var callsHtml = num(total) +
        '<span class="stat-sub">' + t('overview.failedCalls') + ' ' + num(failCount) + '</span>';
      var successHtml = total ? (ok * 100 / total).toFixed(1) + '%' : '—';
      var tokensHtml = num(s.tokens || 0) +
        (cacheVal !== '—' ? '<span class="stat-sub">' + t('overview.cacheHit') + ' ' + cacheVal + '</span>' : '');
      var fallbackHtml = num(s.fallback || 0);
      var privacyHtml = num(s.redacted_hits || 0);

      $('#stats').innerHTML = [
        [t('overview.avgLatency'), latencyHtml],
        [t('overview.totalCalls'), callsHtml],
        [t('overview.successRate'), successHtml],
        [t('overview.totalTokens'), tokensHtml],
        [t('overview.fallbackCount'), fallbackHtml],
        [t('overview.privacyMasked'), privacyHtml]
      ].map(function (x) { return '<div class="stat"><span class="muted small">' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');
      var rows = s.byProvider || [];
      $('#stats-prov').innerHTML = '<tr><th>' + t('overview.thProvider') + '</th><th>' + t('overview.thCalls') + '</th><th>' + t('overview.thSuccess') + '</th><th>' + t('overview.thTokens') + '</th><th>' + t('overview.thFallback') + '</th><th>' + t('overview.thPrivacy') + '</th></tr>' +
        (rows.length ? rows.map(function (r) {
          return '<tr><td>' + esc(r.provider_name || r.provider_id || t('overview.unhit')) + '</td><td>' + num(r.total) + '</td><td>' + num(r.ok) + '</td><td>' + num(r.tokens) + '</td><td>' + num(r.fallback || 0) + '</td><td>' + num(r.redacted_hits || 0) + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">' + t('overview.noStats') + '</td></tr>');
    } catch (err) { $('#stats').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }
  }
  $('#stats-refresh').addEventListener('click', async function () {
    var btn = $('#stats-refresh');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = t('overview.refreshing');
    try { await loadStats(); }
    finally { btn.disabled = false; btn.textContent = t('overview.refresh'); }
  });
  $('#stats-days').addEventListener('change', loadStats);

  // ---- 密钥 ----
  function fmtTokens(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
    return String(v);
  }

  function renderKeys(items) {
    state.keys = items || [];
    $('#key-table').innerHTML = '<tr><th>' + t('keys.thName') + '</th><th>' + t('keys.thKey') + '</th><th>' + t('keys.thQuota') + '</th><th>' + t('keys.thCreated') + '</th><th>' + t('keys.thLastUsed') + '</th><th class="col-actions">' + t('keys.thActions') + '</th></tr>' +
      (state.keys.length ? state.keys.map(function (k) {
        var hasRaw = !!k.raw_key;
        var isUnmasked = !!state.unmaskedKeys[k.id];
        var displayKey = hasRaw ? (isUnmasked ? k.raw_key : '*'.repeat(k.raw_key.length)) : k.preview;
        var keyHtml = '<span class="key-cell">' +
          '<span class="mono small key-val' + (hasRaw ? ' click' : '') + '"' + (hasRaw ? ' data-ktoggle="' + esc(k.id) + '" title="' + t('keys.showHide') + '"' : '') + '>' + esc(displayKey) + '</span>' +
          (hasRaw ? ' <button class="btn sm" data-ktoggle="' + esc(k.id) + '" title="' + t('keys.showHide') + '">' + (isUnmasked ? '🙈' : '👁') + '</button>' : ' <span class="muted small" title="' + t('keys.legacyNoRaw') + '">(' + t('keys.legacyNoRaw') + ')</span>') +
          '</span>';
        var used = Number(k.quota_used) || 0;
        var limit = Number(k.quota_limit) || 0;
        var isExceeded = limit > 0 && used >= limit;
        var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        var barClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'normal';
        var quotaHtml = '<div class="quota-cell">' +
          '<div class="quota-text"><span>' + fmtTokens(used) + ' / ' + (limit > 0 ? fmtTokens(limit) : t('keys.unlimited')) + '</span>' +
          (isExceeded ? '<span class="tag bad" style="margin-left:4px">' + t('keys.quotaExceeded') + '</span>' : '') + '</div>' +
          (limit > 0 ? '<div class="quota-bar-bg"><div class="quota-bar-fill ' + barClass + '" style="width:' + pct + '%"></div></div>' : '') +
          '</div>';

        return '<tr><td class="col-key-name"><b>' + esc(k.name) + '</b></td>' +
          '<td>' + keyHtml + '</td>' +
          '<td>' + quotaHtml + '</td>' +
          '<td class="small">' + fmtTime(k.created_at) + '</td>' +
          '<td class="small">' + fmtTime(k.last_used_at) + '</td>' +
          '<td class="col-actions" style="white-space:nowrap">' +
          (hasRaw ? '<button class="btn sm" data-kcopy="' + esc(k.raw_key) + '">' + t('keys.copy') + '</button> ' : '') +
          '<button class="btn sm" data-rename="' + esc(k.id) + '">' + t('keys.rename') + '</button> ' +
          '<button class="btn sm" data-quota="' + esc(k.id) + '">' + t('keys.quota') + '</button> ' +
          '<button class="btn sm" data-rotate="' + esc(k.id) + '">' + t('keys.rotate') + '</button> ' +
          '<button class="btn sm danger" data-kdel="' + esc(k.id) + '">' + t('keys.delete') + '</button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">' + t('keys.empty') + '</td></tr>');
    $('#lf-key').innerHTML = '<option value="">' + t('logs.allKeys') + '</option><option value="admin">' + t('logs.adminTest') + '</option>' + state.keys.map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(k.name) + '</option>'; }).join('');
  }

  async function loadKeys() {
    try {
      var r = await api('/admin/api/keys');
      renderKeys(r.items);
    } catch (err) { $('#key-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }

  $('#key-create').addEventListener('click', async function () {
    var createBtn = $('#key-create');
    if (createBtn.disabled) return;
    var name = $('#key-name').value.trim();
    if (!name) {
      toast(t('keys.nameRequired'));
      $('#key-name').focus();
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = t('keys.generating');
    try {
      var k = await api('/admin/api/keys', { body: { name: name } });
      $('#key-name').value = '';
      loadKeys();
      try {
        await navigator.clipboard.writeText(k.key);
        toast(t('header.copied'));
      } catch (e) {}
      await showAlert({
        type: 'success',
        title: t('keys.newKeyTitle'),
        message: t('keys.newKeyNotice', { name: name }) + '\n\n' + k.key
      });
    } catch (err) {
      await showAlert({ message: err.message });
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = t('keys.generate');
    }
  });

  $('#key-table').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-ktoggle], [data-kcopy], [data-rename], [data-quota], [data-rotate], [data-kdel]'); if (!b) return;
    try {
      if (b.dataset.ktoggle) {
        var id = b.dataset.ktoggle;
        state.unmaskedKeys[id] = !state.unmaskedKeys[id];
        renderKeys(state.keys);
        return;
      }
      if (b.dataset.kcopy) {
        navigator.clipboard.writeText(b.dataset.kcopy).then(function () { toast(t('header.copied')); });
        return;
      }
      if (b.dataset.rename) {
        var renId = b.dataset.rename;
        var curName = '';
        state.keys.forEach(function (k) { if (k.id === renId) curName = k.name || ''; });
        var nextName = await showPrompt({ title: t('keys.renamePrompt'), defaultValue: curName });
        if (nextName === null) return;
        nextName = String(nextName).trim();
        if (!nextName) { toast(t('keys.nameRequired')); return; }
        var prevRen = state.keys.slice();
        renderKeys(state.keys.map(function (k) { return k.id === renId ? Object.assign({}, k, { name: nextName.slice(0, 60) }) : k; }));
        try {
          var renRes = await api('/admin/api/keys/rename', { body: { id: renId, name: nextName } });
          if (renRes.items) renderKeys(renRes.items);
        } catch (err) { renderKeys(prevRen); throw err; }
        return;
      }
      if (b.dataset.quota) {
        var qId = b.dataset.quota;
        var qK = state.keys.find(function (k) { return k.id === qId; });
        if (!qK) return;
        state.quotaKeyId = qId;
        $('#kq-name').textContent = qK.name || qId;
        $('#kq-cur-used').textContent = t('keys.curUsedTokens', { tokens: Number(qK.quota_used || 0).toLocaleString() });
        $('#kq-limit').value = qK.quota_limit > 0 ? qK.quota_limit : '';
        $('#kq-reset-used').checked = false;
        $('#kq-err').textContent = '';
        $('#dlg-key-quota').showModal();
        return;
      }
      if (b.dataset.rotate) {
        var rotId = b.dataset.rotate;
        var targetK = state.keys.find(function (k) { return k.id === rotId; });
        var targetName = targetK ? targetK.name : rotId;
        if (!(await showConfirm({ message: t('keys.rotateConfirm', { name: targetName }), danger: true }))) return;
        var row = b.closest('tr');
        var rowBtns = row ? row.querySelectorAll('button') : [];
        rowBtns.forEach(function (btn) { btn.disabled = true; });
        b.textContent = t('keys.rotating');
        try {
          var rotRes = await api('/admin/api/keys/rotate', { body: { id: rotId } });
          await loadKeys();
          try {
            await navigator.clipboard.writeText(rotRes.key);
            toast(t('header.copied'));
          } catch (e) {}
          await showAlert({
            type: 'success',
            title: t('keys.rotateTitle'),
            message: t('keys.rotateNotice', { name: targetName }) + '\n\n' + rotRes.key
          });
        } catch (err) {
          b.disabled = false;
          b.textContent = t('keys.rotate');
          rowBtns.forEach(function (btn) { btn.disabled = false; });
          await showAlert({ message: err.message });
        }
        return;
      }
      if (b.dataset.kdel) {
        var delId = b.dataset.kdel;
        if (!(await showConfirm({ message: t('keys.delConfirm'), danger: true }))) return;
        var prevDel = state.keys.slice();
        state.keys = state.keys.filter(function (k) { return k.id !== delId; });
        renderKeys(state.keys);
        try {
          var delRes = await api('/admin/api/keys/delete', { body: { id: delId } });
          toast(t('keys.deleted'));
          if (delRes && delRes.items) renderKeys(delRes.items);
        } catch (err) {
          state.keys = prevDel;
          renderKeys(prevDel);
          await showAlert({ message: err.message });
        }
        return;
      }
    } catch (err) { await showAlert({ message: err.message }); }
  });

  // 限额设置弹窗逻辑
  $$('#dlg-key-quota [data-kq-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = this.dataset.kqPreset;
      $('#kq-limit').value = val === '0' ? '' : val;
    });
  });

  $('#quota-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') return;
    $('#kq-save').click();
  });

  $('#kq-save').addEventListener('click', async function () {
    var saveBtn = $('#kq-save');
    if (saveBtn.disabled) return;
    var id = state.quotaKeyId;
    if (!id) return;
    var limitVal = parseInt($('#kq-limit').value, 10);
    var limit = isNaN(limitVal) || limitVal < 0 ? 0 : limitVal;
    var resetUsed = $('#kq-reset-used').checked;
    saveBtn.disabled = true;
    try {
      await api('/admin/api/keys/quota', { body: { id: id, quotaLimit: limit, resetUsed: resetUsed } });
      $('#dlg-key-quota').close();
      loadKeys();
      toast(t('keys.quotaSaved'));
    } catch (err) {
      $('#kq-err').textContent = err.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  // ---- 日志 ----
  var logItems = [];
  async function loadLogs() {
    var p = new URLSearchParams({ limit: state.logLimit, offset: state.logOffset });
    if ($('#lf-status').value) p.set('status', $('#lf-status').value);
    if ($('#lf-fb').checked) p.set('fallback', '1');
    if ($('#lf-provider').value) p.set('provider', $('#lf-provider').value);
    if ($('#lf-key').value) p.set('key', $('#lf-key').value);
    if ($('#lf-model').value.trim()) p.set('model', $('#lf-model').value.trim());
    if ($('#lf-q').value.trim()) p.set('q', $('#lf-q').value.trim());
    try {
      var r = await api('/admin/api/logs?' + p.toString());
      renderLogs(r);
    } catch (err) { $('#log-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }
  function renderLogs(r) {
    r = r || { items: [], total: 0, offset: 0 };
    logItems = r.items || [];
    state.logTotal = r.total || 0;
    var offset = r.offset || 0;
    $('#log-table').innerHTML = '<tr><th>' + t('logs.thTime') + '</th><th>' + t('logs.thKey') + '</th><th>' + t('logs.thModel') + '</th><th>' + t('logs.thStatus') + '</th><th>' + t('logs.thLatency') + '</th><th>' + t('logs.thTokens') + '</th><th>' + t('logs.thFallback') + '</th></tr>' +
      (logItems.length ? logItems.map(function (l, i) {
        var ok = l.status >= 200 && l.status < 300;
        var target = l.provider_id ? l.provider_id + '/' + (l.model || '') : '—';
        return '<tr class="click" data-log="' + i + '"><td class="small" style="white-space:nowrap">' + fmtTime(l.ts) + '</td>' +
          '<td class="small">' + esc(l.key_name || '—') + '</td>' +
          '<td class="small"><div class="mono">' + esc(target) + '</div>' + (l.requested_model && l.requested_model !== target ? '<div class="muted mono">' + t('logs.requested') + esc(l.requested_model) + '</div>' : '') + (l.stream ? '<span class="tag">' + t('logs.tagStream') + '</span> ' : '') + protoTag(l) + '</td>' +
          '<td><span class="tag ' + (ok ? (l.error ? 'warn' : 'ok') : 'bad') + '">' + l.status + '</span>' + (!ok && l.error ? '<div class="err small" style="max-width:320px;max-height:3.2em;overflow:hidden">' + esc(l.error) + '</div>' : '') + '</td>' +
          '<td class="small">' + num(l.latency_ms) + ' ms' + (l.ttfb_ms != null ? '<div class="muted">' + num(l.ttfb_ms) + ' ms</div>' : '') + '</td>' +
          '<td class="small">' + num(l.total_tokens) + '</td>' +
          '<td>' + (l.fallback ? '<span class="tag warn">' + t('logs.attemptN', { n: l.attempts }) + '</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted">' + t('logs.empty') + '</td></tr>');
    var end = Math.min(offset + logItems.length, state.logTotal);
    $('#log-info').textContent = state.logTotal ? t('logs.pageInfo', { start: offset + 1, end: end, total: state.logTotal }) : '';
    $('#log-prev').disabled = offset <= 0; $('#log-next').disabled = end >= state.logTotal;
  }
  var PROTO_NAME = { openai: 'OpenAI', anthropic: 'Anthropic' };
  function protoTag(l) {
    if (!l.client_protocol) return '';
    var c = PROTO_NAME[l.client_protocol] || l.client_protocol, u = PROTO_NAME[l.upstream_protocol] || l.upstream_protocol;
    if (!l.upstream_protocol || l.upstream_protocol === l.client_protocol) return l.client_protocol === 'anthropic' ? '<span class="tag">Anthropic</span>' : '';
    return '<span class="tag" title="' + esc(c) + ' → ' + esc(u) + '">' + esc(c) + '→' + esc(u) + '</span>';
  }
  $('#lf-go').addEventListener('click', async function () {
    var btn = $('#lf-go');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = t('logs.querying');
    state.logOffset = 0;
    try { await loadLogs(); }
    finally { btn.disabled = false; btn.textContent = t('logs.query'); }
  });
  $('#log-prev').addEventListener('click', function () { state.logOffset = Math.max(0, state.logOffset - state.logLimit); loadLogs(); });
  $('#log-next').addEventListener('click', function () { state.logOffset += state.logLimit; loadLogs(); });
  $('#lf-clear').addEventListener('click', async function () {
    if (!(await showConfirm({ message: t('logs.clearConfirm'), danger: true }))) return;
    var btn = $('#lf-clear');
    if (btn) btn.disabled = true;
    var prevItems = logItems.slice(), prevTotal = state.logTotal, prevOffset = state.logOffset;
    state.logOffset = 0;
    renderLogs({ items: [], total: 0, offset: 0 });
    try {
      var r = await api('/admin/api/logs/clear', { body: {} });
      toast(t('logs.deletedCount', { count: r.deleted == null ? '' : r.deleted }));
    } catch (err) {
      state.logOffset = prevOffset;
      renderLogs({ items: prevItems, total: prevTotal, offset: prevOffset });
      await showAlert({ message: err.message });
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  $('#log-table').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-log]'); if (!tr) return;
    var l = logItems[+tr.dataset.log];
    var h = '<table>' + [
      [t('logs.detailFieldTime'), fmtTime(l.ts)], [t('logs.detailFieldEndpoint'), l.endpoint], [t('logs.detailFieldClientProto'), PROTO_NAME[l.client_protocol] || l.client_protocol || '—'], [t('logs.detailFieldUpstreamProto'), PROTO_NAME[l.upstream_protocol] || l.upstream_protocol || '—'],
      [t('logs.detailFieldKey'), l.key_name || '—'], [t('logs.detailFieldReqModel'), l.requested_model],
      [t('logs.detailFieldFinalProv'), (l.provider_name || '—') + ' (' + (l.provider_id || '—') + ')'], [t('logs.detailFieldFinalModel'), l.model || '—'],
      [t('logs.detailFieldStatus'), l.status], [t('logs.detailFieldStream'), l.stream ? t('logs.yes') : t('logs.no')], [t('logs.detailFieldLatency'), num(l.latency_ms) + ' ms'], [t('logs.detailFieldTTFB'), l.ttfb_ms == null ? '—' : num(l.ttfb_ms) + ' ms'],
      [t('logs.detailFieldTokens'), num(l.prompt_tokens) + ' / ' + num(l.completion_tokens) + ' / ' + num(l.total_tokens)],
      [t('logs.detailFieldCacheRead'), l.cache_read_tokens == null ? '—' : num(l.cache_read_tokens)],
      [t('logs.detailFieldRedacted'), l.redacted_hits ? t('logs.redactedCount', { count: l.redacted_hits }) : '—'],
      [t('logs.detailFieldAttempts'), l.attempts]
    ].map(function (row) { return '<tr><th style="width:110px">' + row[0] + '</th><td class="mono small">' + esc(row[1]) + '</td></tr>'; }).join('') + '</table>';
    if (l.trail && l.trail.length) {
      h += '<h3 style="font-size:14px;margin:14px 0 4px">' + t('logs.detailTrail') + '</h3>' + l.trail.map(function (trItem, i) {
        return '<div class="small" style="margin-top:8px"><b>#' + (i + 1) + ' ' + esc(trItem.providerName || trItem.provider) + ' / ' + esc(trItem.model) + '</b> <span class="muted">' + (trItem.protocol ? esc(PROTO_NAME[trItem.protocol] || trItem.protocol) + ' · ' : '') + 'HTTP ' + esc(trItem.status) + ' · ' + esc(trItem.ms) + ' ms</span><pre class="err">' + esc(trItem.error || trItem.raw) + '</pre></div>';
      }).join('');
    }
    if (l.error) h += '<h3 style="font-size:14px;margin:14px 0 4px">' + t('logs.detailError') + '</h3><pre class="err">' + esc(l.error) + '</pre>';
    if (l.prompt) h += '<h3 style="font-size:14px;margin:14px 0 4px">' + t('logs.detailPrompt') + '</h3><pre>' + esc(l.prompt) + '</pre>';
    $('#log-detail').innerHTML = h; $('#dlg-log').showModal();
  });

// ---- 启动 ----
  async function boot() {
    try { await api('/admin/api/me'); } catch (e) { show('login'); if (!/未登录/.test(e.message)) $('#login-err').textContent = e.message; return; }
    show('main');
    try { await loadConfig(); } catch (e) { await showAlert({ message: e.message }); }
    initChatUi();
    loadStats(); loadKeys();
  }
  boot();
