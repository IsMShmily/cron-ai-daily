const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * 调用本地 Ollama / 兼容 OpenAI 风格接口的简单客户端
 * 支持两类入口：
 *  - OLLAMA_BASE_URL 形如: http://localhost:11434/api      -> POST /chat
 *  - OLLAMA_BASE_URL 形如: http://localhost:11434/v1       -> POST /chat/completions
 *
 * @param {{ system?: string, user: string }} param0
 * @returns {Promise<string>} AI 返回的文本内容
 */
function chatWithOllama({ system, user }) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api';
  const model = process.env.LLM_MODEL || 'qwen2.5:7b';

  let endpoint;
  try {
    const u = new URL(base);
    const path = u.pathname || '';
    const origin = `${u.protocol}//${u.host}`;

    if (path.includes('/v1')) {
      // 兼容 OpenAI 风格: /v1/chat/completions
      endpoint = new URL('/v1/chat/completions', origin);
    } else if (path.includes('/api')) {
      // 兼容示例: http://localhost:11434/api  -> /api/chat
      endpoint = new URL('/api/chat', origin);
    } else {
      // 默认回退到 /api/chat
      endpoint = new URL('/api/chat', origin);
    }
  } catch (e) {
    console.log('[llmClient] OLLAMA_BASE_URL 非法，使用默认 http://localhost:11434/api/chat', {
      base,
      error: e && e.message,
    });
    endpoint = new URL('http://localhost:11434/api/chat');
  }

  const payload = buildRequestBody({ system, user, model });

  const body = JSON.stringify(payload);
  const isHttps = endpoint.protocol === 'https:';
  const mod = isHttps ? https : http;

  console.log('[llmClient] 调用 Ollama / LLM 接口', {
    url: endpoint.toString(),
    model,
  });

  const options = {
    method: 'POST',
    hostname: endpoint.hostname,
    port: endpoint.port || (isHttps ? 443 : 80),
    path: endpoint.pathname + endpoint.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 60_000,
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.log('[llmClient] 接口返回非 2xx', {
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            body: text.slice(0, 500),
          });
          return reject(
            new Error(`LLM 接口错误: ${res.statusCode} ${res.statusMessage || ''}`.trim())
          );
        }
        try {
          const data = JSON.parse(text);
          const content = extractContentFromResponse(data);
          console.log('[llmClient] 调用成功，内容长度', content.length);
          resolve(content);
        } catch (e) {
          console.log('[llmClient] 解析响应 JSON 失败', {
            error: e && e.message,
            raw: text.slice(0, 300),
          });
          reject(new Error('解析 LLM 响应失败'));
        }
      });
    });

    req.on('error', (err) => {
      console.log('[llmClient] 请求错误', {
        message: err && err.message,
        code: err && err.code,
      });
      reject(err);
    });

    req.on('timeout', () => {
      console.log('[llmClient] 请求超时');
      req.destroy(new Error('LLM 请求超时'));
    });

    req.write(body);
    req.end();
  });
}

function buildRequestBody({ system, user, model }) {
  const sys = system && String(system).trim();

  // 默认按 OpenAI / Ollama chat 风格构造
  const messages = [];
  if (sys) {
    messages.push({ role: 'system', content: sys });
  }
  messages.push({ role: 'user', content: String(user || '') });

  return {
    model,
    messages,
    // 大部分本地 LLM/代理都会忽略未知字段，这里只传最小必要字段
  };
}

function extractContentFromResponse(data) {
  // 兼容几种常见结构
  // 1) OpenAI 风格: { choices: [ { message: { content } } ] }
  if (data && Array.isArray(data.choices) && data.choices.length > 0) {
    const msg = data.choices[0].message || data.choices[0].delta || {};
    if (typeof msg.content === 'string') return msg.content;
  }

  // 2) 一些代理: { message: { content } }
  if (data && data.message && typeof data.message.content === 'string') {
    return data.message.content;
  }

  // 3) 其它情况：直接尝试 data.text
  if (typeof data.text === 'string') return data.text;

  // 兜底：返回 JSON 字符串，避免完全丢失信息
  return JSON.stringify(data, null, 2);
}

module.exports = {
  chatWithOllama,
};

