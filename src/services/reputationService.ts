/**
 * Reputation Intelligence Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Two exports:
 *   scanCompanyReputation(name, url?)
 *     → AI grounded search: Trustpilot, Reddit, LinkedIn, legal, Glassdoor
 *     → Returns CompanyReviewScan ready to store on CompanyProfile.reviewScan
 *
 *   researchFounder(name, linkedinUrl?, knownCompany?)
 *     → AI grounded search: LinkedIn, press, fundraising, patterns
 *     → Returns Partial<FounderProfile> for merging into existing profile
 *
 * SCHEDULED USE
 *   App.tsx calls scanCompanyReputation on load for profiles with
 *   scheduledScan: true and lastScanned older than 7 days.
 *
 * AI PROVIDER
 *   Uses getAIProvider() from lib/aiProvider.ts. Model-swappable.
 *   Both functions use useSearch: true (grounded web search).
 */

import { getAIProvider } from '../lib/aiProvider';
import type { AISchema } from '../lib/aiProvider';
import type { CompanyReviewScan, FounderProfile } from '../types';

// ─── Reputation Scan ──────────────────────────────────────────────────────────

const REPUTATION_SCHEMA: AISchema = {
  type: 'object',
  properties: {
    trustpilotScore:     { type: 'number',  description: 'Rating out of 5.0' },
    trustpilotTotal:     { type: 'number',  description: 'Total number of reviews on Trustpilot' },
    trustpilotUrl:       { type: 'string',  description: 'Direct URL to their Trustpilot page' },
    trustpilotSentiment: { type: 'string',  description: '1-2 sentences on what customers consistently love vs hate' },
    trustpilotSample:    { type: 'array',   items: { type: 'string' }, description: '2-3 verbatim or near-verbatim review snippets (mix positive and negative)' },
    redditSentiment:     { type: 'string',  description: '1-2 sentences on overall Reddit sentiment and main recurring themes' },
    redditSample:        { type: 'array',   items: { type: 'string' }, description: '2-3 notable Reddit quotes or summarised thread discussions' },
    linkedinUpdates:     { type: 'array',   items: { type: 'string' }, description: 'Up to 4 recent LinkedIn company posts or announcements with approximate dates' },
    legalFlags:          { type: 'array',   items: { type: 'string' }, description: 'Any lawsuits, class actions, regulatory fines, FTC/GDPR complaints. Be specific: case name, amount, outcome if known. Empty array if none.' },
    glassdoorRating:     { type: 'number',  description: 'Glassdoor employer rating out of 5.0' },
    overallReputation:   { type: 'string',  description: '2-3 sentence synthesis of overall public perception' },
  },
  required: [],
};

/**
 * Run a full AI reputation scan for a company.
 * Uses grounded search to pull Trustpilot, Reddit, LinkedIn, legal,
 * and Glassdoor data in a single two-pass call.
 *
 * @param name     Company name as it appears publicly.
 * @param url      Optional website URL — helps the AI find the right entity.
 * @param signal   Optional AbortSignal for cancellation.
 */
export async function scanCompanyReputation(
  name: string,
  url?: string,
  signal?: AbortSignal,
): Promise<CompanyReviewScan> {
  const provider = getAIProvider();

  const searchPrompt = `Research the complete public reputation of the company "${name}"${url ? ` (website: ${url})` : ''}.

Use web search to systematically find:
1. **Trustpilot** — Get their score, total review count, and representative reviews (positive and negative). Search: "${name} Trustpilot"
2. **Reddit** — What do users, ex-customers, and competitors say? Search: site:reddit.com "${name}" and "${name} reddit review experience"
3. **LinkedIn** — Their company page: recent posts, product launches, hiring announcements, milestones. Search: "${name} LinkedIn company"
4. **Legal & Regulatory** — Any lawsuits, class actions, FTC complaints, GDPR fines, consumer protection cases. Search: "${name} lawsuit" and "${name} legal" and "${name} fine"
5. **Glassdoor** — Employee satisfaction score. Search: "${name} Glassdoor rating"

Include specific quotes, exact scores, and dates wherever available. Be thorough.`;

  const jsonHint = `From the research above, extract the full reputation data for "${name}".
- For trustpilotSample and redditSample: use direct quotes where possible, 1-3 sentences each.
- For legalFlags: list each issue separately and be specific about case names, monetary amounts, and outcomes if known. Empty array if nothing found.
- For linkedinUpdates: include approximate dates where found.
- If a field has no data, omit it rather than guessing.`;

  const response = await provider.complete({
    prompt: searchPrompt,
    jsonSchema: REPUTATION_SCHEMA,
    jsonHint,
    useSearch: true,
  });

  let parsed: Partial<CompanyReviewScan> = {};
  try {
    parsed = JSON.parse(response.text) as Partial<CompanyReviewScan>;
  } catch {
    // Parsing failed — still return a timestamped empty scan rather than throwing
  }

  return { ...parsed, scannedAt: new Date().toISOString() };
}

