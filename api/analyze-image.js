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

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '缺少有效图片数据（data URL）' }));
      return;
    }

    const systemPrompt = [
      '你是懂中文、小红书 plog 风格、会看图并会写贴图短句的文案助手。',
      '你必须根据图片内容给出可直接用于贴图的文案灵感。',
      '输出不要泛泛描述，不要只复述画面。',
      '重点写生活观察、幽默感、反差感、自然口语。',
      '短句适合黑底白字贴图，每句 8-18 个字。',
      '必须严格输出 JSON，不要输出多余文字。'
    ].join('\n');

    const userPrompt = [
      '请分析这张图，并返回 JSON：',
      '{',
      '  "materials": ["..."],',
      '  "funny_points": ["..."],',
      '  "angles": ["..."],',
      '  "captions": ["..."]',
      '}',
      '要求：',
      '- 每个字段尽量 4-6 条；captions 必须正好 6 条。',
      '- captions 每句 8-18 个字，中文自然，可直接贴图。',
      '- 避免空泛鸡汤和过度夸张。'
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
                captions: { type: 'array', minItems: 6, maxItems: 6, items: { type: 'string' } }
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

    const out = {
      materials: Array.isArray(parsed.materials) ? parsed.materials.slice(0, 8) : [],
      funny_points: Array.isArray(parsed.funny_points) ? parsed.funny_points.slice(0, 8) : [],
      angles: Array.isArray(parsed.angles) ? parsed.angles.slice(0, 8) : [],
      captions: Array.isArray(parsed.captions) ? parsed.captions.slice(0, 6) : []
    };

    while (out.captions.length < 6) out.captions.push('这句留给你自由发挥');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || '分析失败' }));
  }
};
