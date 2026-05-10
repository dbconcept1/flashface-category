const SETTINGS_KEY = 'flashface_settings';

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  budgetLimitEur: number | null; // null = no limit
  spendingEur: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalGroundingCalls: number;
  spendingResetAt: string;
}

const DEFAULTS: AppSettings = {
  geminiApiKey: '',
  openaiApiKey: '',
  budgetLimitEur: 50,
  spendingEur: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalGroundingCalls: 0,
  spendingResetAt: new Date().toISOString(),
};

// Gemini 2.5 Flash — TIERED pricing, priced in EUR (~$1 = €0.92)
// ─── Standard tier (prompt ≤ 128k tokens) ───────────────────────────────────
//   Input:  $0.15/1M tokens  → €0.138/1M
//   Output: $0.60/1M tokens  → €0.552/1M
// ─── Long-context tier (prompt > 128k tokens) ───────────────────────────────
//   Input:  $0.60/1M tokens  → €0.552/1M  (4× higher)
//   Output: $3.50/1M tokens  → €3.22/1M   (~5.8× higher)
// ─── Google Search grounding ────────────────────────────────────────────────
//   $35/1000 requests → €0.032/call
// NOTE: Large PDF batches (100+ pages ≈ 125k+ tokens) regularly cross the
//       128k threshold. We default to the LONG-CONTEXT rate for tokens >128k.
//       Verify at: https://ai.google.dev/pricing
export const PRICING_EUR = {
  // Short context (≤128k tokens combined prompt)
  inputPerMToken_short: 0.138,
  outputPerMToken_short: 0.552,
  // Long context (>128k tokens combined prompt) — ~4× higher cost
  inputPerMToken_long: 0.552,
  outputPerMToken_long: 3.22,
  groundingPerCall: 0.032,
  // Threshold in tokens; above this the long-context tier applies
  longContextThreshold: 128_000,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** Returns the OpenAI API key stored in the dashboard. */
export function getOpenAiApiKey(): string {
  return getSettings().openaiApiKey.trim();
}

/** Returns the API key — dashboard key takes priority over .env */
export function getApiKey(): string {
  const fromStore = getSettings().geminiApiKey.trim();
  if (fromStore) return fromStore;
  return (process.env.GEMINI_API_KEY as string | undefined) || '';
}

/** Records token + grounding usage and returns the updated settings after the write. */
export function recordApiUsage(tokensIn: number, tokensOut: number, groundingCalls: number): AppSettings {
  const s = getSettings();
  // Apply tiered pricing: if tokens in > long-context threshold, use high-tier rates
  const isLongContext = tokensIn > PRICING_EUR.longContextThreshold;
  const inputRate  = isLongContext ? PRICING_EUR.inputPerMToken_long  : PRICING_EUR.inputPerMToken_short;
  const outputRate = isLongContext ? PRICING_EUR.outputPerMToken_long : PRICING_EUR.outputPerMToken_short;
  const cost =
    (tokensIn  / 1_000_000) * inputRate +
    (tokensOut / 1_000_000) * outputRate +
    groundingCalls * PRICING_EUR.groundingPerCall;
  return saveSettings({
    spendingEur: s.spendingEur + cost,
    totalTokensIn: s.totalTokensIn + tokensIn,
    totalTokensOut: s.totalTokensOut + tokensOut,
    totalGroundingCalls: s.totalGroundingCalls + groundingCalls,
  });
}

/**
 * Throws a clear, user-readable error if the spending cap has been reached.
 * Call this at the start of every API call so nothing slips through.
 */
export function checkBudget(): void {
  const s = getSettings();
  if (s.budgetLimitEur !== null && s.spendingEur >= s.budgetLimitEur) {
    throw new Error(
      `Budget cap reached: €${s.spendingEur.toFixed(2)} of €${s.budgetLimitEur.toFixed(2)}. ` +
      `Reset your spending counter or raise the limit in Settings.`
    );
  }
}

export function resetSpending(): AppSettings {
  return saveSettings({
    spendingEur: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalGroundingCalls: 0,
    spendingResetAt: new Date().toISOString(),
  });
}

/** 0–100, capped at 100 */
export function calcBudgetPercent(s: AppSettings): number {
  if (!s.budgetLimitEur) return 0;
  return Math.min(100, (s.spendingEur / s.budgetLimitEur) * 100);
}
