// Minimal OpenAI-compatible LLM client for Tacit's agents.
// Mirrors the env vars the rest of the app already uses (Gradient Cloud), so it
// uses the real model whenever a key is configured. Returns null on ANY
// missing-key / network / timeout / parse failure, so callers fall back
// deterministically — the negotiation must never hang or throw.

const BASE = process.env.GRADIENT_BASE_URL || 'https://apis.gradient.network/api/v1';
const KEY = process.env.GRADIENT_API_KEY || process.env.NEXT_PUBLIC_GRADIENT_API_KEY || '';
const MODEL = process.env.GRADIENT_MODEL || 'openai/gpt-oss-120b';

export function llmAvailable(): boolean {
  return KEY.length > 0;
}

/** Ask the model for a single JSON object. Returns the parsed object, or null on any failure. */
export async function llmJson(system: string, user: string, timeoutMs = 8000): Promise<any | null> {
  if (!KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/); // tolerate prose around the JSON
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
