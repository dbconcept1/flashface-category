/**
 * Intel Radar Service
 *
 * Two mega-engineered AI scan functions:
 *   1. scanCompanies()   — finds scaling companies BEFORE they hit mainstream press
 *   2. scanInvestors()   — finds quiet capital holders who invest without press coverage
 *
 * Both functions use the mandatory two-pass pattern:
 *   Pass 1 → grounded search (googleSearch tool, returns raw text)
 *   Pass 2 → JSON extraction (responseMimeType, no search tools)
 *
 * Every Gemini call:
 *   - calls checkBudget() first
 *   - calls recordGeminiUsageFromResponse() afterwards for full attribution
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { RadarCompany, RadarInvestor, RadarRegion, BrainEntry } from "../types";
import { getApiKey, checkBudget, recordGeminiUsageFromResponse } from "../lib/settings";
import { compileDirectivePrompt } from "../lib/directives";

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const isRetryable =
        e?.message?.includes('429') ||
        e?.message?.includes('503') ||
        e?.message?.includes('RESOURCE_EXHAUSTED') ||
        e?.message?.includes('overloaded') ||
        e?.status === 429 ||
        e?.status === 503;
      if (!isRetryable || attempt === maxRetries) throw e;
      const backoff = Math.min(Math.pow(2, attempt) * 2000 + Math.random() * 1000, 30_000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

// ─── Region helpers ───────────────────────────────────────────────────────────

const REGION_LABELS: Record<RadarRegion, string> = {
  NL: 'Netherlands',
  IE: 'Ireland',
  FR: 'France',
  DE: 'Germany',
  US: 'United States',
  BR: 'Brazil',
  OTHER: 'Other',
};

function formatRegions(regions: RadarRegion[]): string {
  return regions.map(r => REGION_LABELS[r] ?? r).join(', ');
}

// ─── Company Radar ────────────────────────────────────────────────────────────

const COMPANY_SEARCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    companies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          companyName:          { type: Type.STRING, description: "Official company name" },
          websiteUrl:           { type: Type.STRING, description: "Main website URL" },
          country:              { type: Type.STRING, description: "Country name or ISO code" },
          region:               { type: Type.STRING, description: "ISO code: NL IE FR DE US BR or OTHER" },
          industry:             { type: Type.STRING, description: "Vertical / industry in 2-4 words" },
          description:          { type: Type.STRING, description: "1-2 sentences: what they sell, who buys it" },
          foundedYear:          { type: Type.STRING, description: "Year founded if known, e.g. 2021" },
          estimatedRevenue:     { type: Type.STRING, description: "Revenue range from signal, e.g. $1M-$5M ARR. Empty if unknown." },
          employeeCount:        { type: Type.STRING, description: "Approximate headcount range, e.g. 11-50" },
          fundingStatus:        { type: Type.STRING, description: "Bootstrapped / Pre-seed / Seed / Series A / Unknown" },
          growthSignals: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Concrete evidence items. Each must end with the source URL in brackets, e.g. 'Founder announced $2M ARR on Twitter [https://x.com/...]'"
          },
          whyNotFamous:         { type: Type.STRING, description: "1-2 sentences: why this has not been covered by major tech/business press" },
          founderName:          { type: Type.STRING, description: "Primary founder full name if identifiable" },
          founderLinkedinSearch: { type: Type.STRING, description: 'Google query to find founder on LinkedIn. Format: "FirstName LastName" "CompanyName" site:linkedin.com/in' },
          linkedinSearchQuery:  { type: Type.STRING, description: 'Google query to find company LinkedIn page. Format: "CompanyName" site:linkedin.com/company' },
          sources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "All source URLs cited as evidence"
          },
        },
        required: ["companyName", "country", "industry", "description", "growthSignals", "whyNotFamous", "linkedinSearchQuery"],
      }
    }
  },
  required: ["companies"],
};

function buildCompanySearchPrompt(regions: RadarRegion[]): string {
  const regionStr = formatRegions(regions);
  const regionCodes = regions.map(r => REGION_LABELS[r] ?? r).join(' OR ');

  return `You are an elite private intelligence analyst whose speciality is finding DTC, e-commerce, SaaS, and consumer subscription companies that are SCALING FAST but have NOT yet been featured in major tech or business press (TechCrunch, Forbes, Business Insider, Bloomberg, Wired).

TARGET REGIONS: ${regionStr}

Your objective: find companies with verified growth signals — real revenue numbers, job explosions, community buzz, or operational scale — that the mainstream investor world has not discovered yet.

━━━ SEARCH STRATEGY ━━━

Run ALL of the following search queries and extract real company names + signals from each result:

§ REVENUE SIGNAL HUNTING
• site:x.com OR site:twitter.com "just hit" OR "crossed" "$1M" OR "€1M" OR "$5M" OR "€5M" OR "$10M" revenue (${regionCodes}) DTC ecommerce founder 2024 2025
• site:reddit.com/r/entrepreneur OR site:reddit.com/r/startups "hit $1M ARR" OR "$5M revenue" OR "€1M" (${regionCodes}) 2024 2025
• site:indiehackers.com "$10k MRR" OR "$50k MRR" OR "$100k MRR" (${regionCodes}) milestone 2024 2025
• site:x.com "bootstrapped to" OR "from 0 to" (${regionCodes}) revenue company 2025 DTC

§ JOB POSTING SIGNALS — HIRING = SCALING
• site:linkedin.com/jobs (${regionCodes}) DTC OR "e-commerce" OR "subscription" hiring "growth" OR "performance marketing" OR "head of" 2025
• site:jobs.ashbyhq.com (${regionCodes}) growth marketing OR COO 2025
• site:join.com (${regionCodes}) "head of growth" OR "VP marketing" OR "country manager" 2025
• site:greenhouse.io (${regionCodes}) DTC ecommerce "25 employees" OR "50 employees" 2025

§ FUNDING WITHOUT PRESS
• site:crunchbase.com (${regionCodes}) "pre-seed" OR "seed" 2023 2024 2025 DTC OR "e-commerce" -techcrunch -forbes
• site:wellfound.com (${regionCodes}) "recently funded" DTC OR ecommerce 2025
• site:dealroom.co (${regionCodes}) DTC consumer "raised" 2024 2025 "undisclosed" OR "€1M" OR "€2M"

§ COMMUNITY + REVIEW SIGNALS
• (${regionCodes}) DTC brand site:trustpilot.com rating 4.8 OR 5.0 "excellent" 200+ reviews growing 2024 2025
• site:producthunt.com (${regionCodes}) consumer brand subscription upvotes 2024 2025
• site:reddit.com "amazing brand" OR "discovered this brand" (${regionCodes}) subscription OR DTC OR ecommerce 2024 2025
• (${regionCodes}) Shopify Plus brand "fast growing" OR "best brand" 2025

§ LINKEDIN GROWTH PROXY
• site:linkedin.com/company (${regionCodes}) DTC ecommerce founded 2020 OR 2021 OR 2022 employees "11-50" OR "51-200" subscription
• "(${regionCodes}) company" "is hiring" site:linkedin.com DTC OR subscription ecommerce 2025

§ FOUNDER COMMUNITY SIGNALS
• site:x.com OR site:twitter.com (${regionCodes}) founder "growing fast" OR "profitable" DTC subscription "team of" 2025
• site:linkedin.com (${regionCodes}) founder "just announced" OR "excited to share" revenue milestone DTC 2025
• (${regionCodes}) "bootstrapped" DTC brand "€" revenue announcement 2024 2025

━━━ FOR EACH COMPANY FOUND, REPORT ━━━
- Company name and website
- Country and region
- What they sell (1-2 sentences)
- MINIMUM 2 concrete growth signals with source URLs
- Approximate employee count and revenue if visible
- Funding status
- Founder name if identifiable
- Why they haven't been featured in mainstream press

━━━ STRICT RULES ━━━
• ONLY include companies where you found REAL, VERIFIABLE signals — not just their website
• EXCLUDE any company that appeared in TechCrunch, Forbes, Bloomberg, Wired as "startup to watch" in the last 18 months
• EXCLUDE companies with known Series B or later funding
• SMALLER signals count: a founder bragging on X, 500+ Trustpilot reviews, an aggressive hiring burst, product hunt traction
• Focus on: ${regionStr}
• Target count: minimum 8, maximum 20 companies
• Every signal must include the source URL you found it at`;
}

/**
 * Discovers scaling companies that are under the mainstream press radar.
 * Two-pass: grounded search → structured JSON extraction.
 */
