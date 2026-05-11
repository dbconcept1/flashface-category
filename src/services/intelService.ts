/**
 * Intel Brain AI Service
 * ─────────────────────────────────────────────────────────────────────────────
 * AI enrichment for user-dumped notes. Transforms raw text into structured
 * intelligence: classified source type, auto-title, semantic tags, and
 * typed insight extraction (metrics, principles, tactics, etc.)
 *
 * USAGE
 *   import { enrichNote } from './intelService';
 *   const enriched = await enrichNote(note.content);
 *   // → { suggestedTitle, suggestedSource, suggestedTags, aiInsights, enrichedAt }
 *
 * EXTENDING
 *   Add new insight types to AIInsight.type in types.ts and update the
 *   ENRICH_SCHEMA.properties.aiInsights.items.properties.type.enum below.
 *   The AI automatically adapts.
 *
 * AI PROVIDER
 *   Uses getAIProvider() from lib/aiProvider.ts.
 *   Swap providers by changing that file — zero changes needed here.
 */

import { getAIProvider } from '../lib/aiProvider';
import type { AISchema } from '../lib/aiProvider';
import type { AIInsight, IntelSourceType } from '../types';

// ─── Return type ──────────────────────────────────────────────────────────────

export interface EnrichedNoteData {
  /** Auto-generated title (≤ 8 words). Applied only if user left title blank. */
  suggestedTitle: string;
  /** AI-classified source type. */
  suggestedSource: IntelSourceType;
  /** 3-6 lowercase semantic tags. */
  suggestedTags: string[];
  /** Structured data points extracted from the note content. */
  aiInsights: AIInsight[];
  /** ISO timestamp of when enrichment ran. */
  enrichedAt: string;
}

// ─── JSON schema for structured AI output ────────────────────────────────────
// Mirrors EnrichedNoteData. Add fields here and to the return type to extend.

const ENRICH_SCHEMA: AISchema = {
  type: 'object',
  required: ['suggestedTitle', 'suggestedSource', 'suggestedTags', 'aiInsights'],
  properties: {
    suggestedTitle: { type: 'string' },
    suggestedSource: {
      type: 'string',
      enum: ['Thought', 'Podcast', 'Article', 'Data', 'Competitor', 'Market'],
    },
    suggestedTags: { type: 'array', items: { type: 'string' } },
    aiInsights: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'text'],
        properties: {
          // Extend enum here when adding new insight types to AIInsight in types.ts
          type: { type: 'string', enum: ['metric', 'principle', 'competitor', 'market', 'tactic'] },
          text: { type: 'string' },
          value: { type: 'number' },  // optional numeric value
          unit:  { type: 'string' },  // e.g. 'EUR', '%', 'x', 'months'
        },
      },
    },
  },
};

// ─── System context ───────────────────────────────────────────────────────────

const SYSTEM = `You are an AI analyst embedded in a DTC e-commerce brand intelligence tool.
Your job is to extract structured, actionable intelligence from raw notes.
Be concise and precise. Every insight should be immediately useful to a founder or operator.`;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Enriches a note by running AI extraction on its content.
 * Does NOT write to state — callers apply the result to their own store.
 *
 * @param content  Raw note text (first 8000 chars sent to AI).
 * @returns        Structured enrichment data + enrichedAt timestamp.
 */
export async function enrichNote(content: string): Promise<EnrichedNoteData> {
  const ai = getAIProvider();

  const res = await ai.complete({
    system: SYSTEM,
    prompt: `Analyze this note and extract structured intelligence:

---NOTE START---
${content.slice(0, 8000)}
---NOTE END---

Return JSON with:
- suggestedTitle: concise title in ≤8 words
- suggestedSource: best match from [Thought, Podcast, Article, Data, Competitor, Market]
  - Thought    = personal reflection, hypothesis, idea
  - Podcast    = content heard/watched (talk, interview, video)
  - Article    = written content (blog, paper, report)
  - Data       = statistics, metrics, benchmark numbers
  - Competitor = intel about a specific brand or company
  - Market     = market size, consumer behavior, trend  
- suggestedTags: 3-6 lowercase tags relevant to DTC/e-commerce (e.g. "ltv", "retention", "pet-care", "nl-market", "cac")
- aiInsights: array of extracted data points, each:
  - type: metric | principle | competitor | market | tactic
  - text: the insight in 1-2 clear sentences
  - value: numeric value if present (optional)
  - unit: unit string if value present — one of: EUR | % | x | months | years | units | (omit if not applicable)

Extract every specific number you find. Prioritize actionable, non-obvious insights.`,
    jsonSchema: ENRICH_SCHEMA,
  });

  const parsed = JSON.parse(res.text) as Omit<EnrichedNoteData, 'enrichedAt'>;

  return {
    ...parsed,
    enrichedAt: new Date().toISOString(),
  };
}
