// FlareRouter 隐私与脱敏模块单元测试
import assert from 'node:assert/strict';
import { PrivacyManager, resolvePrivacyPolicy } from '../src/privacy.js';

console.log('--- 开始测试隐私与脱敏模块 (PrivacyManager) ---');

// 1. 确定性哈希测试
{
  const pm1 = new PrivacyManager({ enabled: true });
  const pm2 = new PrivacyManager({ enabled: true });
  const rawKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
  const ph1 = pm1.maskText(rawKey);
  const ph2 = pm2.maskText(rawKey);
  assert.equal(ph1, ph2, '相同敏感值在不同实例下生成的占位符应完全一致');
  assert.match(ph1, /^\{\{MASK_KEY_[0-9a-f]{8}\}\}$/, '占位符格式应匹配规范');
  console.log('PASS: 确定性暗号生成 (HMAC/FNV-1a 稳定)');
}

// 2. API Key 与 Bearer Token 脱敏
{
  const pm = new PrivacyManager({ enabled: true, maskSecrets: true });
  const text = 'Authorization: Bearer sk-secretkey1234567890abcdefghij in config';
  const masked = pm.maskText(text);
  assert.ok(!masked.includes('sk-secretkey1234567890abcdefghij'), '原始 Key 不应出现在脱敏后文本中');
  assert.ok(masked.includes('Bearer {{MASK_KEY_'), '应保留 Bearer 前缀并仅对 token 脱敏');
  const restored = pm.restoreText(masked);
  assert.equal(restored, text, '反向还原应与原文本完全相同');
  console.log('PASS: API Key 与 Bearer 凭据脱敏及还原');
}

// 3. 数据库连接串脱敏
{
  const pm = new PrivacyManager({ enabled: true, maskSecrets: true });
  const conn = 'postgres://user:SuperP@ssw0rd!123@my-host.db.internal:5432/main';
  const masked = pm.maskText(conn);
  assert.ok(!masked.includes('SuperP@ssw0rd!123'), '数据库密码不应外泄');
  assert.ok(masked.startsWith('postgres://user:{{MASK_DBPASS_'), '应精准定位密码部分');
  const restored = pm.restoreText(masked);
  assert.equal(restored, conn, '数据库连接串还原无误');
  console.log('PASS: 数据库连接串密码脱敏');
}

// 4. 自定义私有词精准替换
{
  const pm = new PrivacyManager({
    enabled: true,
    customWords: ['张三', 'corp.internal.domain', 'ProjectTitan'],
  });
  const prompt = '我是张三，请帮我把 ProjectTitan 部署到 corp.internal.domain。';
  const masked = pm.maskText(prompt);
  assert.ok(!masked.includes('张三'), '姓名脱敏');
  assert.ok(!masked.includes('ProjectTitan'), '项目代号脱敏');
  assert.ok(!masked.includes('corp.internal.domain'), '私有域名脱敏');
  assert.ok(masked.includes('{{MASK_CUSTOM_'), '应生成 CUSTOM 暗号');
  const restored = pm.restoreText(masked);
  assert.equal(restored, prompt, '自定义词还原无误');
  console.log('PASS: 自定义私有词脱敏');
}

// 5. IPv4 地址与本地 IP 避让
{
  const pm = new PrivacyManager({ enabled: true, maskIp: true });
  const text = '服务器公网地址是 123.45.67.89，本地监听 127.0.0.1:8080。';
  const masked = pm.maskText(text);
  assert.ok(!masked.includes('123.45.67.89'), '公网 IP 应被脱敏');
  assert.ok(masked.includes('127.0.0.1'), '本地环回地址 127.0.0.1 应该被保留避让');
  const restored = pm.restoreText(masked);
  assert.equal(restored, text, 'IP 脱敏还原无误');
  console.log('PASS: IP 地址脱敏与本地无害 IP 避让');
}

// 6. 结构化 Payload 深度脱敏
{
  const pm = new PrivacyManager({
    enabled: true,
    customWords: ['绝密项目'],
  });
  const payload = {
    model: 'gpt-4o',
    system: '你是助手，当前开发 绝密项目。',
    messages: [
      { role: 'user', content: '绝密项目的 API key 是 sk-1234567890abcdefghijklmnopqrstuvwxyz' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '还有备用密钥 sk-9876543210zyxwvutsrqponmlkjihgfedcba' },
        ],
      },
    ],
  };
  const { maskedBody, context } = pm.maskPayload(payload);
  assert.equal(maskedBody.model, 'gpt-4o', '模型参数不应被修改');
  assert.ok(!maskedBody.system.includes('绝密项目'), 'system 字段应脱敏');
  assert.ok(!maskedBody.messages[0].content.includes('绝密项目'), 'message 0 字符串 content 应脱敏');
  assert.ok(!maskedBody.messages[1].content[0].text.includes('sk-9876543210'), '多模态数组 text 应脱敏');
  assert.equal(context.hits, 3, '总脱敏命中次数应为 3');
  console.log('PASS: OpenAI / Anthropic 结构化 Payload 递归脱敏');
}

