/**
 * Company Intelligence Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates and refreshes AI master briefs for company profiles.
 * Reads all IntelEntry items for a company and synthesises them into a
 * structured, actionable intelligence brief.
 *
 * EXTENDING
 *   Add new brief sections by editing BRIEF_SYSTEM_PROMPT.
 *   The prompt currently extracts: positioning, business model, product moves,
 *   marketing/ads approach, financial signals, key risks, and "watch for next".
 *
 * AI PROVIDER
 *   Uses getAIProvider() from lib/aiProvider.ts.
 *   Model-swappable — change the provider in that file only.
 */

import { getAIProvider } from '../lib/aiProvider';
import type { CompanyProfile, IntelEntry } from '../types';

// ─── Brief generation ─────────────────────────────────────────────────────────

const BRIEF_SYSTEM_PROMPT = `You are a competitive intelligence analyst. 
Given all intel entries for a company, write a crisp, structured intelligence brief.
No fluff. Be specific, cite details from the entries.

Format your response as plain text with these sections (use these exact labels):
POSITIONING: 1-2 sentences on what the company does and who for.
BUSINESS MODEL: How they make money. Pricing signals if known.
PRODUCT & MOVES: Recent product launches, pivots, key features.
MARKETING & ADS: Their channels, creatives approach, campaigns, promotions.
FINANCIAL SIGNALS: Any numbers — revenue, funding, valuation, growth rates.
RISKS & WEAKNESSES: Gaps, vulnerabilities, things that could hurt them.
WATCH NEXT: What to look for / what's missing / what I should track.

Keep each section to 2-4 sentences max. If you have no data for a section, write "No data yet."`;

function formatEntriesForPrompt(entries: IntelEntry[]): string {
  if (!entries.length) return '(no entries yet)';
  return entries
    .slice()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .map((e, i) => {
      const date = new Date(e.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
      const lines = [`[${i + 1}] [${e.type.toUpperCase()}] ${date}`];
      if (e.source) lines.push(`Source: ${e.source}`);
      if (e.content?.trim()) lines.push(e.content.trim());
      if (e.imageCaption?.trim()) lines.push(`Image desc: ${e.imageCaption.trim()}`);
      if (e.imageDataUrl) lines.push(`(contains image)`);
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}

/**
 * Generate a full intelligence brief for a company from all its entries.
 * Returns the brief as a plain text string with labelled sections.
 */
export async function generateCompanyBrief(profile: CompanyProfile): Promise<string> {
  const provider = getAIProvider();

  const userPrompt = `Company: ${profile.name}${profile.url ? `\nWebsite: ${profile.url}` : ''}${profile.industry ? `\nIndustry: ${profile.industry}` : ''}

Intel entries (${profile.entries.length} total):
${formatEntriesForPrompt(profile.entries)}`;

  const response = await provider.complete({
    system: BRIEF_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  return response.text.trim();
}
