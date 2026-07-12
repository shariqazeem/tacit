// Server-only LLM client for the Buyer Agent Console.
//
// Provider-agnostic OpenAI-compatible chat/completions. Env: TACIT_LLM_* (falls
// back to the app's existing GRADIENT_* so it deploys without re-provisioning).
//
// The LLM is NEVER on the work path. It has exactly two jobs, both OUTSIDE the
// ledger flow: propose a mandate (validated hard by validateAgentPlan), and
// explain an already-verified WorkResult. Returns null on ANY failure so callers
// fall back to an honest error + the manual form — never a fabricated success.
const BASE = (process.env.TACIT_LLM_BASE_URL || process.env.GRADIENT_BASE_URL || 'https://apis.gradient.network/api/v1').replace(/\/$/, '');
const KEY = process.env.TACIT_LLM_API_KEY || process.env.GRADIENT_API_KEY || '';
const MODEL = process.env.TACIT_LLM_MODEL || process.env.GRADIENT_MODEL || 'openai/gpt-oss-120b';
// TACIT_LLM_PROVIDER is informational only (every supported provider here is
// OpenAI-chat-compatible; the base URL selects the endpoint).

export function agentLlmAvailable(): boolean {
  return KEY.length > 0;
}

const TIMEOUT_MS = 15_000;

async function once(system: string, user: string, temperature: number, maxTokens: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One retry (15s each). */
async function chat(system: string, user: string, temperature: number, maxTokens: number): Promise<string | null> {
  if (!KEY) return null;
  const first = await once(system, user, temperature, maxTokens);
  return first !== null ? first : once(system, user, temperature, maxTokens);
}

/** Strict-JSON call (for /api/agent/plan). Returns the parsed object, or null. */
export async function agentLlmJson(system: string, user: string): Promise<any | null> {
  const text = await chat(system, user, 0.2, 400);
  if (text == null) return null;
  const match = text.match(/\{[\s\S]*\}/); // tolerate prose around the JSON
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Prose call (for /api/agent/brief). Returns trimmed text, or null. */
export async function agentLlmText(system: string, user: string): Promise<string | null> {
  const text = await chat(system, user, 0.3, 300);
  return text == null ? null : text.trim();
}
