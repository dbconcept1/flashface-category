/**
 * Brand Research Service
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered brand intelligence. Given a brand name + optional URL/description,
 * runs a grounded web search and returns fully structured brand intel.
 *
 * USAGE
 *   import { researchBrand } from './brandService';
 *   const intel = await researchBrand({ name: 'Boldking', url: 'https://boldking.com' });
 *   // → TrackedBrand partial with all AI-populated fields
 *
 * EXTENDING
 *   Add fields to BRAND_SCHEMA + TrackedBrand type in types.ts.
 *   The extraction prompt will need to mention the new field.
 *
 * AI PROVIDER
 *   Uses getAIProvider() from lib/aiProvider.ts.
 *   Swap providers by changing that file — zero changes needed here.
 *   Note: grounded search (useSearch: true) requires a provider that supports it.
 *   Gemini supports it natively. OpenAI web_search_preview is available in the stub.
 */

import { getAIProvider } from '../lib/aiProvider';
import type { AISchema } from '../lib/aiProvider';
import type { TrackedBrand } from '../types';

// ─── Input type ───────────────────────────────────────────────────────────────

export interface BrandInput {
  name: string;
  url?: string;
  /** Free-text notes the user typed when adding the brand. */
  userDescription?: string;
}

// ─── JSON schema for structured AI output ────────────────────────────────────
// Mirrors the AI-populated subset of TrackedBrand. Extend both here and in types.ts.

const BRAND_SCHEMA: AISchema = {
  type: 'object',
  required: ['detectedCategory', 'detectedIndustry', 'businessModel', 'targetAudience', 'coreInsight', 'aiSummary'],
  properties: {
    detectedCategory:  { type: 'string' },   // e.g. "Pet Food Subscription"
    detectedIndustry:  { type: 'string' },   // e.g. "Pet Care"
    businessModel:     { type: 'string' },
    targetAudience:    { type: 'string' },
    pricePoint:        { type: 'string' },   // e.g. "€29-49/month"
    estimatedCLV:      { type: 'number' },   // in EUR, 0 if unknown
    estimatedCAC:      { type: 'number' },   // in EUR, 0 if unknown
    adChannels:        { type: 'array', items: { type: 'string' } },
    keyStrengths:      { type: 'array', items: { type: 'string' } },
    weaknesses:        { type: 'array', items: { type: 'string' } },
    coreInsight:       { type: 'string' },   // one sentence: why this brand matters
    aiSummary:         { type: 'string' },   // 3-4 paragraph full report
  },
};

// ─── System context ───────────────────────────────────────────────────────────

const SYSTEM = `You are a DTC brand intelligence analyst for a consumer brand research tool.
Research brands deeply using web search. Be objective, specific, and data-driven.
Focus on insights useful for competitive analysis and category evaluation.`;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Researches a brand using AI + grounded web search.
 * Returns the AI-populated fields of TrackedBrand (caller merges with base record).
 *
 * @param input   Brand name + optional URL and user description.
 * @param signal  Optional AbortSignal to cancel mid-research.
 * @returns       Partial TrackedBrand with all AI-populated fields.
 */
export async function researchBrand(
  input: BrandInput,
  signal?: AbortSignal
): Promise<Partial<TrackedBrand>> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const ai = getAIProvider();

  const contextLines = [
    input.url              ? `Website:          ${input.url}` : '',
    input.userDescription  ? `User description: ${input.userDescription}` : '',
  ].filter(Boolean).join('\n');

  const res = await ai.complete({
    system: SYSTEM,
    prompt: `Research this brand comprehensively using web search:

Brand: ${input.name}
${contextLines}

MANDATORY SEARCHES — run all of these:
- "${input.name}" brand overview business model target audience
- "${input.name}" pricing subscription DTC e-commerce
- "${input.name}" marketing channels Instagram TikTok Google ads
- "${input.name}" revenue growth funding Crunchbase
- "${input.name}" trustpilot reviews customer sentiment
- "${input.name}" competitors alternatives market position
- "${input.name}" Netherlands OR European market presence

Return JSON with:
- detectedCategory:  specific product category (e.g. "Men's Razor Subscription", "Organic Dog Food")
- detectedIndustry:  broader industry (e.g. "Men's Grooming", "Pet Care")
- businessModel:     how they make money (subscription / DTC / marketplace / etc.)
- targetAudience:    specific demographic and psychographic description
- pricePoint:        typical price range (e.g. "€19-39/month", "€25 one-time")
- estimatedCLV:      customer lifetime value estimate in EUR (integer, 0 if not found)
- estimatedCAC:      customer acquisition cost estimate in EUR (integer, 0 if not found)
- adChannels:        array of confirmed marketing channels
- keyStrengths:      array of 3-5 specific competitive advantages
- weaknesses:        array of 2-4 specific vulnerabilities or gaps to exploit
- coreInsight:       ONE sentence — why this brand is strategically interesting
- aiSummary:         comprehensive 3-4 paragraph brand intelligence report covering
                     their positioning, growth story, operational model, and how a
                     competitor could win against or learn from them`,
    useSearch: true,
    jsonSchema: BRAND_SCHEMA,
    jsonHint: 'From the brand research above, extract all structured intelligence fields.',
  });

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return JSON.parse(res.text) as Partial<TrackedBrand>;
}
