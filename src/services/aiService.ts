import { GoogleGenAI, Type } from "@google/genai";
import { Category } from "../types";

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
  };
}

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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable. Please configure it in the platform.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = (params: any) => retryWithBackoff(() => ai.models.generateContent(params));
  
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
        METHOD: Keep CLV and CAC completely separate in your logic. Search for "CAC [category name] e-commerce", "CLV [category name] subscription", site:reddit.com/r/marketing, filetype:pdf industry reports. Return a comprehensive breakdown with inline source citations.`,
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
        markdownReport: { type: Type.STRING, description: "Detailed Markdown report showing market size, CAGR, trends." },
        monthlyChurnPercent: { type: Type.NUMBER, description: "Estimated monthly churn percentage (0-100)" },
        cagr: { type: Type.STRING, description: "Estimated CAGR percentage over next 5 years" },
        marketSizeGlobal: { type: Type.STRING, description: "Total Global Market Size" },
        marketSizeEU: { type: Type.STRING, description: "Total European Market Size" },
        marketSizeNL: { type: Type.STRING, description: "Total NL Market Size / Value" },
        audienceSizeNL: { type: Type.STRING, description: "Highly realistic exact number of people in NL qualified. E.g. '15,000 users'" },
        marketSizeScore: { type: Type.NUMBER, description: "Score from 1 to 10" },
        realMonthlyConsumption: { type: Type.BOOLEAN },
        monthlyConsumptionReason: { type: Type.STRING },
        acquisitionDifficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" },
        emotionalLoyalty: { type: Type.STRING, description: "Low, Medium, or High" },
        storyDepth: { type: Type.NUMBER, description: "Score from 1 to 10" },
        microNichePotential: { type: Type.NUMBER, description: "Score from 1 to 10" },
        sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of URLs or report names used for this research" }
      },
      required: ["markdownReport", "monthlyChurnPercent", "marketSizeGlobal", "marketSizeEU", "marketSizeNL", "audienceSizeNL", "marketSizeScore", "realMonthlyConsumption", "monthlyConsumptionReason", "acquisitionDifficulty", "emotionalLoyalty", "storyDepth", "microNichePotential", "sources"]
    };
    try {
      const response = await safeGenerate({
        model: modelName,
        contents: `You are a European Consumer Market Researcher. Analyze the market for "${category.name}" targeted at "${category.targetAudience}". Provide a clear breakdown of market size globally, across Europe, and specifically in the Netherlands (NL). 
        ANTI-HALLUCINATION RULES: (1) Every market size figure MUST cite a real source URL found via search. (2) If a figure cannot be sourced, return "Unknown (no source found)" — never fabricate a number. (3) Populate the sources array with every URL used — mandatory.
        AUDIENCE SIZE: You MUST compute a strict TAM→SAM→SOM funnel for NL. Show each filter step: [Total NL 18M] → [Correct Age/Gender bracket from CBS.nl data] → [Online/e-commerce penetration for that bracket] → [% actually experiencing the specific problem]. Never skip steps. If CBS or government data is unavailable for a step, state that explicitly.
        Focus on strict market size, realistic churn rates, consumer psychology (emotional loyalty, story depth), and niche potential. Return a detailed markdown report with your full TAM/SAM/SOM funnel, all fields, and sources list.`,
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
        contents: `You are a competitive intelligence operative. Search for and list local competitors in the Netherlands (or broader EU) selling: "${category.name}" to "${category.targetAudience}". Provide a bulleted list of 2-4 competitors, their estimated scale/traffic, pricing strategy, and positioning. Keep it intensely actionable. 
        CRITICAL: Use advanced Google Search tricks (e.g. "intitle:review [competitor]"). Look for real companies. No placeholder names. Check real reviews and exact features. Return Markdown text and the sources you found.`,
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
        contents: `You are a trend-spotter. Research the most successful global or US benchmarks/competitors for the category: "${category.name}" targeting "${category.targetAudience}". Identify exactly what makes the top 1 or 2 players globally successful. 
        CRITICAL: Extract real breakdowns from X, LinkedIn, Reddit, or podcast transcripts (use Google Search with "transcript [company name]"). Identify exact stack and positioning. Return Markdown text and sources.`,
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
        contents: `You are a scrappy e-commerce founder and supply chain expert. For the category: "${category.name}", find out who the realistic suppliers are. Can we dropship it? How realistic is it to get this started on a very tight budget? What exactly is needed to launch the MVP? 
        CRITICAL: Search Reddit (/r/Entrepreneur, /r/dropship), supplier hubs, and use Google Dorks (e.g. site:alibaba.com). Give real numbers and supplier names. Return Markdown text and sources.`,
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

  updateProgress({ overall: 'Running Global Competitors + Suppliers & Budget in parallel...' });
  const [globalNotes, suppliersBudget] = await Promise.all([
    runGlobalCompetitorsAgent(),
    runSuppliersBudgetAgent(),
  ]);

  updateProgress({ overall: 'Running Founders & Team...' });
  const foundersAndTeam = await runFoundersTeamAgent();

  updateProgress({ overall: 'Merging intelligence reports...' });

  const allSources = [
    ...(unitEcon.sources || []),
    ...(marketDyn.sources || []),
    ...(legalLog.sources || []),
    ...(localNotes.sources || []),
    ...(globalNotes.sources || []),
    ...(suppliersBudget.sources || []),
    ...(foundersAndTeam.sources || [])
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeGenerate = (params: any) => retryWithBackoff(() => ai.models.generateContent(params));

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

        const response = await ai.models.generateContent({
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = "gemini-2.5-flash";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const go = (params: any) => retryWithBackoff(() => ai.models.generateContent(params));
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable. Please configure it in the platform.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = "gemini-2.5-flash";

  
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

  const response = await ai.models.generateContent({
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
