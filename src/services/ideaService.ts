/**
 * Ideas Service
 * ─────────────────────────────────────────────────────────────────────────────
 * AI expansion and critique for ideas on the Ideas Board.
 * Takes a raw idea title + description and returns a structured expansion:
 * deeper problem definition, opportunity sizing, how to test it fast,
 * risks, and a verdict on whether it's worth pursuing.
 *
 * AI PROVIDER
 *   Uses getAIProvider() from lib/aiProvider.ts. Model-swappable.
 */

import { getAIProvider } from '../lib/aiProvider';
import type { Idea } from '../types';

const EXPAND_SYSTEM_PROMPT = `You are a sharp DTC business strategist. 
Given a raw idea, give an honest, specific expansion. No fluff, no cheerleading.

Format your response as plain text with these sections:
THE REAL OPPORTUNITY: What's actually interesting here — why now, why us?
IDEAL CUSTOMER: 1 specific person. Age, situation, why they pay.
BUSINESS MODEL: How would this make money? Rough pricing, margins?
FASTEST TEST: Cheapest, fastest way to validate in 2-4 weeks.
RISKS: Top 2-3 things that could kill this.
VERDICT: One sentence — is this worth exploring further? Scale 1-10 excitement.

Be direct. If the idea has a fatal flaw, say it immediately.`;

/**
 * Generate a full strategic expansion for an idea.
 * Returns plain text with labelled sections.
 */
export async function expandIdea(idea: Idea): Promise<string> {
  const provider = getAIProvider();

  const tags = idea.tags.length ? `Tags: ${idea.tags.join(', ')}` : '';
  const userPrompt = [
    `Idea: ${idea.title}`,
    tags,
    idea.description ? `\n${idea.description}` : '',
  ].filter(Boolean).join('\n');

  const response = await provider.complete({
    system: EXPAND_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  return response.text.trim();
}
