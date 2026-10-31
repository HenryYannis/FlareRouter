(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var I18N = {
    zh: {
      title: 'FlareRouter · 管理',
      header: { copyEndpoint: '复制地址', copied: '已复制', logout: '退出', themeToDark: '切换到夜间', themeToLight: '切换到日间' },
      tabs: { overview: '概览', providers: '服务商', fallback: '容灾', keys: '调用密钥', logs: '日志', test: '测试', settings: '设置' },
      login: { title: 'FlareRouter · 管理登录', passwordLabel: '管理员密码', submit: '登录', unauth: '未登录' },
      overview: {
        statsTitle: '调用统计', days24h: '近 24 小时', days7d: '近 7 天', days30d: '近 30 天', refresh: '刷新',
        totalCalls: '调用次数', successRate: '成功率', failedCalls: '失败', fallbackTriggered: '触发容灾', totalTokens: 'Tokens', avgLatency: '平均耗时',
        usageTitle: '调用方式', usageDesc: 'OpenAI 兼容。模型写成「服务商ID/模型」，写 auto 则按容灾链从头尝试。请求头 x-gateway-fallback: off 可临时关闭本次容灾。',
        thProvider: '服务商', thCalls: '调用', thSuccess: '成功', thTokens: 'Tokens', noStats: '暂无调用', unhit: '（未命中）'
      },
      providers: {
        title: '服务商', desc: '顺序即 auto 默认容灾顺序（未自定义容灾链时）', add: '添加服务商',
        thOrder: '顺序', thNameId: '名称 / ID', thBase: 'Base URL', thKey: 'Key', thModels: '模型', thEnable: '启用', thActions: '操作',
        empty: '还没有服务商，点右上角「添加服务商」。', edit: '编辑', del: '删除',
        delConfirm: '删除服务商「{name}」？它在容灾链里的条目也会一并移除。', deleted: '已删除',
        dialogAdd: '添加服务商', dialogEdit: '编辑服务商', labelName: '名称', labelId: 'ID（用于「ID/模型」寻址）',
        labelProto: '协议类型', protoOpenAI: 'OpenAI 兼容（/chat/completions，Bearer 鉴权）', protoAnthropic: 'Anthropic Messages（/v1/messages，x-api-key 鉴权）',
        tipAnthropic: 'Base URL 写到域名即可（带不带 /v1 都行），请求发往 /v1/messages，模型列表取 /v1/models；也适用于提供 Anthropic 兼容接口的服务商。',
        tipOpenAI: 'Base URL 一般以 /v1 结尾，请求发往 /chat/completions，模型列表取 /models。',
        keyEmptyTag: '未填', clearKey: '清除已保存的 Key', keyCurrent: '当前：', keyPlaceholderEdit: '留空则不修改', keyPlaceholderNew: '必填（部分本地服务可留空）',
        labelModels: '模型列表（逗号或换行分隔，第一个为默认；留空保存会自动拉取全部）', fetchModels: '从服务商拉取', fetching: '拉取中…',
        fetchPopulated: '已写入全部 {count} 个模型', searchModels: '搜索…', selectAll: '全选可见', selectNone: '取消可见',
        noMatchModels: '没有匹配的模型（共 {count} 个）', labelTimeout: '超时（毫秒，拿到响应头为止）', labelNote: '备注',
        streamUsage: '流式请求自动加 stream_options.include_usage', enabled: '启用', cancel: '取消', save: '保存', saved: '已保存'
      },
      fallback: {
        title: '容灾切换', switchLabel: '请求的模型失败时，继续按下面的容灾链尝试',
        desc: '失败（网络错误、超时、任何非 2xx）就换下一个；流式请求只在上游开始返回前切换。容灾链留空时，按服务商顺序取每家模型列表的第一个。',
        addToChain: '加入容灾链', save: '保存', saved: '容灾设置已保存', remove: '移除',
        chainInvalid: '服务商已停用或模型不存在，会被跳过',
        chainEmpty: '（空）按服务商顺序取每家第一个模型：{models}', chainNone: '暂无'
      },
      keys: {
        title: '调用密钥', namePlaceholder: '名称，例如：笔记本 / Cherry Studio', generate: '生成新密钥',
        newKeyNotice: '新密钥已生成，已完整保存至列表，可随时查看或复制：', copy: '复制',
        showHide: '显示 / 隐藏明文', legacyNoRaw: '旧密钥无明文', thName: '名称', thKey: '密钥',
        thCreated: '创建', thLastUsed: '最近使用', thStatus: '状态', thActions: '操作',
        active: '有效', revoked: '已吊销', revoke: '吊销', delete: '删除',
        revokeConfirm: '吊销后该密钥立即失效（最长 30 秒缓存），继续？', delConfirm: '彻底删除该密钥记录？', empty: '还没有调用密钥。',
        unnamed: '未命名'
      },
      logs: {
        allStatus: '全部状态', success: '成功', fail: '失败', onlyFallback: '仅容灾',
        allProviders: '全部服务商', allKeys: '全部密钥', adminTest: '管理页测试',
        modelContains: '模型包含…', errKeyword: '错误关键词…', query: '查询', clearLogs: '清空日志',
        clearConfirm: '清空全部调用日志？此操作不可恢复。', deletedCount: '已删除 {count} 条',
        thTime: '时间', thKey: '密钥', thModel: '模型', thStatus: '状态', thLatency: '耗时 / 首包', thTokens: 'Tokens', thFallback: '容灾',
        empty: '暂无日志', prevPage: '上一页', nextPage: '下一页', pageInfo: '第 {start}–{end} 条，共 {total} 条',
        tagStream: '流式', attemptN: '第 {n} 次', requested: '请求：',
        detailTitle: '调用详情', detailFieldTime: '时间', detailFieldEndpoint: '接口', detailFieldClientProto: '入口协议', detailFieldUpstreamProto: '上游协议',
        detailFieldKey: '密钥', detailFieldReqModel: '请求模型', detailFieldFinalProv: '最终服务商', detailFieldFinalModel: '最终模型',
        detailFieldStatus: '状态', detailFieldStream: '流式', detailFieldLatency: '总耗时', detailFieldTTFB: '首包',
        detailFieldTokens: 'Tokens', detailFieldAttempts: '尝试次数', detailTrail: '失败的尝试（原文）', detailError: '错误',
        detailPrompt: '用户消息', yes: '是', no: '否', close: '关闭'
      },
      test: {
        title: '测试调用', desc: '走真实的转发、容灾与日志链路（日志里密钥显示为「管理页测试」）。',
        labelModel: '模型', labelPrompt: '提示词', defaultPrompt: '你好，用一句话介绍你自己。',
        stream: '流式', noFallback: '关闭容灾', send: '发送', requesting: '请求中…',
        metaInfo: 'HTTP {status} · 服务商 {provider} · 模型 {model} · 尝试 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 总 {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: '日志', retentionLabel: '日志保留', daysUnit: '天（0 = 永久，每日 Cron 清理）',
        logPromptsLabel: '记录最后一条用户消息原文（默认关，只记元数据）', save: '保存', saved: '已保存',
        backupTitle: '备份', backupDesc: '导出文件包含上游 API Key 明文，请妥善保存。导入会整体覆盖当前服务商与设置。',
        exportBtn: '导出配置', importBtn: '导入配置', importConfirm: '导入将覆盖当前全部服务商与设置（共 {count} 个服务商），继续？', importSuccess: '导入完成'
      }
    },
    'zh-Hant': {
      title: 'FlareRouter · 管理',
      header: { copyEndpoint: '複製地址', copied: '已複製', logout: '退出', themeToDark: '切換到夜間', themeToLight: '切換到日間' },
      tabs: { overview: '概覽', providers: '服務商', fallback: '容災', keys: '調用密鑰', logs: '日誌', test: '測試', settings: '設定' },
      login: { title: 'FlareRouter · 管理登入', passwordLabel: '管理員密碼', submit: '登入', unauth: '未登入' },
      overview: {
        statsTitle: '調用統計', days24h: '近 24 小時', days7d: '近 7 天', days30d: '近 30 天', refresh: '刷新',
        totalCalls: '調用次數', successRate: '成功率', failedCalls: '失敗', fallbackTriggered: '觸發容災', totalTokens: 'Tokens', avgLatency: '平均耗時',
        usageTitle: '調用方式', usageDesc: 'OpenAI 相容。模型寫成「服務商ID/模型」，寫 auto 則按容災鏈從頭嘗試。請求頭 x-gateway-fallback: off 可臨時關閉本次容災。',
        thProvider: '服務商', thCalls: '調用', thSuccess: '成功', thTokens: 'Tokens', noStats: '暫無調用', unhit: '（未命中）'
      },
      providers: {
        title: '服務商', desc: '順序即 auto 預設容災順序（未自訂容災鏈時）', add: '新增服務商',
        thOrder: '順序', thNameId: '名稱 / ID', thBase: 'Base URL', thKey: 'Key', thModels: '模型', thEnable: '啟用', thActions: '操作',
        empty: '還沒有服務商，點右上角「新增服務商」。', edit: '編輯', del: '刪除',
        delConfirm: '刪除服務商「{name}」？它在容災鏈裡的條目也會一併移除。', deleted: '已刪除',
        dialogAdd: '新增服務商', dialogEdit: '編輯服務商', labelName: '名稱', labelId: 'ID（用於「ID/模型」定址）',
        labelProto: '協議類型', protoOpenAI: 'OpenAI 相容（/chat/completions，Bearer 鑑權）', protoAnthropic: 'Anthropic Messages（/v1/messages，x-api-key 鑑權）',
        tipAnthropic: 'Base URL 寫到網域即可（帶不帶 /v1 都行），請求發往 /v1/messages，模型列表取 /v1/models；也適用於提供 Anthropic 相容介面的服務商。',
        tipOpenAI: 'Base URL 一般以 /v1 結尾，請求發往 /chat/completions，模型列表取 /models。',
        keyEmptyTag: '未填', clearKey: '清除已儲存的 Key', keyCurrent: '當前：', keyPlaceholderEdit: '留空則不修改', keyPlaceholderNew: '必填（部分本地服務可留空）',
        labelModels: '模型列表（逗號或換行分隔，第一個為預設；留空保存會自動拉取全部）', fetchModels: '從服務商拉取', fetching: '拉取中…',
        fetchPopulated: '已寫入全部 {count} 個模型', searchModels: '搜尋…', selectAll: '全選可見', selectNone: '取消可見',
        noMatchModels: '沒有匹配的模型（共 {count} 個）', labelTimeout: '超時（毫秒，拿到回應頭為止）', labelNote: '備註',
        streamUsage: '串流請求自動加 stream_options.include_usage', enabled: '啟用', cancel: '取消', save: '儲存', saved: '已儲存'
      },
      fallback: {
        title: '容災切換', switchLabel: '請求的模型失敗時，繼續按下面的容災鏈嘗試',
        desc: '失敗（網路錯誤、超時、任何非 2xx）就換下一個；串流請求只在上游開始返回前切換。容災鏈留空時，按服務商順序取每家模型列表的第一個。',
        addToChain: '加入容災鏈', save: '儲存', saved: '容災設定已儲存', remove: '移除',
        chainInvalid: '服務商已停用或模型不存在，會被跳過',
        chainEmpty: '（空）按服務商順序取每家第一個模型：{models}', chainNone: '暫無'
      },
      keys: {
        title: '調用密鑰', namePlaceholder: '名稱，例如：筆記本 / Cherry Studio', generate: '生成新密鑰',
        newKeyNotice: '新密鑰已生成，已完整儲存至列表，可隨時查看或複製：', copy: '複製',
        showHide: '顯示 / 隱藏明文', legacyNoRaw: '舊密鑰無明文', thName: '名稱', thKey: '密鑰',
        thCreated: '建立', thLastUsed: '最近使用', thStatus: '狀態', thActions: '操作',
        active: '有效', revoked: '已吊銷', revoke: '吊銷', delete: '刪除',
        revokeConfirm: '吊銷後該密鑰立即失效（最長 30 秒快取），繼續？', delConfirm: '徹底刪除該密鑰記錄？', empty: '還沒有調用密鑰。',
        unnamed: '未命名'
      },
      logs: {
        allStatus: '全部狀態', success: '成功', fail: '失敗', onlyFallback: '僅容災',
        allProviders: '全部服務商', allKeys: '全部密鑰', adminTest: '管理頁測試',
        modelContains: '模型包含…', errKeyword: '錯誤關鍵詞…', query: '查詢', clearLogs: '清空日誌',
        clearConfirm: '清空全部調用日誌？此操作不可恢復。', deletedCount: '已刪除 {count} 條',
        thTime: '時間', thKey: '密鑰', thModel: '模型', thStatus: '狀態', thLatency: '耗時 / 首包', thTokens: 'Tokens', thFallback: '容災',
        empty: '暫無日誌', prevPage: '上一頁', nextPage: '下一頁', pageInfo: '第 {start}–{end} 條，共 {total} 條',
        tagStream: '串流', attemptN: '第 {n} 次', requested: '請求：',
        detailTitle: '調用詳情', detailFieldTime: '時間', detailFieldEndpoint: '介面', detailFieldClientProto: '入口協議', detailFieldUpstreamProto: '上游協議',
        detailFieldKey: '密鑰', detailFieldReqModel: '請求模型', detailFieldFinalProv: '最終服務商', detailFieldFinalModel: '最終模型',
        detailFieldStatus: '狀態', detailFieldStream: '串流', detailFieldLatency: '總耗時', detailFieldTTFB: '首包',
        detailFieldTokens: 'Tokens', detailFieldAttempts: '嘗試次數', detailTrail: '失敗的嘗試（原文）', detailError: '錯誤',
        detailPrompt: '使用者訊息', yes: '是', no: '否', close: '關閉'
      },
      test: {
        title: '測試調用', desc: '走真實的轉發、容災與日誌鏈路（日誌裡密鑰顯示為「管理頁測試」）。',
        labelModel: '模型', labelPrompt: '提示詞', defaultPrompt: '你好，用一句話介紹你自己。',
        stream: '串流', noFallback: '關閉容災', send: '發送', requesting: '請求中…',
        metaInfo: 'HTTP {status} · 服務商 {provider} · 模型 {model} · 嘗試 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 總 {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: '日誌', retentionLabel: '日誌保留', daysUnit: '天（0 = 永久，每日 Cron 清理）',
        logPromptsLabel: '記錄最後一條使用者訊息原文（預設關，只記元數據）', save: '儲存', saved: '已儲存',
        backupTitle: '備份', backupDesc: '匯出檔案包含上游 API Key 明文，請妥善保存。匯入會整體覆蓋當前服務商與設定。',
        exportBtn: '匯出設定', importBtn: '匯入設定', importConfirm: '匯入將覆蓋當前全部服務商與設定（共 {count} 個服務商），繼續？', importSuccess: '匯入完成'
      }
    },
    en: {
      title: 'FlareRouter · Admin',
      header: { copyEndpoint: 'Copy URL', copied: 'Copied', logout: 'Sign Out', themeToDark: 'Switch to Night', themeToLight: 'Switch to Day' },
      tabs: { overview: 'Overview', providers: 'Providers', fallback: 'Failover', keys: 'API Keys', logs: 'Logs', test: 'Test', settings: 'Settings' },
      login: { title: 'FlareRouter · Admin Sign In', passwordLabel: 'Admin Password', submit: 'Sign In', unauth: 'Not signed in' },
      overview: {
        statsTitle: 'Call Statistics', days24h: 'Last 24 Hours', days7d: 'Last 7 Days', days30d: 'Last 30 Days', refresh: 'Refresh',
        totalCalls: 'Total Calls', successRate: 'Success Rate', failedCalls: 'Failed', fallbackTriggered: 'Failovers', totalTokens: 'Tokens', avgLatency: 'Avg Latency',
        usageTitle: 'Usage Guide', usageDesc: 'OpenAI compatible. Specify model as "provider/model", or "auto" to try along the failover chain. Header "x-gateway-fallback: off" disables failover per request.',
        thProvider: 'Provider', thCalls: 'Calls', thSuccess: 'Success', thTokens: 'Tokens', noStats: 'No calls yet', unhit: '(Unhit)'
      },
      providers: {
        title: 'Providers', desc: 'Order defines default failover when chain is unset', add: 'Add Provider',
        thOrder: 'Order', thNameId: 'Name / ID', thBase: 'Base URL', thKey: 'Key', thModels: 'Models', thEnable: 'Enabled', thActions: 'Actions',
        empty: 'No providers yet. Click "Add Provider" above to start.', edit: 'Edit', del: 'Delete',
        delConfirm: 'Delete provider "{name}"? Entries in failover chain will also be removed.', deleted: 'Deleted',
        dialogAdd: 'Add Provider', dialogEdit: 'Edit Provider', labelName: 'Name', labelId: 'ID (for "id/model" addressing)',
        labelProto: 'Protocol Type', protoOpenAI: 'OpenAI Compatible (/chat/completions, Bearer auth)', protoAnthropic: 'Anthropic Messages (/v1/messages, x-api-key auth)',
        tipAnthropic: 'Base URL can be just the domain (with or without /v1). Requests go to /v1/messages, models to /v1/models; also works with Anthropic-compatible proxies.',
        tipOpenAI: 'Base URL usually ends in /v1. Requests go to /chat/completions, models to /models.',
        keyEmptyTag: 'None', clearKey: 'Clear saved Key', keyCurrent: 'Current: ', keyPlaceholderEdit: 'Leave empty to keep unchanged', keyPlaceholderNew: 'Required (can be empty for local)',
        labelModels: 'Models (comma or newline separated, 1st is default; leave empty on save to auto-fetch all)', fetchModels: 'Fetch from Provider', fetching: 'Fetching…',
        fetchPopulated: 'Populated all {count} models', searchModels: 'Search…', selectAll: 'Select Visible', selectNone: 'Deselect Visible',
        noMatchModels: 'No matching models ({count} total)', labelTimeout: 'Timeout (ms, until response headers)', labelNote: 'Note',
        streamUsage: 'Auto add stream_options.include_usage to stream requests', enabled: 'Enabled', cancel: 'Cancel', save: 'Save', saved: 'Saved'
      },
      fallback: {
        title: 'Failover Chain', switchLabel: 'On request failure, try the models in failover chain below',
        desc: 'Switches on network error, timeout, or non-2xx; streams failover only before 1st byte. When empty, defaults to 1st model of each provider in order.',
        addToChain: 'Add to Chain', save: 'Save', saved: 'Failover settings saved', remove: 'Remove',
        chainInvalid: 'Provider disabled or model missing, will be skipped',
        chainEmpty: '(Empty) Tries 1st model of each provider: {models}', chainNone: 'None'
      },
      keys: {
        title: 'API Keys', namePlaceholder: 'Name, e.g. Laptop / Cursor', generate: 'Generate Key',
        newKeyNotice: 'New key generated and saved. You can view or copy it anytime in the list below:', copy: 'Copy',
        showHide: 'Show / Hide Key', legacyNoRaw: 'Legacy (no raw key)', thName: 'Name', thKey: 'Key',
        thCreated: 'Created', thLastUsed: 'Last Used', thStatus: 'Status', thActions: 'Actions',
        active: 'Active', revoked: 'Revoked', revoke: 'Revoke', delete: 'Delete',
        revokeConfirm: 'Key will become invalid immediately upon revocation (up to 30s cache). Continue?', delConfirm: 'Permanently delete this key record?', empty: 'No API keys yet.',
        unnamed: 'Unnamed'
      },
      logs: {
        allStatus: 'All Status', success: 'Success', fail: 'Failed', onlyFallback: 'Failover Only',
        allProviders: 'All Providers', allKeys: 'All Keys', adminTest: 'Admin Test',
        modelContains: 'Model contains…', errKeyword: 'Error keyword…', query: 'Filter', clearLogs: 'Clear Logs',
        clearConfirm: 'Clear all call logs? This cannot be undone.', deletedCount: 'Deleted {count} records',
        thTime: 'Time', thKey: 'Key', thModel: 'Model', thStatus: 'Status', thLatency: 'Latency / TTFB', thTokens: 'Tokens', thFallback: 'Failover',
        empty: 'No logs yet', prevPage: 'Prev', nextPage: 'Next', pageInfo: '{start}–{end} of {total}',
        tagStream: 'Stream', attemptN: 'Attempt #{n}', requested: 'Requested: ',
        detailTitle: 'Call Details', detailFieldTime: 'Time', detailFieldEndpoint: 'Endpoint', detailFieldClientProto: 'Client Protocol', detailFieldUpstreamProto: 'Upstream Protocol',
        detailFieldKey: 'Key', detailFieldReqModel: 'Requested Model', detailFieldFinalProv: 'Final Provider', detailFieldFinalModel: 'Final Model',
        detailFieldStatus: 'Status', detailFieldStream: 'Stream', detailFieldLatency: 'Latency', detailFieldTTFB: 'TTFB',
        detailFieldTokens: 'Tokens', detailFieldAttempts: 'Attempts', detailTrail: 'Failed Attempts (Raw)', detailError: 'Error',
        detailPrompt: 'User Message', yes: 'Yes', no: 'No', close: 'Close'
      },
      test: {
        title: 'Test Gateway', desc: 'Tests through real proxying, failover and logging (logged as "Admin Test").',
        labelModel: 'Model', labelPrompt: 'Prompt', defaultPrompt: 'Hello, introduce yourself in one sentence.',
        stream: 'Stream', noFallback: 'Disable Failover', send: 'Send', requesting: 'Requesting…',
        metaInfo: 'HTTP {status} · Provider {provider} · Model {model} · Attempts {attempts}',
        ttfbTotal: 'TTFB {ttfb} ms · Total {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: 'Logs', retentionLabel: 'Log retention', daysUnit: 'days (0 = forever, daily cron cleanup)',
        logPromptsLabel: 'Log raw user prompt of the last message (default off)', save: 'Save', saved: 'Saved',
        backupTitle: 'Backup', backupDesc: 'Export file contains raw upstream API keys; store safely. Import overwrites existing providers and settings.',
        exportBtn: 'Export Config', importBtn: 'Import Config', importConfirm: 'Import will overwrite all existing providers and settings ({count} providers), continue?', importSuccess: 'Import completed'
      }
    }
  };

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
    if (res.status === 401 && path !== '/admin/api/login') { show('login'); throw new Error((data && data.error) || t('login.unauth')); }
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
  initTheme();
  initLang();

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
  $('#copy-ep').addEventListener('click', function () { navigator.clipboard.writeText(base).then(function () { toast(t('header.copied') + ' ' + base); }); });

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
    var h = '<tr><th>' + t('providers.thOrder') + '</th><th>' + t('providers.thNameId') + '</th><th class="hide-sm">' + t('providers.thBase') + '</th><th>' + t('providers.thKey') + '</th><th>' + t('providers.thModels') + '</th><th>' + t('providers.thEnable') + '</th><th>' + t('providers.thActions') + '</th></tr>';
    if (!ps.length) h += '<tr><td colspan="7" class="muted">' + t('providers.empty') + '</td></tr>';
    ps.forEach(function (p, i) {
      h += '<tr>' +
        '<td class="mono"><button class="btn sm" data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button> <button class="btn sm" data-down="' + i + '"' + (i === ps.length - 1 ? ' disabled' : '') + '>↓</button></td>' +
        '<td><div>' + esc(p.name) + '</div><div class="muted mono small">' + esc(p.id) + '</div>' + (p.note ? '<div class="muted small">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td class="hide-sm mono small" style="word-break:break-all">' + esc(p.baseUrl) + (p.protocol === 'anthropic' ? ' <span class="tag">Anthropic</span>' : '') + '</td>' +
        '<td class="mono small">' + (p.hasKey ? esc(p.apiKeyPreview) : '<span class="tag warn">' + t('providers.keyEmptyTag') + '</span>') + '</td>' +
        '<td class="small" title="' + esc(p.models.join(', ')) + '">' + p.models.length + '<div class="muted mono">' + esc(p.models[0] || '') + '</div></td>' +
        '<td><label class="switch"><input type="checkbox" data-toggle="' + esc(p.id) + '"' + (p.enabled ? ' checked' : '') + '><span></span></label></td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-edit="' + i + '">' + t('providers.edit') + '</button> <button class="btn sm danger" data-del="' + esc(p.id) + '">' + t('providers.del') + '</button></td>' +
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
        var tId = ids[i]; ids[i] = ids[j]; ids[j] = tId;
        setCfg(await api('/admin/api/providers/reorder', { body: { ids: ids } }));
      } else if (b.dataset.edit) openProv(ps[+b.dataset.edit]);
      else if (b.dataset.del) {
        if (!confirm(t('providers.delConfirm', { name: b.dataset.del }))) return;
        setCfg(await api('/admin/api/providers/delete', { body: { id: b.dataset.del } })); toast(t('providers.deleted'));
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
    $('#prov-title').textContent = p ? t('providers.dialogEdit') : t('providers.dialogAdd');
    $('#p-name').value = p ? p.name : '';
    $('#p-id').value = p ? p.id : '';
    $('#p-protocol').value = p && p.protocol === 'anthropic' ? 'anthropic' : 'openai';
    syncProtocol();
    $('#p-url').value = p ? p.baseUrl : '';
    $('#p-key').value = '';
    $('#p-key').placeholder = p && p.hasKey ? t('providers.keyPlaceholderEdit') : t('providers.keyPlaceholderNew');
    $('#p-key-preview').textContent = p && p.hasKey ? t('providers.keyCurrent') + p.apiKeyPreview : '';
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
    $('#p-protocol-tip').textContent = a ? t('providers.tipAnthropic') : t('providers.tipOpenAI');
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
      toast(res.modelsNotice ? t('providers.saved') + '，' + res.modelsNotice : t('providers.saved'));
    }
    catch (err) { $('#prov-err').textContent = err.message; }
  });
  $('#p-fetch').addEventListener('click', async function () {
    $('#p-fetch-err').textContent = t('providers.fetching');
    try {
      var r = await api('/admin/api/providers/fetch-models', { body: { id: state.editing, protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(), apiKey: $('#p-key').value.trim() } });
      state.fetched = r.models; $('#p-fetch-err').textContent = '';
      if (!currentModels().length && r.models.length) { $('#p-models').value = r.models.join('\n'); toast(t('providers.fetchPopulated', { count: r.models.length })); }
      $('#p-fetch-box').classList.remove('hidden'); renderFetched();
    } catch (err) { $('#p-fetch-err').textContent = err.message; }
  });
  function currentModels() { return $('#p-models').value.split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function renderFetched() {
    var q = $('#p-fetch-q').value.trim().toLowerCase(), cur = currentModels();
    var list = state.fetched.filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
    $('#p-fetch-list').innerHTML = list.length ? list.map(function (m) {
      return '<label><input type="checkbox" value="' + esc(m) + '"' + (cur.indexOf(m) >= 0 ? ' checked' : '') + '> <span class="mono">' + esc(m) + '</span></label>';
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
    try { setCfg(await api('/admin/api/settings', { body: { fallbackEnabled: $('#fb-on').checked, fallbackChain: chainDraft } })); toast(t('fallback.saved')); }
    catch (err) { alert(err.message); }
  });

  function renderModelSelects() {
    var ms = state.cfg.models || modelsFrom(state.cfg.providers);
    state.cfg.models = ms;
    var opts = ms.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    var keep = $('#t-model').value;
    $('#t-model').innerHTML = opts; if (keep) $('#t-model').value = keep;
    $('#chain-add').innerHTML = ms.filter(function (m) { return m !== 'auto'; }).map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    $('#lf-provider').innerHTML = '<option value="">' + t('logs.allProviders') + '</option>' + state.cfg.providers.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    var ex = ms[1] || 'auto';
    $('#curl-example').textContent =
      'curl ' + base + '/chat/completions \\\n  -H "Authorization: Bearer sk-gw-xxxx" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"' + ex + '","stream":true,"messages":[{"role":"user","content":"Hello"}]}\'';
  }

  function renderSettings() {
    $('#s-ret').value = state.cfg.settings.logRetentionDays;
    $('#s-prompts').checked = !!state.cfg.settings.logPrompts;
  }
  $('#s-save').addEventListener('click', async function () {
    try { setCfg(await api('/admin/api/settings', { body: { logRetentionDays: +$('#s-ret').value, logPrompts: $('#s-prompts').checked } })); toast(t('settings.saved')); }
    catch (err) { alert(err.message); }
  });
  $('#s-export').addEventListener('click', function () { location.href = '/admin/api/export'; });
  $('#s-import').addEventListener('change', async function () {
    var f = this.files[0]; if (!f) return;
    try {
      var data = JSON.parse(await f.text());
      if (!confirm(t('settings.importConfirm', { count: (data.providers || []).length }))) return;
      setCfg(await api('/admin/api/import', { body: data })); toast(t('settings.importSuccess'));
    } catch (err) { alert(err.message); }
    this.value = '';
  });

  // ---- 统计 ----
  async function loadStats() {
    try {
      var s = await api('/admin/api/stats?days=' + $('#stats-days').value);
      var total = s.total || 0, ok = s.ok || 0;
      $('#stats').innerHTML = [
        [t('overview.totalCalls'), num(total)], [t('overview.successRate'), total ? (ok * 100 / total).toFixed(1) + '%' : '—'],
        [t('overview.failedCalls'), num(total - ok)], [t('overview.fallbackTriggered'), num(s.fallback || 0)],
        [t('overview.totalTokens'), num(s.tokens || 0)], [t('overview.avgLatency'), s.avg_latency ? Math.round(s.avg_latency) + ' ms' : '—']
      ].map(function (x) { return '<div class="stat"><span class="muted small">' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');
      var rows = s.byProvider || [];
      $('#stats-prov').innerHTML = '<tr><th>' + t('overview.thProvider') + '</th><th>' + t('overview.thCalls') + '</th><th>' + t('overview.thSuccess') + '</th><th>' + t('overview.thTokens') + '</th></tr>' +
        (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.provider_name || r.provider_id || t('overview.unhit')) + '</td><td>' + num(r.total) + '</td><td>' + num(r.ok) + '</td><td>' + num(r.tokens) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">' + t('overview.noStats') + '</td></tr>');
    } catch (err) { $('#stats').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }
  }
  $('#stats-refresh').addEventListener('click', loadStats);
  $('#stats-days').addEventListener('change', loadStats);

  // ---- 密钥 ----
  async function loadKeys() {
    try {
      var r = await api('/admin/api/keys'); state.keys = r.items;
      $('#key-table').innerHTML = '<tr><th>' + t('keys.thName') + '</th><th>' + t('keys.thKey') + '</th><th>' + t('keys.thCreated') + '</th><th>' + t('keys.thLastUsed') + '</th><th>' + t('keys.thStatus') + '</th><th>' + t('keys.thActions') + '</th></tr>' +
        (r.items.length ? r.items.map(function (k) {
          var hasRaw = !!k.raw_key;
          var isUnmasked = !!state.unmaskedKeys[k.id];
          var displayKey = hasRaw ? (isUnmasked ? k.raw_key : k.preview) : k.preview;
          var keyHtml = '<span class="key-cell">' +
            '<span class="mono small key-val">' + esc(displayKey) + '</span>' +
            (hasRaw ? ' <button class="btn sm" data-ktoggle="' + esc(k.id) + '" title="' + t('keys.showHide') + '">' + (isUnmasked ? '🙈' : '👁') + '</button>' : ' <span class="muted small" title="' + t('keys.legacyNoRaw') + '">(' + t('keys.legacyNoRaw') + ')</span>') +
            (hasRaw ? ' <button class="btn sm" data-kcopy="' + esc(k.raw_key) + '">' + t('keys.copy') + '</button>' : '') +
            '</span>';
          return '<tr><td><b>' + esc(k.name) + '</b></td>' +
            '<td>' + keyHtml + '</td>' +
            '<td class="small">' + fmtTime(k.created_at) + '</td>' +
            '<td class="small">' + fmtTime(k.last_used_at) + '</td>' +
            '<td><span class="tag ' + (k.revoked ? 'bad' : 'ok') + '">' + (k.revoked ? t('keys.revoked') : t('keys.active')) + '</span></td>' +
            '<td style="white-space:nowrap">' + (k.revoked ? '' : '<button class="btn sm" data-revoke="' + esc(k.id) + '">' + t('keys.revoke') + '</button> ') + '<button class="btn sm danger" data-kdel="' + esc(k.id) + '">' + t('keys.delete') + '</button></td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">' + t('keys.empty') + '</td></tr>');
      $('#lf-key').innerHTML = '<option value="">' + t('logs.allKeys') + '</option><option value="admin">' + t('logs.adminTest') + '</option>' + r.items.map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(k.name) + '</option>'; }).join('');
    } catch (err) { $('#key-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }
  $('#key-create').addEventListener('click', async function () {
    try {
      var k = await api('/admin/api/keys', { body: { name: $('#key-name').value.trim() || t('keys.unnamed') } });
      $('#key-new-val').textContent = k.key; $('#key-new').classList.remove('hidden'); $('#key-name').value = '';
      loadKeys();
    } catch (err) { alert(err.message); }
  });
  $('#key-copy').addEventListener('click', function () { navigator.clipboard.writeText($('#key-new-val').textContent).then(function () { toast(t('header.copied')); }); });
  $('#key-table').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.ktoggle) {
        var id = b.dataset.ktoggle;
        state.unmaskedKeys[id] = !state.unmaskedKeys[id];
        loadKeys();
        return;
      }
      if (b.dataset.kcopy) {
        navigator.clipboard.writeText(b.dataset.kcopy).then(function () { toast(t('header.copied')); });
        return;
      }
      if (b.dataset.revoke) { if (!confirm(t('keys.revokeConfirm'))) return; await api('/admin/api/keys/revoke', { body: { id: b.dataset.revoke } }); }
      if (b.dataset.kdel) { if (!confirm(t('keys.delConfirm'))) return; await api('/admin/api/keys/delete', { body: { id: b.dataset.kdel } }); }
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
      $('#log-table').innerHTML = '<tr><th>' + t('logs.thTime') + '</th><th>' + t('logs.thKey') + '</th><th>' + t('logs.thModel') + '</th><th>' + t('logs.thStatus') + '</th><th>' + t('logs.thLatency') + '</th><th>' + t('logs.thTokens') + '</th><th>' + t('logs.thFallback') + '</th></tr>' +
        (r.items.length ? r.items.map(function (l, i) {
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
      var end = Math.min(r.offset + r.items.length, r.total);
      $('#log-info').textContent = r.total ? t('logs.pageInfo', { start: r.offset + 1, end: end, total: r.total }) : '';
      $('#log-prev').disabled = r.offset <= 0; $('#log-next').disabled = end >= r.total;
    } catch (err) { $('#log-table').innerHTML = '<tr><td class="err">' + esc(err.message) + '</td></tr>'; }
  }
  var PROTO_NAME = { openai: 'OpenAI', anthropic: 'Anthropic' };
  function protoTag(l) {
    if (!l.client_protocol) return '';
    var c = PROTO_NAME[l.client_protocol] || l.client_protocol, u = PROTO_NAME[l.upstream_protocol] || l.upstream_protocol;
    if (!l.upstream_protocol || l.upstream_protocol === l.client_protocol) return l.client_protocol === 'anthropic' ? '<span class="tag">Anthropic</span>' : '';
    return '<span class="tag" title="' + esc(c) + ' → ' + esc(u) + '">' + esc(c) + '→' + esc(u) + '</span>';
  }
  $('#lf-go').addEventListener('click', function () { state.logOffset = 0; loadLogs(); });
  $('#log-prev').addEventListener('click', function () { state.logOffset = Math.max(0, state.logOffset - state.logLimit); loadLogs(); });
  $('#log-next').addEventListener('click', function () { state.logOffset += state.logLimit; loadLogs(); });
  $('#lf-clear').addEventListener('click', async function () {
    if (!confirm(t('logs.clearConfirm'))) return;
    try { var r = await api('/admin/api/logs/clear', { body: {} }); toast(t('logs.deletedCount', { count: r.deleted == null ? '' : r.deleted })); state.logOffset = 0; loadLogs(); }
    catch (err) { alert(err.message); }
  });
  $('#log-table').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-log]'); if (!tr) return;
    var l = logItems[+tr.dataset.log];
    var h = '<table>' + [
      [t('logs.detailFieldTime'), fmtTime(l.ts)], [t('logs.detailFieldEndpoint'), l.endpoint], [t('logs.detailFieldClientProto'), PROTO_NAME[l.client_protocol] || l.client_protocol || '—'], [t('logs.detailFieldUpstreamProto'), PROTO_NAME[l.upstream_protocol] || l.upstream_protocol || '—'],
      [t('logs.detailFieldKey'), l.key_name || '—'], [t('logs.detailFieldReqModel'), l.requested_model],
      [t('logs.detailFieldFinalProv'), (l.provider_name || '—') + ' (' + (l.provider_id || '—') + ')'], [t('logs.detailFieldFinalModel'), l.model || '—'],
      [t('logs.detailFieldStatus'), l.status], [t('logs.detailFieldStream'), l.stream ? t('logs.yes') : t('logs.no')], [t('logs.detailFieldLatency'), num(l.latency_ms) + ' ms'], [t('logs.detailFieldTTFB'), l.ttfb_ms == null ? '—' : num(l.ttfb_ms) + ' ms'],
      [t('logs.detailFieldTokens'), num(l.prompt_tokens) + ' / ' + num(l.completion_tokens) + ' / ' + num(l.total_tokens)], [t('logs.detailFieldAttempts'), l.attempts]
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

  // ---- 测试 ----
  $('#t-go').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    var out = $('#t-out'); out.classList.remove('hidden'); out.classList.remove('err'); out.textContent = '';
    $('#t-meta').textContent = t('test.requesting');
    var t0 = performance.now();
    try {
      var res = await fetch('/admin/api/test', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
        body: JSON.stringify({ model: $('#t-model').value, prompt: $('#t-prompt').value, stream: $('#t-stream').checked, noFallback: $('#t-nofb').checked })
      });
      var meta = t('test.metaInfo', {
        status: res.status,
        provider: res.headers.get('x-gateway-provider') || '—',
        model: res.headers.get('x-gateway-model') || '—',
        attempts: res.headers.get('x-gateway-attempts') || '—'
      });
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
            try { var o = JSON.parse(d), dl = o.choices && o.choices[0] && o.choices[0].delta; if (dl) text += (dl.reasoning_content || '') + (dl.content || ''); } catch (e) { text += '\n[error] ' + d; }
          });
          out.textContent = text;
        }
        $('#t-meta').textContent = meta + ' · ' + t('test.ttfbTotal', { ttfb: Math.round(first - t0), total: Math.round(performance.now() - t0) });
      } else {
        var raw = await res.text();
        try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
        if (!res.ok) { out.classList.add('err'); if (res.status === 401) show('login'); }
        out.textContent = raw;
        $('#t-meta').textContent = meta + ' · ' + t('test.totalOnly', { total: Math.round(performance.now() - t0) });
      }
    } catch (err) { out.classList.add('err'); out.textContent = String(err && err.stack || err); $('#t-meta').textContent = ''; }
    btn.disabled = false;
  });

  // ---- 启动 ----
  async function boot() {
    try { await api('/admin/api/me'); } catch (e) { show('login'); if (!/未登录/.test(e.message)) $('#login-err').textContent = e.message; return; }
    show('main');
    try { await loadConfig(); } catch (e) { alert(e.message); }
    loadStats(); loadKeys();
  }
  boot();
})();
