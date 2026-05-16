/**
 * nlQueryService — Natural Language Category Filter
 *
 * Converts freeform NL queries like "high CLV, easy acquisition, churn < 5%"
 * into structured filter predicates using Gemini.
 *
 * Cost: ~1 tiny Gemini call per query (no Search grounding) ≈ €0.001
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKey, recordGeminiUsageFromResponse } from '../lib/settings';
import type { Category, BrainEntry } from '../types';
import { compileDirectivePrompt } from '../lib/directives';

export interface ParsedFilter {
  minClv?: number;
  maxClv?: number;
  minLtvCac?: number;
  maxChurn?: number;
  minScore?: number;
  acquisitionDifficulty?: ('Easy' | 'Medium' | 'Hard')[];
  emotionalLoyalty?: ('Low' | 'Medium' | 'High')[];
  status?: string[];
  keywordInName?: string;
  explanation: string;
}

export async function parseNlQuery(query: string, brainEntries: BrainEntry[] = []): Promise<ParsedFilter> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key');

  const ai = new GoogleGenAI({ apiKey });
  const directiveBlock = compileDirectivePrompt(brainEntries, 'nlquery');

  const prompt = `${directiveBlock}You are a filter parser for a DTC subscription category database.

The user typed: "${query}"

Parse this into a structured filter JSON. Available fields:
- minClv: minimum Customer Lifetime Value in EUR (e.g. 500)
- maxClv: maximum CLV in EUR
- minLtvCac: minimum LTV:CAC ratio (e.g. 3.0)
- maxChurn: maximum monthly churn percent (e.g. 5)
- minScore: minimum decision score 0-100
- acquisitionDifficulty: array of "Easy", "Medium", "Hard"
- emotionalLoyalty: array of "Low", "Medium", "High"  
- status: array of "Researching", "Shortlisted", "Winner", "Killed"
- keywordInName: substring to match in category name
- explanation: 1-sentence human-readable description of what this filter does

Return ONLY valid JSON, no markdown. Example:
{
  "minLtvCac": 3,
  "maxChurn": 5,
  "acquisitionDifficulty": ["Easy", "Medium"],
  "explanation": "Categories with LTV:CAC above 3x, churn below 5%, and easy or medium acquisition"
}`;

  const params = {
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 300 },
  };

  const response = await ai.models.generateContent(params);

  recordGeminiUsageFromResponse(params, response, {
    feature: 'nl-query',
    operation: 'filter-parse',
    model: 'gemini-2.0-flash',
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { explanation: query };
  return JSON.parse(jsonMatch[0]);
}

export function applyParsedFilter(
  categories: { id: string; estimatedCLV: number; monthlyChurnPercent: number; acquisitionDifficulty: string; emotionalLoyalty: string; status: string; name: string; score: number; ltvCac: number }[],
  filter: ParsedFilter,
): string[] {
  return categories
    .filter(c => {
      if (filter.minClv !== undefined && c.estimatedCLV < filter.minClv) return false;
      if (filter.maxClv !== undefined && c.estimatedCLV > filter.maxClv) return false;
      if (filter.minLtvCac !== undefined && c.ltvCac < filter.minLtvCac) return false;
      if (filter.maxChurn !== undefined && c.monthlyChurnPercent > filter.maxChurn) return false;
      if (filter.minScore !== undefined && c.score < filter.minScore) return false;
      if (filter.acquisitionDifficulty?.length && !filter.acquisitionDifficulty.includes(c.acquisitionDifficulty as any)) return false;
      if (filter.emotionalLoyalty?.length && !filter.emotionalLoyalty.includes(c.emotionalLoyalty as any)) return false;
      if (filter.status?.length && !filter.status.includes(c.status)) return false;
      if (filter.keywordInName && !c.name.toLowerCase().includes(filter.keywordInName.toLowerCase())) return false;
      return true;
    })
    .map(c => c.id);
}
