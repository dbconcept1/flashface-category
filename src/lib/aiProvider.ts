/**
 * AI Provider Abstraction Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Single place to add, swap, or configure AI providers for the entire app.
 *
 * USAGE
 *   const ai = getAIProvider();
 *   const res = await ai.complete({ prompt: '...' });
 *   const obj = await completeJSON<MyType>({ prompt: '...', jsonSchema: { ... } });
 *
 * ADDING A NEW PROVIDER
 *   1. Add its API key field to AppSettings in lib/settings.ts
 *   2. Write an adapter function below (e.g. createAnthropicAdapter)
 *      that implements AIProviderAdapter
 *   3. Add it to the ADAPTERS registry at the bottom
 *   It instantly becomes available everywhere via getAIProvider({ provider: 'anthropic' }).
 *
 * SWITCHING THE DEFAULT
 *   getAIProvider() auto-selects: Gemini if key present, else OpenAI.
 *   Pass { provider: 'openai' } to override per-call.
 *
 * CURRENT PROVIDERS
 *   'gemini'  — Google Gemini 2.5 Flash (default). Full search grounding support.
 *   'openai'  — GPT-4o stub. Install 'openai' package + fill in createOpenAIAdapter to activate.
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKey, getOpenAiApiKey, recordApiUsage, checkBudget } from './settings';

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Provider-agnostic JSON Schema subset.
 * Each adapter converts this to its native wire format.
 * Supports: object, array, string, number, boolean, enums.
 */
export interface AISchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, AISchema>;
  items?: AISchema;
  required?: string[];
  enum?: string[];
  description?: string;
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface CompletionRequest {
  /** Main instruction / user message (required). */
  prompt: string;
  /** Prepended system context — sets role and tone (optional). */
  system?: string;
  /**
   * Enable web search grounding for this call.
   *   Gemini:  Google Search grounding via config.tools.
   *   OpenAI:  web_search_preview tool (fill stub below to activate).
   */
  useSearch?: boolean;
  /**
   * Force structured JSON output matching this schema.
   * When combined with useSearch, the adapter uses two passes internally:
   *   Pass 1: grounded search → raw text
   *   Pass 2: raw text → JSON extraction
   * Callers don't need to handle the two-pass themselves.
   */
  jsonSchema?: AISchema;
  /**
   * Instruction prepended to the JSON extraction pass in two-pass mode.
   * E.g. "From the research above, extract these fields."
   */
  jsonHint?: string;
}

export interface UsageStats {
  tokensIn: number;
  tokensOut: number;
  groundingCalls: number;
}

export interface CompletionResponse {
  /** Raw text (or JSON string when jsonSchema was provided). */
  text: string;
  /** Recorded to the budget tracker automatically by each adapter. */
  usage: UsageStats;
}

export type ProviderName = 'gemini' | 'openai';

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface AIProviderAdapter {
  /**
   * Execute one completion request.
   * Throws on missing API key, budget exceeded, or unrecoverable API error.
   * Usage is automatically recorded to the budget tracker.
   */
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

// ─── Gemini adapter ───────────────────────────────────────────────────────────

/** Recursively converts an AISchema to the Gemini schema wire format. */
function toGeminiSchema(schema: AISchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type.toUpperCase() };
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;
  if (schema.enum) out.enum = schema.enum;
  return out;
}

