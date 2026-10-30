(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var state = { cfg: null, keys: [], logOffset: 0, logLimit: 50, logTotal: 0, editing: null, fetched: [] };

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
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
    if (res.status === 401 && path !== '/admin/api/login') { show('login'); throw new Error((data && data.error) || '未登录'); }
    if (!res.ok) throw new Error((data && (data.error && (data.error.message || data.error))) || ('HTTP ' + res.status + ' ' + text));
    return data;
  }

  // ---- 主题（对齐 FlarePanel：跟随系统 + 日月按钮 + 星空） ----
  var starsContainer = null;
  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function createSkyStars() {
    if (!starsContainer) {
      starsContainer = document.createElement('div');
      starsContainer.className = 'stars-container';
      starsContainer.id = 'sky-stars-container';
      document.body.appendChild(starsContainer);
    }
    starsContainer.innerHTML = '';
    for (var i = 0; i < 35; i++) {
      var star = document.createElement('div');
      star.className = 'star';
      var size = (Math.random() * 1.5 + 1).toFixed(1);
      star.style.cssText = 'width:' + size + 'px;height:' + size + 'px;top:' + (Math.random() * 100).toFixed(1) + '%;left:' + (Math.random() * 100).toFixed(1) + '%;animation-delay:' + (Math.random() * 3).toFixed(1) + 's;animation-duration:' + (Math.random() * 5 + 4).toFixed(1) + 's';
      starsContainer.appendChild(star);
    }
  }
  function clearSkyStars() {
    if (starsContainer) { starsContainer.remove(); starsContainer = null; }
  }
  function updateThemeButtons(isDark) {
    var label = isDark ? '切换到日间' : '切换到夜间';
    $('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('title', label);
      b.setAttribute('aria-label', label);
    });
  }
  function applyTheme(isDark) {
    document.documentElement.classList.remove('day-theme', 'night-theme');
    document.documentElement.classList.add(isDark ? 'night-theme' : 'day-theme');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) createSkyStars(); else clearSkyStars();
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
    $('[data-theme-toggle]').forEach(function (b) {
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
  initTheme();

  function show(v) {
    $('#v-login').classList.toggle('hidden', v !== 'login');
    $('#v-main').classList.toggle('hidden', v !== 'main');
  }

  // ---- 登录 ----
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault(); $('#login-err').textContent = '';
    try { await api('/admin/api/login', { body: { password: $('#pw').value } }); $('#pw').value = ''; boot(); }
    catch (err) { $('#login-err').textContent = err.message; }
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

  var base = location.origin + '/v1';
  $('#ep').textContent = base;
  $('#copy-ep').addEventListener('click', function () { navigator.clipboard.writeText(base).then(function () { toast('已复制 ' + base); }); });

  // ---- 配置 ----
  async function loadConfig() {
    state.cfg = await api('/admin/api/config');
    renderProviders(); renderChain(); renderModelSelects(); renderSettings();
  }
  function setCfg(c) { state.cfg.providers = c.providers; state.cfg.settings = c.settings; state.cfg.models = modelsFrom(c.providers); renderProviders(); renderChain(); renderModelSelects(); renderSettings(); }
  function modelsFrom(providers) {
    var out = ['auto'];
    providers.forEach(function (p) { if (p.enabled) p.models.forEach(function (m) { out.push(p.id + '/' + m); }); });
    return out;
  }

  function renderProviders() {
    var ps = state.cfg.providers;
    var h = '<tr><th>顺序</th><th>名称 / ID</th><th class="hide-sm">Base URL</th><th>Key</th><th>模型</th><th>启用</th><th></th></tr>';
    if (!ps.length) h += '<tr><td colspan="7" class="muted">还没有服务商，点右上角「添加服务商」。</td></tr>';
    ps.forEach(function (p, i) {
      h += '<tr>' +
        '<td class="mono"><button class="btn sm" data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button> <button class="btn sm" data-down="' + i + '"' + (i === ps.length - 1 ? ' disabled' : '') + '>↓</button></td>' +
        '<td><div>' + esc(p.name) + '</div><div class="muted mono small">' + esc(p.id) + '</div>' + (p.note ? '<div class="muted small">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td class="hide-sm mono small" style="word-break:break-all">' + esc(p.baseUrl) + (p.protocol === 'anthropic' ? ' <span class="tag">Anthropic</span>' : '') + '</td>' +
        '<td class="mono small">' + (p.hasKey ? esc(p.apiKeyPreview) : '<span class="tag warn">未填</span>') + '</td>' +
        '<td class="small" title="' + esc(p.models.join(', ')) + '">' + p.models.length + ' 个<div class="muted mono">' + esc(p.models[0] || '') + '</div></td>' +
        '<td><label class="switch"><input type="checkbox" data-toggle="' + esc(p.id) + '"' + (p.enabled ? ' checked' : '') + '><span></span></label></td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-edit="' + i + '">编辑</button> <button class="btn sm danger" data-del="' + esc(p.id) + '">删除</button></td>' +
        '</tr>';
    });
    $('#prov-table').innerHTML = h;
  }
  $('#prov-table').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var ps = state.cfg.providers, ids = ps.map(function (p) { return p.id; });
    try {
      if (b.dataset.up || b.dataset.down) {
        var i = +(b.dataset.up || b.dataset.down), j = b.dataset.up ? i - 1 : i + 1;
        var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        setCfg(await api('/admin/api/providers/reorder', { body: { ids: ids } }));
      } else if (b.dataset.edit) openProv(ps[+b.dataset.edit]);
      else if (b.dataset.del) {
        if (!confirm('删除服务商「' + b.dataset.del + '」？它在容灾链里的条目也会一并移除。')) return;
        setCfg(await api('/admin/api/providers/delete', { body: { id: b.dataset.del } })); toast('已删除');
      }
    } catch (err) { alert(err.message); }
  });
  $('#prov-table').addEventListener('change', async function (e) {
    var id = e.target.dataset.toggle; if (!id) return;
    try { setCfg(await api('/admin/api/providers/toggle', { body: { id: id, enabled: e.target.checked } })); }
    catch (err) { alert(err.message); e.target.checked = !e.target.checked; }
  });

  // ---- 服务商弹窗 ----
  $('#add-prov').addEventListener('click', function () { openProv(null); });
  function openProv(p) {
    state.editing = p ? p.id : null; state.fetched = [];
    $('#prov-title').textContent = p ? '编辑服务商' : '添加服务商';
    $('#p-name').value = p ? p.name : '';
    $('#p-id').value = p ? p.id : '';
    $('#p-protocol').value = p && p.protocol === 'anthropic' ? 'anthropic' : 'openai';
    syncProtocol();
    $('#p-url').value = p ? p.baseUrl : '';
    $('#p-key').value = '';
    $('#p-key').placeholder = p && p.hasKey ? '留空则不修改' : '必填（部分本地服务可留空）';
    $('#p-key-preview').textContent = p && p.hasKey ? '当前：' + p.apiKeyPreview : '';
    $('#p-clear').checked = false;
    $('#p-clear-wrap').classList.toggle('hidden', !(p && p.hasKey));
    $('#p-models').value = p ? p.models.join('\n') : '';
    $('#p-timeout').value = p ? p.timeoutMs : 60000;
    $('#p-note').value = p ? p.note || '' : '';
    $('#p-usage').checked = p ? p.streamUsage !== false : true;
    $('#p-enabled').checked = p ? p.enabled : true;
    $('#prov-err').textContent = ''; $('#p-fetch-err').textContent = '';
    $('#p-fetch-box').classList.add('hidden');
    $('#dlg-prov').showModal();
  }
  function syncProtocol() {
    var a = $('#p-protocol').value === 'anthropic';
    $('#p-url').placeholder = a ? 'https://api.anthropic.com' : 'https://api.example.com/v1';
    $('#p-protocol-tip').textContent = a
      ? 'Base URL 写到域名即可（带不带 /v1 都行），请求发往 /v1/messages，模型列表取 /v1/models；也适用于提供 Anthropic 兼容接口的服务商。'
      : 'Base URL 一般以 /v1 结尾，请求发往 /chat/completions，模型列表取 /models。';
    $('#p-usage').closest('label').classList.toggle('hidden', a);
  }
  $('#p-protocol').addEventListener('change', syncProtocol);
  $('#p-name').addEventListener('input', function () {
    if (state.editing) return;
    var slug = this.value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) $('#p-id').value = slug;
  });
  $('#prov-save').addEventListener('click', async function () {
    $('#prov-err').textContent = '';
    var body = {
      originalId: state.editing || '',
      clearKey: $('#p-clear').checked,
      provider: {
        id: $('#p-id').value.trim(), name: $('#p-name').value.trim(), protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(),
        apiKey: $('#p-key').value.trim(), models: $('#p-models').value, timeoutMs: +$('#p-timeout').value || 60000,
        note: $('#p-note').value.trim(), streamUsage: $('#p-usage').checked, enabled: $('#p-enabled').checked
      }
    };
    try {
      var res = await api('/admin/api/providers', { body: body });
      setCfg(res); $('#dlg-prov').close();
      toast(res.modelsNotice ? '已保存，' + res.modelsNotice : '已保存');
    }
    catch (err) { $('#prov-err').textContent = err.message; }
  });
  $('#p-fetch').addEventListener('click', async function () {
    $('#p-fetch-err').textContent = '拉取中…';
    try {
      var r = await api('/admin/api/providers/fetch-models', { body: { id: state.editing, protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(), apiKey: $('#p-key').value.trim() } });
      state.fetched = r.models; $('#p-fetch-err').textContent = '';
      // 列表还是空的：直接全选写入；已有列表则保持原样，勾选随点随写
      if (!currentModels().length && r.models.length) { $('#p-models').value = r.models.join('\n'); toast('已写入全部 ' + r.models.length + ' 个模型'); }
      $('#p-fetch-box').classList.remove('hidden'); renderFetched();
    } catch (err) { $('#p-fetch-err').textContent = err.message; }
  });
  function currentModels() { return $('#p-models').value.split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function renderFetched() {
    var q = $('#p-fetch-q').value.trim().toLowerCase(), cur = currentModels();
    var list = state.fetched.filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
    $('#p-fetch-list').innerHTML = list.length ? list.map(function (m) {
      return '<label><input type="checkbox" value="' + esc(m) + '"' + (cur.indexOf(m) >= 0 ? ' checked' : '') + '> <span class="mono">' + esc(m) + '</span></label>';
    }).join('') : '<span class="muted small">没有匹配的模型（共 ' + state.fetched.length + ' 个）</span>';
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
        (ok ? '' : '<span class="tag warn">服务商已停用或模型不存在，会被跳过</span>') +
        '<button class="btn sm" data-cu="' + i + '"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button class="btn sm" data-cd="' + i + '"' + (i < chainDraft.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="btn sm danger" data-cx="' + i + '">移除</button></li>';
    }).join('') : '<li class="muted small">（空）按服务商顺序取每家第一个模型：' + esc(state.cfg.providers.filter(function (p) { return p.enabled && p.models.length; }).map(function (p) { return p.id + '/' + p.models[0]; }).join(' → ') || '暂无') + '</li>';
  }
  $('#chain').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i, t;
    if (b.dataset.cu) { i = +b.dataset.cu; t = chainDraft[i - 1]; chainDraft[i - 1] = chainDraft[i]; chainDraft[i] = t; }
    if (b.dataset.cd) { i = +b.dataset.cd; t = chainDraft[i + 1]; chainDraft[i + 1] = chainDraft[i]; chainDraft[i] = t; }
    if (b.dataset.cx) chainDraft.splice(+b.dataset.cx, 1);
    drawChain();
  });
  $('#chain-add-btn').addEventListener('click', function () {
    var v = $('#chain-add').value; if (v && chainDraft.indexOf(v) < 0) { chainDraft.push(v); drawChain(); }
  });
  $('#chain-save').addEventListener('click', async function () {
    try { setCfg(await api('/admin/api/settings', { body: { fallbackEnabled: $('#fb-on').checked, fallbackChain: chainDraft } })); toast('容灾设置已保存'); }
    catch (err) { alert(err.message); }
  });

  function renderModelSelects() {
    var ms = state.cfg.models || modelsFrom(state.cfg.providers);
    state.cfg.models = ms;
    var opts = ms.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    var keep = $('#t-model').value;
    $('#t-model').innerHTML = opts; if (keep) $('#t-model').value = keep;
    $('#chain-add').innerHTML = ms.filter(function (m) { return m !== 'auto'; }).map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    $('#lf-provider').innerHTML = '<option value="">全部服务商</option>' + state.cfg.providers.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    var ex = ms[1] || 'auto';
    $('#curl-example').textContent =
      'curl ' + base + '/chat/completions \\\n  -H "Authorization: Bearer sk-gw-你的密钥" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"' + ex + '","stream":true,"messages":[{"role":"user","content":"你好"}]}\'';
  }

  function renderSettings() {
    $('#s-ret').value = state.cfg.settings.logRetentionDays;
    $('#s-prompts').checked = !!state.cfg.settings.logPrompts;
  }
  $('#s-save').addEventListener('click', async function () {
    try { setCfg(await api('/admin/api/settings', { body: { logRetentionDays: +$('#s-ret').value, logPrompts: $('#s-prompts').checked } })); toast('已保存'); }
    catch (err) { alert(err.message); }
  });
  $('#s-export').addEventListener('click', function () { location.href = '/admin/api/export'; });
  $('#s-import').addEventListener('change', async function () {
    var f = this.files[0]; if (!f) return;
    try {
      var data = JSON.parse(await f.text());
      if (!confirm('导入将覆盖当前全部服务商与设置（共 ' + (data.providers || []).length + ' 个服务商），继续？')) return;
      setCfg(await api('/admin/api/import', { body: data })); toast('导入完成');
    } catch (err) { alert(err.message); }
    this.value = '';
  });

  // ---- 统计 ----
  async function loadStats() {
    try {
      var s = await api('/admin/api/stats?days=' + $('#stats-days').value);
      var total = s.total || 0, ok = s.ok || 0;
      $('#stats').innerHTML = [
        ['调用次数', num(total)], ['成功率', total ? (ok * 100 / total).toFixed(1) + '%' : '—'],
        ['失败', num(total - ok)], ['触发容灾', num(s.fallback || 0)],
        ['Tokens', num(s.tokens || 0)], ['平均耗时', s.avg_latency ? Math.round(s.avg_latency) + ' ms' : '—']
      ].map(function (x) { return '<div class="stat"><span class="muted small">' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');
      var rows = s.byProvider || [];
      $('#stats-prov').innerHTML = '<tr><th>服务商</th><th>调用</th><th>成功</th><th>Tokens</th></tr>' +
        (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.provider_name || r.provider_id || '（未命中）') + '</td><td>' + num(r.total) + '</td><td>' + num(r.ok) + '</td><td>' + num(r.tokens) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">暂无调用</td></tr>');
    } catch (err) { $('#stats').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }
  }
  $('#stats-refresh').addEventListener('click', loadStats);
  $('#stats-days').addEventListener('change', loadStats);

  // ---- 密钥 ----
  async function loadKeys() {
    try {
      var r = await api('/admin/api/keys'); state.keys = r.items;
      $('#key-table').innerHTML = '<tr><th>名称</th><th>预览</th><th>创建</th><th>最近使用</th><th>状态</th><th></th></tr>' +
        (r.items.length ? r.items.map(function (k) {
          return '<tr><td>' + esc(k.name) + '</td><td class="mono small">' + esc(k.preview) + '</td><td class="small">' + fmtTime(k.created_at) + '</td><td class="small">' + fmtTime(k.last_used_at) + '</td>' +
            '<td>' + (k.revoked ? '<span class="tag bad">已吊销</span>' : '<span class="tag ok">有效</span>') + '</td>' +
            '<td style="white-space:nowrap">' + (k.revoked ? '' : '<button class="btn sm" data-revoke="' + esc(k.id) + '">吊销</button> ') + '<button class="btn sm danger" data-kdel="' + esc(k.id) + '">删除</button></td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">还没有调用密钥。</td></tr>');
      $('#lf-key').innerHTML = '<option value="">全部密钥</option><option value="admin">管理页测试</option>' + r.items.map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(k.name) + '</option>'; }).join('');
    } catch (err) { $('#key-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }
  $('#key-create').addEventListener('click', async function () {
    try {
      var k = await api('/admin/api/keys', { body: { name: $('#key-name').value.trim() } });
      $('#key-new-val').textContent = k.key; $('#key-new').classList.remove('hidden'); $('#key-name').value = '';
      loadKeys();
    } catch (err) { alert(err.message); }
  });
  $('#key-copy').addEventListener('click', function () { navigator.clipboard.writeText($('#key-new-val').textContent).then(function () { toast('已复制'); }); });
  $('#key-table').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.revoke) { if (!confirm('吊销后该密钥立即失效（最长 30 秒缓存），继续？')) return; await api('/admin/api/keys/revoke', { body: { id: b.dataset.revoke } }); }
      if (b.dataset.kdel) { if (!confirm('彻底删除该密钥记录？')) return; await api('/admin/api/keys/delete', { body: { id: b.dataset.kdel } }); }
      loadKeys();
    } catch (err) { alert(err.message); }
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
      logItems = r.items; state.logTotal = r.total;
      $('#log-table').innerHTML = '<tr><th>时间</th><th>密钥</th><th>模型</th><th>状态</th><th>耗时 / 首包</th><th>Tokens</th><th>容灾</th></tr>' +
        (r.items.length ? r.items.map(function (l, i) {
          var ok = l.status >= 200 && l.status < 300;
          var target = l.provider_id ? l.provider_id + '/' + (l.model || '') : '—';
          return '<tr class="click" data-log="' + i + '"><td class="small" style="white-space:nowrap">' + fmtTime(l.ts) + '</td>' +
            '<td class="small">' + esc(l.key_name || '—') + '</td>' +
            '<td class="small"><div class="mono">' + esc(target) + '</div>' + (l.requested_model && l.requested_model !== target ? '<div class="muted mono">请求：' + esc(l.requested_model) + '</div>' : '') + (l.stream ? '<span class="tag">流式</span> ' : '') + protoTag(l) + '</td>' +
            '<td><span class="tag ' + (ok ? (l.error ? 'warn' : 'ok') : 'bad') + '">' + l.status + '</span>' + (!ok && l.error ? '<div class="err small" style="max-width:320px;max-height:3.2em;overflow:hidden">' + esc(l.error) + '</div>' : '') + '</td>' +
            '<td class="small">' + num(l.latency_ms) + ' ms' + (l.ttfb_ms != null ? '<div class="muted">' + num(l.ttfb_ms) + ' ms</div>' : '') + '</td>' +
            '<td class="small">' + num(l.total_tokens) + '</td>' +
            '<td>' + (l.fallback ? '<span class="tag warn">第 ' + l.attempts + ' 次</span>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="muted">暂无日志</td></tr>');
      var end = Math.min(r.offset + r.items.length, r.total);
      $('#log-info').textContent = r.total ? ('第 ' + (r.offset + 1) + '–' + end + ' 条，共 ' + r.total + ' 条') : '';
      $('#log-prev').disabled = r.offset <= 0; $('#log-next').disabled = end >= r.total;
    } catch (err) { $('#log-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }
  var PROTO_NAME = { openai: 'OpenAI', anthropic: 'Anthropic' };
  function protoTag(l) {
    if (!l.client_protocol) return '';
    var c = PROTO_NAME[l.client_protocol] || l.client_protocol, u = PROTO_NAME[l.upstream_protocol] || l.upstream_protocol;
    if (!l.upstream_protocol || l.upstream_protocol === l.client_protocol) return l.client_protocol === 'anthropic' ? '<span class="tag">Anthropic</span>' : '';
    return '<span class="tag" title="入口协议 → 上游协议">' + esc(c) + '→' + esc(u) + '</span>';
  }
  $('#lf-go').addEventListener('click', function () { state.logOffset = 0; loadLogs(); });
  $('#log-prev').addEventListener('click', function () { state.logOffset = Math.max(0, state.logOffset - state.logLimit); loadLogs(); });
  $('#log-next').addEventListener('click', function () { state.logOffset += state.logLimit; loadLogs(); });
  $('#lf-clear').addEventListener('click', async function () {
    if (!confirm('清空全部调用日志？此操作不可恢复。')) return;
    try { var r = await api('/admin/api/logs/clear', { body: {} }); toast('已删除 ' + (r.deleted == null ? '' : r.deleted) + ' 条'); state.logOffset = 0; loadLogs(); }
    catch (err) { alert(err.message); }
  });
  $('#log-table').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-log]'); if (!tr) return;
    var l = logItems[+tr.dataset.log];
    var h = '<table>' + [
      ['时间', fmtTime(l.ts)], ['接口', l.endpoint], ['入口协议', PROTO_NAME[l.client_protocol] || l.client_protocol || '—'], ['上游协议', PROTO_NAME[l.upstream_protocol] || l.upstream_protocol || '—'],
      ['密钥', l.key_name || '—'], ['请求模型', l.requested_model],
      ['最终服务商', (l.provider_name || '—') + ' (' + (l.provider_id || '—') + ')'], ['最终模型', l.model || '—'],
      ['状态', l.status], ['流式', l.stream ? '是' : '否'], ['总耗时', num(l.latency_ms) + ' ms'], ['首包', l.ttfb_ms == null ? '—' : num(l.ttfb_ms) + ' ms'],
      ['Tokens', num(l.prompt_tokens) + ' 入 / ' + num(l.completion_tokens) + ' 出 / ' + num(l.total_tokens) + ' 合计'], ['尝试次数', l.attempts]
    ].map(function (r) { return '<tr><th style="width:110px">' + r[0] + '</th><td class="mono small">' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>';
    if (l.trail && l.trail.length) {
      h += '<h3 style="font-size:14px;margin:14px 0 4px">失败的尝试（原文）</h3>' + l.trail.map(function (t, i) {
        return '<div class="small" style="margin-top:8px"><b>#' + (i + 1) + ' ' + esc(t.providerName || t.provider) + ' / ' + esc(t.model) + '</b> <span class="muted">' + (t.protocol ? esc(PROTO_NAME[t.protocol] || t.protocol) + ' · ' : '') + 'HTTP ' + esc(t.status) + ' · ' + esc(t.ms) + ' ms</span><pre class="err">' + esc(t.error || t.raw) + '</pre></div>';
      }).join('');
    }
    if (l.error) h += '<h3 style="font-size:14px;margin:14px 0 4px">错误</h3><pre class="err">' + esc(l.error) + '</pre>';
    if (l.prompt) h += '<h3 style="font-size:14px;margin:14px 0 4px">用户消息</h3><pre>' + esc(l.prompt) + '</pre>';
    $('#log-detail').innerHTML = h; $('#dlg-log').showModal();
  });

  // ---- 测试 ----
  $('#t-go').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    var out = $('#t-out'); out.classList.remove('hidden'); out.classList.remove('err'); out.textContent = '';
    $('#t-meta').textContent = '请求中…';
    var t0 = performance.now();
    try {
      var res = await fetch('/admin/api/test', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
        body: JSON.stringify({ model: $('#t-model').value, prompt: $('#t-prompt').value, stream: $('#t-stream').checked, noFallback: $('#t-nofb').checked })
      });
      var meta = 'HTTP ' + res.status + ' · 服务商 ' + (res.headers.get('x-gateway-provider') || '—') + ' · 模型 ' + (res.headers.get('x-gateway-model') || '—') + ' · 尝试 ' + (res.headers.get('x-gateway-attempts') || '—') + ' 次';
      if (res.ok && $('#t-stream').checked && res.body) {
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', text = '';
        var first = 0;
        for (;;) {
          var r = await reader.read(); if (r.done) break;
          if (!first) first = performance.now();
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n'); buf = lines.pop();
          lines.forEach(function (ln) {
            ln = ln.trim(); if (ln.indexOf('data:') !== 0) return;
            var d = ln.slice(5).trim(); if (!d || d === '[DONE]') return;
            try { var o = JSON.parse(d), dl = o.choices && o.choices[0] && o.choices[0].delta; if (dl) text += (dl.reasoning_content || '') + (dl.content || ''); } catch (e) { text += '\n[无法解析] ' + d; }
          });
          out.textContent = text;
        }
        $('#t-meta').textContent = meta + ' · 首包 ' + Math.round(first - t0) + ' ms · 总 ' + Math.round(performance.now() - t0) + ' ms';
      } else {
        var raw = await res.text();
        try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
        if (!res.ok) { out.classList.add('err'); if (res.status === 401) show('login'); }
        out.textContent = raw;
        $('#t-meta').textContent = meta + ' · ' + Math.round(performance.now() - t0) + ' ms';
      }
    } catch (err) { out.classList.add('err'); out.textContent = String(err && err.stack || err); $('#t-meta').textContent = ''; }
    btn.disabled = false;
  });

  // ---- 启动 ----
  async function boot() {
    try { await api('/admin/api/me'); } catch (e) { show('login'); if (!/未登录/.test(e.message)) $('#login-err').textContent = e.message; return; }
    show('main');
    try { await loadConfig(); } catch (e) { alert('读取配置失败：' + e.message); }
    loadStats(); loadKeys();
  }
  boot();
})();