// ---- 对话（多轮 + 流式 + Markdown，会话存本机）----
  var CHAT_LS_KEY = 'gw_chat_v2';
  var CHAT_LS_KEY_LEGACY = 'gw_chat_v1';
  var CHAT_MAX_ATTACH = 5;
  var CHAT_MAX_ATTACH_BYTES = 4 * 1024 * 1024;
  var chatState = { model: 'auto', noFallback: false, messages: [] };
  var chatAbort = null;
  var chatBusy = false;
  var pendingAttachments = [];
  var attachIdSeq = 0;

  function isImageMime(mime) {
    return typeof mime === 'string' && mime.indexOf('image/') === 0;
  }
  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function contentTextOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(function (p) { return p && p.type === 'text' && p.text; }).map(function (p) { return p.text; }).join('\n');
  }
  function normalizeStoredContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    var parts = [];
    content.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (p.type === 'text' && typeof p.text === 'string') parts.push({ type: 'text', text: p.text });
      else if (p.type === 'image_url') {
        var url = typeof p.image_url === 'string' ? p.image_url : (p.image_url && p.image_url.url);
        if (url) parts.push({ type: 'image_url', image_url: { url: String(url) } });
      } else if (p.type === 'file' && p.file && p.file.file_data) {
        parts.push({
          type: 'file',
          file: {
            filename: String(p.file.filename || 'file'),
            file_data: String(p.file.file_data)
          }
        });
      }
    });
    if (!parts.length) return '';
    if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
    return parts;
  }
  function stripMediaFromContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    var texts = [];
    content.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (p.type === 'text' && p.text) texts.push(p.text);
      else if (p.type === 'image_url') texts.push('[image]');
      else if (p.type === 'file') texts.push('[file: ' + ((p.file && p.file.filename) || 'file') + ']');
    });
    return texts.join('\n');
  }
  function isValidChatMessage(m) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    if (typeof m.content === 'string') return true;
    if (!Array.isArray(m.content)) return false;
    return m.content.some(function (p) {
      return p && (p.type === 'text' || p.type === 'image_url' || p.type === 'file');
    });
  }
  function loadChatState() {
    try {
      var raw = localStorage.getItem(CHAT_LS_KEY);
      if (!raw) raw = localStorage.getItem(CHAT_LS_KEY_LEGACY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      chatState.model = typeof o.model === 'string' ? o.model : 'auto';
      chatState.noFallback = !!o.noFallback;
      chatState.messages = Array.isArray(o.messages) ? o.messages.filter(isValidChatMessage).map(function (m) {
        return {
          role: m.role,
          content: normalizeStoredContent(m.content),
          reasoning: typeof m.reasoning === 'string' ? m.reasoning : ''
        };
      }).slice(-40) : [];
    } catch (e) {}
  }
  function saveChatState() {
    var payload = {
      model: $('#c-model').value || chatState.model || 'auto',
      noFallback: $('#c-nofb').checked,
      messages: chatState.messages.map(function (m) {
        return { role: m.role, content: m.content, reasoning: m.reasoning || '' };
      })
    };
    try {
      localStorage.setItem(CHAT_LS_KEY, JSON.stringify(payload));
    } catch (e) {
      try {
        payload.messages = chatState.messages.map(function (m) {
          return { role: m.role, content: stripMediaFromContent(m.content), reasoning: m.reasoning || '' };
        });
        localStorage.setItem(CHAT_LS_KEY, JSON.stringify(payload));
      } catch (e2) {}
    }
  }
  function apiMessagesFromChat() {
    return chatState.messages.map(function (m) {
      var out = { role: m.role, content: m.content };
      if (m.role === 'assistant' && m.reasoning) out.reasoning_content = m.reasoning;
      return out;
    });
  }
  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsDataURL(file);
    });
  }
  function renderPendingAttachments() {
    var box = $('#c-attach-list');
    if (!box) return;
    if (!pendingAttachments.length) {
      box.innerHTML = '';
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = pendingAttachments.map(function (a) {
      var preview = a.isImage
        ? '<img class="chat-attach-thumb" src="' + esc(a.dataUrl) + '" alt="">'
        : '<span class="chat-attach-icon">FILE</span>';
      return '<div class="chat-attach-chip" data-id="' + a.id + '">' +
        preview +
        '<span class="chat-attach-meta"><span class="chat-attach-name" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
        '<span class="chat-attach-size">' + esc(formatBytes(a.size)) + '</span></span>' +
        '<button type="button" class="chat-attach-remove" data-remove-id="' + a.id + '" aria-label="' + esc(t('chat.removeAttach')) + '">×</button>' +
        '</div>';
    }).join('');
  }
  async function addFilesToPending(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(Boolean);
    if (!files.length) return;
    var status = $('#c-status');
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (pendingAttachments.length >= CHAT_MAX_ATTACH) {
        if (status) status.textContent = t('chat.errTooMany', { max: CHAT_MAX_ATTACH });
        break;
      }
      if (file.size > CHAT_MAX_ATTACH_BYTES) {
        if (status) status.textContent = t('chat.errTooLarge', { max: 4, name: file.name || 'file' });
        continue;
      }
      try {
        var dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl) continue;
        pendingAttachments.push({
          id: ++attachIdSeq,
          name: file.name || ('file-' + attachIdSeq),
          size: file.size || 0,
          mime: file.type || 'application/octet-stream',
          isImage: isImageMime(file.type),
          dataUrl: dataUrl
        });
      } catch (e) {}
    }
    renderPendingAttachments();
  }
  function buildUserContent(text, attachments) {
    var list = attachments || [];
    if (!list.length) return text;
    var parts = [];
    if (text) parts.push({ type: 'text', text: text });
    list.forEach(function (a) {
      if (a.isImage) parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
      else parts.push({ type: 'file', file: { filename: a.name, file_data: a.dataUrl } });
    });
    return parts;
  }
  function renderUserContentHtml(content) {
    if (typeof content === 'string') return esc(content).replace(/\n/g, '<br>');
    if (!Array.isArray(content)) return '';
    var media = [];
    var texts = [];
    content.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (p.type === 'text' && p.text) texts.push(esc(p.text).replace(/\n/g, '<br>'));
      else if (p.type === 'image_url') {
        var url = typeof p.image_url === 'string' ? p.image_url : (p.image_url && p.image_url.url);
        if (url) media.push('<img class="chat-msg-img" src="' + esc(url) + '" alt="">');
      } else if (p.type === 'file' && p.file) {
        media.push('<span class="chat-msg-file">' + esc(p.file.filename || 'file') + '</span>');
      }
    });
    var html = '';
    if (media.length) html += '<div class="chat-msg-attachments">' + media.join('') + '</div>';
    if (texts.length) html += texts.join('<br>');
    return html || '';
  }
  function renderMd(src) {
    var s = String(src == null ? '' : src);
    s = s.replace(/\r\n/g, '\n');
    var blocks = [];
    s = s.replace(/```([\w-]*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      var i = blocks.length;
      blocks.push('<pre class="md-code"><code' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '>' + esc(code.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000B' + i + '\u0000';
    });
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^\*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return t;
    }
    var lines = s.split('\n');
    var html = [];
    var listType = null;
    function closeList() {
      if (listType) { html.push(listType === 'ol' ? '</ol>' : '</ul>'); listType = null; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var bm = line.match(/^\u0000B(\d+)\u0000$/);
      if (bm) { closeList(); html.push(blocks[+bm[1]]); continue; }
      var hm = line.match(/^(#{1,3})\s+(.+)$/);
      if (hm) { closeList(); html.push('<h' + hm[1].length + '>' + inline(hm[2]) + '</h' + hm[1].length + '>'); continue; }
      var ul = line.match(/^[-*]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
        html.push('<li>' + inline(ul[1]) + '</li>');
        continue;
      }
      var ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
        html.push('<li>' + inline(ol[1]) + '</li>');
        continue;
      }
      closeList();
      if (!line.trim()) { html.push(''); continue; }
      html.push('<p>' + inline(line) + '</p>');
    }
    closeList();
    return html.join('\n');
  }
  function renderChatMessages() {
    var box = $('#c-messages');
    if (!chatState.messages.length) {
      box.innerHTML = '<div class="chat-empty muted">' + esc(t('chat.empty')) + '<div class="small" style="margin-top:6px">' + esc(t('chat.localOnly')) + '</div></div>';
      return;
    }
    box.innerHTML = chatState.messages.map(function (m, idx) {
      var role = m.role === 'assistant' ? 'assistant' : 'user';
      var think = '';
      if (role === 'assistant' && m.reasoning) {
        think = '<details class="chat-think"><summary>' + esc(t('chat.thinkLabel')) + '</summary><div class="chat-think-body">' + esc(m.reasoning).replace(/\n/g, '<br>') + '</div></details>';
      }
      var body = role === 'assistant' ? renderMd(contentTextOf(m.content)) : renderUserContentHtml(m.content);
      var md = role === 'assistant' ? '<div class="chat-md">' + body + '</div>' : body;
      return '<div class="chat-bubble ' + role + '" data-idx="' + idx + '"><div class="chat-role">' + (role === 'assistant' ? 'AI' : 'You') + '</div><div class="chat-body">' + think + md + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
  function setChatBusy(on) {
    chatBusy = !!on;
    $('#c-send').disabled = chatBusy;
    $('#c-input').disabled = chatBusy;
    $('#c-clear').disabled = chatBusy;
    $('#c-model').disabled = chatBusy;
    $('#c-nofb').disabled = chatBusy;
    $('#c-attach').disabled = chatBusy;
    $('#c-file').disabled = chatBusy;
    // 忙时发送位换成停止，保持右侧三钮同高
    $('#c-send').classList.toggle('hidden', chatBusy);
    $('#c-stop').classList.toggle('hidden', !chatBusy);
    if (chatBusy) $('#c-status').textContent = t('chat.thinking');
  }
  function initChatUi() {
    loadChatState();
    $('#c-nofb').checked = !!chatState.noFallback;
    if (chatState.model) $('#c-model').value = chatState.model;
    renderPendingAttachments();
    renderChatMessages();
  }
  $('#c-model').addEventListener('change', function () { chatState.model = this.value; saveChatState(); });
  $('#c-nofb').addEventListener('change', function () { chatState.noFallback = this.checked; saveChatState(); });
  $('#c-clear').addEventListener('click', async function () {
    if (!chatState.messages.length && !pendingAttachments.length) return;
    if (chatState.messages.length && !(await showConfirm({ message: t('chat.clearConfirm'), danger: true }))) return;
    if (chatAbort) try { chatAbort.abort(); } catch (e) {}
    chatState.messages = [];
    pendingAttachments = [];
    renderPendingAttachments();
    saveChatState();
    renderChatMessages();
    $('#c-status').textContent = '';
    setChatBusy(false);
  });
  $('#c-stop').addEventListener('click', function () {
    if (chatAbort) try { chatAbort.abort(); } catch (e) {}
  });
  $('#c-attach').addEventListener('click', function () {
    if (chatBusy) return;
    $('#c-file').click();
  });
  $('#c-file').addEventListener('change', async function () {
    var input = this;
    await addFilesToPending(input.files);
    input.value = '';
  });
  $('#c-attach-list').addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-remove-id]') : null;
    if (!btn) return;
    var id = +btn.getAttribute('data-remove-id');
    pendingAttachments = pendingAttachments.filter(function (a) { return a.id !== id; });
    renderPendingAttachments();
  });
  (function bindComposeDragDrop() {
    var compose = $('#c-compose');
    if (!compose) return;
    var dragDepth = 0;
    function hasFiles(e) {
      var types = e.dataTransfer && e.dataTransfer.types;
      if (!types) return false;
      return Array.prototype.indexOf.call(types, 'Files') !== -1 || Array.prototype.indexOf.call(types, 'application/x-moz-file') !== -1;
    }
    compose.addEventListener('dragenter', function (e) {
      if (!hasFiles(e) || chatBusy) return;
      e.preventDefault();
      dragDepth++;
      compose.classList.add('drag-over');
    });
    compose.addEventListener('dragover', function (e) {
      if (!hasFiles(e) || chatBusy) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    compose.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) compose.classList.remove('drag-over');
    });
    compose.addEventListener('drop', async function (e) {
      e.preventDefault();
      dragDepth = 0;
      compose.classList.remove('drag-over');
      if (chatBusy) return;
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) await addFilesToPending(files);
    });
  })();
  $('#c-input').addEventListener('paste', async function (e) {
    if (chatBusy) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items || !items.length) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.kind === 'file') {
        var f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    await addFilesToPending(files);
  });
  async function sendChat() {
    if (chatBusy) return;
    var text = $('#c-input').value.trim();
    var attachments = pendingAttachments.slice();
    if (!text && !attachments.length) return;
    $('#c-input').value = '';
    pendingAttachments = [];
    renderPendingAttachments();
    var userContent = buildUserContent(text, attachments);
    chatState.messages.push({ role: 'user', content: userContent, reasoning: '' });
    chatState.messages.push({ role: 'assistant', content: '', reasoning: '' });
    renderChatMessages();
    saveChatState();
    setChatBusy(true);
    chatAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var assistantIdx = chatState.messages.length - 1;
    var t0 = performance.now();
    var first = 0;
    try {
      var payloadMessages = apiMessagesFromChat().slice(0, -1);
      var res = await fetch('/admin/api/test', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
        signal: chatAbort ? chatAbort.signal : undefined,
        body: JSON.stringify({
          model: $('#c-model').value || 'auto',
          stream: true,
          noFallback: $('#c-nofb').checked,
          messages: payloadMessages
        })
      });
      var meta = t('chat.metaInfo', {
        status: res.status,
        provider: res.headers.get('x-gateway-provider') || '—',
        model: res.headers.get('x-gateway-model') || '—',
        attempts: res.headers.get('x-gateway-attempts') || '—'
      });
      if (!res.ok) {
        var errText = await res.text();
        try { var ej = JSON.parse(errText); errText = (ej.error && ej.error.message) || ej.error || errText; } catch (e) {}
        if (res.status === 401) show('login');
        chatState.messages[assistantIdx].content = String(errText || ('HTTP ' + res.status));
        $('#c-status').textContent = meta + ' · ' + t('chat.totalOnly', { total: Math.round(performance.now() - t0) });
      } else if (res.body) {
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', contentOut = '', reasonOut = '';
        var toolAcc = {};
        function renderTools() {
          var keys = Object.keys(toolAcc).sort(function (a, b) { return Number(a) - Number(b); });
          if (!keys.length) return '';
          return keys.map(function (k) {
            var item = toolAcc[k];
            var head = '调用 ' + (item.name || 'tool');
            return item.args ? head + '\n```json\n' + item.args + '\n```' : head;
          }).join('\n\n');
        }
        function visibleContent() {
          var tools = renderTools();
          if (contentOut && tools) return contentOut + '\n\n' + tools;
          return contentOut || tools;
        }
        for (;;) {
          var r = await reader.read(); if (r.done) break;
          if (!first) first = performance.now();
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n'); buf = lines.pop();
          lines.forEach(function (ln) {
            ln = ln.trim(); if (ln.indexOf('data:') !== 0) return;
            var d = ln.slice(5).trim(); if (!d || d === '[DONE]') return;
            try {
              var o = JSON.parse(d), dl = o.choices && o.choices[0] && o.choices[0].delta;
              if (dl) {
                if (dl.reasoning_content) reasonOut += dl.reasoning_content;
                if (dl.content) contentOut += dl.content;
                if (Array.isArray(dl.tool_calls)) {
                  dl.tool_calls.forEach(function (tc) {
                    if (!tc) return;
                    var i = tc.index != null ? tc.index : 0;
                    if (!toolAcc[i]) toolAcc[i] = { name: '', args: '' };
                    var fn = tc.function || {};
                    if (fn.name) toolAcc[i].name = fn.name;
                    if (typeof fn.arguments === 'string') toolAcc[i].args += fn.arguments;
                  });
                }
              }
              if (o.error) {
                var em = o.error && o.error.message;
                if (!em) {
                  try { em = typeof o.error === 'string' ? o.error : JSON.stringify(o.error); } catch (e2) { em = 'error'; }
                }
                contentOut += (contentOut ? '\n' : '') + em;
              }
            } catch (e) { contentOut += '\n' + d; }
          });
          chatState.messages[assistantIdx].reasoning = reasonOut;
          chatState.messages[assistantIdx].content = visibleContent();
          renderChatMessages();
        }
        if (!visibleContent() && !reasonOut) chatState.messages[assistantIdx].content = '(empty)';
        $('#c-status').textContent = meta + ' · ' + t('chat.ttfbTotal', {
          ttfb: Math.round((first || performance.now()) - t0),
          total: Math.round(performance.now() - t0)
        });
      } else {
        chatState.messages[assistantIdx].content = '(empty)';
        $('#c-status').textContent = meta + ' · ' + t('chat.totalOnly', { total: Math.round(performance.now() - t0) });
      }
    } catch (err) {
      var msg = (err && err.name === 'AbortError') ? t('chat.errAborted') : String(err && err.message || err);
      if (!chatState.messages[assistantIdx].content && !chatState.messages[assistantIdx].reasoning) {
        chatState.messages[assistantIdx].content = msg;
      } else if (err && err.name === 'AbortError') {
        chatState.messages[assistantIdx].content += (chatState.messages[assistantIdx].content ? '\n\n' : '') + '(' + t('chat.errAborted') + ')';
      }
      $('#c-status').textContent = '';
    }
    saveChatState();
    renderChatMessages();
    setChatBusy(false);
    chatAbort = null;
  }
  $('#c-send').addEventListener('click', function () { sendChat(); });
  $('#c-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
