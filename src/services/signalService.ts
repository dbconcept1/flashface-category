/**
 * MarketSignalService — AI-powered market pulse engine
 *
 * Uses Gemini 2.5 Flash with Google Search grounding to detect live signals
 * relevant to your tracked categories: rising trends, competitor funding,
 * regulatory shifts, and underreported opportunities in NL/EU.
 *
 * Design principle: *lightweight*. One grounded call, structured JSON output.
 * Investor-grade output, €0.03 per run.
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKey, checkBudget, recordGeminiUsageFromResponse } from '../lib/settings';
import type { BrainEntry } from '../types';
import { compileDirectivePrompt } from '../lib/directives';

export type SignalType =
  | 'trend_rising'
  | 'trend_falling'
  | 'competitor_funded'
  | 'regulatory_change'
  | 'new_entrant'
  | 'opportunity_window'
  | 'consumer_shift';

export type SignalUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface MarketSignal {
  id: string;
  categoryName: string;
  type: SignalType;
  urgency: SignalUrgency;
  title: string;
  detail: string;
  implication: string; // 1-sentence business implication
  source?: string;     // e.g. "TechCrunch", "Google Trends NL", "EU Commission"
  detectedAt: string;
}

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  trend_rising:       '📈 Rising Trend',
  trend_falling:      '📉 Cooling',
  competitor_funded:  '💰 Competitor Funded',
  regulatory_change:  '⚖️ Regulatory Change',
  new_entrant:        '🚀 New Entrant',
  opportunity_window: '🪟 Opportunity Window',
  consumer_shift:     '👥 Consumer Shift',
};

export { SIGNAL_TYPE_LABELS };

/**
 * Scans for live market signals across the top N category names.
 * Makes one grounded Gemini search call to minimize cost.
 */
export async function scanMarketSignals(
  topCategories: string[],
  onProgress?: (msg: string) => void,
  brainEntries: BrainEntry[] = [],
): Promise<MarketSignal[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Gemini API key not set');
  checkBudget();

  const top5 = topCategories.slice(0, 5);
  onProgress?.(`Scanning live market signals for: ${top5.join(', ')}…`);

  const ai = new GoogleGenAI({ apiKey });
  const directiveBlock = compileDirectivePrompt(brainEntries, 'signal');

  const prompt = `${directiveBlock}You are an elite market intelligence analyst specializing in D2C subscription businesses in the Netherlands and EU.

Today is ${new Date().toLocaleDateString('en-NL', { year: 'numeric', month: 'long', day: 'numeric' })}.

Search the web RIGHT NOW for the latest signals (last 30 days) relevant to these product categories for a Dutch DTC subscription founder:

${top5.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Focus on:
- Google Trends NL/EU search volume trends
- VC/PE funding announcements for competitors in these spaces  
- EU or Dutch regulations, bans, or incentives affecting these categories
- Viral consumer behavior shifts visible on TikTok/Reddit/Instagram
- New well-funded DTC entrants launching in Netherlands/EU
- Any unexpected market opportunity windows (e.g., a big player exiting, supply chain reversal)

Return a JSON array of the 6 MOST ACTIONABLE signals found (3 minimum). Each signal must be grounded in a real, findable source.

Format (strict JSON, no markdown):
[
  {
    "categoryName": "exact category name from the list above",
    "type": "trend_rising|trend_falling|competitor_funded|regulatory_change|new_entrant|opportunity_window|consumer_shift",
    "urgency": "critical|high|medium|low",
    "title": "Short punchy signal title (max 8 words)",
    "detail": "1-2 sentences describing the signal with specifics (numbers, company names, dates)",
    "implication": "1 sentence: what this means for a NL DTC founder entering this space",
    "source": "Publication or platform name"
  }
]

Only return the JSON array. No preamble. No explanation.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
    },
  });

  recordGeminiUsageFromResponse({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
    },
  }, response, {
    feature: 'market-signals',
    operation: 'signal-scan',
    model: 'gemini-2.5-flash',
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Signal scan returned no structured data');

  const parsed: Omit<MarketSignal, 'id' | 'detectedAt'>[] = JSON.parse(jsonMatch[0]);
  const now = new Date().toISOString();

  return parsed.map((s, i) => ({
    ...s,
    id: `sig-${Date.now()}-${i}`,
    detectedAt: now,
  }));
}