// ─── Founder Research ─────────────────────────────────────────────────────────

const FOUNDER_SCHEMA: AISchema = {
  type: 'object',
  properties: {
    currentCompany:  { type: 'string', description: 'Current primary company or venture' },
    currentRole:     { type: 'string', description: 'Current title (e.g. CEO & Co-founder, Operator-in-Residence)' },
    pastCompanies:   { type: 'array',  items: { type: 'string' }, description: 'Previous companies they founded, co-founded, or led as CEO. Exclude advisory roles.' },
    keyInsights:     { type: 'array',  items: { type: 'string' }, description: '4-6 specific factual bullets about their career: raises, exits, patterns, notable moves. E.g. "Raised €12M Series A from Balderton in 2022."' },
    aiSummary:       { type: 'string', description: '2-3 paragraph analytical founder assessment: what they build, patterns across companies, what kind of operator/visionary they are, and what makes them interesting or cautionary.' },
  },
  required: [],
};

/**
 * AI-powered founder research using grounded web search.
 * Finds LinkedIn career history, press coverage, fundraising,
 * exits, and recurring patterns across their ventures.
 *
 * @param name         Founder's full name.
 * @param linkedinUrl  Optional LinkedIn URL to anchor the search.
 * @param knownCompany Known associated company to disambiguate.
 * @param signal       Optional AbortSignal for cancellation.
 */
export async function researchFounder(
  name: string,
  linkedinUrl?: string,
  knownCompany?: string,
  signal?: AbortSignal,
): Promise<Partial<FounderProfile>> {
  const provider = getAIProvider();

  const searchPrompt = `Research the entrepreneur/founder "${name}"${knownCompany ? ` (known for: ${knownCompany})` : ''}${linkedinUrl ? `. LinkedIn: ${linkedinUrl}` : ''}.

Find the following:
1. **LinkedIn profile** — current role, company, full career history. Search: "${name}" site:linkedin.com and "${name} founder CEO"
2. **Companies built** — every startup or company they Founded or led: current and historical, with funding amounts where known
3. **Press and interviews** — notable articles, podcast appearances, investor announcements. Search: "${name} founder interview" and "${name} raised"
4. **Fundraising** — rounds, investors, valuations across all their ventures
5. **Exits and outcomes** — any acquisitions, shutdowns, pivots
6. **Career patterns** — what sectors do they keep returning to? What's their building style?

Be specific and factual. Use names, amounts, and dates.`;

  const jsonHint = `From the research above, extract founder intelligence for "${name}".
For pastCompanies: list only companies they actually Founded or led, not advisory roles.
For keyInsights: write specific facts like bullet points, not generic personality adjectives.
For aiSummary: be analytical — what pattern repeats across their work? What kind of operator are they? Is there anything cautionary?
Omit fields where no reliable data was found.`;

  const response = await provider.complete({
    prompt: searchPrompt,
    jsonSchema: FOUNDER_SCHEMA,
    jsonHint,
    useSearch: true,
  });

  try {
    return JSON.parse(response.text) as Partial<FounderProfile>;
  } catch {
    return {};
  }
}