// 7. 流式跨 Chunk 截断还原测试
{
  const pm = new PrivacyManager({
    enabled: true,
    customWords: ['my-super-secret-password'],
  });
  const masked = pm.maskText('pass: my-super-secret-password');
  // 提取生成的占位符
  const placeholder = Array.from(pm.secretMap.keys())[0];
  assert.ok(placeholder, '应存在生成的占位符');

  // 模拟流式大模型输出时把占位符从中间截断成两个 Chunk
  // 假设占位符形如 {{MASK_CUSTOM_abcd1234}}
  const mid = Math.floor(placeholder.length / 2);
  const part1 = placeholder.slice(0, mid); // 如 {{MASK_CUS
  const part2 = placeholder.slice(mid);     // 如 TOM_abcd1234}}

  const restorer = pm.createStreamRestorer();
  const chunk1 = 'Here is your ';
  const chunk2 = part1;
  const chunk3 = part2 + ' is verified.';

  const out1 = restorer(chunk1);
  assert.equal(out1, 'Here is your ', '普通文本直接放行');

  const out2 = restorer(chunk2);
  assert.equal(out2, '', '遇到未闭合暗号前缀时应被暂扣，输出为空');

  const out3 = restorer(chunk3);
  assert.equal(out3, 'my-super-secret-password is verified.', '下一个 chunk 到达后成功拼齐并还原！');
  console.log('PASS: 流式跨 Chunk 占位符暂扣与拼接还原');
}

// 8. 渠道策略解析测试
{
  const cfgOn = { settings: { privacy: { enabled: true } } };
  const cfgOff = { settings: { privacy: { enabled: false } } };

  assert.equal(resolvePrivacyPolicy(cfgOn, { privacy: 'inherit' }), true, 'inherit 时跟随全局 true');
  assert.equal(resolvePrivacyPolicy(cfgOff, { privacy: 'inherit' }), false, 'inherit 时跟随全局 false');
  assert.equal(resolvePrivacyPolicy(cfgOff, { privacy: 'on' }), true, '强制 on 优先于全局 false');
  assert.equal(resolvePrivacyPolicy(cfgOn, { privacy: 'off' }), false, '强制 off 优先于全局 true');
  console.log('PASS: 服务商脱敏策略 (inherit/on/off) 解析');
}

// 9. 脱敏明细结构化收集测试
{
  const pm = new PrivacyManager({ enabled: true, maskSecrets: true, maskIp: true });
  const text = '密钥是 sk-abcdef12345678901234567890，服务器位于 1.2.3.4。';
  pm.maskText(text);
  assert.equal(pm.redactedDetails.length, 2, '应记录 2 条脱敏条目');
  assert.ok(pm.redactedDetails.some((d) => d.kind === 'KEY' && d.original.includes('sk-abcdef')), '应包含 KEY 明细');
  assert.ok(pm.redactedDetails.some((d) => d.kind === 'IP' && d.original === '1.2.3.4'), '应包含 IP 明细');
  console.log('PASS: 结构化脱敏明细条目收集');
}

// 10. KV 永久持久化与新实例跨会话异步还原测试
{
  const mockKV = new Map();
  const mockEnv = {
    CONFIG: {
      async put(key, val, opts) {
        mockKV.set(key, val);
      },
      async get(key) {
        return mockKV.get(key) || null;
      },
    },
  };

  // 实例 1：第 1 轮对话，脱敏并写入 KV
  const pm1 = new PrivacyManager({ enabled: true, maskSecrets: true });
  const rawKey = 'sk-11111111112222222222333333333344';
  const maskedPrompt = pm1.maskText(`我的 API Key 是 ${rawKey}`);
  await pm1.persistToKV(mockEnv); // 默认永久写入

  assert.equal(mockKV.size, 1, 'KV 中应存入 1 条暗号映射');
  const storedKey = Array.from(mockKV.keys())[0];
  assert.ok(storedKey.startsWith('mask:{{MASK_KEY_'), 'KV key 应带有 mask: 前缀');
  assert.equal(mockKV.get(storedKey), rawKey, 'KV 中应存储真实明文');

  // 实例 2：模拟 7 天甚至几个月后的全新实例（内存完全为空，无任何 secretMap）
  const pm2 = new PrivacyManager({ enabled: true });
  assert.equal(pm2.secretMap.size, 0, '实例 2 初始内存必须为空');

  // AI 回复中引用了之前的暗号
  const aiReply = `我已经接收到你的密钥 ${Array.from(pm1.secretMap.keys())[0]}，随时待命。`;
  const restoredText = await pm2.restoreTextAsync(aiReply, mockEnv);

  assert.ok(!restoredText.includes('{{MASK_KEY_'), '还原后不应再有占位符暗号');
  assert.ok(restoredText.includes(rawKey), '跨会话/跨实例成功从 KV 读取并精准还原真实明文！');
  assert.equal(pm2.secretMap.size, 1, '还原后已自动载入实例 2 的内存二级缓存');
  console.log('PASS: KV 永久持久化与多轮/跨会话透明异步解密还原');
}