export async function scanCompanies(
  regions: RadarRegion[],
  onProgress: (msg: string) => void,
  brainEntries: BrainEntry[] = []
): Promise<RadarCompany[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");
  checkBudget();

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = async (params: any, operation: string) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    recordGeminiUsageFromResponse(params, response, {
      feature: 'intel-radar',
      operation,
      entityType: 'radar-scan',
      entityName: `companies:${regions.join(',')}`,
    });
    return response;
  };

  const regionStr = formatRegions(regions);
  onProgress(`Launching company intelligence scan for: ${regionStr}...`);
  onProgress(`Pass 1: Running grounded web searches across ${regions.length} region(s)...`);

  const directiveBlock = compileDirectivePrompt(brainEntries, 'radar');

  // Pass 1: grounded search — raw text only (cannot combine schema + googleSearch)
  const searchResponse = await safeGenerate({
    model: modelName,
    contents: directiveBlock + buildCompanySearchPrompt(regions),
    config: {
      tools: [{ googleSearch: {} }],
    },
  }, 'companies-grounded-search');

  const rawSearchText = searchResponse.text?.trim() || '';
  if (!rawSearchText) throw new Error("Grounded search returned no results. Try again.");

  onProgress(`Pass 1 complete — raw intelligence gathered (${rawSearchText.length.toLocaleString()} chars). Extracting structured data...`);

  // Pass 2: JSON extraction — no search tools
  const extractResponse = await safeGenerate({
    model: modelName,
    contents: `You are a precise data extraction engine. Extract all company profiles from the intelligence report below.

RULES:
- Extract EVERY company mentioned with growth signals — do not drop any
- For each company, synthesise all evidence into the structured fields
- growthSignals must each include the source URL
- linkedinSearchQuery format MUST be: "CompanyName" site:linkedin.com/company
- founderLinkedinSearch format MUST be: "FirstName LastName" "CompanyName" site:linkedin.com/in
- region must be one of: NL, IE, FR, DE, US, BR, OTHER

INTELLIGENCE REPORT:
${rawSearchText.slice(0, 30_000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: COMPANY_SEARCH_SCHEMA,
    },
  }, 'companies-json-extraction');

  const data = JSON.parse(extractResponse.text?.trim() || '{}');
  const now = new Date().toISOString();

  const results: RadarCompany[] = (data.companies || []).map((c: any) => ({
    id: crypto.randomUUID(),
    companyName:          c.companyName || 'Unknown',
    websiteUrl:           c.websiteUrl || undefined,
    country:              c.country || 'Unknown',
    region:               (c.region as RadarRegion) || 'OTHER',
    industry:             c.industry || 'Unknown',
    description:          c.description || '',
    foundedYear:          c.foundedYear || undefined,
    estimatedRevenue:     c.estimatedRevenue || undefined,
    employeeCount:        c.employeeCount || undefined,
    fundingStatus:        c.fundingStatus || undefined,
    growthSignals:        Array.isArray(c.growthSignals) ? c.growthSignals : [],
    whyNotFamous:         c.whyNotFamous || '',
    founderName:          c.founderName || undefined,
    founderLinkedinSearch: c.founderLinkedinSearch || undefined,
    linkedinSearchQuery:  c.linkedinSearchQuery || `"${c.companyName}" site:linkedin.com/company`,
    sources:              Array.isArray(c.sources) ? c.sources : [],
    scannedAt: now,
    createdAt: now,
  }));

  onProgress(`Scan complete — found ${results.length} scaling companies.`);
  return results;
}

// ─── Investor Radar ───────────────────────────────────────────────────────────

const INVESTOR_SEARCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    investors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fullName:          { type: Type.STRING, description: "Full legal name" },
          country:           { type: Type.STRING, description: "Country name or ISO code" },
          region:            { type: Type.STRING, description: "ISO code: NL IE FR DE US BR or OTHER" },
          investorType:      { type: Type.STRING, description: "angel / family-office / operator / exit-founder / hnwi / unknown" },
          investmentFocus:   { type: Type.STRING, description: "What they tend to invest in: sector, stage, geography" },
          background:        { type: Type.STRING, description: "2-3 sentences: how they built or inherited their wealth" },
          evidenceOfCapital: { type: Type.STRING, description: "The specific signals that indicate they have investable capital" },
          estimatedCapacity: { type: Type.STRING, description: "Evidence-based deal size estimate, e.g. €250k–€1M. Empty if unknown." },
          linkedinSearchQuery: {
            type: Type.STRING,
            description: 'EXACT Google query ready to paste. Format: "Full Name" site:linkedin.com/in OR "Full Name" "Company" investor'
          },
          linkedinUrl:       { type: Type.STRING, description: "Direct LinkedIn profile URL if found during scan" },
          connectionApproach: { type: Type.STRING, description: "How to best approach this person: mutual connections, shared background, entry point" },
          whyHidden:         { type: Type.STRING, description: "Why they don't appear on Midas List, TechCrunch VC lists, or AngelList spotlight" },
          sources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "All source URLs — every claim must have a source"
          },
        },
        required: ["fullName", "country", "investorType", "background", "evidenceOfCapital", "linkedinSearchQuery", "whyHidden", "connectionApproach"],
      }
    }
  },
  required: ["investors"],
};

function buildInvestorSearchPrompt(regions: RadarRegion[]): string {
  const regionStr = formatRegions(regions);
  const regionCodes = regions.map(r => REGION_LABELS[r] ?? r).join(' OR ');

  const regionalSpecifics = regions.map(r => {
    switch (r) {
      case 'NL': return `Netherlands specifics:
  • site:nvba.nl members angel investors 2024
  • "Dutch angel investor" OR "Nederlandse business angel" site:linkedin.com DTC ecommerce 2024
  • site:crunchbase.com Netherlands angel-investor investments 3+ "no press"
  • KvK company director multiple companies DTC Netherlands 2022 2023 2024`;
      case 'IE': return `Ireland specifics:
  • Enterprise Ireland investment network quiet angels 2024
  • "Irish angel investor" DTC consumer brand site:linkedin.com 2024
  • site:eiis.ie individual investor 2024
  • Ireland "former CEO" "exited" company quiet investor 2023 2024`;
      case 'FR': return `France specifics:
  • France Invest members private investors 2024
  • "investisseur particulier" OR "business angel" DTC OR e-commerce France 2024
  • site:franceangels.org membres 2024
  • "fondateur" OR "entrepreneur" France "cédé" OR "cession" DTC investissement 2023 2024`;
      case 'DE': return `Germany specifics:
  • BAND Deutschland Business Angels members 2024
  • "Business Angel" Deutschland DTC ecommerce site:linkedin.com 2024
  • site:band-ev.de angel members 2024
  • Deutschland "Exit" "Gründer" "investiert" DTC Subscription 2023 2024`;
      case 'US': return `United States specifics:
  • site:angellist.co "angel" $500k+ investments DTC consumer subscription 2024
  • "quietly investing" OR "angel checks" US DTC subscription ecommerce founder 2024 2025
  • "exited" DTC company "$5M" OR "$10M" US "now advising" OR "investing in" 2023 2024
  • site:crunchbase.com US angel-investor "e-commerce" OR "DTC" investments 5+ 2023 2024`;
      case 'BR': return `Brazil specifics:
  • Anjos do Brasil investidores 2024
  • "anjo investidor" DTC OR ecommerce Brasil site:linkedin.com 2024
  • "fundador" Brasil "vendeu empresa" OR "exit" investidor 2023 2024
  • site:startse.com.br investidores anjos DTC 2024`;
      default: return '';
    }
  }).filter(Boolean).join('\n\n');

  return `You are an elite wealth intelligence analyst. Your mission: identify individuals with REAL capital to invest in early-stage DTC, e-commerce, or consumer subscription companies — people who are NOT on mainstream investor lists, NOT a named VC partner at a known fund, and NOT regularly featured in tech press.

TARGET REGIONS: ${regionStr}

━━━ TARGET PROFILES ━━━

You are looking for these hidden investor archetypes:

1. EXIT-FOUNDERS — people who built and quietly sold a company (€5M–€100M exit) and are now doing angel deals with NO press about it
2. OPERATOR-INVESTORS — industry veterans (logistics, retail, pharma, tech) who made significant money operating companies and now write checks selectively
3. FAMILY OFFICE PRINCIPALS — managing inherited or self-made wealth through a private family office, rarely mentioned publicly
4. QUIET HNWIs — high-net-worth individuals whose wealth came from one big outcome (IPO equity, M&A, real estate portfolio) and who occasionally invest in consumer brands
5. SERIAL FOUNDERS — people with 2+ exits, most of them unpublicized, who have become informal angels in their network
6. WEALTHY OPERATORS IN DTC — people who ran or built large DTC/e-commerce operations and now have capital plus sector knowledge

━━━ SEARCH STRATEGY ━━━

§ EXIT SIGNAL HUNTING
• site:crunchbase.com (${regionCodes}) exit 2019 2020 2021 2022 2023 "acquired" OR "merger" -IPO -techcrunch "DTC" OR "e-commerce" OR "consumer"
• "(${regionCodes}) founder" "sold company" OR "exit" OR "acquired" site:linkedin.com 2020 2021 2022 2023
• (${regionCodes}) "former CEO" OR "former founder" "now investing" OR "angel investor" OR "startup advisor" site:linkedin.com 2022 2023 2024
• site:dealroom.co (${regionCodes}) exit "undisclosed" OR "€5M" OR "€10M" OR "$5M" 2020 2021 2022 2023

§ FAMILY OFFICE / HNWI SIGNALS
• "(${regionCodes}) family office" investment portfolio "early stage" OR DTC OR consumer 2023 2024 -"press release" -Forbes
• "(${regionCodes})" "high net worth" angel investment "early stage" DTC OR ecommerce -"venture capital" -"VC fund"
• (${regionCodes}) "board member" "5 companies" OR "6 companies" director site:linkedin.com investor

§ QUIET OPERATOR-INVESTOR SIGNALS
• site:linkedin.com "(${regionCodes}) angel investor" OR "private investor" DTC OR ecommerce 2021 2022 2023 2024
• "(${regionCodes})" "seed stage" "I invest in" OR "looking for founders" site:x.com 2023 2024 2025 -"VC" -"fund" -"partner at"
• "(${regionCodes}) entrepreneur" "invest in" OR "advise" DTC NOT "venture" NOT "managing partner" 2023 2024 2025
• site:crunchbase.com (${regionCodes}) angel-investor 3+ investments "not covered" OR "undisclosed" -"GP" -"managing partner"

§ COMPANY DIRECTOR NETWORK SIGNALS
• (${regionCodes}) Companies House OR Kamer van Koophandel OR Registrar of Companies director multiple companies DTC 2022 2023 2024
• (${regionCodes}) "private equity" operating partner low profile DTC consumer 2024
• site:ft.com OR site:bloomberg.com (${regionCodes}) "private investor" "family office" -"fund" 2022 2023 2024

${regionalSpecifics}

§ COMMUNITY + NETWORK SIGNALS
• site:x.com (${regionCodes}) "I write angel checks" OR "I'm an angel investor" DTC consumer subscription 2023 2024 2025
• "(${regionCodes})" "writing my first check" OR "leading a round" DTC ecommerce 2024 2025 NOT VC NOT fund
• site:substack.com (${regionCodes}) investor "my portfolio" DTC subscription 2024
• "(${regionCodes})" "invested in" DTC OR ecommerce "not announced" OR "quiet round" 2023 2024

━━━ FOR EACH PERSON FOUND, REPORT ━━━
- Full name
- Country + region
- Investor type (exit-founder / angel / family-office / operator / hnwi / unknown)
- 2-3 sentences: how they built or inherited their wealth
- The SPECIFIC signal(s) that indicate they have capital to invest
- Evidence-based deal size estimate if possible
- Investment focus (what they tend to back)
- EXACT Google search query to find their LinkedIn (ready to paste, no modification needed)
- Direct LinkedIn URL if found
- Why they are NOT on mainstream investor directories
- How to best approach them for a first connection
- ALL source URLs — every claim must link to evidence

━━━ STRICT RULES ━━━
• NEVER include people who appear on Midas List, Forbes Midas, Preqin VC rankings, or similar mainstream investor rankings
• NEVER include general partners at named VC funds (Sequoia, a16z, Index, etc.)
• NEVER include accelerator partners or incubator directors as their primary role
• ONLY include INDIVIDUALS — not firms, funds, or syndicates
• EVERY person needs minimum ONE verifiable source URL
• If you cannot find a real person with verified signals, do NOT hallucinate one
• Target count: minimum 6 people, maximum 15 per scan
• Focus exclusively on: ${regionStr}`;
}

/**
 * Discovers hidden investors — people with capital who invest quietly
 * without appearing on mainstream investor lists.
 * Two-pass: grounded search → structured JSON extraction.
 */
export async function scanInvestors(
  regions: RadarRegion[],
  onProgress: (msg: string) => void,
  brainEntries: BrainEntry[] = []
): Promise<RadarInvestor[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");
  checkBudget();

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = async (params: any, operation: string) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    recordGeminiUsageFromResponse(params, response, {
      feature: 'intel-radar',
      operation,
      entityType: 'radar-scan',
      entityName: `investors:${regions.join(',')}`,
    });
    return response;
  };

  const regionStr = formatRegions(regions);
  onProgress(`Launching hidden investor scan for: ${regionStr}...`);
  onProgress(`Pass 1: Running deep grounded web searches to surface quiet capital holders...`);

  const investorDirectiveBlock = compileDirectivePrompt(brainEntries, 'radar');

  // Pass 1: grounded search
  const searchResponse = await safeGenerate({
    model: modelName,
    contents: investorDirectiveBlock + buildInvestorSearchPrompt(regions),
    config: {
      tools: [{ googleSearch: {} }],
    },
  }, 'investors-grounded-search');

  const rawSearchText = searchResponse.text?.trim() || '';
  if (!rawSearchText) throw new Error("Grounded search returned no results. Try again.");

  onProgress(`Pass 1 complete — raw intelligence gathered (${rawSearchText.length.toLocaleString()} chars). Extracting investor profiles...`);

  // Pass 2: JSON extraction
  const extractResponse = await safeGenerate({
    model: modelName,
    contents: `You are a precise data extraction engine. Extract all investor profiles from the intelligence report below.

RULES:
- Extract EVERY person mentioned with evidence of investable capital
- linkedinSearchQuery must be a READY-TO-PASTE Google query, e.g.: "John Smith" site:linkedin.com/in OR "John Smith" "ExitedCompany" investor
- investorType must be one of: angel / family-office / operator / exit-founder / hnwi / unknown
- region must be one of: NL, IE, FR, DE, US, BR, OTHER
- Do NOT include VC fund partners or accelerator managing directors
- Do NOT hallucinate people — only extract real names from the report

INTELLIGENCE REPORT:
${rawSearchText.slice(0, 30_000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: INVESTOR_SEARCH_SCHEMA,
    },
  }, 'investors-json-extraction');

  const data = JSON.parse(extractResponse.text?.trim() || '{}');
  const now = new Date().toISOString();

  const results: RadarInvestor[] = (data.investors || []).map((inv: any) => ({
    id: crypto.randomUUID(),
    fullName:           inv.fullName || 'Unknown',
    country:            inv.country || 'Unknown',
    region:             (inv.region as RadarRegion) || 'OTHER',
    investorType:       inv.investorType || 'unknown',
    investmentFocus:    inv.investmentFocus || '',
    background:         inv.background || '',
    evidenceOfCapital:  inv.evidenceOfCapital || '',
    estimatedCapacity:  inv.estimatedCapacity || undefined,
    linkedinSearchQuery: inv.linkedinSearchQuery || `"${inv.fullName}" site:linkedin.com/in`,
    linkedinUrl:        inv.linkedinUrl || undefined,
    connectionApproach: inv.connectionApproach || '',
    whyHidden:          inv.whyHidden || '',
    sources:            Array.isArray(inv.sources) ? inv.sources : [],
    scannedAt: now,
    createdAt: now,
  }));

  onProgress(`Scan complete — found ${results.length} hidden investors.`);
  return results;
}
