const SETTINGS_KEY = 'flashface_settings';
const API_USAGE_LEDGER_KEY = 'flashface_api_usage_ledger';
const MAX_API_USAGE_ENTRIES = 500;

export interface ApiUsageContext {
  provider?: 'gemini' | 'openai';
  feature: string;
  operation: string;
  agent?: string;
  model?: string;
  entityType?: string;
  entityName?: string;
}

export interface ApiUsageEntry {
  id: string;
  at: string;
  provider: 'gemini' | 'openai';
  feature: string;
  operation: string;
  agent?: string;
  model?: string;
  entityType?: string;
  entityName?: string;
  tokensIn: number;
  tokensOut: number;
  groundingCalls: number;
  costEur: number;
  isLongContext: boolean;
  promptChars: number;
  responseChars: number;
  promptHash: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export interface ApiUsageBucketSummary {
  label: string;
  feature: string;
  agent?: string;
  operation?: string;
  calls: number;
  spendEur: number;
  tokensIn: number;
  tokensOut: number;
  groundingCalls: number;
  longContextCalls: number;
}

export interface ApiUsageAnomaly {
  type: 'long-context' | 'duplicate-prompts' | 'grounded-search' | 'expensive-calls';
  label: string;
  calls: number;
  spendEur: number;
  detail: string;
}

export interface ApiUsageAuditSummary {
  totalCalls: number;
  totalSpendEur: number;
  trackedSince: string | null;
  topBuckets: ApiUsageBucketSummary[];
  topCalls: ApiUsageEntry[];
  anomalies: ApiUsageAnomaly[];
}

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  githubToken: string;
  budgetLimitEur: number | null; // null = no limit
  spendingEur: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalGroundingCalls: number;
  spendingResetAt: string;
  /**
   * Preferred Gemini model for deep research calls.
   * - gemini-2.0-flash: cheapest, fastest (~60% lower cost than 2.5-flash, no thinking)
   * - gemini-2.5-flash: recommended default (thinking, grounding, best balance)
   * - gemini-2.5-pro: most capable, highest cost (use for final memo/analysis only)
   */
  preferredResearchModel: 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-pro';
  /** Days before a researched category is marked stale and suggested for refresh */
  researchStaleDays: number;
}