// 11. SSE Token 被大模型碎片化（分词切碎）拼合还原测试
{
  const pm = new PrivacyManager({ enabled: true, customWords: ['张三丰'] });
  pm.maskPayload({ messages: [{ role: 'user', content: '我叫张三丰' }] });
  const ph = Array.from(pm.secretMap.keys())[0]; // {{MASK_CUSTOM_xxxx}}
  assert.ok(ph, '应生成自定义暗号占位符');

  const restorer = pm.createStreamRestorer();

  // 模拟大模型把暗号切碎成 4 个小 Token
  const mid1 = Math.floor(ph.length / 3);
  const mid2 = Math.floor((ph.length * 2) / 3);
  const partA = ph.slice(0, mid1);
  const partB = ph.slice(mid1, mid2);
  const partC = ph.slice(mid2);

  const chunks = [
    `data: {"choices":[{"delta":{"content":"你的名字是：${partA}"}}]}\n\n`,
    `data: {"choices":[{"delta":{"content":"${partB}"}}]}\n\n`,
    `data: {"choices":[{"delta":{"content":"${partC}，已成功记住。"}}]}\n\n`,
    'data: [DONE]\n\n',
  ];

  let assembledContent = '';
  for (const c of chunks) {
    const out = await restorer(c);
    const lines = out.split('\n');
    for (const l of lines) {
      if (!l.startsWith('data:')) continue;
      const raw = l.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const o = JSON.parse(raw);
        if (o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content) {
          assembledContent += o.choices[0].delta.content;
        }
      } catch (e) {}
    }
  }

  assert.equal(assembledContent, '你的名字是：张三丰，已成功记住。', '碎片化的 Token 必须拼齐并 100% 还原为真实姓名！');
  console.log('PASS: SSE Token 碎片化多帧跨包滑动拼接与解密还原');
}

// 12. KV 写入防爆与削峰：多轮对话内存指纹去重（消除 90% 重复写入）
{
  let putCount = 0;
  let getCount = 0;
  const mockKV = new Map();
  const mockEnv = {
    CONFIG: {
      async put(key, val, opts) {
        putCount++;
        mockKV.set(key, val);
      },
      async get(key) {
        getCount++;
        return mockKV.get(key) || null;
      },
    },
  };

  const rawSecret = 'sk-11111111112222222222333333333355';
  // 第 1 轮对话：全新词，触发 1 次 get 检查 + 1 次 put 写入 + 1 次日志索引
  const pmRound1 = new PrivacyManager({ enabled: true, maskSecrets: true });
  pmRound1.maskText(`初始密钥: ${rawSecret}`);
  await pmRound1.persistToKV(mockEnv, { logTs: 10001 });

  assert.equal(putCount, 2, '第 1 轮：应写入 1 个暗号 + 1 条日志索引');
  assert.equal(mockKV.size, 2, 'KV 中应有 2 条记录');

  // 第 2 轮至第 10 轮对话（模拟带着长上下文多轮试聊）
  for (let round = 2; round <= 10; round++) {
    const pmNext = new PrivacyManager({ enabled: true, maskSecrets: true });
    // 上下文里继续包含之前的 rawSecret
    pmNext.maskText(`多轮对话第 ${round} 轮，依然包含: ${rawSecret}`);
    await pmNext.persistToKV(mockEnv, { logTs: 10000 + round });
  }

  // 关键断言：后 9 轮对话中，因为有内存指纹与已存在标记拦截，putCount 绝不重复递增！
  assert.equal(putCount, 2, '后 9 轮多轮对话重复写入量必须为 0，彻底根治多轮会话刷爆 KV 写配额！');
  console.log('PASS: 多轮对话内存指纹去重（消除 90% 重复写入）');
}

// 13. Read-Before-Write（读先于写）削峰机制验证
{
  let putCount = 0;
  let getCount = 0;
  const mockKV = new Map();
  const existingPh = '{{MASK_CUSTOM_aabbccdd}}';
  mockKV.set(`mask:${existingPh}`, '云端已存在的敏感词');

  const mockEnv = {
    CONFIG: {
      async put(key, val, opts) {
        putCount++;
        mockKV.set(key, val);
      },
      async get(key) {
        getCount++;
        return mockKV.get(key) || null;
      },
    },
  };

  const pm = new PrivacyManager({ enabled: true });
  pm.secretMap.set(existingPh, '云端已存在的敏感词');
  pm.redactedDetails.push({ kind: 'CUSTOM', placeholder: existingPh, original: '云端已存在的敏感词' });

  // 关键测试：即便带上 logTs，但因为全是已存在的暗号，绝对不能写 redact:log:*！
  await pm.persistToKV(mockEnv, { logTs: 10002 });

  assert.equal(getCount, 1, '应执行 1 次读预检');
  assert.equal(putCount, 0, '云端已存在的暗号绝对禁止执行 put 写入（包括 redact:log:*），彻底杜绝冷启动实例重复写日志！');
  console.log('PASS: Read-Before-Write 读先于写削峰验证（含 redact:log 零写入）');
}

console.log('--- 全部隐私与脱敏单元测试均顺利通过！ ---');
