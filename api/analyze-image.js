module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY 未配置' }));
    return;
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const body = rawBody ? JSON.parse(rawBody) : {};
    const image = body.image;
    const styleProfileRaw = body.style_profile || {};
    const stylePromptRaw = typeof body.style_prompt === 'string' ? body.style_prompt.trim() : '';

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '缺少有效图片数据（data URL）' }));
      return;
    }

    const styleDescription = typeof styleProfileRaw.description === 'string'
      ? styleProfileRaw.description.trim()
      : '';
    const styleName = typeof styleProfileRaw.name === 'string'
      ? styleProfileRaw.name.trim()
      : '默认风格库';
    const styleExamples = Array.isArray(styleProfileRaw.examples)
      ? styleProfileRaw.examples.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 10)
      : (Array.isArray(styleProfileRaw.samples)
      ? styleProfileRaw.samples.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 10)
      : []);
    const stylePrompt = stylePromptRaw || [
      '请严格模仿以下写作风格生成 plog 文案，不允许脱离风格自由发挥。',
      `风格库名称：${styleName || '默认风格库'}`,
      `风格描述：${styleDescription || '轻松、吐槽、生活感，像和朋友聊天。'}`,
      `示例语句：${styleExamples.join(' | ')}`
    ].join('\n');

    const systemPrompt = [
      '你是“丛式风格”的中文 plog 文案助手，必须看图写文案。',
      '你写出来要像本人随手记录，不像AI，不像文章。',
      '核心语气：聊天感、轻松、俏皮、轻微吐槽+自嘲、生活观察感。',
      '允许不完整句，允许短促句，分行要自然。',
      '禁止：鸡汤、总结、营销、模板口号、宏大叙事。',
      '禁止使用这类句式：在这个快节奏生活中 / 治愈人生 / 精致生活。',
      '如果图片信息不足，宁可保守，不要编造具体事实。',
      '必须严格返回 JSON，不要输出任何额外文字。'
    ].join('\n');

    const userPrompt = [
      `当前风格库：${styleName || '默认风格库'}`,
      '',
      '【1. 风格描述】',
      styleDescription || '轻松、吐槽、生活感、像和朋友聊天，偶尔小情绪。',
      '',
      '【2. 用户真实语料（请学习语气，不照抄）】',
      ...(styleExamples.length ? styleExamples.map((s, i) => `${i + 1}. ${s}`) : ['（未提供，使用默认丛式口吻）']),
      '',
      '【前端拼接风格指令（最高优先级）】',
      stylePrompt,
      '',
      '【3. 当前图片分析任务】',
      '请基于这张图生成“丛式风格”结果，返回 JSON：',
      '{',
      '  "materials": ["..."],',
      '  "funny_points": ["..."],',
      '  "angles": ["..."],',
      '  "captions": ["..."]',
      '}',
      '',
      '字段要求：',
      '- materials: 4-6条，只写图中真实可用素材点，不编剧情。',
      '- funny_points: 3-6条，写反差/笑点；如果没有就写轻微观察，不硬凹。',
      '- angles: 4-6条，写可写方向（口语化）。',
      '- captions: 必须正好5条，分行数不固定（可1-4行，用\\n分行）。',
      '- 5条必须故意做长短变化、节奏变化、句式变化，不能同模板复读。',
      '- 至少包含：1条单行短 punchline、1条两行轻吐槽、1条三行反转、1条更口语化碎碎念。',
      '- 每条 captions 尽量有“前半铺垫 + 后半反转”或“前半观察 + 后半吐槽”，但形式不要统一。',
      '- 每行尽量8-18字，允许个别更短或更碎，像“随手说的一句”，自然、不端着。',
      '- captions 可直接贴图，避免大段解释。',
      '',
      '风格参考（只学语气，不抄原句）：',
      '- 报告酋长！我已搞到长沙麻辣小龙虾…',
      '- 最近半夜阳台总有异响…开灯发现两名黑猫警长…',
      '- 午间快讯：一架微型私人飞机在沙漠坠毁（蚊子掉进饭里）',
      '- 哈哈哈哈 / 对（这种短促节奏感也可出现）'
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.9,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'plog_inspiration',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                materials: { type: 'array', items: { type: 'string' } },
                funny_points: { type: 'array', items: { type: 'string' } },
                angles: { type: 'array', items: { type: 'string' } },
                captions: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } }
              },
              required: ['materials', 'funny_points', 'angles', 'captions']
            }
          }
        },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: image } }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : 'OpenAI 接口错误';
      throw new Error(msg);
    }

    const raw = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;

    let parsed;
    if (typeof raw === 'string') {
      parsed = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      const textPart = raw.find((p) => p && p.type === 'text' && p.text);
      parsed = JSON.parse(textPart ? textPart.text : '{}');
    } else {
      parsed = {};
    }

    const cleanList = (input, limit) => {
      if (!Array.isArray(input)) return [];
      return input
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .slice(0, limit);
    };

    const splitByPunctuation = (text) => {
      return String(text || '')
        .replace(/[。！？；!?;]+/g, '\n')
        .replace(/[，,]+/g, '\n')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const toCaptionLines = (text) => {
      const raw = String(text || '').replace(/\r/g, '').trim();
      let lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!lines.length) lines = splitByPunctuation(raw);
      lines = lines.filter((s) => s.length >= 2);
      if (!lines.length) lines = ['今天这张图有点东西'];
      return lines;
    };

    const captionFallbacks = [
      '今天这画面，离谱得刚刚好',
      '本来只想随手拍\n结果它先把我拍服了',
      '我以为只是普通一幕\n盯久了突然不对劲\n反正先发再说',
      '这张图吧\n越看越像我今天的状态\n表面稳住\n内心已经小跑了两圈',
      '不解释太多\n懂的人会先笑一下'
    ];

    const desiredLineCounts = [1, 2, 3, 4, 2];

    const diversifyCaption = (text, idx) => {
      const lines = toCaptionLines(text);
      const targetCount = desiredLineCounts[idx] || 2;
      if (targetCount <= 1) return lines[0];
      const out = [];
      for (let i = 0; i < lines.length && out.length < targetCount; i += 1) {
        out.push(lines[i]);
      }
      if (out.length < targetCount) {
        const backup = splitByPunctuation(lines.join('，'));
        for (let i = 0; i < backup.length && out.length < targetCount; i += 1) {
          if (!out.includes(backup[i])) out.push(backup[i]);
        }
      }
      while (out.length < targetCount) {
        out.push(out[out.length - 1] || '先记一下');
      }
      return out.slice(0, 4).join('\n');
    };

    const out = {
      materials: cleanList(parsed.materials, 8),
      funny_points: cleanList(parsed.funny_points, 8),
      angles: cleanList(parsed.angles, 8),
      captions: cleanList(parsed.captions, 5).map((c, i) => diversifyCaption(c, i))
    };

    while (out.captions.length < 5) out.captions.push(captionFallbacks[out.captions.length]);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || '分析失败' }));
  }
};