const DEFAULTS: AppSettings = {
  geminiApiKey: '',
  openaiApiKey: '',
  githubToken: '',
  budgetLimitEur: 50,
  spendingEur: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalGroundingCalls: 0,
  spendingResetAt: new Date().toISOString(),
  preferredResearchModel: 'gemini-2.5-flash',
  researchStaleDays: 30,
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

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hashPrompt(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function flattenPrompt(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenPrompt).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (Array.isArray(record.parts)) return record.parts.map(flattenPrompt).filter(Boolean).join('\n');
  if (record.inlineData && typeof record.inlineData === 'object') {
    const inlineData = record.inlineData as Record<string, unknown>;
    const mimeType = typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'inline-data';
    const size = typeof inlineData.data === 'string' ? inlineData.data.length : 0;
    return `[inline:${mimeType}:${size}]`;
  }
  if (record.fileData && typeof record.fileData === 'object') {
    const fileData = record.fileData as Record<string, unknown>;
    const mimeType = typeof fileData.mimeType === 'string' ? fileData.mimeType : 'file-data';
    const fileUri = typeof fileData.fileUri === 'string' ? fileData.fileUri : 'unknown';
    return `[file:${mimeType}:${fileUri}]`;
  }
  return Object.values(record).map(flattenPrompt).filter(Boolean).join('\n');
}

export function estimateApiCost(tokensIn: number, tokensOut: number, groundingCalls: number): { costEur: number; isLongContext: boolean } {
  const isLongContext = tokensIn > PRICING_EUR.longContextThreshold;
  const inputRate = isLongContext ? PRICING_EUR.inputPerMToken_long : PRICING_EUR.inputPerMToken_short;
  const outputRate = isLongContext ? PRICING_EUR.outputPerMToken_long : PRICING_EUR.outputPerMToken_short;
  const costEur =
    (tokensIn / 1_000_000) * inputRate +
    (tokensOut / 1_000_000) * outputRate +
    groundingCalls * PRICING_EUR.groundingPerCall;
  return { costEur, isLongContext };
}

export function getApiUsageLedger(): ApiUsageEntry[] {
  try {
    const raw = localStorage.getItem(API_USAGE_LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveApiUsageLedger(entries: ApiUsageEntry[]): void {
  localStorage.setItem(API_USAGE_LEDGER_KEY, JSON.stringify(entries.slice(0, MAX_API_USAGE_ENTRIES)));
}

export function resetApiUsageLedger(): void {
  localStorage.removeItem(API_USAGE_LEDGER_KEY);
}

export function recordApiUsageDetailed(input: {
  context: ApiUsageContext;
  tokensIn: number;
  tokensOut: number;
  groundingCalls: number;
  promptChars?: number;
  responseChars?: number;
  promptHash?: string;
  usageMetadata?: ApiUsageEntry['usageMetadata'];
}): AppSettings {
  const tokensIn = Math.max(0, Math.round(input.tokensIn));
  const tokensOut = Math.max(0, Math.round(input.tokensOut));
  const groundingCalls = Math.max(0, Math.round(input.groundingCalls));
  const { costEur, isLongContext } = estimateApiCost(tokensIn, tokensOut, groundingCalls);
  const settings = getSettings();

  const entry: ApiUsageEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    provider: input.context.provider || 'gemini',
    feature: input.context.feature,
    operation: input.context.operation,
    agent: input.context.agent,
    model: input.context.model,
    entityType: input.context.entityType,
    entityName: input.context.entityName,
    tokensIn,
    tokensOut,
    groundingCalls,
    costEur,
    isLongContext,
    promptChars: Math.max(0, input.promptChars ?? 0),
    responseChars: Math.max(0, input.responseChars ?? 0),
    promptHash: input.promptHash || 'no-hash',
    usageMetadata: input.usageMetadata,
  };

  saveApiUsageLedger([entry, ...getApiUsageLedger()]);

  return saveSettings({
    spendingEur: settings.spendingEur + costEur,
    totalTokensIn: settings.totalTokensIn + tokensIn,
    totalTokensOut: settings.totalTokensOut + tokensOut,
    totalGroundingCalls: settings.totalGroundingCalls + groundingCalls,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function recordGeminiUsageFromResponse(params: any, response: any, context: ApiUsageContext): AppSettings {
  const meta = response?.usageMetadata ?? {};
  const promptTokenCount = toFiniteNumber(meta?.promptTokenCount);
  const candidatesTokenCount = toFiniteNumber(meta?.candidatesTokenCount);
  const totalTokenCount = toFiniteNumber(meta?.totalTokenCount);
  const inferredOutput = totalTokenCount > 0 ? Math.max(totalTokenCount - promptTokenCount, candidatesTokenCount) : candidatesTokenCount;
  const grounded = Array.isArray(params?.config?.tools) && params.config.tools.some((tool: any) => tool && typeof tool === 'object' && 'googleSearch' in tool);
  const promptText = flattenPrompt(params?.contents);
  const responseText = typeof response?.text === 'function' ? (response.text() || '') : (response?.text?.trim?.() || '');

  return recordApiUsageDetailed({
    context: {
      provider: 'gemini',
      model: params?.model,
      ...context,
    },
    tokensIn: promptTokenCount,
    tokensOut: inferredOutput,
    groundingCalls: grounded ? 1 : 0,
    promptChars: promptText.length,
    responseChars: responseText.length,
    promptHash: hashPrompt(promptText),
    usageMetadata: {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount,
      thoughtsTokenCount: toFiniteNumber(meta?.thoughtsTokenCount),
      cachedContentTokenCount: toFiniteNumber(meta?.cachedContentTokenCount),
    },
  });
}

export function getApiUsageAuditSummary(): ApiUsageAuditSummary {
  const entries = getApiUsageLedger();
  const bucketMap = new Map<string, ApiUsageBucketSummary>();
  const duplicates = new Map<string, { calls: number; spendEur: number; feature: string }>();

  for (const entry of entries) {
    const key = `${entry.feature}::${entry.agent || entry.operation}`;
    const existing = bucketMap.get(key) || {
      label: entry.agent ? `${entry.feature} / ${entry.agent}` : `${entry.feature} / ${entry.operation}`,
      feature: entry.feature,
      agent: entry.agent,
      operation: entry.operation,
      calls: 0,
      spendEur: 0,
      tokensIn: 0,
      tokensOut: 0,
      groundingCalls: 0,
      longContextCalls: 0,
    };
    existing.calls += 1;
    existing.spendEur += entry.costEur;
    existing.tokensIn += entry.tokensIn;
    existing.tokensOut += entry.tokensOut;
    existing.groundingCalls += entry.groundingCalls;
    existing.longContextCalls += entry.isLongContext ? 1 : 0;
    bucketMap.set(key, existing);

    if (entry.promptHash && entry.promptHash !== 'no-hash') {
      const seen = duplicates.get(entry.promptHash) || { calls: 0, spendEur: 0, feature: entry.feature };
      seen.calls += 1;
      seen.spendEur += entry.costEur;
      duplicates.set(entry.promptHash, seen);
    }
  }

  const duplicatePromptCalls = Array.from(duplicates.values()).filter(group => group.calls > 1);
  const groundedEntries = entries.filter(entry => entry.groundingCalls > 0);
  const longContextEntries = entries.filter(entry => entry.isLongContext);
  const expensiveEntries = entries.filter(entry => entry.costEur >= 0.03);

  const anomalies: ApiUsageAnomaly[] = [];
  if (longContextEntries.length > 0) {
    anomalies.push({
      type: 'long-context',
      label: 'Long-context calls',
      calls: longContextEntries.length,
      spendEur: longContextEntries.reduce((sum, entry) => sum + entry.costEur, 0),
      detail: 'These calls crossed the 128k-token tier and use materially higher token pricing.',
    });
  }
  if (duplicatePromptCalls.length > 0) {
    anomalies.push({
      type: 'duplicate-prompts',
      label: 'Repeated identical prompts',
      calls: duplicatePromptCalls.reduce((sum, item) => sum + item.calls, 0),
      spendEur: duplicatePromptCalls.reduce((sum, item) => sum + item.spendEur, 0),
      detail: 'Same prompt hash was billed multiple times. Review whether retries, loops, or repeated scans are intentional.',
    });
  }
  if (groundedEntries.length > 0) {
    anomalies.push({
      type: 'grounded-search',
      label: 'Grounded search calls',
      calls: groundedEntries.length,
      spendEur: groundedEntries.reduce((sum, entry) => sum + entry.costEur, 0),
      detail: 'Grounding adds a fixed cost per call. Use this to spot flows that search more often than they need to.',
    });
  }
  if (expensiveEntries.length > 0) {
    anomalies.push({
      type: 'expensive-calls',
      label: 'Expensive individual calls',
      calls: expensiveEntries.length,
      spendEur: expensiveEntries.reduce((sum, entry) => sum + entry.costEur, 0),
      detail: 'Each of these calls cost at least €0.03. They are the best first place to look for waste.',
    });
  }

  return {
    totalCalls: entries.length,
    totalSpendEur: entries.reduce((sum, entry) => sum + entry.costEur, 0),
    trackedSince: entries.length > 0 ? entries[entries.length - 1].at : null,
    topBuckets: Array.from(bucketMap.values()).sort((a, b) => b.spendEur - a.spendEur).slice(0, 8),
    topCalls: [...entries].sort((a, b) => b.costEur - a.costEur).slice(0, 8),
    anomalies,
  };
}

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

/** Returns the configured preferred Gemini model identifier. */
export function getPreferredModel(): string {
  return getSettings().preferredResearchModel || 'gemini-2.5-flash';
}

/** Returns the stale-research threshold in milliseconds. */
export function getResearchStaleTtlMs(): number {
  const days = getSettings().researchStaleDays ?? 30;
  return days * 24 * 60 * 60 * 1000;
}

/** Records token + grounding usage and returns the updated settings after the write. */
export function recordApiUsage(tokensIn: number, tokensOut: number, groundingCalls: number): AppSettings {
  return recordApiUsageDetailed({
    context: {
      provider: 'gemini',
      feature: 'unattributed',
      operation: 'legacy-recordApiUsage',
    },
    tokensIn,
    tokensOut,
    groundingCalls,
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
  resetApiUsageLedger();
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
