// FlareRouter 模型特性与能力识别模块 (Cherry Studio / Models.dev / OpenRouter 权威规则超集)

function cleanModelName(modelId) {
  var raw = String(modelId || '').trim();
  var slashIdx = raw.indexOf('/');
  var s = (slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw).toLowerCase();
  // 剥离常见聚合渠道与中转前缀
  s = s.replace(/^(openai|anthropic|google|minimax-code|custom|official)\//i, '');
  s = s.replace(/^(fast|free|online)-/i, '');
  return s;
}

function detectCaps(modelId) {
  var s = cleanModelName(modelId);

  // 1. 生图 (Image Generation)
  var isImageGen = /(dall-e|flux|stable-diffusion|sdxl|sd[123]|midjourney|\bmj\b|imagen|cogview|kolors|ideogram|hunyuan-dit|kling|luma|recraft)/i.test(s);

  // 2. 音频 (Audio / Speech / TTS / ASR)
  var isAudio = /(whisper|tts|speech|cosyvoice|sensevoice|chattts|elevenlabs|fish-speech|\bvoice\b|realtime.*audio)/i.test(s);

  // 3. 嵌入 (Embedding)
  var isEmbedding = /(embedding|bge-m3|bge-large|bge-small|bge-base|bce-|text2vec|e5-|gte-|voyage)/i.test(s);

  // 4. 重排 (Rerank)
  var isRerank = /(rerank|bge-reranker|bce-reranker|cohere-rerank|jina-reranker)/i.test(s);

  // 5. 显式思考/深度推理 (Thinking / Reasoning)
  var isThinking = /(\br1\b|-r1\b|_r1\b|reasoner|thinking|thought|\bo1\b|-o1\b|\bo3\b|-o3\b|qwq|marco-o1|k1\.5|step-reasoner)/i.test(s);

  // 6. 视觉/多模态输入 (Vision)
  var isVision = /(-vl\b|vl-|_vl\b|-vision\b|_vision\b|vision-|-v-\b|4v\b|4o\b|claude-3|gemini|pixtral|llava|omni|minicpm-v|internvl|step-[12]v|glm-4v|cogvlm|multimodal|llama-3\.[123].*vision)/i.test(s);

  // 7. 工具/函数调用 (Tools / Function Calling)
  var nonTool = isImageGen || isAudio || isEmbedding || isRerank;
  var isBase = /(-base\b|_base\b|babbage|davinci)/i.test(s);
  var isPureReasoner = /(deepseek-reasoner|deepseek-r1\b)/i.test(s);

  // 涵盖 OpenAI, Anthropic, Google, 智谱 GLM, 通义千问, 讯飞星火 Spark, 云知声 U2, 书生 Atria/InternLM, MiniMax, 商汤, 百川, 阶跃, 零一, Llama, Mistral 等全系
  var knownToolFamily = /(gpt-4|gpt-3\.5-turbo|claude-3|gemini|qwen|glm-4|glm-3|internlm|intern-ai|atria|llama-3|mistral|mixtral|codestral|deepseek-(chat|v[23]|flash)|sensenova|sensechat|spark|u2-|unisound|shanhai|minimax|abab|step-|yi-|moonshot|kimi|baichuan)/i.test(s);
  var isInstructOrChat = /(chat|instruct|turbo|plus|max|pro)/i.test(s);

  var isTools = !nonTool && !isBase && !isPureReasoner && (knownToolFamily || isInstructOrChat);

  // 8. 文本 (Text)
  var isText = !isImageGen && !isAudio && !isEmbedding && !isRerank;

  return {
    text: isText,
    vision: isVision,
    imageGen: isImageGen,
    tools: isTools,
    thinking: isThinking,
    audio: isAudio,
    embedding: isEmbedding,
    rerank: isRerank
  };
}

function capsBadgeHtml(modelId) {
  var c = detectCaps(modelId);
  var out = '';
  if (c.vision) out += '<span class="cap-badge vision" title="' + t('fallback.capVision') + '">👁 ' + t('fallback.capVision') + '</span>';
  if (c.imageGen) out += '<span class="cap-badge image" title="' + t('fallback.capImage') + '">🎨 ' + t('fallback.capImage') + '</span>';
  if (c.tools) out += '<span class="cap-badge tools" title="' + t('fallback.capTools') + '">🛠 ' + t('fallback.capTools') + '</span>';
  if (c.thinking) out += '<span class="cap-badge thinking" title="' + t('fallback.capThinking') + '">🧠 ' + t('fallback.capThinking') + '</span>';
  if (c.audio) out += '<span class="cap-badge audio" title="' + t('fallback.capAudio') + '">🎙 ' + t('fallback.capAudio') + '</span>';
  if (c.embedding) out += '<span class="cap-badge embedding" title="' + t('fallback.capEmbedding') + '">🔢 ' + t('fallback.capEmbedding') + '</span>';
  if (c.rerank) out += '<span class="cap-badge rerank" title="' + t('fallback.capRerank') + '">🔀 ' + t('fallback.capRerank') + '</span>';
  if (!out && c.text) {
    out = '<span class="cap-badge text" title="' + t('fallback.capText') + '">📝 ' + t('fallback.capText') + '</span>';
  }
  return out;
}
