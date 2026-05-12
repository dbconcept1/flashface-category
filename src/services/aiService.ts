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
    searchTrends: { status: AgentStatus; detail: string };
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
    searchTrends: { status: 'pending', detail: 'Waiting to start...' },
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

  // ─── Two-pass helpers ───────────────────────────────────────────────────────
  // Gemini does not allow responseMimeType:"application/json" + googleSearch together.
  // Pass 1 uses googleSearch (plain text output).
  // Pass 2 extracts structured data from that text (JSON schema, no search tools).

  const searchRaw = async (prompt: string): Promise<string> => {
    const resp = await safeGenerate({
      model: modelName,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    return resp.text?.trim() || '';
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractJson = async <T>(rawText: string, schema: any, hint: string): Promise<T> => {
    const resp = await safeGenerate({
      model: modelName,
      contents: `${hint}\n\n---RESEARCH TEXT START---\n${rawText.slice(0, 30000)}\n---RESEARCH TEXT END---`,
      config: { responseMimeType: 'application/json', responseSchema: schema },
    });
    return JSON.parse(resp.text?.trim() || '{}') as T;
  };
  // ───────────────────────────────────────────────────────────────────────────

  updateProgress({ overall: `Launching 7 autonomous agents for ${category.name}...` });

  const runUnitEconomicsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('unitEconomics', 'running', 'Searching pricing, LTV, CAC models on Reddit & scientific sources...');
    try {
      // Pass 1: grounded search → plain text
      const raw = await searchRaw(`You are an expert e-commerce unit economics analyst. Deeply research the Customer Lifetime Value (CLV, in Euros) and Customer Acquisition Cost (CAC, in Euros) for the category: "${category.name}" targeting "${category.targetAudience}". Focus entirely on realistic European/NL metrics.
        ANTI-HALLUCINATION: Every CLV/CAC figure MUST be backed by a real URL found via search. Return 0 for any metric you cannot source. Cite every URL used.

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

        Keep CLV and CAC completely separate. Return a comprehensive breakdown with inline source citations.`);
      // Pass 2: extract numeric fields from the research text
      const extracted = await extractJson<{ estimatedCLV: number; estimatedCAC: number }>(
        raw,
        { type: Type.OBJECT, properties: { estimatedCLV: { type: Type.NUMBER }, estimatedCAC: { type: Type.NUMBER } }, required: ['estimatedCLV', 'estimatedCAC'] },
        `From the research report below extract the estimated Customer Lifetime Value (CLV in Euros) and Customer Acquisition Cost (CAC in Euros). Return 0 for any value not clearly stated.`
      );
      updateAgent('unitEconomics', 'completed', 'Unit economics finalized.');
      return { result: { estimatedCLV: extracted.estimatedCLV, estimatedCAC: extracted.estimatedCAC }, raw, sources: [] };
    } catch (e: any) {
      updateAgent('unitEconomics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runMarketDynamicsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('marketDynamics', 'running', 'Analyzing global & NL market sizes, churn, and CAGR...');
    try {
      // Pass 1: grounded search → plain text
      const raw = await searchRaw(`You are a European Consumer Market Researcher specialising in bottom-up market sizing for the Netherlands.
CATEGORY: "${category.name}" | TARGET: "${category.targetAudience}"

Research market size (global/EU/NL), CAGR, monthly churn %, and compute a realistic TAM→SAM→SOM funnel for NL.

FUNNEL RULES: Start from largest countable NL population. Apply filters one at a time — each step must show the filter, % reduction, source URL, and remaining count. TAM = outer boundary, SAM = reachable, SOM = realistic buyers.

MANDATORY SEARCHES:
- "${category.name}" market size global EU Netherlands 2024 2025
- "${category.name}" "CAGR" OR "compound annual growth" subscription 2025 2026
- "${category.name}" subscription monthly churn benchmark
- "${category.name}" CBS.nl OR KVK Netherlands market data
- "${category.name}" TAM SAM SOM Netherlands consumer market
- "${category.name}" emotional loyalty brand retention study
- "${category.name}" micro-niche DTC opportunity 2025 2026

ANTI-HALLUCINATION: Every figure must cite a real URL. Write "Unknown (no source found)" for unverifiable data.
Return comprehensive markdown covering market size, churn, CAGR, consumer psychology, and the full funnel.`);

      // Pass 2: extract structured fields
      const extractSchema = {
        type: Type.OBJECT,
        properties: {
          monthlyChurnPercent: { type: Type.NUMBER },
          cagr: { type: Type.STRING },
          marketSizeGlobal: { type: Type.STRING },
          marketSizeEU: { type: Type.STRING },
          marketSizeNL: { type: Type.STRING },
          audienceSizeNL: { type: Type.STRING },
          tamNL: { type: Type.NUMBER },
          samNL: { type: Type.NUMBER },
          somNL: { type: Type.NUMBER },
          funnelBreakdownNL: { type: Type.STRING },
          marketSizeScore: { type: Type.NUMBER },
          realMonthlyConsumption: { type: Type.BOOLEAN },
          monthlyConsumptionReason: { type: Type.STRING },
          acquisitionDifficulty: { type: Type.STRING },
          emotionalLoyalty: { type: Type.STRING },
          storyDepth: { type: Type.NUMBER },
          microNichePotential: { type: Type.NUMBER },
        },
        required: ["monthlyChurnPercent", "marketSizeNL", "tamNL", "samNL", "somNL", "marketSizeScore", "realMonthlyConsumption", "acquisitionDifficulty", "emotionalLoyalty", "storyDepth", "microNichePotential"]
      };
      const extracted = await extractJson<Record<string, any>>(
        raw, extractSchema,
        `From the market research report below, extract all structured market data fields. Use 0 for missing numbers, "Unknown" for missing strings, and false for missing booleans.`
      );
      updateAgent('marketDynamics', 'completed', 'Market dynamics mapped.');
      return { result: extracted, raw, sources: [] };
    } catch (e: any) {
      updateAgent('marketDynamics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runLocalCompetitorsAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('localCompetitors', 'running', 'Spying on local NL/EU players...');
    try {
      const raw = await searchRaw(`You are a competitive intelligence operative. Search for and list local competitors in the Netherlands (or broader EU) selling: "${category.name}" to "${category.targetAudience}".

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

        For each of 2-4 real competitors: company name, URL, monthly traffic estimate (SimilarWeb), pricing, Trustpilot score, positioning angle, and key gap/weakness to exploit.`);
      updateAgent('localCompetitors', 'completed', 'Local competition analyzed.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('localCompetitors', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runGlobalCompetitorsAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('globalCompetitors', 'running', 'Scanning US/Global pioneers...');
    try {
      const raw = await searchRaw(`You are a 2026 DTC trend analyst and global competitive intelligence specialist. Research the most successful global players for: "${category.name}" targeting "${category.targetAudience}".

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

        Identify what makes the top 1-2 global players successful: exact growth channels, retention mechanics, product diff, unit economics.`);
      updateAgent('globalCompetitors', 'completed', 'Global benchmarks identified.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('globalCompetitors', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runLegalLogisticsAgent = async (): Promise<{ result: Partial<Category>, raw: string, sources: string[] }> => {
    updateAgent('legalLogistics', 'running', 'Checking NL legal & ad restrictions...');
    try {
      // Pass 1: grounded search
      const raw = await searchRaw(`You are a Dutch Legal and E-commerce Compliance Expert. Analyze the category: "${category.name}" for the Netherlands market. Is it legal? Does it require special licenses? Is it a restricted ad category on Meta/Google?
        ANTI-HALLUCINATION: Only cite legal requirements found via search on official sources (overheid.nl, autoriteitpersoonsgegevens.nl, reclame.code.nl). Write "Unverified — consult a Dutch e-commerce lawyer" for anything not verified.`);
      // Pass 2: extract structured fields
      const extracted = await extractJson<{ regulatoryRiskNL: string; legalAndAdRestrictions: string }>(
        raw,
        { type: Type.OBJECT, properties: { regulatoryRiskNL: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] }, legalAndAdRestrictions: { type: Type.STRING } }, required: ['regulatoryRiskNL', 'legalAndAdRestrictions'] },
        `From the legal research report below, extract: regulatoryRiskNL (must be exactly Low/Medium/High) and legalAndAdRestrictions (a summary of legal and ad restrictions in the Netherlands).`
      );
      updateAgent('legalLogistics', 'completed', 'Legal and compliance checked.');
      return { result: { regulatoryRiskNL: extracted.regulatoryRiskNL as any, legalAndAdRestrictions: extracted.legalAndAdRestrictions }, raw, sources: [] };
    } catch (e: any) {
      updateAgent('legalLogistics', 'error', e.message);
      return { result: {}, raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runSuppliersBudgetAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('suppliersBudget', 'running', 'Checking suppliers and startup budget...');
    try {
      const raw = await searchRaw(`You are a scrappy e-commerce founder and supply chain expert. For the category: "${category.name}", map every realistic supply chain option and startup cost for an NL-based DTC subscription launch.

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

        Provide: real supplier names, MOQ, unit cost, estimated COGs%, and a full MVP budget breakdown from €0 to 100 subscribers in NL.`);
      updateAgent('suppliersBudget', 'completed', 'Suppliers and budget analyzed.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('suppliersBudget', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runAdIntelligenceAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('adIntelligence', 'running', 'Scanning Meta/TikTok ad library, CPM benchmarks, creative hooks...');
    try {
      const raw = await searchRaw(`You are a 2026 DTC performance marketing specialist. Research the full paid media landscape for: "${category.name}" targeting "${category.targetAudience}" in the Netherlands.

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

Return a comprehensive paid-media intelligence report covering: channel CAC breakdown table, Meta/TikTok/Google tactics, influencer/UGC strategy, 2026-specific opportunities, and creative hooks. ANTI-HALLUCINATION: All CPM/CPC/ROAS/CAC figures must trace to a real source URL from this session.`);
      updateAgent('adIntelligence', 'completed', 'Ad intelligence mapped.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('adIntelligence', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runRetentionEngineeringAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('retentionEngineering', 'running', 'Mapping cohort retention, churn drivers, subscription term economics...');
    try {
      const raw = await searchRaw(`You are a subscription retention engineer and DTC growth expert. Research cohort economics and retention for: "${category.name}" targeting "${category.targetAudience}".

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
- "${category.name}" cancellation survey top reasons

Return a full retention engineering report covering: retention benchmarks table, churn drivers, subscription term economics, win-back playbook, dunning defense, referral/loyalty uplift, and 2026 tactics. ANTI-HALLUCINATION: Cite real source URLs from this session.`);
      updateAgent('retentionEngineering', 'completed', 'Retention engineering report complete.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('retentionEngineering', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runFoundersTeamAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('foundersAndTeam', 'running', 'Discovering founders and linkedIn profiles...');
    try {
      const raw = await searchRaw(`You are an elite talent scout and investigative journalist. Find the founders or key people of the top 3 companies in the category: "${category.name}".
        ANTI-HALLUCINATION RULE FOR LINKEDIN URLS: Only include a LinkedIn URL if actually retrieved via Google Search in this session. If not found via search, write "LinkedIn: [not found in search]" instead of guessing.
        METHOD: Search site:linkedin.com/in/ "[Founder Name]" "[Company]", also search for podcast transcripts, news articles, Crunchbase profiles, and previous exits. Only include facts traceable to a real search result. Return factual bios in Markdown.`);
      updateAgent('foundersAndTeam', 'completed', 'Founders identified.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('foundersAndTeam', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  const runSearchTrendsAgent = async (): Promise<{ raw: string, sources: string[] }> => {
    updateAgent('searchTrends', 'running', 'Fetching Google Trends data (EN + NL)...');
    try {
      const raw = await searchRaw(`You are a Google Trends data analyst and market intelligence expert. Retrieve and interpret REAL, LIVE Google Trends data for: "${category.name}".

MANDATORY SEARCHES:
1. https://trends.google.com/trends/explore?q=${encodeURIComponent(category.name)}&geo=NL
2. https://trends.google.com/trends/explore?q=${encodeURIComponent(category.name)}
3. "${category.name}" Google Trends interest over time Netherlands 2024 2025
4. "${category.name}" Dutch translation search trends NL
5. "${category.name}" seasonal search peaks Netherlands Belgium 2024
6. "${category.name}" vs "protein powder" vs "yoga mat" Google Trends comparison
7. "${category.name}" rising related queries Netherlands breakout

Google Trends scores are RELATIVE (0-100). Always compare to anchor categories (protein powder ~70, yoga mat ~55, pet food ~80, coffee subscription ~25) for context.

Return a comprehensive markdown report covering: interest scores (NL + global), trend direction (12 months), YoY comparison, seasonal patterns, rising queries, Dutch-specific terms, geographic distribution, and launch timing recommendations.

ANTI-HALLUCINATION: Only return scores retrieved from real searches. Write "[score not retrieved]" if data not accessible.`);
      updateAgent('searchTrends', 'completed', 'Search trends data retrieved.');
      return { raw, sources: [] };
    } catch (e: any) {
      updateAgent('searchTrends', 'error', e.message);
      return { raw: `Error: ${e.message}`, sources: [] };
    }
  };

  // Run all 10 agents simultaneously — retryWithBackoff auto-retries any rate-limit errors
  updateProgress({ overall: 'Launching all 10 agents simultaneously...' });
  const [
    unitEcon, marketDyn, legalLog, localNotes,
    globalNotes, suppliersBudget, adIntel,
    foundersAndTeam, retentionEng, searchTrends
  ] = await Promise.all([
    runUnitEconomicsAgent(),
    runMarketDynamicsAgent(),
    runLegalLogisticsAgent(),
    runLocalCompetitorsAgent(),
    runGlobalCompetitorsAgent(),
    runSuppliersBudgetAgent(),
    runAdIntelligenceAgent(),
    runFoundersTeamAgent(),
    runRetentionEngineeringAgent(),
    runSearchTrendsAgent(),
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
    ...(searchTrends.sources || []),
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
       searchTrends: searchTrends.raw,
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
    },
    required: ["sectors"]
  };

  const categorySchema = {
    type: Type.OBJECT,
    properties: {
      categories: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            targetAudience: { type: Type.STRING },
            estimatedCLV: { type: Type.NUMBER },
            estimatedCAC: { type: Type.NUMBER },
            monthlyChurnPercent: { type: Type.NUMBER },
            marketSizeNL: { type: Type.STRING },
            audienceSizeNL: { type: Type.STRING },
            marketSizeScore: { type: Type.NUMBER },
            storyDepth: { type: Type.NUMBER },
            microNichePotential: { type: Type.NUMBER },
            acquisitionDifficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
            emotionalLoyalty: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            realMonthlyConsumption: { type: Type.BOOLEAN },
            monthlyConsumptionReason: { type: Type.STRING },
            notes: { type: Type.STRING },
            sources: { type: Type.ARRAY, items: { type: Type.STRING } }
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
    // Pass ALL existing names to the model — category names are short strings (~30 chars each)
    // so even 500 names is only ~15KB, trivial vs. the 1M-token context window.
    // Capping at 60 (old behaviour) caused the primary bug: the model re-discovered
    // older categories not in the avoid list, and handleImport correctly deduped them
    // → 0 net additions per cycle after the first ~60 categories were found.
    const avoidNames = existingCategoryNames;
    log(`Syncing bounds: avoiding ${existingCategoryNames.length} known categories & ${searchedSectors.size} exhausted sectors.`);

    // ── Step 1: Generate next wave of sectors via grounded JSON ──────────────
    // Single call: JSON schema + Google Search together via toolConfig.
    // This avoids a fragile text-parse + JSON fallback pattern.
    updateProgress({ status: "Generating next wave of consumer sectors..." });

    let sectors: string[] = [];
    try {
      // Cap to last 40 to prevent the prompt from ballooning as the set grows
      // into hundreds of entries and confusing the model on subsequent cycles.
      const avoidedSectorsText = searchedSectors.size > 0
        ? `DO NOT SUGGEST THESE SECTORS (already mapped): ${Array.from(searchedSectors).slice(-40).join(", ")}.`
        : "";

      // Pass 1 — grounded text search: confirm real DTC businesses per sector.
      // NOTE: responseMimeType + responseSchema are INCOMPATIBLE with googleSearch
      // in a single call. We must do two separate calls.
      const sectorRawResp = await safeGenerate({
        model: modelName,
        contents: `You are an endless private-equity sector mapper. Search the web to verify each sector has real, operating DTC subscription businesses before listing it.

Research and describe 8 DISTINCT consumer product sectors where subscription/high-loyalty DTC models are viable and proven.
VARIETY RULE: Rotate across drastically different areas — Beauty, Pet care, Baby products, Vitamins/supplements, Home goods, Wearables, Coffee/food, Skincare, Fitness, Men's grooming, Women's health, Gaming accessories, Office products, Cleaning products, Sleep aids, Oral care, Kids education, Hobby crafts — never cluster in one theme.
${avoidedSectorsText}

For each sector provide: the sector name, and at least one real named DTC business currently operating in it. Use plain text, no JSON.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      if (signal.aborted) return;

      const sectorRawText = sectorRawResp.text?.trim() || '';
      log(`Sector research complete. Extracting structured list...`);

      // Pass 2 — JSON extraction from the grounded text (no search tools).
      const sectorExtractResp = await safeGenerate({
        model: modelName,
        contents: `From the following research text, extract exactly 8 distinct consumer sector names and return them as JSON with a "sectors" array of strings. Only the sector name — no descriptions.\n\nResearch:\n${sectorRawText.slice(0, 20000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: sectorSchema
        }
      });
      if (signal.aborted) return;

      sectors = JSON.parse(sectorExtractResp.text?.trim() || '{}').sectors || [];
      // Guard: remove any sectors the model returned despite the avoid instruction.
      // Without this, the model can loop forever on the same 8 sectors while
      // handleImport correctly deduplicates every discovery → 0 net additions.
      const alreadySearched = Array.from(searchedSectors).map(s => s.toLowerCase());
      const freshSectors = sectors.filter((s: string) => !alreadySearched.includes(s.toLowerCase()));
      if (freshSectors.length < sectors.length) {
        log(`Filtered ${sectors.length - freshSectors.length} already-searched sectors returned by model.`);
      }
      sectors = freshSectors;
      log(`Mapped ${sectors.length} new sectors via grounded search.`);
      updateProgress({ totalIndustries: progress.totalIndustries + sectors.length });
    } catch (e: any) {
      log(`Sector mapping error: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (!sectors || sectors.length === 0) {
      // If all generated sectors are already mapped, trim the oldest half of the
      // searched set so the model can re-explore from fresh angles rather than
      // spinning forever with an ever-growing exclude list.
      if (searchedSectors.size > 20) {
        const arr = Array.from(searchedSectors);
        searchedSectors = new Set(arr.slice(-15)); // keep only the 15 most recent
        log(`All sectors exhausted — pruned explore-set to last 15 to unblock new directions.`);
      } else {
        log("No new sectors found this cycle. Re-calibrating...");
      }
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    updateProgress({ status: "Hunting inside targeted sectors..." });

    // ── Step 2: Per-sector discovery — single grounded JSON call ─────────────
    // KEY FIX: We use JSON schema + Google Search in ONE call (toolConfig).
    // Previously: Pass 1 searched (text) → Pass 2 extracted (JSON, no search)
    // Problem: Pass 2 couldn't find URLs in the text → sources always empty →
    //          filter "require non-empty sources" killed ALL categories.
    // Fix: Grounding populates sources in real-time during the structured call.
    for (const sector of sectors) {
      if (signal.aborted) return;
      searchedSectors.add(sector);
      log(`Deploying Agent into sector: [${sector}]...`);

      try {
        const avoidList = avoidNames.length > 0
          ? `CATEGORIES WE ALREADY TRACK (do not suggest these or anything clearly identical): ${avoidNames.join(", ")}.`
          : "";

        // Pass 1 — grounded text research for this sector.
        // Cannot combine responseMimeType/responseSchema with googleSearch — two-pass required.
        const catRawResp = await safeGenerate({
          model: modelName,
          contents: `${userPrompt}

${avoidList}

YOUR MISSION: Deep-dive into the consumer sector: "${sector}".
Search for 3 to 6 HYPER-SPECIFIC, profitable micro-categories within this sector that meet the evaluation criteria above.

ANTI-HALLUCINATION RULES (non-negotiable):
1. ONLY report on categories with at least ONE real, named, currently-operating business confirmed by search.
2. If you cannot find a real business via search, DO NOT include that category.
3. For each category describe: the real business name(s) found, why this micro-niche is distinct, and any benchmarks for CLV/CAC/churn if you find them.
4. List any source URLs you accessed during this search.

Write plain text — no JSON yet. Just thorough research notes.`,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });
        if (signal.aborted) return;

        const catRawText = catRawResp.text?.trim() || '';

        // Capture grounding URLs from Pass 1 metadata before Pass 2 discards them.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const catChunks: any[] = (catRawResp as any).candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const groundingUrls: string[] = catChunks
          .map((c: any) => c?.web?.uri)
          .filter((u: any) => typeof u === 'string' && u.startsWith('http'))
          .slice(0, 8);

        log(`Sector research done for [${sector}]. Extracting structured categories...`);

        // Pass 2 — JSON extraction from the grounded text (no search tools).
        const catExtractResp = await safeGenerate({
          model: modelName,
          contents: `From the following research notes about the "${sector}" consumer sector, extract structured DTC category data and return a JSON object with a "categories" array. Each category needs at minimum a non-empty "name" and "targetAudience". For numeric fields use 0 if not found in the research.\n\nRESEARCH NOTES:\n${catRawText.slice(0, 30000)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: categorySchema
          }
        });
        if (signal.aborted) return;

        const data = JSON.parse(catExtractResp.text?.trim() || "{}");
        const found: any[] = data.categories || [];

        // Filter: must have a name. Sources are populated by grounding — no hard filter.
        // (The old hard sources-filter was the main cause of zero output.)
        const valid = found.filter(c => typeof c.name === 'string' && c.name.trim().length > 2);
        log(`Agent found ${valid.length} valid categories in [${sector}] (${found.length - valid.length} had no name).`);

        for (const cat of valid) {
          if (signal.aborted) return;
          cat.industry = sector;
          cat.status = 'Researching';
          // Merge grounding URLs from Pass 1 with any URLs the model put in sources.
          const discoverySources: string[] = [...new Set([...(cat.sources || []), ...groundingUrls])];
          const sourceNote = discoverySources.length > 0
            ? `\nDiscovery sources: ${discoverySources.join(', ')}`
            : '\n⚠️ No source URLs captured — run Deep Research to validate all estimates.';
          cat.notes = `[DISCOVERY SWARM — ${new Date().toISOString()}]\n⚠️ INITIAL ESTIMATES ONLY — CLV, CAC, churn %, market size are unvalidated. Run Deep Research to replace with source-backed data.${sourceNote}\n\n${cat.notes || ''}`;
          if (discoverySources.length > 0) {
            cat.researchSources = discoverySources;
          }
          onCategoryDiscovered(cat);
        }
      } catch (e: any) {
        log(`Agent error in [${sector}]: ${e.message}`);
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
      config: { responseMimeType: "application/json", responseSchema: pass1Schema },
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
      config: { tools: [{ googleSearch: {} }] },
    });
    const pass2Res = await go({
      model: modelName,
      contents: `Extract structured founders/team data about "${companyName}" from this research:\n\n---START---\n${(res.text?.trim() || '').slice(0, 30000)}\n---END---`,
      config: { responseMimeType: "application/json", responseSchema: pass2Schema },
    });
    pass2Data = JSON.parse(pass2Res.text?.trim() || '{}');
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
      config: { tools: [{ googleSearch: {} }] },
    });
    const pass3Res = await go({
      model: modelName,
      contents: `Extract structured funding and traction data about "${companyName}" from this research:\n\n---START---\n${(res.text?.trim() || '').slice(0, 30000)}\n---END---`,
      config: { responseMimeType: "application/json", responseSchema: pass3Schema },
    });
    pass3Data = JSON.parse(pass3Res.text?.trim() || '{}');
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
      config: { tools: [{ googleSearch: {} }] },
    });
    const pass4Res = await go({
      model: modelName,
      contents: `Extract structured PR, social media, and competitive data about "${companyName}" from this research:\n\n---START---\n${(res.text?.trim() || '').slice(0, 30000)}\n---END---`,
      config: { responseMimeType: "application/json", responseSchema: pass4Schema },
    });
    pass4Data = JSON.parse(pass4Res.text?.trim() || '{}');
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
