(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var I18N = {
    zh: {
      title: 'FlareRouter 网关',
      header: { copied: '已复制', logout: '退出账号', themeToDark: '切换到夜间', themeToLight: '切换到日间' },
      tabs: { overview: '概览', providers: '上游', fallback: '容灾', keys: '密钥', logs: '日志', chat: '测试', settings: '设置' },
      login: { title: 'FlareRouter 网关登录', passwordLabel: '管理员密码', submit: '登录', unauth: '未登录' },
      overview: {
        statsTitle: '调用统计', days24h: '近 24 小时', days7d: '近 7 天', days30d: '近 30 天', refresh: '刷新',
        totalCalls: '调用次数', successRate: '成功率', failedCalls: '失败', fallbackTriggered: '触发容灾', totalTokens: 'Tokens', avgLatency: '平均耗时',
        cacheHit: '缓存命中',
        usageTitle: '调用方式',
        usageBaseLabel: 'Base URL', usageBaseHint: '填进客户端的「API 地址 / Base URL」',
        usageProtoLabel: '对话协议', usageProtoHint: '按客户端支持的类型选一行',
        usageChatLabel: 'OpenAI Chat Completions', usageChatHint: '多数 OpenAI 兼容客户端的默认协议',
        usageAnthLabel: 'Anthropic Messages', usageAnthHint: 'Claude Code / Anthropic SDK（token 计数：/v1/messages/count_tokens）',
        usageOtherLabel: '其它能力', usageOtherHint: 'Embeddings 与媒体接口',
        usageModelsLabel: '模型清单', usageModelsHint: '客户端拉取可用模型（需调用密钥）',
        usageAuth: '鉴权：在「密钥」页生成 Key，请求头带 Authorization: Bearer <key> 或 x-api-key: <key>。',
        usageModelHint: '模型写成「服务商 ID/模型」，写 auto 则按容灾链从头尝试；请求头 x-gateway-fallback: off 可临时关闭本次容灾。',
        usageCurlLabel: '示例',
        thProvider: '服务商', thCalls: '调用', thSuccess: '成功', thTokens: 'Tokens', noStats: '暂无调用', unhit: '（未命中）'
      },
      providers: {
        title: '上游', desc: '顺序即 auto 默认容灾顺序（未自定义容灾链时）', add: '添加服务商',
        thOrder: '顺序', thNameId: '名称 / ID', thBase: 'Base URL', thKey: 'Key', thModels: '模型', thEnable: '启用', thActions: '操作',
        empty: '还没有服务商，点右上角「添加服务商」。', edit: '编辑', del: '删除',
        delConfirm: '删除服务商「{name}」？它在容灾链里的条目也会一并移除。', deleted: '已删除',
        dialogAdd: '添加服务商', dialogEdit: '编辑服务商', labelName: '名称', labelId: 'ID（用于「ID/模型」寻址）',
        labelProto: '协议类型', protoOpenAI: 'OpenAI 兼容（/chat/completions，Bearer 鉴权）', protoAnthropic: 'Anthropic Messages（/v1/messages，x-api-key 鉴权）',
        tipAnthropic: 'Base URL 写到域名即可（带不带 /v1 都行），请求发往 /v1/messages，模型列表取 /v1/models；也适用于提供 Anthropic 兼容接口的服务商。',
        tipOpenAI: 'Base URL 一般以 /v1 结尾，请求发往 /chat/completions，模型列表取 /models。',
        keyEmptyTag: '未填', keyPlaceholderEdit: '留空则清除已保存的 Key', keyPlaceholderNew: '必填（部分本地服务可留空）',
        labelModels: '模型列表（逗号或换行分隔，第一个为默认；留空可点「从服务商拉取」）', fetchModels: '从服务商拉取', fetching: '拉取中…',
        fetchPopulated: '已写入全部 {count} 个模型', searchModels: '搜索…', selectAll: '全选可见', selectNone: '取消可见',
        noMatchModels: '没有匹配的模型（共 {count} 个）', labelTimeout: '超时（毫秒，拿到响应头为止）', labelNote: '备注',
        streamUsage: '流式请求自动加 stream_options.include_usage', cancel: '取消', save: '保存', saved: '已保存',
        savedEmptyModels: '已保存。模型列表为空，可点「从服务商拉取」'
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
        newKeyTitle: '密钥已生成',
        newKeyNotice: '已为「{name}」生成密钥，已自动复制到剪贴板，并保存至列表：', copy: '复制',
        nameRequired: '请先填写名称',
        showHide: '显示 / 隐藏明文', legacyNoRaw: '旧密钥无明文', thName: '名称', thKey: '密钥',
        thCreated: '创建', thLastUsed: '最近使用', thStatus: '状态', thActions: '操作',
        active: '有效', revoked: '已吊销', rename: '改名', revoke: '吊销', delete: '删除',
        renamePrompt: '新的密钥名称',
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
        detailFieldTokens: 'Tokens', detailFieldCacheRead: '缓存读 Token', detailFieldAttempts: '尝试次数', detailTrail: '失败的尝试（原文）', detailError: '错误',
        detailPrompt: '用户消息', yes: '是', no: '否', close: '关闭'
      },
      test: {
        title: '测试调用', desc: '走真实的转发、容灾与日志链路（日志里密钥显示为「管理页测试」）。',
        labelModel: '模型', labelPrompt: '提示词', defaultPrompt: '你好，用一句话介绍你自己。',
        stream: '流式', noFallback: '关闭容灾', send: '发送', requesting: '请求中…',
        metaInfo: 'HTTP {status} · 服务商 {provider} · 模型 {model} · 尝试 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 总 {total} ms', totalOnly: '{total} ms'
      },
      chat: {
        desc: '走真实的转发、容灾与日志链路。会话仅保存在本机浏览器。',
        labelModel: '模型', noFallback: '关闭容灾', clear: '清空', clearConfirm: '清空当前对话？此操作不可恢复。',
        placeholder: '输入消息，Enter 发送，Shift+Enter 换行', send: '发送', stop: '停止',
        attach: '上传文件', removeAttach: '移除', dropHint: '可将图片或文件拖到此处',
        errTooMany: '最多上传 {max} 个文件', errTooLarge: '文件过大（上限 {max} MiB）：{name}',
        empty: '还没有消息。选一个模型，开始测试。', thinking: '生成中…',
        thinkLabel: '思考过程', errAborted: '已停止', localOnly: '会话仅保存在本机浏览器',
        metaInfo: 'HTTP {status} · 服务商 {provider} · 模型 {model} · 尝试 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 总 {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: '日志', retentionLabel: '日志保留', daysUnit: '天（0 = 永久，每日 Cron 清理）',
        logPromptsLabel: '记录最后一条用户消息原文（默认关，只记元数据）', save: '保存', saved: '已保存',
        backupTitle: '备份', backupDesc: '导出文件包含上游 API Key 明文，请妥善保存。导入会整体覆盖当前服务商与设置。',
        exportBtn: '导出配置', importBtn: '导入配置', importConfirm: '导入将覆盖当前全部服务商与设置（共 {count} 个服务商），继续？', importSuccess: '导入完成'
      },
      common: { confirm: '确认', cancel: '取消' },
      dialog: { confirmTitle: '操作确认', alertTitle: '提示', alertOk: '我知道了', promptTitle: '请输入' },
      footer: { brand: 'FlareRouter', tagline: '基于 Cloudflare Workers 的轻量 AI 网关', github: 'GitHub' }
    },
    'zh-Hant': {
      title: 'FlareRouter 網關',
      header: { copied: '已複製', logout: '退出帳號', themeToDark: '切換到夜間', themeToLight: '切換到日間' },
      tabs: { overview: '概覽', providers: '上游', fallback: '容災', keys: '密鑰', logs: '日誌', chat: '測試', settings: '設定' },
      login: { title: 'FlareRouter 網關登入', passwordLabel: '管理員密碼', submit: '登入', unauth: '未登入' },
      overview: {
        statsTitle: '調用統計', days24h: '近 24 小時', days7d: '近 7 天', days30d: '近 30 天', refresh: '刷新',
        totalCalls: '調用次數', successRate: '成功率', failedCalls: '失敗', fallbackTriggered: '觸發容災', totalTokens: 'Tokens', avgLatency: '平均耗時',
        cacheHit: '快取命中',
        usageTitle: '調用方式',
        usageBaseLabel: 'Base URL', usageBaseHint: '填進客戶端的「API 位址 / Base URL」',
        usageProtoLabel: '對話協議', usageProtoHint: '按客戶端支援的類型選一行',
        usageChatLabel: 'OpenAI Chat Completions', usageChatHint: '多數 OpenAI 相容客戶端的預設協議',
        usageAnthLabel: 'Anthropic Messages', usageAnthHint: 'Claude Code / Anthropic SDK（token 計數：/v1/messages/count_tokens）',
        usageOtherLabel: '其它能力', usageOtherHint: 'Embeddings 與媒體介面',
        usageModelsLabel: '模型清單', usageModelsHint: '客戶端拉取可用模型（需調用密鑰）',
        usageAuth: '鑑權：在「密鑰」頁產生 Key，請求頭帶 Authorization: Bearer <key> 或 x-api-key: <key>。',
        usageModelHint: '模型寫成「服務商 ID/模型」，寫 auto 則按容災鏈從頭嘗試；請求頭 x-gateway-fallback: off 可臨時關閉本次容災。',
        usageCurlLabel: '範例',
        thProvider: '服務商', thCalls: '調用', thSuccess: '成功', thTokens: 'Tokens', noStats: '暫無調用', unhit: '（未命中）'
      },
      providers: {
        title: '上游', desc: '順序即 auto 預設容災順序（未自訂容災鏈時）', add: '新增服務商',
        thOrder: '順序', thNameId: '名稱 / ID', thBase: 'Base URL', thKey: 'Key', thModels: '模型', thEnable: '啟用', thActions: '操作',
        empty: '還沒有服務商，點右上角「新增服務商」。', edit: '編輯', del: '刪除',
        delConfirm: '刪除服務商「{name}」？它在容災鏈裡的條目也會一併移除。', deleted: '已刪除',
        dialogAdd: '新增服務商', dialogEdit: '編輯服務商', labelName: '名稱', labelId: 'ID（用於「ID/模型」定址）',
        labelProto: '協議類型', protoOpenAI: 'OpenAI 相容（/chat/completions，Bearer 鑑權）', protoAnthropic: 'Anthropic Messages（/v1/messages，x-api-key 鑑權）',
        tipAnthropic: 'Base URL 寫到網域即可（帶不帶 /v1 都行），請求發往 /v1/messages，模型列表取 /v1/models；也適用於提供 Anthropic 相容介面的服務商。',
        tipOpenAI: 'Base URL 一般以 /v1 結尾，請求發往 /chat/completions，模型列表取 /models。',
        keyEmptyTag: '未填', keyPlaceholderEdit: '留空則清除已儲存的 Key', keyPlaceholderNew: '必填（部分本地服務可留空）',
        labelModels: '模型列表（逗號或換行分隔，第一個為預設；留空可點「從服務商拉取」）', fetchModels: '從服務商拉取', fetching: '拉取中…',
        fetchPopulated: '已寫入全部 {count} 個模型', searchModels: '搜尋…', selectAll: '全選可見', selectNone: '取消可見',
        noMatchModels: '沒有匹配的模型（共 {count} 個）', labelTimeout: '超時（毫秒，拿到回應頭為止）', labelNote: '備註',
        streamUsage: '串流請求自動加 stream_options.include_usage', cancel: '取消', save: '儲存', saved: '已儲存',
        savedEmptyModels: '已儲存。模型列表為空，可點「從服務商拉取」'
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
        newKeyTitle: '密鑰已產生',
        newKeyNotice: '已為「{name}」產生密鑰，已自動複製到剪貼簿，並儲存至列表：', copy: '複製',
        nameRequired: '請先填寫名稱',
        showHide: '顯示 / 隱藏明文', legacyNoRaw: '舊密鑰無明文', thName: '名稱', thKey: '密鑰',
        thCreated: '建立', thLastUsed: '最近使用', thStatus: '狀態', thActions: '操作',
        active: '有效', revoked: '已吊銷', rename: '改名', revoke: '吊銷', delete: '刪除',
        renamePrompt: '新的密鑰名稱',
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
        detailFieldTokens: 'Tokens', detailFieldCacheRead: '快取讀 Token', detailFieldAttempts: '嘗試次數', detailTrail: '失敗的嘗試（原文）', detailError: '錯誤',
        detailPrompt: '使用者訊息', yes: '是', no: '否', close: '關閉'
      },
      test: {
        title: '測試調用', desc: '走真實的轉發、容災與日誌鏈路（日誌裡密鑰顯示為「管理頁測試」）。',
        labelModel: '模型', labelPrompt: '提示詞', defaultPrompt: '你好，用一句話介紹你自己。',
        stream: '串流', noFallback: '關閉容災', send: '發送', requesting: '請求中…',
        metaInfo: 'HTTP {status} · 服務商 {provider} · 模型 {model} · 嘗試 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 總 {total} ms', totalOnly: '{total} ms'
      },
      chat: {
        desc: '走真實的轉發、容災與日誌鏈路。會話僅保存在本機瀏覽器。',
        labelModel: '模型', noFallback: '關閉容災', clear: '清空', clearConfirm: '清空當前對話？此操作不可恢復。',
        placeholder: '輸入訊息，Enter 發送，Shift+Enter 換行', send: '發送', stop: '停止',
        attach: '上傳檔案', removeAttach: '移除', dropHint: '可將圖片或檔案拖到此處',
        errTooMany: '最多上傳 {max} 個檔案', errTooLarge: '檔案過大（上限 {max} MiB）：{name}',
        empty: '還沒有訊息。選一個模型，開始測試。', thinking: '生成中…',
        thinkLabel: '思考過程', errAborted: '已停止', localOnly: '會話僅保存在本機瀏覽器',
        metaInfo: 'HTTP {status} · 服務商 {provider} · 模型 {model} · 嘗試 {attempts} 次',
        ttfbTotal: '首包 {ttfb} ms · 總 {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: '日誌', retentionLabel: '日誌保留', daysUnit: '天（0 = 永久，每日 Cron 清理）',
        logPromptsLabel: '記錄最後一條使用者訊息原文（預設關，只記元數據）', save: '儲存', saved: '已儲存',
        backupTitle: '備份', backupDesc: '匯出檔案包含上游 API Key 明文，請妥善保存。匯入會整體覆蓋當前服務商與設定。',
        exportBtn: '匯出設定', importBtn: '匯入設定', importConfirm: '匯入將覆蓋當前全部服務商與設定（共 {count} 個服務商），繼續？', importSuccess: '匯入完成'
      },
      common: { confirm: '確認', cancel: '取消' },
      dialog: { confirmTitle: '操作確認', alertTitle: '提示', alertOk: '我知道了', promptTitle: '請輸入' },
      footer: { brand: 'FlareRouter', tagline: '基於 Cloudflare Workers 的輕量 AI 網關', github: 'GitHub' }
    },
    en: {
      title: 'FlareRouter Gateway',
      header: { copied: 'Copied', logout: 'Sign Out', themeToDark: 'Switch to Night', themeToLight: 'Switch to Day' },
      tabs: { overview: 'Overview', providers: 'Upstream', fallback: 'Failover', keys: 'Keys', logs: 'Logs', chat: 'Test', settings: 'Settings' },
      login: { title: 'FlareRouter Gateway Sign In', passwordLabel: 'Admin Password', submit: 'Sign In', unauth: 'Not signed in' },
      overview: {
        statsTitle: 'Call Statistics', days24h: 'Last 24 Hours', days7d: 'Last 7 Days', days30d: 'Last 30 Days', refresh: 'Refresh',
        totalCalls: 'Total Calls', successRate: 'Success Rate', failedCalls: 'Failed', fallbackTriggered: 'Failovers', totalTokens: 'Tokens', avgLatency: 'Avg Latency',
        cacheHit: 'Cache Hit',
        usageTitle: 'Usage Guide',
        usageBaseLabel: 'Base URL', usageBaseHint: 'Paste into the client\'s API Base URL field',
        usageProtoLabel: 'Chat Protocols', usageProtoHint: 'Pick the row your client supports',
        usageChatLabel: 'OpenAI Chat Completions', usageChatHint: 'Default for most OpenAI-compatible clients',
        usageAnthLabel: 'Anthropic Messages', usageAnthHint: 'Claude Code / Anthropic SDK (token count: /v1/messages/count_tokens)',
        usageOtherLabel: 'Other Endpoints', usageOtherHint: 'Embeddings and media APIs',
        usageModelsLabel: 'Model List', usageModelsHint: 'Clients fetch available models (requires an API key)',
        usageAuth: 'Auth: create a key on the Keys page; send Authorization: Bearer <key> or x-api-key: <key>.',
        usageModelHint: 'Model format: provider/model, or auto to walk the failover chain. Header x-gateway-fallback: off disables failover for one request.',
        usageCurlLabel: 'Example',
        thProvider: 'Provider', thCalls: 'Calls', thSuccess: 'Success', thTokens: 'Tokens', noStats: 'No calls yet', unhit: '(Unhit)'
      },
      providers: {
        title: 'Upstream', desc: 'Order defines default failover when chain is unset', add: 'Add Provider',
        thOrder: 'Order', thNameId: 'Name / ID', thBase: 'Base URL', thKey: 'Key', thModels: 'Models', thEnable: 'Enabled', thActions: 'Actions',
        empty: 'No providers yet. Click "Add Provider" above to start.', edit: 'Edit', del: 'Delete',
        delConfirm: 'Delete provider "{name}"? Entries in failover chain will also be removed.', deleted: 'Deleted',
        dialogAdd: 'Add Provider', dialogEdit: 'Edit Provider', labelName: 'Name', labelId: 'ID (for "id/model" addressing)',
        labelProto: 'Protocol Type', protoOpenAI: 'OpenAI Compatible (/chat/completions, Bearer auth)', protoAnthropic: 'Anthropic Messages (/v1/messages, x-api-key auth)',
        tipAnthropic: 'Base URL can be just the domain (with or without /v1). Requests go to /v1/messages, models to /v1/models; also works with Anthropic-compatible proxies.',
        tipOpenAI: 'Base URL usually ends in /v1. Requests go to /chat/completions, models to /models.',
        keyEmptyTag: 'None', keyPlaceholderEdit: 'Leave empty to clear saved Key', keyPlaceholderNew: 'Required (can be empty for local)',
        labelModels: 'Models (comma or newline separated, 1st is default; leave empty and use Fetch from Provider)', fetchModels: 'Fetch from Provider', fetching: 'Fetching…',
        fetchPopulated: 'Populated all {count} models', searchModels: 'Search…', selectAll: 'Select Visible', selectNone: 'Deselect Visible',
        noMatchModels: 'No matching models ({count} total)', labelTimeout: 'Timeout (ms, until response headers)', labelNote: 'Note',
        streamUsage: 'Auto add stream_options.include_usage to stream requests', cancel: 'Cancel', save: 'Save', saved: 'Saved',
        savedEmptyModels: 'Saved. Models empty — use Fetch from Provider'
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
        newKeyTitle: 'Key Created',
        newKeyNotice: 'Key created for "{name}", copied to clipboard, and saved to the list:', copy: 'Copy',
        nameRequired: 'Please enter a name first',
        showHide: 'Show / Hide Key', legacyNoRaw: 'Legacy (no raw key)', thName: 'Name', thKey: 'Key',
        thCreated: 'Created', thLastUsed: 'Last Used', thStatus: 'Status', thActions: 'Actions',
        active: 'Active', revoked: 'Revoked', rename: 'Rename', revoke: 'Revoke', delete: 'Delete',
        renamePrompt: 'New key name',
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
        detailFieldTokens: 'Tokens', detailFieldCacheRead: 'Cache Read Tokens', detailFieldAttempts: 'Attempts', detailTrail: 'Failed Attempts (Raw)', detailError: 'Error',
        detailPrompt: 'User Message', yes: 'Yes', no: 'No', close: 'Close'
      },
      test: {
        title: 'Test Gateway', desc: 'Tests through real proxying, failover and logging (logged as "Admin Test").',
        labelModel: 'Model', labelPrompt: 'Prompt', defaultPrompt: 'Hello, introduce yourself in one sentence.',
        stream: 'Stream', noFallback: 'Disable Failover', send: 'Send', requesting: 'Requesting…',
        metaInfo: 'HTTP {status} · Provider {provider} · Model {model} · Attempts {attempts}',
        ttfbTotal: 'TTFB {ttfb} ms · Total {total} ms', totalOnly: '{total} ms'
      },
      chat: {
        desc: 'Uses the real proxy, failover and logging path. Session is stored only in this browser.',
        labelModel: 'Model', noFallback: 'Disable Failover', clear: 'Clear', clearConfirm: 'Clear this chat? This cannot be undone.',
        placeholder: 'Type a message. Enter to send, Shift+Enter for newline', send: 'Send', stop: 'Stop',
        attach: 'Attach file', removeAttach: 'Remove', dropHint: 'Drop images or files here',
        errTooMany: 'At most {max} files', errTooLarge: 'File too large (max {max} MiB): {name}',
        empty: 'No messages yet. Pick a model and start testing.', thinking: 'Generating…',
        thinkLabel: 'Thinking', errAborted: 'Stopped', localOnly: 'Session is stored only in this browser',
        metaInfo: 'HTTP {status} · Provider {provider} · Model {model} · Attempts {attempts}',
        ttfbTotal: 'TTFB {ttfb} ms · Total {total} ms', totalOnly: '{total} ms'
      },
      settings: {
        logsTitle: 'Logs', retentionLabel: 'Log retention', daysUnit: 'days (0 = forever, daily cron cleanup)',
        logPromptsLabel: 'Log raw user prompt of the last message (default off)', save: 'Save', saved: 'Saved',
        backupTitle: 'Backup', backupDesc: 'Export file contains raw upstream API keys; store safely. Import overwrites existing providers and settings.',
        exportBtn: 'Export Config', importBtn: 'Import Config', importConfirm: 'Import will overwrite all existing providers and settings ({count} providers), continue?', importSuccess: 'Import completed'
      },
      common: { confirm: 'Confirm', cancel: 'Cancel' },
      dialog: { confirmTitle: 'Please confirm', alertTitle: 'Notice', alertOk: 'OK', promptTitle: 'Input' },
      footer: { brand: 'FlareRouter', tagline: 'Lightweight AI gateway on Cloudflare Workers', github: 'GitHub' }
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
    renderUsageDocs();
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
      if (e.target === dialogOverlay) closeDialog(null);
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
      dialogOverlay.querySelector('.custom-dialog-btn-cancel').onclick = function () { closeDialog(false); };
      dialogOverlay.querySelector('.custom-dialog-btn-confirm').onclick = function () { closeDialog(true); };
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
    var h = '<tr><th>' + t('providers.thOrder') + '</th><th>' + t('providers.thNameId') + '</th><th class="hide-sm">' + t('providers.thBase') + '</th><th>' + t('providers.thKey') + '</th><th>' + t('providers.thModels') + '</th><th>' + t('providers.thEnable') + '</th><th class="col-actions">' + t('providers.thActions') + '</th></tr>';
    if (!ps.length) h += '<tr><td colspan="7" class="muted">' + t('providers.empty') + '</td></tr>';
    ps.forEach(function (p, i) {
      h += '<tr>' +
        '<td class="mono"><button class="btn sm" data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button> <button class="btn sm" data-down="' + i + '"' + (i === ps.length - 1 ? ' disabled' : '') + '>↓</button></td>' +
        '<td><div>' + esc(p.name) + '</div><div class="muted mono small">' + esc(p.id) + '</div>' + (p.note ? '<div class="muted small">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td class="hide-sm mono small" style="word-break:break-all">' + esc(p.baseUrl) + (p.protocol === 'anthropic' ? ' <span class="tag">Anthropic</span>' : '') + '</td>' +
        '<td class="mono small">' + (p.hasKey ? esc(p.apiKeyPreview) : '<span class="tag warn">' + t('providers.keyEmptyTag') + '</span>') + '</td>' +
        '<td class="small" title="' + esc(p.models.join(', ')) + '">' + p.models.length + '<div class="muted mono">' + esc(p.models[0] || '') + '</div></td>' +
        '<td><label class="switch"><input type="checkbox" data-toggle="' + esc(p.id) + '"' + (p.enabled ? ' checked' : '') + '><span></span></label></td>' +
        '<td class="col-actions" style="white-space:nowrap"><button class="btn sm" data-edit="' + i + '">' + t('providers.edit') + '</button> <button class="btn sm danger" data-del="' + esc(p.id) + '">' + t('providers.del') + '</button></td>' +
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
        if (!(await showConfirm({ message: t('providers.delConfirm', { name: b.dataset.del }), danger: true }))) return;
        setCfg(await api('/admin/api/providers/delete', { body: { id: b.dataset.del } })); toast(t('providers.deleted'));
      }
    } catch (err) { await showAlert({ message: err.message }); }
  });
  $('#prov-table').addEventListener('change', async function (e) {
    var id = e.target.dataset.toggle; if (!id) return;
    try { setCfg(await api('/admin/api/providers/toggle', { body: { id: id, enabled: e.target.checked } })); }
    catch (err) { await showAlert({ message: err.message }); e.target.checked = !e.target.checked; }
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
    $('#p-key').value = p && p.apiKey ? p.apiKey : '';
    $('#p-key').type = 'password';
    $('#p-key-toggle').textContent = '👁';
    $('#p-key').placeholder = p && p.hasKey ? t('providers.keyPlaceholderEdit') : t('providers.keyPlaceholderNew');
    $('#p-models').value = p ? p.models.join('\n') : '';
    $('#p-timeout').value = p ? p.timeoutMs : 60000;
    $('#p-note').value = p ? p.note || '' : '';
    $('#p-usage').checked = p ? p.streamUsage !== false : true;
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
    var keyVal = $('#p-key').value.trim();
    var editingId = state.editing || '';
    var prev = editingId ? (state.cfg.providers || []).find(function (x) { return x.id === editingId; }) : null;
    var body = {
      originalId: editingId,
      clearKey: !!(editingId && !keyVal),
      provider: {
        id: $('#p-id').value.trim(), name: $('#p-name').value.trim(), protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(),
        apiKey: keyVal, models: $('#p-models').value, timeoutMs: +$('#p-timeout').value || 60000,
        note: $('#p-note').value.trim(), streamUsage: $('#p-usage').checked,
        enabled: prev ? !!prev.enabled : true
      }
    };
    if (state.fetchedLimits && Object.keys(state.fetchedLimits).length) body.provider.modelLimits = Object.assign({}, prev && prev.modelLimits, state.fetchedLimits);
    try {
      var res = await api('/admin/api/providers', { body: body });
      setCfg(res); $('#dlg-prov').close();
      var savedId = body.provider.id;
      var ap = (res.providers || []).find(function (p) { return p.id === savedId; });
      toast(ap && !ap.models.length ? t('providers.savedEmptyModels') : t('providers.saved'));
    }
    catch (err) { $('#prov-err').textContent = err.message; }
  });
  $('#p-fetch').addEventListener('click', async function () {
    $('#p-fetch-err').textContent = t('providers.fetching');
    try {
      var r = await api('/admin/api/providers/fetch-models', { body: { id: state.editing, protocol: $('#p-protocol').value, baseUrl: $('#p-url').value.trim(), apiKey: $('#p-key').value.trim() } });
      state.fetched = r.models; state.fetchedLimits = r.limits || {}; $('#p-fetch-err').textContent = '';
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
    catch (err) { await showAlert({ message: err.message }); }
  });

  function renderModelSelects() {
    var ms = state.cfg.models || modelsFrom(state.cfg.providers);
    state.cfg.models = ms;
    var opts = ms.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    var keepC = $('#c-model').value || (chatState && chatState.model) || '';
    $('#c-model').innerHTML = opts; if (keepC) $('#c-model').value = keepC;
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
    catch (err) { await showAlert({ message: err.message }); }
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
      var cacheVal = '—';
      if (s.cache_read_tokens != null && s.prompt_tokens_for_cache > 0) {
        cacheVal = num(s.cache_read_tokens) + ' / ' + (s.cache_read_tokens * 100 / s.prompt_tokens_for_cache).toFixed(1) + '%';
      } else if (s.cache_read_tokens != null) {
        cacheVal = num(s.cache_read_tokens);
      }
      // 调用(+失败) · 成功率(+容灾) · Tokens(+缓存) · 平均耗时 → 4 格
      var callsHtml = num(total) +
        '<span class="stat-sub">' + t('overview.failedCalls') + ' ' + num(total - ok) + '</span>';
      var successHtml = (total ? (ok * 100 / total).toFixed(1) + '%' : '—') +
        '<span class="stat-sub">' + t('overview.fallbackTriggered') + ' ' + num(s.fallback || 0) + '</span>';
      var tokensHtml = num(s.tokens || 0) +
        '<span class="stat-sub">' + t('overview.cacheHit') + ' ' + cacheVal + '</span>';
      $('#stats').innerHTML = [
        [t('overview.totalCalls'), callsHtml],
        [t('overview.successRate'), successHtml],
        [t('overview.totalTokens'), tokensHtml],
        [t('overview.avgLatency'), s.avg_latency ? Math.round(s.avg_latency) + ' ms' : '—']
      ].map(function (x) { return '<div class="stat"><span class="muted small">' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');
      var rows = s.byProvider || [];
      $('#stats-prov').innerHTML = '<tr><th>' + t('overview.thProvider') + '</th><th>' + t('overview.thCalls') + '</th><th>' + t('overview.thSuccess') + '</th><th>' + t('overview.thTokens') + '</th></tr>' +
        (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.provider_name || r.provider_id || t('overview.unhit')) + '</td><td>' + num(r.total) + '</td><td>' + num(r.ok) + '</td><td>' + num(r.tokens) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">' + t('overview.noStats') + '</td></tr>');
    } catch (err) { $('#stats').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }
  }
  $('#stats-refresh').addEventListener('click', loadStats);
  $('#stats-days').addEventListener('change', loadStats);

  // ---- 密钥 ----
  function renderKeys(items) {
    state.keys = items || [];
    $('#key-table').innerHTML = '<tr><th>' + t('keys.thName') + '</th><th>' + t('keys.thKey') + '</th><th>' + t('keys.thCreated') + '</th><th>' + t('keys.thLastUsed') + '</th><th>' + t('keys.thStatus') + '</th><th class="col-actions">' + t('keys.thActions') + '</th></tr>' +
      (state.keys.length ? state.keys.map(function (k) {
        var hasRaw = !!k.raw_key;
        var isUnmasked = !!state.unmaskedKeys[k.id];
        var displayKey = hasRaw ? (isUnmasked ? k.raw_key : '*'.repeat(k.raw_key.length)) : k.preview;
        var keyHtml = '<span class="key-cell">' +
          '<span class="mono small key-val' + (hasRaw ? ' click' : '') + '"' + (hasRaw ? ' data-ktoggle="' + esc(k.id) + '" title="' + t('keys.showHide') + '"' : '') + '>' + esc(displayKey) + '</span>' +
          (hasRaw ? ' <button class="btn sm" data-ktoggle="' + esc(k.id) + '" title="' + t('keys.showHide') + '">' + (isUnmasked ? '🙈' : '👁') + '</button>' : ' <span class="muted small" title="' + t('keys.legacyNoRaw') + '">(' + t('keys.legacyNoRaw') + ')</span>') +
          '</span>';
        return '<tr><td><b>' + esc(k.name) + '</b></td>' +
          '<td>' + keyHtml + '</td>' +
          '<td class="small">' + fmtTime(k.created_at) + '</td>' +
          '<td class="small">' + fmtTime(k.last_used_at) + '</td>' +
          '<td><span class="tag ' + (k.revoked ? 'bad' : 'ok') + '">' + (k.revoked ? t('keys.revoked') : t('keys.active')) + '</span></td>' +
          '<td class="col-actions" style="white-space:nowrap">' + (hasRaw ? '<button class="btn sm" data-kcopy="' + esc(k.raw_key) + '">' + t('keys.copy') + '</button> ' : '') + '<button class="btn sm" data-rename="' + esc(k.id) + '">' + t('keys.rename') + '</button> ' + (k.revoked ? '' : '<button class="btn sm" data-revoke="' + esc(k.id) + '">' + t('keys.revoke') + '</button> ') + '<button class="btn sm danger" data-kdel="' + esc(k.id) + '">' + t('keys.delete') + '</button></td></tr>';
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
    var name = $('#key-name').value.trim();
    if (!name) {
      toast(t('keys.nameRequired'));
      $('#key-name').focus();
      return;
    }
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
    } catch (err) { await showAlert({ message: err.message }); }
  });
  $('#key-table').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-ktoggle], [data-kcopy], [data-rename], [data-revoke], [data-kdel]'); if (!b) return;
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
      if (b.dataset.revoke) {
        if (!(await showConfirm({ message: t('keys.revokeConfirm'), danger: true }))) return;
        var revId = b.dataset.revoke;
        var prevRev = state.keys.slice();
        renderKeys(state.keys.map(function (k) { return k.id === revId ? Object.assign({}, k, { revoked: 1 }) : k; }));
        try {
          var revRes = await api('/admin/api/keys/revoke', { body: { id: revId } });
          if (revRes.items) renderKeys(revRes.items);
        } catch (err) { renderKeys(prevRev); throw err; }
        return;
      }
      if (b.dataset.kdel) {
        if (!(await showConfirm({ message: t('keys.delConfirm'), danger: true }))) return;
        var delId = b.dataset.kdel;
        var prevDel = state.keys.slice();
        renderKeys(state.keys.filter(function (k) { return k.id !== delId; }));
        try {
          var delRes = await api('/admin/api/keys/delete', { body: { id: delId } });
          if (delRes.items) renderKeys(delRes.items);
        } catch (err) { renderKeys(prevDel); throw err; }
      }
    } catch (err) { await showAlert({ message: err.message }); }
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
    if (!(await showConfirm({ message: t('logs.clearConfirm'), danger: true }))) return;
    try { var r = await api('/admin/api/logs/clear', { body: {} }); toast(t('logs.deletedCount', { count: r.deleted == null ? '' : r.deleted })); state.logOffset = 0; loadLogs(); }
    catch (err) { await showAlert({ message: err.message }); }
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

  // ---- 启动 ----
  async function boot() {
    try { await api('/admin/api/me'); } catch (e) { show('login'); if (!/未登录/.test(e.message)) $('#login-err').textContent = e.message; return; }
    show('main');
    try { await loadConfig(); } catch (e) { await showAlert({ message: e.message }); }
    initChatUi();
    loadStats(); loadKeys();
  }
  boot();
})();
