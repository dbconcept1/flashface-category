/**
 * autoIntelService — Intelligence Automation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight Gemini 2.0 Flash micro-calls that automate the intel pipeline:
 *
 *  • extractFoundersFromResearch  — parse founder names from category agent results
 *  • buildIntelContext            — compact token-efficient context for ChatGPT
 *
 * All AI calls use gemini-2.0-flash (€0.10/1M tokens) — micro-ops budget.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenAI } from '@google/genai';
import { getApiKey, recordGeminiUsageFromResponse } from '../lib/settings';
import type {
  IntelNote,
  TrackedBrand,
  CompanyProfile,
  FounderProfile,
  PodcastEpisode,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedFounder {
  name: string;
  company?: string;
  role?: string;
  linkedinHint?: string;
}

// ─── extractFoundersFromResearch ─────────────────────────────────────────────

/**
 * Parse the `foundersAndTeam` agent result to extract founder/exec names + companies.
 * Uses Gemini 2.0 Flash — cheap, fast, name-extraction only.
 * Returns empty array on any error (non-blocking quality of life feature).
 */
export async function extractFoundersFromResearch(
  categoryName: string,
  researchText: string,
): Promise<ExtractedFounder[]> {
  const apiKey = getApiKey();
  if (!apiKey || !researchText?.trim()) return [];

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Extract founder and key executive names from this market research about "${categoryName}".

Research text:
${researchText.slice(0, 2500)}

Return JSON array (max 5 entries, named individuals with clear founder/CEO/executive roles only):
[{"name":"Full Name","company":"Company Name","role":"CEO/Founder/COO/etc","linkedinHint":"optional search hint"}]

Return [] if no clearly named individuals found. No markdown, raw JSON only.`;

  const params = {
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0, maxOutputTokens: 400 },
  };

  try {
    const response = await ai.models.generateContent(params);
    recordGeminiUsageFromResponse(params, response, {
      feature: 'auto-intel',
      operation: 'extract-founders',
      model: 'gemini-2.0-flash',
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as ExtractedFounder[];
  } catch {
    return [];
  }
}

// ─── buildIntelContext ────────────────────────────────────────────────────────

/**
 * Build a compact, token-efficient intel context string for the ChatGPT system prompt.
 *
 * Strategy: Show what matters most, truncate aggressively.
 * Budget: ~2 000–3 500 tokens for this entire section (~1 500–2 500 words).
 *
 * Order: Brands → Companies → Founders → Intel Notes → Podcast Episodes
 */
export function buildIntelContext(
  brands: TrackedBrand[],
  companies: CompanyProfile[],
  founders: FounderProfile[],
  notes: IntelNote[],
  episodes: PodcastEpisode[],
): string {
  const parts: string[] = [];

  // ── Brands ────────────────────────────────────────────────────────────────
  const activeBrands = brands.filter(b => b.status === 'complete').slice(0, 12);
  if (activeBrands.length > 0) {
    const rows = activeBrands.map(b => {
      const parts: string[] = [`**${b.name}**`];
      if (b.detectedIndustry) parts.push(b.detectedIndustry);
      if (b.estimatedCLV) parts.push(`CLV €${b.estimatedCLV}`);
      if (b.estimatedCAC) parts.push(`CAC €${b.estimatedCAC}`);
      if (b.businessModel) parts.push(b.businessModel.slice(0, 60));
      const line = parts.join(' | ');
      const insight = b.coreInsight ? `\n  → ${b.coreInsight.slice(0, 160)}` : '';
      const channels = b.adChannels?.length ? `\n  Channels: ${b.adChannels.join(', ')}` : '';
      return line + insight + channels;
    });
    parts.push(`## TRACKED BRANDS (${activeBrands.length})\n${rows.join('\n')}`);
  }

  // ── Companies ────────────────────────────────────────────────────────────
  const withBrief = companies.filter(c => c.aiMasterBrief || c.description).slice(0, 10);
  if (withBrief.length > 0) {
    const rows = withBrief.map(c => {
      const header = `**${c.name}** (${c.industry ?? 'unknown'})`;
      const brief = c.aiMasterBrief
        ? `\n  ${c.aiMasterBrief.slice(0, 280)}…`
        : c.description
        ? `\n  ${c.description.slice(0, 200)}`
        : '';
      const rep = c.reviewScan?.overallReputation
        ? `\n  Reputation: ${c.reviewScan.overallReputation.slice(0, 100)}`
        : '';
      const score = c.reviewScan?.trustpilotScore
        ? ` | Trustpilot ${c.reviewScan.trustpilotScore}/5`
        : '';
      return header + score + brief + rep;
    });
    parts.push(`## COMPANY INTELLIGENCE (${withBrief.length})\n${rows.join('\n')}`);
  }

  // ── Founders ──────────────────────────────────────────────────────────────
  const trackedFounders = founders.filter(f => f.aiSummary || (f.keyInsights?.length ?? 0) > 0).slice(0, 10);
  if (trackedFounders.length > 0) {
    const rows = trackedFounders.map(f => {
      const header = `**${f.name}** | ${f.currentRole ?? 'Founder'} @ ${f.currentCompany ?? '?'}`;
      const insights = f.keyInsights?.slice(0, 3).map(k => `  • ${k.slice(0, 120)}`).join('\n') ?? '';
      const summary = f.aiSummary && !insights ? `\n  ${f.aiSummary.slice(0, 200)}` : '';
      return header + (insights ? '\n' + insights : summary);
    });
    parts.push(`## FOUNDER INTELLIGENCE (${trackedFounders.length})\n${rows.join('\n')}`);
  }

  // ── Intel Notes ──────────────────────────────────────────────────────────
  const enrichedNotes = notes
    .filter(n => n.enrichedAt && (n.aiInsights?.length ?? 0) > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 18);
  if (enrichedNotes.length > 0) {
    const rows = enrichedNotes.map(n => {
      const heading = `**[${n.source}]** ${n.title || n.content.slice(0, 70)}`;
      const insights = (n.aiInsights ?? []).slice(0, 2).map(ins => {
        const val = ins.value !== undefined ? ` ${ins.value}${ins.unit ? ins.unit : ''}` : '';
        return `  ${ins.type.toUpperCase()}${val}: ${ins.text.slice(0, 130)}`;
      }).join('\n');
      return heading + (insights ? '\n' + insights : '');
    });
    parts.push(`## INTEL NOTES — AI ENRICHED (${enrichedNotes.length})\n${rows.join('\n')}`);
  }

  // Recent un-enriched notes (capture context even without AI insights)
  const rawNotes = notes
    .filter(n => !n.enrichedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
  if (rawNotes.length > 0) {
    const rows = rawNotes.map(n =>
      `- [${n.source}] ${n.title || n.content.slice(0, 80)}`
    );
    parts.push(`## INTEL NOTES — RAW CAPTURES (${rawNotes.length})\n${rows.join('\n')}`);
  }

  // ── Podcast Episodes ─────────────────────────────────────────────────────
  const completedEps = episodes
    .filter(e => e.processingStatus === 'complete')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
  if (completedEps.length > 0) {
    const rows = completedEps.map(ep => {
      const header = `**${ep.founderName}**: "${ep.title}"`;
      const tactics = ep.keyTactics?.slice(0, 3).map(t => `  • Tactic: ${t.slice(0, 120)}`).join('\n') ?? '';
      const metrics = ep.keyMetrics?.slice(0, 2).map(m => `  • Metric: ${m.slice(0, 100)}`).join('\n') ?? '';
      const cats = ep.relevantCategories?.length
        ? `\n  Relevant to: ${ep.relevantCategories.join(', ')}`
        : '';
      return header + (tactics ? '\n' + tactics : '') + (metrics ? '\n' + metrics : '') + cats;
    });
    parts.push(`## PODCAST INTEL (${completedEps.length} episodes extracted)\n${rows.join('\n')}`);
  }

  if (parts.length === 0) return '';
  return parts.join('\n\n');
}
