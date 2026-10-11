// Groq chat completions call. Verified against Groq's docs (console.groq.com/docs/api-reference,
// /structured-outputs, /models, /reasoning, /rate-limits):
//   POST https://api.groq.com/openai/v1/chat/completions
//   Authorization: Bearer <key>, Content-Type: application/json
//   body: model, messages, temperature, max_completion_tokens, response_format, reasoning_effort, include_reasoning
//   response_format json_schema {name, strict, schema} works on openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b.
//   Streaming is NOT supported with structured outputs, so we never stream.
//   gpt-oss reasoning_effort accepts low | medium | high. include_reasoning is supported (false omits reasoning).
//   429 responses carry a retry-after header (seconds).
// The key is read from the caller's argument (which comes from process.env). It is never logged.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const STRICT_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);

export class GroqError extends Error {
  constructor(code, retryAfter) {
    super(code);
    this.code = code; // timeout | rate_limited | upstream_error
    this.retryAfter = retryAfter || null;
  }
}

export async function callGroq({ apiKey, model, system, user, schemaName, schema, maxTokens, timeoutMs }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_completion_tokens: maxTokens,
    response_format: STRICT_MODELS.has(model)
      ? { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } }
      : { type: 'json_object' }, // the prompt also says "JSON", which json_object mode requires
  };
  if (model.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = 'low';
    body.include_reasoning = false;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GroqError(e && e.name === 'AbortError' ? 'timeout' : 'upstream_error');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after'));
    throw new GroqError('rate_limited', Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : null);
  }
  if (!res.ok) throw new GroqError('upstream_error'); // never surface the upstream body

  let data;
  try {
    data = await res.json();
  } catch {
    throw new GroqError('upstream_error');
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof content !== 'string' || !content.trim()) throw new GroqError('upstream_error');
  return { content, usage: data.usage || null, model: data.model || model };
}