/** Exponential backoff retry for rate-limit / transient errors. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); } catch (e: any) {
      lastErr = e;
      const retryable = e?.message?.includes('429') || e?.message?.includes('503') ||
        e?.message?.includes('RESOURCE_EXHAUSTED') || e?.message?.includes('overloaded') ||
        e?.status === 429 || e?.status === 503;
      if (!retryable || i === maxAttempts - 1) throw e;
      await new Promise(r => setTimeout(r, Math.min(Math.pow(2, i) * 2000 + Math.random() * 800, 30000)));
    }
  }
  throw lastErr;
}

function createGeminiAdapter(): AIProviderAdapter {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error('No Gemini API key configured — go to Settings.');
      checkBudget();

      const ai = new GoogleGenAI({ apiKey });
      const MODEL = 'gemini-2.5-flash';
      const totalUsage: UsageStats = { tokensIn: 0, tokensOut: 0, groundingCalls: 0 };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = async (contents: string, config: Record<string, unknown>): Promise<string> => {
        checkBudget();
        const resp = await withRetry(() => ai.models.generateContent({ model: MODEL, contents, config }));
        const meta = (resp as any).usageMetadata;
        const isGrounded = Array.isArray(config.tools) &&
          (config.tools as any[]).some((t: any) => 'googleSearch' in t);
        const tIn = meta?.promptTokenCount ?? 0;
        const tOut = meta?.candidatesTokenCount ?? 0;
        const gCalls = isGrounded ? 1 : 0;
        totalUsage.tokensIn += tIn;
        totalUsage.tokensOut += tOut;
        totalUsage.groundingCalls += gCalls;
        recordApiUsage(tIn, tOut, gCalls);
        return (resp as any).text?.trim() ?? '';
      };

      const full = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;

      if (req.useSearch && req.jsonSchema) {
        // Two-pass: grounded search → raw text, then raw text → structured JSON
        const raw = await call(full, { tools: [{ googleSearch: {} }] });
        const extractPrompt = req.jsonHint
          ? `${req.jsonHint}\n\n---RESEARCH START---\n${raw.slice(0, 30000)}\n---RESEARCH END---`
          : `Extract structured data from this research:\n\n${raw.slice(0, 30000)}`;
        const json = await call(extractPrompt, {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(req.jsonSchema),
        });
        return { text: json, usage: totalUsage };
      }

      if (req.useSearch) {
        return { text: await call(full, { tools: [{ googleSearch: {} }] }), usage: totalUsage };
      }

      if (req.jsonSchema) {
        return {
          text: await call(full, {
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(req.jsonSchema),
          }),
          usage: totalUsage,
        };
      }

      return { text: await call(full, {}), usage: totalUsage };
    },
  };
}

// ─── OpenAI adapter stub ──────────────────────────────────────────────────────
// TO ACTIVATE:
//   1. Run: npm install openai
//   2. Replace the stub body below with the commented-out implementation
//   3. The provider is immediately available everywhere
//   Reference: https://platform.openai.com/docs/api-reference/chat

function createOpenAIAdapter(): AIProviderAdapter {
  return {
    async complete(_req: CompletionRequest): Promise<CompletionResponse> {
      const apiKey = getOpenAiApiKey();
      if (!apiKey) throw new Error('No OpenAI API key configured — go to Settings.');

      // ── Paste real implementation here ────────────────────────────────────
      // import OpenAI from 'openai';
      // const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      // const msgs = [
      //   ...(_req.system ? [{ role: 'system' as const, content: _req.system }] : []),
      //   { role: 'user' as const, content: _req.prompt },
      // ];
      // const resp = await openai.chat.completions.create({
      //   model: 'gpt-4o',
      //   messages: msgs,
      //   ...(_req.jsonSchema ? { response_format: { type: 'json_object' as const } } : {}),
      //   ...(_req.useSearch ? { tools: [{ type: 'web_search_preview' as const }] } : {}),
      // });
      // const text = resp.choices[0]?.message?.content ?? '';
      // recordApiUsage(resp.usage?.prompt_tokens ?? 0, resp.usage?.completion_tokens ?? 0, 0);
      // return { text, usage: { tokensIn: resp.usage?.prompt_tokens ?? 0, tokensOut: resp.usage?.completion_tokens ?? 0, groundingCalls: 0 } };
      // ──────────────────────────────────────────────────────────────────────

      throw new Error('OpenAI adapter stub — see src/lib/aiProvider.ts to activate.');
    },
  };
}

// ─── Registry & factory ───────────────────────────────────────────────────────

/**
 * Provider registry. Add new providers here.
 * Each entry is a factory function (lazy — adapter only created when requested).
 */
const ADAPTERS: Record<ProviderName, () => AIProviderAdapter> = {
  gemini: createGeminiAdapter,
  openai:  createOpenAIAdapter,
  // anthropic: createAnthropicAdapter,  ← plug in here
};

/**
 * Returns an AI provider adapter, auto-selecting the right one.
 * Auto-selection: Gemini if its key is set, else OpenAI.
 * Pass { provider: 'openai' } to force a specific provider for one call.
 */
export function getAIProvider(opts?: { provider?: ProviderName }): AIProviderAdapter {
  if (opts?.provider) return ADAPTERS[opts.provider]();
  const hasGemini = !!getApiKey();
  const hasOpenAI = !!getOpenAiApiKey();
  if (!hasGemini && hasOpenAI) return ADAPTERS.openai();
  return ADAPTERS.gemini();
}

/**
 * Convenience: complete a request and parse the JSON response.
 * Throws a descriptive error on parse failure.
 */
export async function completeJSON<T>(
  req: Omit<CompletionRequest, 'jsonSchema'> & { jsonSchema: AISchema },
  opts?: { provider?: ProviderName }
): Promise<T> {
  const adapter = getAIProvider(opts);
  const res = await adapter.complete(req);
  try {
    return JSON.parse(res.text) as T;
  } catch {
    throw new Error(`AI returned invalid JSON.\nRaw output: ${res.text.slice(0, 300)}`);
  }
}
