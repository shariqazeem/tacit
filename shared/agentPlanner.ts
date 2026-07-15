// Tacit — PURE planner decision logic (browser + node safe, no I/O). The impure
// model call is injected, so this whole orchestration is unit-testable without a
// mock server. Honesty is preserved: this never fabricates a proposal — it only
// returns a proposal that an injected validator (the hard gate) accepted, or an
// honest {ok:false, reason}. Retries/fallbacks are real model calls or nothing.

export interface ModelCfg {
  model: string;
  base: string; // OpenAI-compatible base URL (…/v1)
  key: string;
  label: string; // 'primary' | 'fallback:<model>'
}

export interface PlanAttempt {
  model: string;
  phase: 'fresh' | 'repair';
  ok: boolean;
  reason?: string;
}

export type ValidateFn = (obj: unknown) => { ok: true; proposal: any } | { ok: false; reason: string };
export type CallModelFn = (cfg: ModelCfg, system: string, user: string) => Promise<string | null>;

/** Extract the first JSON object from model output (tolerating prose around it). */
export function extractJson(text: string | null): any | null {
  if (typeof text !== 'string') return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** The repair prompt: feed the model its own output + the precise gate failure,
 *  and demand corrected strict JSON only. */
export function buildRepairUser(goalText: string, badOutput: string, failureReason: string): string {
  return [
    `Goal: ${goalText}`,
    '',
    'Your previous answer was rejected by strict validation.',
    `Your previous answer: ${(badOutput || '(no output)').slice(0, 600)}`,
    `Rejection reason: ${failureReason}`,
    '',
    'Return ONLY one corrected JSON object with EXACTLY the required keys — no prose, no code fences.',
    'Fix the specific problem named above. policyId MUST belong to the chosen serviceType.',
  ].join('\n');
}

/** Resolve the ordered model list from env: primary, then an optional fallback.
 *  Absent fallback env → exactly one model (current behavior). Pure. */
export function resolveModels(env: Record<string, string | undefined>): ModelCfg[] {
  const base = (env.TACIT_LLM_BASE_URL || env.GRADIENT_BASE_URL || 'https://apis.gradient.network/api/v1').replace(/\/$/, '');
  const key = env.TACIT_LLM_API_KEY || env.GRADIENT_API_KEY || '';
  const model = env.TACIT_LLM_MODEL || env.GRADIENT_MODEL || 'openai/gpt-oss-120b';
  const models: ModelCfg[] = [{ model, base, key, label: 'primary' }];

  const fbModel = env.TACIT_LLM_FALLBACK_MODEL;
  if (fbModel) {
    const fbBase = (env.TACIT_LLM_FALLBACK_BASE_URL || base).replace(/\/$/, '');
    const fbKey = env.TACIT_LLM_FALLBACK_API_KEY || key;
    // Only add a usable fallback (must have a key).
    if (fbKey) models.push({ model: fbModel, base: fbBase, key: fbKey, label: `fallback:${fbModel}` });
  }
  return models;
}

/**
 * For each model in order: one fresh attempt, then — if the fresh output fails the
 * gate — one structured-repair attempt that feeds back the failure. Move to the next
 * model only after both fail. Returns the first gate-accepted proposal, or an honest
 * {ok:false} with the last reason. `attempts` records every step for evidence.
 */
export async function planWithRepairAndFallback(
  goalText: string,
  system: string,
  models: ModelCfg[],
  callModel: CallModelFn,
  validate: ValidateFn,
): Promise<{ ok: true; proposal: any; attempts: PlanAttempt[] } | { ok: false; reason: string; attempts: PlanAttempt[] }> {
  const attempts: PlanAttempt[] = [];
  let lastReason = 'the planner could not produce a usable proposal';

  for (const cfg of models) {
    // Fresh attempt.
    const freshText = await callModel(cfg, system, `Goal: ${goalText}`);
    const freshObj = extractJson(freshText);
    const fv = freshObj ? validate(freshObj) : null;
    if (fv && fv.ok) {
      attempts.push({ model: cfg.label, phase: 'fresh', ok: true });
      return { ok: true, proposal: fv.proposal, attempts };
    }
    const freshReason = fv ? (fv as { ok: false; reason: string }).reason : (freshText === null ? 'the model did not respond in time' : 'no parseable JSON object in the model output');
    attempts.push({ model: cfg.label, phase: 'fresh', ok: false, reason: freshReason });
    lastReason = freshReason;

    // Repair ONLY when the model actually responded (its output was wrong, not absent).
    // A timeout won't be cured by asking the same slow model again — skip to the next.
    if (freshText !== null) {
      const repairText = await callModel(cfg, system, buildRepairUser(goalText, freshText, freshReason));
      const repairObj = extractJson(repairText);
      const rv = repairObj ? validate(repairObj) : null;
      if (rv && rv.ok) {
        attempts.push({ model: cfg.label, phase: 'repair', ok: true });
        return { ok: true, proposal: rv.proposal, attempts };
      }
      const repairReason = rv ? (rv as { ok: false; reason: string }).reason : 'repair produced no parseable JSON object';
      attempts.push({ model: cfg.label, phase: 'repair', ok: false, reason: repairReason });
      lastReason = repairReason;
    }
  }

  return { ok: false, reason: lastReason, attempts };
}
