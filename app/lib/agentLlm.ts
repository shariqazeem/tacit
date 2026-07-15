// Server-only LLM client for the Buyer Agent Console.
//
// Provider-agnostic OpenAI-compatible chat/completions. Env: TACIT_LLM_* (falls
// back to the app's existing GRADIENT_*), with an OPTIONAL second model via
// TACIT_LLM_FALLBACK_MODEL (+ optional _FALLBACK_BASE_URL / _FALLBACK_API_KEY).
//
// The LLM is NEVER on the work path. Two jobs, both OUTSIDE the ledger flow:
// propose a mandate (validated hard by validateAgentPlan; the repair+fallback
// orchestration lives in shared/agentPlanner.ts) and explain an already-verified
// WorkResult. A failure is always an honest null → {ok:false} upstream, never a
// fabricated success.
import { resolveModels, type ModelCfg } from '@/shared/agentPlanner';

// Ordered model list (primary, then optional fallback). Absent fallback env → one.
export const MODELS: ModelCfg[] = resolveModels(process.env as Record<string, string | undefined>);

export function agentLlmAvailable(): boolean {
  return MODELS.length > 0 && MODELS[0].key.length > 0;
}

const TIMEOUT_MS = 15_000;

/** One real chat/completions call to a specific model. Returns text, or null on any
 *  failure (never throws). This is the ONLY network primitive here. */
export async function callModelRaw(cfg: ModelCfg, system: string, user: string, temperature = 0.15, maxTokens = 500): Promise<string | null> {
  if (!cfg.key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
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

/** Prose call for /api/agent/brief — primary model, one retry (15s each). */
export async function agentLlmText(system: string, user: string): Promise<string | null> {
  const cfg = MODELS[0];
  if (!cfg?.key) return null;
  const first = await callModelRaw(cfg, system, user, 0.3, 300);
  const text = first !== null ? first : await callModelRaw(cfg, system, user, 0.3, 300);
  return text == null ? null : text.trim();
}
