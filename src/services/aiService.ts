import { GoogleGenAI, Type } from "@google/genai";
import { Category } from "../types";
import { getApiKey, checkBudget, recordApiUsage } from "../lib/settings";

/** Retries a Gemini API call with exponential backoff on rate-limit / transient errors */
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
      const backoff = Math.min(Math.pow(2, attempt) * 2000 + Math.random() * 1000, 30000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

export type AgentStatus = 'pending' | 'running' | 'completed' | 'error';
export interface ResearchProgress {
  overall: string;
  agents: {
    unitEconomics: { status: AgentStatus; detail: string };
    marketDynamics: { status: AgentStatus; detail: string };
    localCompetitors: { status: AgentStatus; detail: string };
    globalCompetitors: { status: AgentStatus; detail: string };
    legalLogistics: { status: AgentStatus; detail: string };
    suppliersBudget: { status: AgentStatus; detail: string };
    foundersAndTeam: { status: AgentStatus; detail: string };
    adIntelligence: { status: AgentStatus; detail: string };
    retentionEngineering: { status: AgentStatus; detail: string };
  };
}

/** State tracked per-category while research is in-flight or recently completed. */
export type CategoryResearchState = ResearchProgress & {
  /** queued = waiting in bulk queue | running = AI agents active | done = success | error = failed */
  __state: 'queued' | 'running' | 'done' | 'error';
  __error?: string;
};

export const createInitialProgress = (): ResearchProgress => ({
  overall: 'Initializing agentic swarm...',
  agents: {
    unitEconomics: { status: 'pending', detail: 'Waiting to start...' },
    marketDynamics: { status: 'pending', detail: 'Waiting to start...' },
    localCompetitors: { status: 'pending', detail: 'Waiting to start...' },
    globalCompetitors: { status: 'pending', detail: 'Waiting to start...' },
    legalLogistics: { status: 'pending', detail: 'Waiting to start...' },
    suppliersBudget: { status: 'pending', detail: 'Waiting to start...' },
    foundersAndTeam: { status: 'pending', detail: 'Waiting to start...' },
    adIntelligence: { status: 'pending', detail: 'Waiting to start...' },
    retentionEngineering: { status: 'pending', detail: 'Waiting to start...' },
  }
});

export interface DiscoveryProgress {
  status: string;
  totalIndustries: number;
  industriesTrawled: number;
  logs: string[];
}

export async function agenticDeepResearchCategory(
  category: Category,
  onProgress: (progress: ResearchProgress) => void,
  onPartialUpdate?: (update: Partial<Category>) => void
): Promise<Partial<Category>> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");
  checkBudget();

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = async (params: any) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    const meta = (response as any).usageMetadata;
    const hasGrounding = Array.isArray(params.config?.tools) && params.config.tools.some((t: any) => 'googleSearch' in t);
    recordApiUsage(meta?.promptTokenCount ?? 0, meta?.candidatesTokenCount ?? 0, hasGrounding ? 1 : 0);
    return response;
  };
  
  let currentProgress = createInitialProgress();
  const updateProgress = (updates: Partial<ResearchProgress>) => {
    currentProgress = { ...currentProgress, ...updates };
    onProgress({ ...currentProgress });
  };

  const updateAgent = (agent: keyof ResearchProgress['agents'], status: AgentStatus, detail: string) => {
    currentProgress.agents[agent] = { status, detail };
    onProgress({ ...currentProgress });
  };

  updateProgress({ overall: `Launching 7 autonomous agents for ${category.name}...` });

  const runUnitEconomicsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('unitEconomics', 'running', 'Searching pricing, LTV, CAC models on Reddit & scientific sources...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdownReport: { type: Type.STRING, description: "Detailed Markdown report showing unit economics, CAC/CLV, pricing models, backed by sources." },
        estimatedCLV: { type: Type.NUMBER, description: "Estimated Average CLV in Euros" },
        estimatedCAC: { type: Type.NUMBER, description: "Estimated Average CAC in Euros" },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdownReport", "estimatedCLV", "estimatedCAC", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are an expert e-commerce unit economics analyst. Deeply research the Customer Lifetime Value (CLV, in Euros) and Customer Acquisition Cost (CAC, in Euros) for the category: "${category.name}" targeting "${category.targetAudience}". Focus entirely on realistic European/NL metrics.
        ANTI-HALLUCINATION RULES: (1) Every CLV and CAC figure you return MUST be backed by a real URL found via search in this session. (2) If no real data can be found for this specific category, return 0 for that numeric field and explain why in markdownReport. A sourced zero is always more trustworthy than an invented figure. (3) Do not extrapolate from unrelated industries. (4) Populate the sources array with every URL you used — this is mandatory.

        MANDATORY SEARCHES — run ALL of these:
        - "${category.name}" CLV "customer lifetime value" subscription e-commerce
        - "${category.name}" CAC "customer acquisition cost" e-commerce 2025 2026
        - "${category.name}" "average order value" subscription Netherlands EU
        - site:rechargeapps.com blog "${category.name}" retention CLV
        - site:recurly.com benchmark "${category.name}" subscription metrics
        - site:chartmogul.com "${category.name}" revenue metrics
        - "${category.name}" "ltv" OR "ltv:cac" benchmark filetype:pdf
        - site:reddit.com/r/ecommerce "${category.name}" CAC OR CLV OR "lifetime value"
        - "${category.name}" subscription ARPU "average revenue per user"
        - "${category.name}" unit economics startup pitch deck investor

        Keep CLV and CAC completely separate in your logic. Return a comprehensive breakdown with inline source citations.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('unitEconomics', 'completed', 'Unit economics finalized.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { result: { estimatedCLV: data.estimatedCLV, estimatedCAC: data.estimatedCAC }, raw: data.markdownReport || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('unitEconomics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runMarketDynamicsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('marketDynamics', 'running', 'Analyzing global & NL market sizes, churn, and CAGR...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdownReport: { type: Type.STRING, description: "Detailed Markdown report showing market size, CAGR, trends, and the full TAM→SAM→SOM funnel with every filter step numbered and sourced." },
        monthlyChurnPercent: { type: Type.NUMBER, description: "Estimated monthly churn percentage (0-100)" },
        cagr: { type: Type.STRING, description: "Estimated CAGR percentage over next 5 years" },
        marketSizeGlobal: { type: Type.STRING, description: "Total Global Market Size in euros/dollars with year" },
        marketSizeEU: { type: Type.STRING, description: "Total European Market Size in euros with year" },
        marketSizeNL: { type: Type.STRING, description: "Total NL Market Size / Value in euros with year" },
        audienceSizeNL: { type: Type.STRING, description: "Human-readable SOM figure: '~12,400 reachable targets'" },
        tamNL: { type: Type.NUMBER, description: "TAM: raw count of all entities in NL that could ever be a customer (integer). E.g. 100000 for all NL restaurants." },
        samNL: { type: Type.NUMBER, description: "SAM: count after removing unreachable entities (no social presence, wrong region, offline-only, etc.). Must be <= TAM." },
        somNL: { type: Type.NUMBER, description: "SOM: count that realistically can buy given budget, awareness, and operational capacity. Must be <= SAM. This is the number we actually target." },
        funnelBreakdownNL: { type: Type.STRING, description: "Numbered step-by-step funnel. Each step: entity count → filter applied → remaining count → source URL. Example: '1. 100,000 restaurants in NL (CBS 2024) → 2. 52,000 with active social media (Newcom 2023, 52%) → 3. 18,000 with ≥€300/mo marketing budget (KVK SME survey 2023, 35%) → 4. 12,400 aware of/open to this product category (Eurobarometer 2024, 69%) = SOM 12,400'" },
        marketSizeScore: { type: Type.NUMBER, description: "Score from 1 to 10 based on SOM size, growth rate, and competition density" },
        realMonthlyConsumption: { type: Type.BOOLEAN },
        monthlyConsumptionReason: { type: Type.STRING },
        acquisitionDifficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" },
        emotionalLoyalty: { type: Type.STRING, description: "Low, Medium, or High" },
        storyDepth: { type: Type.NUMBER, description: "Score from 1 to 10" },
        microNichePotential: { type: Type.NUMBER, description: "Score from 1 to 10" },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdownReport", "monthlyChurnPercent", "marketSizeGlobal", "marketSizeEU", "marketSizeNL", "audienceSizeNL", "tamNL", "samNL", "somNL", "funnelBreakdownNL", "marketSizeScore", "realMonthlyConsumption", "monthlyConsumptionReason", "acquisitionDifficulty", "emotionalLoyalty", "storyDepth", "microNichePotential", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a European Consumer Market Researcher specialising in bottom-up market sizing for the Netherlands.

CATEGORY: "${category.name}"
TARGET: "${category.targetAudience}"

═══════════════════════════════════════════════════════════
MISSION — TAM → SAM → SOM FUNNEL (mandatory, numbered steps)
═══════════════════════════════════════════════════════════
You MUST compute a realistic, bottom-up funnel for the NL market.

RULES:
1. Start from the LARGEST countable population relevant to this category (CBS StatLine, KVK register, RVO, Newcom, etc.). Never start from "NL population 18M" unless the product genuinely targets all Dutch adults.
2. Apply filters ONE AT A TIME. Each step must show:
   • What you filtered on (e.g. "on social media", "SME with >€300/mo marketing budget")
   • The % or absolute reduction
   • A real source URL for the filter rate
   • Remaining count
3. TAM = after first meaningful outer boundary (entity type + country)
4. SAM = after removing unreachable entities (offline, wrong region, competitor-locked, etc.)
5. SOM = after removing those without budget, need, or operational readiness to buy YOUR product
6. If a real source cannot be found for a filter rate, STATE that and use a conservative estimate marked "[estimated — no source found]"
7. Integers only for tamNL, samNL, somNL. audienceSizeNL = human label e.g. "~12,400 reachable B2B targets"

EXAMPLE FORMAT for funnelBreakdownNL:
"1. 100,000 full-service restaurants in NL (KVK Handelsregister 2024) [TAM = 100,000]
 → 2. −48,000 with no digital/online presence (Newcom Nationale Social Media Onderzoek 2024: 52% active) [remaining 52,000]
 → 3. −34,000 with marketing budget <€200/mo (KVK MKB Barometer Q1 2024: 35% have ≥€200/mo) [remaining 18,200]
 → 4. −5,800 already using a direct competitor (estimated 32%, no source found) [remaining 12,400]
 [SOM = 12,400]"

═══════════════════════════════════════════════════════════
ANTI-HALLUCINATION RULES
═══════════════════════════════════════════════════════════
• Every figure MUST cite a real source URL found via live Google Search.
• If a figure cannot be sourced, return "Unknown (no source found)" — NEVER fabricate.
• Populate the sources array with every URL used — mandatory.
• marketSizeNL, EU, Global: cite year; prefer official statistics or reputable industry reports.

Return a detailed markdownReport covering: market size (global/EU/NL), CAGR, consumer psychology (loyalty, story depth), niche potential, and the full funnel. Include sources list.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('marketDynamics', 'completed', 'Market dynamics mapped.');
      const data = JSON.parse(response.text?.trim() || "{}");
      const { markdownReport, sources, ...categoryFields } = data;
      return { result: categoryFields, raw: markdownReport || '', sources: sources || [] };
    } catch (e: any) {
      updateAgent('marketDynamics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runLocalCompetitorsAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('localCompetitors', 'running', 'Spying on local NL/EU players...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Markdown text containing the list of 2-4 competitors" },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a competitive intelligence operative. Search for and list local competitors in the Netherlands (or broader EU) selling: "${category.name}" to "${category.targetAudience}".

        MANDATORY SEARCHES — run ALL of these:
        - "${category.name}" subscription Netherlands OR "Nederland" webshop
        - "${category.name}" site:trustpilot.com Netherlands reviews
        - site:tweakers.net "${category.name}"
        - site:retaildetail.nl "${category.name}"
        - site:twinkle.nl "${category.name}" e-commerce
        - "${category.name}" site:x.com Netherlands OR NL brand 2025
        - "${category.name}" "Nederland" site:reddit.com community discussion
        - "${category.name}" EU competitor DTC subscription brand 2025 2026
        - intitle:review "${category.name}" Netherlands OR Belgian competitor
        - "${category.name}" site:similarweb.com monthly visits NL competitor

        For each of 2-4 real competitors: company name, URL, monthly traffic estimate (SimilarWeb), pricing, Trustpilot score, positioning angle, and key gap/weakness to exploit. Return Markdown text and all sources.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('localCompetitors', 'completed', 'Local competition analyzed.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('localCompetitors', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runGlobalCompetitorsAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('globalCompetitors', 'running', 'Scanning US/Global pioneers...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Markdown text containing the list of successful global competitors" },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a 2026 DTC trend analyst and global competitive intelligence specialist. Research the most successful global players for: "${category.name}" targeting "${category.targetAudience}".

        MANDATORY SEARCHES — run ALL of these:
        - "${category.name}" DTC direct-to-consumer subscription US UK global top brand 2025 2026
        - site:producthunt.com "${category.name}" — emerging players gaining traction
        - site:crunchbase.com "${category.name}" DTC subscription funded recent
        - site:explodingtopics.com "${category.name}" trend growth 2025
        - "${category.name}" site:reddit.com/r/Entrepreneur OR site:reddit.com/r/startups success story
        - "${category.name}" acquisition OR acqui-hire OR exit 2023 2024 2025
        - "${category.name}" site:x.com founder thread scaling OR "${category.name}" founder story
        - "${category.name}" YC batch OR Techstars OR accelerator cohort
        - "${category.name}" Inc5000 OR Deloitte Fast500 fastest growing DTC
        - "${category.name}" podcast interview founder scaling unit economics

        Identify what makes the top 1-2 global players successful: exact growth channels, retention mechanics, product diff, unit economics. Extract from X, LinkedIn, Reddit, podcasts where found. Return Markdown text and all sources.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('globalCompetitors', 'completed', 'Global benchmarks identified.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('globalCompetitors', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runLegalLogisticsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('legalLogistics', 'running', 'Checking NL legal & ad restrictions...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdownReport: { type: Type.STRING, description: "Detailed Markdown report outlining exact legalities, ad blocks, required licenses in the EU/NL." },
        regulatoryRiskNL: { type: Type.STRING, description: "Low, Medium, or High" },
        legalAndAdRestrictions: { type: Type.STRING, description: "Details on if it's legal in the Netherlands, easy to do, requires special licenses, or has restricted ad categories." },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdownReport", "regulatoryRiskNL", "legalAndAdRestrictions", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a Dutch Legal and E-commerce Compliance Expert. Analyze the category: "${category.name}" for the Netherlands market. Is it legal? Does it require special licenses? Is it a restricted ad category on Meta/Google?
        ANTI-HALLUCINATION RULES: (1) Only cite legal requirements you find via search on official sources (overheid.nl, autoriteitpersoonsgegevens.nl, reclame.code.nl, or credible legal blogs). (2) Do not assume regulatory status from memory — always verify via search. (3) If a legal point cannot be verified via search, say "Unverified — consult a Dutch e-commerce lawyer" instead of guessing. (4) Sources array is mandatory — include every URL used.`,

        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('legalLogistics', 'completed', 'Legal and compliance checked.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { result: { regulatoryRiskNL: data.regulatoryRiskNL as any, legalAndAdRestrictions: data.legalAndAdRestrictions }, raw: data.markdownReport || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('legalLogistics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runSuppliersBudgetAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('suppliersBudget', 'running', 'Checking suppliers and startup budget...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Markdown text detailing suppliers, dropshipping options, and how realistic it is to start on a tight budget." },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a scrappy e-commerce founder and supply chain expert. For the category: "${category.name}", map every realistic supply chain option and startup cost for an NL-based DTC subscription launch.

        MANDATORY SEARCHES — run ALL of these:
        - site:alibaba.com "${category.name}" minimum order quantity white label
        - site:1688.com "${category.name}" — direct Chinese factory pricing (lower MOQ than Alibaba)
        - site:faire.com "${category.name}" — European/US wholesale marketplace
        - site:ankorstore.com "${category.name}" — EU-focused wholesale, NL friendly
        - site:thomasnet.com "${category.name}" manufacturer supplier
        - "${category.name}" private label white label Netherlands Europe supplier
        - "${category.name}" dropshipping supplier EU NL 2025 2026
        - site:reddit.com/r/dropship "${category.name}" OR site:reddit.com/r/Entrepreneur "${category.name}" supplier experience
        - "${category.name}" 3PL fulfillment center Netherlands PostNL DHL
        - "${category.name}" COGs "cost of goods" subscription box benchmark
        - "${category.name}" MOQ minimum order e-commerce startup

        Provide: real supplier names, MOQ, unit cost, estimated COGs%, and a full MVP budget breakdown from €0 to 100 subscribers in NL. Flag supply chain risks. Return Markdown text and all sources.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('suppliersBudget', 'completed', 'Suppliers and budget analyzed.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('suppliersBudget', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runAdIntelligenceAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('adIntelligence', 'running', 'Scanning Meta/TikTok ad library, CPM benchmarks, creative hooks...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Full Markdown paid-media intelligence report structured by channel." },
        sources: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a 2026 DTC performance marketing specialist. Research the full paid media landscape for: "${category.name}" targeting "${category.targetAudience}" in the Netherlands.

MANDATORY SEARCHES — run ALL of these:
- site:facebook.com/ads/library "${category.name}" — active Meta ads targeting NL/EU
- "${category.name}" Meta CPM Netherlands benchmark 2025 2026
- "${category.name}" TikTok ads creative center top performing 2025 2026
- "${category.name}" TikTok Shop creator affiliate
- "${category.name}" influencer CAC micro-influencer ROAS Netherlands
- "${category.name}" UGC creator ads performance conversion
- "${category.name}" Google Shopping ROAS benchmark Netherlands 2025
- "${category.name}" subscription ad creative hook examples
- site:reddit.com/r/PPC "${category.name}" OR site:reddit.com/r/FacebookAds "${category.name}"
- "${category.name}" affiliate program commission rate Netherlands
- "${category.name}" Performance Max Google 2025 2026
- "${category.name}" Nederlandse influencer samenwerking OR NL creator partnership
- "${category.name}" ad fatigue creative refresh cycle subscription

REPORT FORMAT (use exactly this structure):

## Channel CAC Breakdown
| Channel | Estimated CAC (NL) | Confidence | Source |
|---------|-------------------|------------|--------|
| Meta (FB/IG) | | | |
| TikTok | | | |
| Google Search | | | |
| Google Shopping | | | |
| Influencer/UGC | | | |
| Affiliate | | | |

## Meta (Facebook/Instagram)
- CPM range NL (€): …
- Typical CTR: …
- Best-performing creative angles: …
- Ad restrictions for this category (health claims, etc.): …
- Winning ad formats in 2026 (UGC, VSL, static, carousel): …

## TikTok
- TikTok Shop presence for this category (yes/no/emerging): …
- Top creative hooks/styles that convert: …
- CPM range NL (€): …
- UGC vs produced content split: …
- Key creators or niches to target: …

## Google (Search + Shopping + PMAX)
- CPC ranges NL (€): …
- ROAS benchmarks: …
- Best keyword intent clusters: …
- PMAX vs Search split recommendation: …

## Influencer & UGC Economy
- Nano/micro/macro split recommendation: …
- Typical CPR (cost per result) via influencer: …
- Platforms that convert best for this category: …
- Average engagement rate benchmarks: …

## 2026-Specific Opportunities
New platform features (Meta AI ads, TikTok Shop Live, YouTube Shopping, Pinterest Shopping, WhatsApp Business NL) and creative formats emerging for this category.

## Creative Strategy Playbook
Top 3-5 proven hooks/angles with evidence from search. What emotional triggers drive conversions in this category?

ANTI-HALLUCINATION: All CPM/CPC/ROAS/CAC figures must trace to a real source URL from this session. If a benchmark cannot be verified, write "No verified benchmark found — industry proxy: [X], treat as estimate". Never invent figures.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('adIntelligence', 'completed', 'Ad intelligence mapped.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('adIntelligence', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runRetentionEngineeringAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('retentionEngineering', 'running', 'Mapping cohort retention, churn drivers, subscription term economics...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Full Markdown retention engineering report with benchmarks, playbooks, and 2026 tactics." },
        sources: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a subscription retention engineer and DTC growth expert. Research cohort economics and retention for: "${category.name}" targeting "${category.targetAudience}".

MANDATORY SEARCHES — run ALL of these:
- "${category.name}" subscription retention benchmark 2025 2026
- site:rechargeapps.com blog "${category.name}" subscription retention
- site:recurly.com benchmark churn "${category.name}"
- site:chartmogul.com "${category.name}" subscription metrics
- "${category.name}" "3-month retention" OR "6-month retention" OR "12-month retention" cohort
- "${category.name}" subscription annual vs monthly conversion rate uplift
- "${category.name}" subscription pause rate cancel rate
- "${category.name}" win-back campaign reactivation rate email
- "${category.name}" subscriber NPS benchmark
- "${category.name}" dunning management failed payment recovery rate
- "${category.name}" referral program LTV uplift loyalty program
- site:reddit.com/r/ecommerce "${category.name}" retention churn
- "${category.name}" subscription box cohort analysis
- subscription business benchmark 2025 involuntary churn failed payment
- "${category.name}" cancellation survey top reasons

REPORT FORMAT (exact structure):

## Retention Benchmark Summary
| Metric | This Category (found/estimated) | Source | Confidence |
|--------|---------------------------------|--------|-----------|
| Month-1 retention | | | |
| Month-3 retention | | | |
| Month-6 retention | | | |
| Month-12 retention | | | |
| Steady-state monthly churn | | | |
| Target <6% churn feasible? | | | |

## Subscription Term Mix Engineering
- % of subscribers on annual plans (benchmark + source)
- Optimal annual discount for this category (% off that maximizes net revenue while boosting LTV)
- Free trial vs paid trial: which converts better and why
- Prepaid bundles (3/6/12 month) — measured LTV uplift vs monthly

## Top 5 Churn Drivers (ranked by frequency)
From customer surveys, Reddit, review analysis, or cancellation studies found via search.

## Pause Rate vs Cancel Rate
- Does a subscription pause feature reduce cancellations in this space?
- % of "cancel" attempts that convert to pause when offered
- Reactivation rate from paused vs hard-cancelled subscribers

## Win-Back / Reactivation Playbook
- Industry average win-back rate for this category
- Top reactivation channels (email, SMS, paid retargeting) with conversion benchmarks
- Typical discount depth needed to win back a cancelled subscriber
- Optimal timing for win-back sequence (day 1, 7, 30, 60, 90?)

## Dunning & Involuntary Churn Defense
- Industry average involuntary churn from failed payments for this category
- Smart retry logic improvement (3-day, 7-day retry window)
- Account updater service impact on recovery rate
- Pre-dunning SMS/email nudge benchmarks

## Referral & Loyalty Program Economics
- Average LTV uplift % for referral-acquired subscribers vs paid-ad acquired
- Best loyalty mechanics for this category (points, tiers, early access, co-creation)
- Net revenue retention uplift when a loyalty program is active

## 2026-Specific Retention Tactics
- AI-personalized subscription curation for this category
- Community-driven retention (Discord, WhatsApp groups, member events)
- Co-creation / subscriber input into product selection
- "Pause, don't cancel" UX flows — conversion rates
- Personalized win-back video or handwritten note programs
- Hyperlocal NL tactics (PostNL partnerships, iDEAL billing retry, etc.)

ANTI-HALLUCINATION: Every percentage must cite a real source URL from this session. If no specific data found for this category, cite nearest adjacent category and clearly label as proxy "[adjacent category proxy — no direct source found]".`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('retentionEngineering', 'completed', 'Retention engineering report complete.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('retentionEngineering', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runFoundersTeamAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('foundersAndTeam', 'running', 'Discovering founders and linkedIn profiles...');
    const schema = {
      type: Type.OBJECT,
      properties: {
        markdown: { type: Type.STRING, description: "Markdown text detailing the founders of the top companies in this category, their backgrounds, podcast appearances, and LinkedIn URLs." },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdown", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are an elite talent scout and investigative journalist. Find the founders or key people of the top 3 companies in the category: "${category.name}".
        ANTI-HALLUCINATION RULE FOR LINKEDIN URLS: You may ONLY include a LinkedIn URL if you actually retrieve it via Google Search in this session. LLMs are known to hallucinate LinkedIn profile URLs — a wrong URL destroys credibility. If a search does not return a verifiable LinkedIn URL, write "LinkedIn: [not found in search]" instead of guessing. Never construct a URL from a person's name.
        METHOD: Use Google Search with operators like site:linkedin.com/in/ "[Founder Name]" "[Company]", and search for podcast transcripts, news articles, Crunchbase profiles, and previous exits. Only include facts you can trace to a real search result. Provide factual bios in Markdown.`,
        config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
      });
      updateAgent('foundersAndTeam', 'completed', 'Founders identified.');
      const data = JSON.parse(response.text?.trim() || "{}");
      return { raw: data.markdown || '', sources: data.sources || [] };
    } catch (e: any) {
      updateAgent('foundersAndTeam', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  // Run agents in parallel pairs — retryWithBackoff handles rate limits (~3x faster than fully sequential)
  updateProgress({ overall: 'Running Unit Economics + Market Dynamics in parallel...' });
  const [unitEcon, marketDyn] = await Promise.all([
    runUnitEconomicsAgent(),
    runMarketDynamicsAgent(),
  ]);

  updateProgress({ overall: 'Running Legal & Logistics + Local Competitors in parallel...' });
  const [legalLog, localNotes] = await Promise.all([
    runLegalLogisticsAgent(),
    runLocalCompetitorsAgent(),
  ]);

  if (onPartialUpdate) {
    onPartialUpdate({
      ...unitEcon.result,
      ...marketDyn.result,
      ...legalLog.result,
      agentResults: {
        unitEconomics: unitEcon.raw,
        marketDynamics: marketDyn.raw,
        legalLogistics: legalLog.raw,
        localCompetitors: localNotes.raw
      },
      researchSources: [...new Set([...(category.researchSources || []), ...(unitEcon.sources || []), ...(marketDyn.sources || []), ...(legalLog.sources || []), ...(localNotes.sources || [])])]
    });
  }

  updateProgress({ overall: 'Running Global Competitors + Suppliers + Ad Intelligence in parallel...' });
  const [globalNotes, suppliersBudget, adIntel] = await Promise.all([
    runGlobalCompetitorsAgent(),
    runSuppliersBudgetAgent(),
    runAdIntelligenceAgent(),
  ]);

  updateProgress({ overall: 'Running Founders & Team + Retention Engineering in parallel...' });
  const [foundersAndTeam, retentionEng] = await Promise.all([
    runFoundersTeamAgent(),
    runRetentionEngineeringAgent(),
  ]);

  updateProgress({ overall: 'Merging intelligence reports...' });

  const allSources = [
    ...(unitEcon.sources || []),
    ...(marketDyn.sources || []),
    ...(legalLog.sources || []),
    ...(localNotes.sources || []),
    ...(globalNotes.sources || []),
    ...(suppliersBudget.sources || []),
    ...(foundersAndTeam.sources || []),
    ...(adIntel.sources || []),
    ...(retentionEng.sources || []),
  ];

  updateProgress({ overall: 'Research complete.' });

  return {
    ...unitEcon.result,
    ...marketDyn.result,
    ...legalLog.result,
    agentResults: {
       unitEconomics: unitEcon.raw,
       marketDynamics: marketDyn.raw,
       localCompetitors: localNotes.raw,
       globalCompetitors: globalNotes.raw,
       legalLogistics: legalLog.raw,
       suppliersBudget: suppliersBudget.raw,
       foundersAndTeam: foundersAndTeam.raw,
       adIntelligence: adIntel.raw,
       retentionEngineering: retentionEng.raw,
    },
    researchSources: [...new Set([...(category.researchSources || []), ...allSources])],
    lastUpdated: new Date().toISOString()
  };
}

export async function discoverDtcCategories(
  userPrompt: string,
  getExistingCategoryNames: () => string[],
  onProgress: (prog: DiscoveryProgress) => void,
  onCategoryDiscovered: (cat: Partial<Category>) => void,
  signal: AbortSignal
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");
  checkBudget();
  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = async (params: any) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    const meta = (response as any).usageMetadata;
    const hasGrounding = Array.isArray(params.config?.tools) && params.config.tools.some((t: any) => 'googleSearch' in t);
    recordApiUsage(meta?.promptTokenCount ?? 0, meta?.candidatesTokenCount ?? 0, hasGrounding ? 1 : 0);
    return response;
  };

  let progress: DiscoveryProgress = {
    status: "Initializing Endless Global Sector Mapper...",
    totalIndustries: 0,
    industriesTrawled: 0,
    logs: ["Establishing limits and existing DB bounds..."]
  };

  const updateProgress = (updates: Partial<DiscoveryProgress>) => {
    progress = { ...progress, ...updates };
    onProgress({ ...progress });
  };
  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    progress.logs = [`[${ts}] ${msg}`, ...progress.logs].slice(0, 15);
    updateProgress({});
  };

  const sectorSchema = {
    type: Type.OBJECT,
    properties: {
      sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
      sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "URLs confirming these sectors have active DTC businesses (optional but encouraged)" }
    }
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      categories: {
        type: Type.ARRAY,
        description: "List of highly specific new sub-categories found.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            targetAudience: { type: Type.STRING },
            estimatedCLV: { type: Type.NUMBER },
            estimatedCAC: { type: Type.NUMBER },
            monthlyChurnPercent: { type: Type.NUMBER },
            marketSizeNL: { type: Type.STRING },
            audienceSizeNL: { type: Type.STRING, description: "Highly realistic exact number of people in NL qualified. E.g. '15,000 users'" },
            marketSizeScore: { type: Type.NUMBER },
            storyDepth: { type: Type.NUMBER },
            microNichePotential: { type: Type.NUMBER },
            acquisitionDifficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
            emotionalLoyalty: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            realMonthlyConsumption: { type: Type.BOOLEAN },
            monthlyConsumptionReason: { type: Type.STRING },
            notes: { type: Type.STRING, description: "Why this fits the criteria perfectly. What is the hyper-specific angle? Include your TAM→SOM funnel steps." },
            sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "At least 1 real URL found via search proving this category has active businesses. Mandatory — categories without a source will be rejected." }
          },
          required: ["name", "targetAudience", "sources"]
        }
      }
    },
    required: ["categories"]
  };

  let searchedSectors = new Set<string>();

  while (!signal.aborted) {
    const existingCategoryNames = getExistingCategoryNames();
    log(`Syncing bounds: avoiding ${existingCategoryNames.length} known categories & ${searchedSectors.size} exhausted sectors.`);

    // Step 1: Identify Marco-Industries
    updateProgress({ status: "Generating next wave of consumer sectors..." });
    
    let sectors: string[] = [];
    try {
      const avoidedSectorsText = searchedSectors.size > 0 ? `DO NOT SUGGEST THESE SECTORS (we already mapped them): ${Array.from(searchedSectors).join(", ")}.` : "";
      
      const response = await safeGenerate({
        model: modelName,
        contents: `You are an endless, elite private equity mapping system. Return a completely new list of 5 distinct consumer product sectors where subscription/high-loyalty DTC models are viable.
        CRITICAL: Rotate randomly through drastically different areas. Sometimes pick Beauty/Makeup, sometimes Hardware Subscriptions, sometimes Pets, Home, Vitamins, Wearables, Kid stuff, etc. Be as randomized and broad as possible across the entire global economy so we don't miss emerging opportunities.
        ANTI-HALLUCINATION: Use search to verify each sector. Only include sectors with real, currently operating DTC businesses. Do not suggest theoretical or purely emerging sectors with no live players.
        ${avoidedSectorsText}
        Return ONLY the list.`,
        config: { responseMimeType: "application/json", responseSchema: sectorSchema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } }
      });
      if (signal.aborted) return;

      sectors = JSON.parse(response.text?.trim() || "{}").sectors || [];
      log(`Successfully mapped ${sectors.length} new distinct sectors.`);
      updateProgress({ totalIndustries: progress.totalIndustries + sectors.length });
    } catch (e: any) {
      log(`Sector mapping turbulence: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000)); // slight backoff
      continue;
    }

    if (!sectors || sectors.length === 0) {
      log("No new sectors found this cycle. Re-calibrating...");
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    updateProgress({ status: "Hunting inside targeted sectors..." });

    for (const sector of sectors) {
      if (signal.aborted) return;
      searchedSectors.add(sector);
      log(`Deploying Agent into sector: [${sector}]...`);
      try {
        const currentAvoidCategories = getExistingCategoryNames();
        const existingInfo = currentAvoidCategories.length > 0 
          ? `DO NOT SUGGEST ANY OF THE FOLLOWING EXACT OR SIMILAR CATEGORIES (WE ALREADY HAVE THEM TRACKED): ${currentAvoidCategories.join(", ")}.\n\n`
          : "";

        const prompt = `${userPrompt}\n\n${existingInfo}YOUR MISSION NOW: Deep-dive specifically into the sector: "${sector}". Discover 2 to 4 HYPER-SPECIFIC, highly profitable micro-categories within this sector that fit all constraints.\n\nCRITICAL ANTI-HALLUCINATION CONSTRAINTS:\n1. DO NOT INVENT categories. Only suggest categories that have REAL, NAMED, OPERATIONAL businesses already serving them. Use Google Search to verify each one before including it.\n2. For EVERY category you return, you MUST include at least one real URL in the sources array (a live business homepage, a market report, a Reddit thread) that proves this niche exists with real demand. Categories without a verifiable source MUST be excluded.\n3. For "audienceSizeNL": output a brutally realistic number (e.g. "12,500 people") and show your full TAM→SAM→SOM funnel in notes with each filter step. Never skip steps.\n4. TAM/SAM/SOM reduction: [Total NL 18M] → [Correct Age/Gender] → [Income Bracket] → [% experiencing the exact problem]. Use census or CBS.nl data where possible.\n5. If a statistic (CLV, CAC, churn) cannot be found via search, output 0 — a sourced zero is more trustworthy than an invented number.`;

        const response = await safeGenerate({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: "application/json", responseSchema: schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } }
        });
        if (signal.aborted) return;

        const data = JSON.parse(response.text?.trim() || "{}");
        const found = data.categories || [];
        
        log(`Agent extracted ${found.length} valid entities from [${sector}].`);
        
        for (const cat of found) {
          if (signal.aborted) return;
          cat.industry = sector;
          cat.status = 'Researching';
          const discoverySources: string[] = cat.sources || [];
          const sourceNote = discoverySources.length > 0
            ? `\nDiscovery sources: ${discoverySources.join(', ')}`
            : '\n⚠️ No sources captured during discovery — treat all estimates as unverified until Deep Research is run.';
          cat.notes = `[DISCOVERY SWARM — ${new Date().toISOString()}]\n⚠️ INITIAL ESTIMATES ONLY — all numeric values (CLV, CAC, churn %, market size, audience size) are unvalidated model estimates. Run Deep Research on this category to replace them with source-backed data.${sourceNote}\n\n${cat.notes || ''}`;
          if (discoverySources.length > 0) {
            cat.researchSources = discoverySources;
          }
          onCategoryDiscovered(cat);
        }
      } catch (e: any) {
        log(`Agent encountered interference in [${sector}]: ${e.message}`);
      }
      updateProgress({ industriesTrawled: progress.industriesTrawled + 1 });
    }
  }

  updateProgress({ status: "Swarm operation aborted by user." });
  log(`Endless Swarm Terminated.`);
}

export async function extractCompanyFromImage(
  input: { imageData: string; mimeType: string; existingCategoryNames?: string[] },
  onProgress?: (status: string) => void
): Promise<{ categoryParams: Partial<Category>, rawResearch: string, sources: string[] } | null> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const go = async (params: any) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    const meta = (response as any).usageMetadata;
    const hasGrounding = Array.isArray(params.config?.tools) && params.config.tools.some((t: any) => 'googleSearch' in t);
    recordApiUsage(meta?.promptTokenCount ?? 0, meta?.candidatesTokenCount ?? 0, hasGrounding ? 1 : 0);
    return response;
  };
  const report = (msg: string) => onProgress?.(msg);

  // ─── PASS 1: Brand Identification + Full Website Scan ─────────────────────
  report('Pass 1/4 — Identifying brand & scanning full website...');

  const pass1Schema = {
    type: Type.OBJECT,
    properties: {
      companyName:     { type: Type.STRING },
      domain:          { type: Type.STRING },
      foundedYear:     { type: Type.STRING },
      headquarters:    { type: Type.STRING },
      companyType:     { type: Type.STRING, description: "e.g. DTC, SaaS, Marketplace, Agency" },
      productCatalog:  { type: Type.STRING, description: "Markdown list of all real products/SKUs found on website with ACTUAL prices exactly as shown. Never estimate." },
      pricingModel:    { type: Type.STRING, description: "Subscription tiers, one-time, bundles, freemium — describe exactly." },
      activeDiscounts: { type: Type.STRING, description: "Active promo codes, welcome offers, referral discounts found via search. Include code string if found." },
      returnPolicy:    { type: Type.STRING, description: "Summary of return/refund policy found on their site." },
      shippingInfo:    { type: Type.STRING, description: "Shipping costs, countries served, free shipping threshold." },
      categoryData: {
        type: Type.OBJECT,
        properties: {
          name:                     { type: Type.STRING },
          industry:                 { type: Type.STRING },
          targetAudience:           { type: Type.STRING },
          estimatedCLV:             { type: Type.NUMBER },
          estimatedCAC:             { type: Type.NUMBER },
          monthlyChurnPercent:      { type: Type.NUMBER },
          marketSizeNL:             { type: Type.STRING },
          marketSizeScore:          { type: Type.NUMBER },
          realMonthlyConsumption:   { type: Type.BOOLEAN },
          monthlyConsumptionReason: { type: Type.STRING },
          acquisitionDifficulty:    { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
          emotionalLoyalty:         { type: Type.STRING, enum: ["Low", "Medium", "High"] },
          storyDepth:               { type: Type.NUMBER },
          microNichePotential:      { type: Type.NUMBER },
          notes:                    { type: Type.STRING }
        },
        required: ["name"]
      },
      sources: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["companyName", "categoryData", "sources"]
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pass1Data: Record<string, any> = {};
  try {
    const res = await go({
      model: modelName,
      contents: [
        `You are an elite e-commerce intelligence analyst. Study this screenshot and identify the exact company or brand.

Then DEEPLY SEARCH their website and the web. Your job in this pass:
1. Confirm exact company name and domain URL.
2. Crawl their ENTIRE product catalog — list every real product/SKU with ACTUAL prices as shown on the website. Never estimate prices. If a price is behind login, write "Price not found — requires account".
3. Find ANY active discount codes, welcome offers, promo banners, or seasonal sales (search "[brand] promo code 2025", "[brand] discount code", "[brand] coupon").
4. Document their full pricing model (subscription tiers, one-time plans, bundles).
5. Find their return/refund policy and shipping terms.
6. Estimate CLV from actual prices × realistic order frequency — return 0 if no real data found. Estimate CAC return 0 if no real benchmark found via search.

ANTI-HALLUCINATION: Only return prices/products you actually found on their live website or search results. Never guess prices. All sources go in the sources array.

Match to an existing category if relevant: [${input.existingCategoryNames?.join(', ')}]`,
        { inlineData: { data: input.imageData, mimeType: input.mimeType } }
      ],
      config: { responseMimeType: "application/json", responseSchema: pass1Schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
    });
    pass1Data = JSON.parse(res.text?.trim() || '{}');
  } catch (e: any) {
    report(`Pass 1 error: ${e.message}`);
  }

  const companyName = pass1Data.companyName || 'Unknown Company';
  if (!pass1Data.categoryData?.name) return null;

  // ─── PASS 2: Founders & Team Intelligence ─────────────────────────────────
  report(`Pass 2/4 — Investigating founders & team of ${companyName}...`);

  const pass2Schema = {
    type: Type.OBJECT,
    properties: {
      founders:              { type: Type.STRING, description: "Full Markdown section. For EACH founder: full name, role, hometown/nationality, university & degree, career timeline, previous companies with exit values if known, how they started this company, LinkedIn URL (ONLY if retrieved via live search — never construct from name, write 'LinkedIn: [not retrieved via search]' if not found), Twitter/X handle, notable podcast appearances with show name and URL." },
      linkedinEmployeeCount: { type: Type.STRING, description: "Exact range shown on LinkedIn company page (e.g. '51-200 employees'), found via search. Write 'Not found via search' if unavailable." },
      keyHires:              { type: Type.STRING, description: "Notable C-suite/senior hires beyond founders with backgrounds. Only from search results." },
      techStack:             { type: Type.STRING, description: "Tech stack from BuiltWith data, Wappalyzer results, or job listing requirements found via search." },
      companyStory:          { type: Type.STRING, description: "Founding story, pivots, major milestones. Only facts traceable to a search result URL." },
      sources: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["founders", "sources"]
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pass2Data: Record<string, any> = {};
  try {
    const res = await go({
      model: modelName,
      contents: `You are an elite investigative journalist and talent scout. Research every person behind "${companyName}".

MANDATORY SEARCHES — run ALL of these:
- "${companyName} founder" — identify full name(s)
- site:linkedin.com/in/ "[founder name]" "${companyName}" — retrieve actual LinkedIn profile URL
- "${companyName} CEO interview" OR "${companyName} founder podcast" — podcast and media appearances
- "${companyName}" site:crunchbase.com — verify founders listed
- "${companyName} about us" OR "${companyName}/team" — leadership page
- site:linkedin.com/company/ "${companyName}" — LinkedIn company employee count
- "[founder name] before ${companyName}" OR "[founder name] previous company" — prior career
- "[founder name] exit" OR "[founder name] acquisition" — previous exits
- "${companyName}" site:stackshare.io OR "${companyName} tech stack" OR "${companyName} built with" — technology
- "${companyName}" job listings — infer team size and tech from open roles

ANTI-HALLUCINATION — non-negotiable:
- LinkedIn URL: ONLY include if you actually retrieved it from a search result in this session. Never construct from a name. If not found, write "LinkedIn: [not retrieved via search]".
- Employee count: only report the exact range LinkedIn shows. Never estimate.
- All facts must trace to a URL. Write "Not found via search" if unavailable.`,
      config: { responseMimeType: "application/json", responseSchema: pass2Schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
    });
    pass2Data = JSON.parse(res.text?.trim() || '{}');
  } catch (e: any) {
    report(`Pass 2 error: ${e.message}`);
  }

  // ─── PASS 3: Funding & Business Traction ──────────────────────────────────
  report(`Pass 3/4 — Tracking funding rounds & traction signals for ${companyName}...`);

  const pass3Schema = {
    type: Type.OBJECT,
    properties: {
      totalFundingAmount:  { type: Type.STRING, description: "Total capital raised (e.g. '$12.4M') with source URL. If bootstrapped or no data found, state explicitly." },
      fundingRounds:       { type: Type.STRING, description: "Markdown table: | Round | Amount | Date | Lead Investor(s) | Source URL |. Only rows verified via live search." },
      investors:           { type: Type.STRING, description: "All known investors (VCs, angels, strategics) with fund names, found via Crunchbase/news." },
      revenue:             { type: Type.STRING, description: "Any public revenue figure or ARR range from press/interviews/filings. Include source URL. Write 'No public revenue data found via search' if none." },
      trustpilotRating:    { type: Type.STRING, description: "Score and total review count from Trustpilot, found via search." },
      trustpilotUrl:       { type: Type.STRING },
      appStoreRating:      { type: Type.STRING, description: "iOS App Store or Google Play rating + review count if applicable." },
      monthlyWebTraffic:   { type: Type.STRING, description: "Monthly traffic estimate from SimilarWeb or SEMrush found via search." },
      customerCount:       { type: Type.STRING, description: "Any published subscriber/customer count from press or their own site." },
      awardsAccelerators:  { type: Type.STRING, description: "Inc 5000, YC batch, Techstars, industry awards found via search." },
      sources: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["sources"]
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pass3Data: Record<string, any> = {};
  try {
    const res = await go({
      model: modelName,
      contents: `You are a private equity due diligence analyst. Investigate the funding history and business traction of "${companyName}".

MANDATORY SEARCHES — run ALL of these:
- "${companyName}" site:crunchbase.com — funding rounds, investors, founding date
- "${companyName}" site:pitchbook.com — additional investment data
- "${companyName} funding" OR "${companyName} raises" OR "${companyName} series" — press coverage of rounds
- "${companyName} seed round" OR "${companyName} venture capital" — early stage funding
- "${companyName}" site:trustpilot.com — reviews and rating
- "${companyName}" site:apps.apple.com OR site:play.google.com — app rating if applicable
- "${companyName} revenue" OR "${companyName} ARR" OR "${companyName} annual revenue" — business metrics in press
- "${companyName} customers" OR "${companyName} subscribers" — any published count
- "${companyName}" site:similarweb.com OR "${companyName} monthly visits" — web traffic
- "${companyName} Y Combinator" OR "${companyName} accelerator" OR "${companyName} Inc 5000" — recognition
- "${companyName}" site:sec.gov — SEC filings if publicly traded or Reg-CF/Reg-A

ANTI-HALLUCINATION: Every figure must trace to a real URL from this session. If no funding found, write "No funding found via search — likely bootstrapped or undisclosed". Never invent investors, round sizes, or revenue.`,
      config: { responseMimeType: "application/json", responseSchema: pass3Schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
    });
    pass3Data = JSON.parse(res.text?.trim() || '{}');
  } catch (e: any) {
    report(`Pass 3 error: ${e.message}`);
  }

  // ─── PASS 4: PR, Social Media & Competitive Intelligence ──────────────────
  report(`Pass 4/4 — Scanning PR, social media & ads for ${companyName}...`);

  const pass4Schema = {
    type: Type.OBJECT,
    properties: {
      youtubeVideos:        { type: Type.STRING, description: "Markdown list of YouTube videos about/by this brand with exact titles and URLs found via search." },
      podcastFeatures:      { type: Type.STRING, description: "Podcast episodes featuring the brand or founders — show name, episode title, approximate date, URL." },
      pressArticles:        { type: Type.STRING, description: "Recent press articles with headline, publication, date, URL." },
      instagramPresence:    { type: Type.STRING, description: "Instagram handle and follower count found via search. Write 'Not found via search' if unavailable — never construct a handle." },
      tiktokPresence:       { type: Type.STRING, description: "TikTok handle and follower count found via search. Write 'Not found via search' if unavailable." },
      facebookAdsLibrary:   { type: Type.STRING, description: "Ad formats, copy themes, creative strategy found via Facebook Ads Library search." },
      redditMentions:       { type: Type.STRING, description: "Reddit threads discussing this brand — subreddit, thread title, sentiment, URL." },
      keyMarketingMessages: { type: Type.STRING, description: "Core claims and messaging found consistently across channels." },
      controversies:        { type: Type.STRING, description: "BBB complaints, negative press, or customer issues found via search. Factual and objective only." },
      sources: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["sources"]
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pass4Data: Record<string, any> = {};
  try {
    const res = await go({
      model: modelName,
      contents: `You are a brand intelligence analyst. Map the full public presence of "${companyName}".

MANDATORY SEARCHES — run ALL of these:
- site:youtube.com "${companyName}" — YouTube videos reviewing or featuring the brand
- "${companyName}" podcast episode OR interview — podcast appearances
- "${companyName}" site:techcrunch.com OR site:forbes.com OR site:businessinsider.com — major press
- "${companyName}" site:tweakers.net OR site:nrc.nl OR site:fd.nl — Dutch press if relevant
- "${companyName}" instagram followers — Instagram account and size
- "${companyName}" tiktok OR site:tiktok.com — TikTok presence
- site:facebook.com/ads/library "${companyName}" OR "${companyName}" facebook ads active — ad strategy
- site:reddit.com "${companyName}" — community discussions and sentiment
- "${companyName}" complaint OR "${companyName}" BBB OR "${companyName}" review negative — reputation
- "${companyName}" "promo code" OR "${companyName}" affiliate program — growth channels

ANTI-HALLUCINATION: Social handles must come from real search results. Never construct @handles. All facts must have source URLs. Write "Not found via search" for anything not confirmed.`,
      config: { responseMimeType: "application/json", responseSchema: pass4Schema, tools: [{ googleSearch: {} }], toolConfig: { includeServerSideToolInvocations: true } },
    });
    pass4Data = JSON.parse(res.text?.trim() || '{}');
  } catch (e: any) {
    report(`Pass 4 error: ${e.message}`);
  }

  report(`Compiling intelligence dossier for ${companyName}...`);

  const allSources = [...new Set([
    ...(pass1Data.sources || []),
    ...(pass2Data.sources || []),
    ...(pass3Data.sources || []),
    ...(pass4Data.sources || []),
  ])];

  const companyNotes = `# Company Intelligence Dossier: ${companyName}
> Generated: ${new Date().toISOString()} | ${allSources.length} sources verified via live search

---

## Company Overview
- **Name:** ${pass1Data.companyName || 'Unknown'}
- **Domain:** ${pass1Data.domain || 'Not found'}
- **Founded:** ${pass1Data.foundedYear || 'Not found'}
- **HQ:** ${pass1Data.headquarters || 'Not found'}
- **Type:** ${pass1Data.companyType || 'Not found'}

${pass2Data.companyStory ? `**Origin Story:**\n${pass2Data.companyStory}` : ''}

---

## Products & Pricing
${pass1Data.productCatalog || '_No product data extracted._'}

**Pricing Model:** ${pass1Data.pricingModel || 'Not found'}

**Active Discounts / Promo Codes:** ${pass1Data.activeDiscounts || 'None found via search'}

**Return Policy:** ${pass1Data.returnPolicy || 'Not found'}

**Shipping:** ${pass1Data.shippingInfo || 'Not found'}

---

## Founders & Team
${pass2Data.founders || '_No founder data found via search._'}

**LinkedIn Employee Count:** ${pass2Data.linkedinEmployeeCount || 'Not found via search'}

**Key Hires:** ${pass2Data.keyHires || 'Not found'}

**Tech Stack:** ${pass2Data.techStack || 'Not found'}

---

## Funding & Investors
**Total Funding:** ${pass3Data.totalFundingAmount || 'No funding found via search — likely bootstrapped or undisclosed'}

${pass3Data.fundingRounds ? `**Funding Rounds:**\n${pass3Data.fundingRounds}` : ''}

**Investors:** ${pass3Data.investors || 'Not found'}

---

## Business Traction
**Revenue:** ${pass3Data.revenue || 'No public revenue data found via search'}

**Trustpilot:** ${pass3Data.trustpilotRating || 'Not found'}${pass3Data.trustpilotUrl ? ` — [View](${pass3Data.trustpilotUrl})` : ''}

**App Store:** ${pass3Data.appStoreRating || 'N/A or not found'}

**Monthly Web Traffic:** ${pass3Data.monthlyWebTraffic || 'Not found'}

**Customer / Subscriber Count:** ${pass3Data.customerCount || 'Not publicly disclosed'}

**Awards & Accelerators:** ${pass3Data.awardsAccelerators || 'None found'}

---

## PR, Social & Media
**YouTube:** ${pass4Data.youtubeVideos || 'Not found'}

**Podcasts:** ${pass4Data.podcastFeatures || 'Not found'}

**Press:** ${pass4Data.pressArticles || 'Not found'}

**Instagram:** ${pass4Data.instagramPresence || 'Not found via search'}

**TikTok:** ${pass4Data.tiktokPresence || 'Not found via search'}

**Facebook Ads Library:** ${pass4Data.facebookAdsLibrary || 'Not found'}

**Reddit:** ${pass4Data.redditMentions || 'Not found'}

**Core Marketing Messages:** ${pass4Data.keyMarketingMessages || 'Not found'}

${pass4Data.controversies ? `**Complaints / Controversies:**\n${pass4Data.controversies}` : ''}

---

## Sources (${allSources.length} URLs from live search)
${allSources.map((s, i) => `${i + 1}. ${s}`).join('\n') || '_No sources captured._'}
`;

  return {
    categoryParams: {
      ...pass1Data.categoryData,
      notes: companyNotes,
      researchSources: allSources,
    },
    rawResearch: companyNotes,
    sources: allSources,
  };
}

export interface ExtractionRange {
  currentPage: number;  // 1-based first page to scan
  endPage: number;      // 1-based last page to scan (inclusive)
  totalPages: number;   // estimated total pages in document
}

export async function extractCategoriesFromText(input: { text?: string; fileData?: { mimeType: string; data: string }; existingCategoryNames?: string[]; range?: ExtractionRange }): Promise<Partial<Category>[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured. Add your key in Settings.");

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = async (params: any) => {
    checkBudget();
    const response = await retryWithBackoff(() => ai.models.generateContent(params));
    const meta = (response as any).usageMetadata;
    const hasGrounding = Array.isArray(params.config?.tools) && params.config.tools.some((t: any) => 'googleSearch' in t);
    recordApiUsage(meta?.promptTokenCount ?? 0, meta?.candidatesTokenCount ?? 0, hasGrounding ? 1 : 0);
    return response;
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      categories: {
        type: Type.ARRAY,
        description: "A list of e-commerce business categories extracted from the text.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the category" },
            industry: { type: Type.STRING, description: "The general industry or domain (e.g. Health & Wellness, Cosmetics, Pets, Tech, etc.)" },
            targetAudience: { type: Type.STRING, description: "Target audience description" },
            estimatedCLV: { type: Type.NUMBER },
            estimatedCAC: { type: Type.NUMBER },
            monthlyChurnPercent: { type: Type.NUMBER },
            marketSizeNL: { type: Type.STRING },
            marketSizeScore: { type: Type.NUMBER },
            storyDepth: { type: Type.NUMBER },
            microNichePotential: { type: Type.NUMBER },
            acquisitionDifficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" },
            emotionalLoyalty: { type: Type.STRING, description: "Low, Medium, or High" },
            notes: { type: Type.STRING, description: "Extract and summarize any existing research, competitors, metrics, or detailed notes mentioned in the text for this category." }
          },
          required: ["name", "targetAudience"]
        }
      }
    },
    required: ["categories"]
  };

  const existingInfo = input.existingCategoryNames && input.existingCategoryNames.length > 0
    ? `\n\nCRITICAL INSTRUCTION: You must skip and DO NOT EXTRACT the following categories because we already have them: ${input.existingCategoryNames.join(", ")}.\n\n`
    : "";

  const rangeInstruction = input.range
    ? `\n\nDOCUMENT SCANNING INSTRUCTION: This document has approximately ${input.range.totalPages} pages total.\nYOUR SCAN RANGE FOR THIS BATCH: Pages ${input.range.currentPage} to ${input.range.endPage} ONLY.\n- Navigate directly to page ${input.range.currentPage} and start reading from there.\n- Stop reading at page ${input.range.endPage}; do not extract content from any page beyond ${input.range.endPage}.\n- If you see content from earlier batches (pages before ${input.range.currentPage}), skip it.\nThis sequenced approach guarantees the full document is covered without overlap or gaps.`
    : '';

  const promptText = `Extract potential e-commerce or niche business categories from the following document or text. Format them neatly and estimate initial metrics (CLV, CAC, etc) for the Netherlands market if not explicitly stated. If the document contains existing research, competitors, specific metrics, or detailed notes about a category, extract all of that and include it in the 'notes' field.${existingInfo}${rangeInstruction}${input.text ? `\n\nText:\n\n${input.text.substring(0, 200000)}` : ''}`;

  const contents: any[] = [promptText];
  if (input.fileData) {
    contents.push({
      inlineData: input.fileData
    });
  }

  const response = await safeGenerate({
    model: modelName,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  try {
    const jsonStr = response.text?.trim() || '{"categories": []}';
    const result = JSON.parse(jsonStr);
    return result.categories || [];
  } catch (e) {
    console.error("Failed to parse extracted categories", e);
    return [];
  }
}
