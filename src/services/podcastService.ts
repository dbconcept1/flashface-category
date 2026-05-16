import { GoogleGenAI, Type } from "@google/genai";
import type { FounderPodcast, PodcastEpisode, BrainEntry } from "../types";
import { getApiKey, checkBudget, recordGeminiUsageFromResponse } from "../lib/settings";
import { compileDirectivePrompt } from "../lib/directives";

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

type DiscoveredEpisode = Pick<PodcastEpisode,
  'founderId' | 'founderName' | 'title' | 'youtubeUrl' | 'publishDate' | 'sources'
>;

/**
 * Scans YouTube for the latest podcast episodes from a founder.
 * Uses Google Search grounding to find real youtube.com/watch?v= URLs.
 */
export async function discoverFounderEpisodes(
  founder: FounderPodcast,
  existingUrls: Set<string>,
  onStatus: (msg: string) => void,
  brainEntries: BrainEntry[] = []
): Promise<DiscoveredEpisode[]> {
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
      feature: 'podcast-intel',
      operation,
      entityType: 'founder',
      entityName: founder.founderName,
    });
    return response;
  };

  const episodeSchema = {
    type: Type.OBJECT,
    properties: {
      episodes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title:       { type: Type.STRING, description: "Exact video title as shown on YouTube" },
            youtubeUrl:  { type: Type.STRING, description: "Full https://www.youtube.com/watch?v=VIDEO_ID URL" },
            publishDate: { type: Type.STRING, description: "Approximate publish date: YYYY-MM-DD or 'Month YYYY'" },
          },
          required: ["title", "youtubeUrl"]
        }
      }
    },
    required: ["episodes"]
  };

  onStatus(`Searching YouTube for latest episodes from ${founder.founderName}...`);

  const intelDirectiveBlock = compileDirectivePrompt(brainEntries, 'intel');

  // Pass 1: grounded search — raw text only (cannot combine schema + search in one call)
  const searchResponse = await safeGenerate({
    model: modelName,
    contents: `${intelDirectiveBlock}Search for the 6 most recent YouTube podcast episodes featuring or hosted by: "${founder.founderName}".
Channel / search hint: ${founder.channelQuery}

Run ALL of these searches and list every episode you find:
1. site:youtube.com "${founder.founderName}" podcast 2025
2. "${founder.founderName}" "${founder.channelQuery}" youtube latest episode
3. "${founder.founderName}" podcast DTC ecommerce interview 2024 2025

For each episode, write:
- Title: <exact YouTube title>
- URL: <full https://www.youtube.com/watch?v=VIDEO_ID>
- Date: <approximate publish date>

Rules: real watch URLs only (no /shorts/, no playlists). Never guess or create video IDs.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  }, 'discover-episodes-grounded-search');

  const rawSearchText = searchResponse.text?.trim() || '';
  onStatus(`Extracting episode list...`);

  // Pass 2: JSON extraction from raw search text
  const extractResponse = await safeGenerate({
    model: modelName,
    contents: `Extract YouTube podcast episodes from the search results below.
Only include episodes where "${founder.founderName}" actually appears (as guest or host).
Only include standard youtube.com/watch?v=... URLs.

SEARCH RESULTS:
${rawSearchText.slice(0, 25000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: episodeSchema,
    }
  }, 'discover-episodes-json-extraction');

  const data = JSON.parse(extractResponse.text?.trim() || '{}');
  const results: DiscoveredEpisode[] = [];

  for (const ep of (data.episodes || [])) {
    if (!ep.youtubeUrl || !ep.title) continue;
    // Normalize: must be a standard watch URL
    const url: string = ep.youtubeUrl;
    if (!url.includes('youtube.com/watch?v=') && !url.includes('youtu.be/')) continue;
    // Expand short URLs
    const normalizedUrl = url.includes('youtu.be/')
      ? `https://www.youtube.com/watch?v=${url.split('youtu.be/')[1]?.split('?')[0]}`
      : url.split('&')[0]; // strip playlist params
    if (existingUrls.has(normalizedUrl)) continue;

    results.push({
      founderId: founder.id,
      founderName: founder.founderName,
      title: ep.title,
      youtubeUrl: normalizedUrl,
      publishDate: ep.publishDate,
      sources: [normalizedUrl],
    });
  }

  return results;
}

/**
 * Extracts DTC business intelligence from a YouTube episode.
 *
 * PRIMARY path: Gemini's native YouTube video understanding — pass the URL as
 * fileData and Gemini watches/transcribes the video directly. No 3rd party
 * transcription service needed.
 *
 * FALLBACK: If video processing fails (private video, unavailable, quota) —
 * fall back to Google Search to find transcript snippets, show notes, and
 * summaries, then extract from that.
 */
export async function extractEpisodeInsights(
  episode: PodcastEpisode,
  categoryNames: string[],
  onStatus: (msg: string) => void,
  brainEntries: BrainEntry[] = []
): Promise<Partial<PodcastEpisode>> {
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
      feature: 'podcast-intel',
      operation,
      entityType: 'podcast-episode',
      entityName: episode.title,
    });
    return response;
  };

  const insightSchema = {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "2-3 sentence overview of the episode's core DTC business topic"
      },
      keyTactics: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Specific actionable tactics mentioned. Each item is 1 sentence."
      },
      keyMetrics: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Every number, KPI, or benchmark mentioned: LTV, CAC, churn %, revenue, ROAS, growth rates, conversion rates. Format: 'Metric: value (context)'"
      },
      businessInsights: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Strategic principles, mental models, and broader business insights. Each item is 1 sentence."
      },
      relevantCategories: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: `From this exact list, which categories does this episode have relevant insights for? Only pick categories that are actually discussed: ${categoryNames.slice(0, 40).join(', ')}`
      },
      fullReport: {
        type: Type.STRING,
        description: "Full structured markdown report, 400-800 words. Use ## headers for sections. Include direct quotes where possible."
      }
    },
    required: ["summary", "keyTactics", "keyMetrics", "businessInsights", "fullReport"]
  };

  const extractionPrompt = `${compileDirectivePrompt(brainEntries, 'intel')}You are a DTC subscription business intelligence analyst. Extract maximum actionable value from this podcast for a DTC brand builder.

Podcast: "${episode.title}" by ${episode.founderName}

EXTRACT:
1. Every specific TACTIC mentioned (growth hacks, retention plays, acquisition strategies, product decisions)
2. Every NUMBER mentioned (LTV, CAC, churn, MRR, ARR, ROAS, conversion rates, audience sizes, growth percentages) — be precise, include context
3. Core BUSINESS PRINCIPLES and mental models
4. SUBSCRIPTION-SPECIFIC insights (pricing, packaging, trial offers, cancellation flows, win-backs)
5. NETHERLANDS / EUROPE specific insights if mentioned
6. Which product categories from our portfolio this knowledge applies to

Be specific. Capture exact quotes where impactful. This goes into a permanent business intelligence database.`;

  onStatus(`Processing: "${episode.title.slice(0, 60)}${episode.title.length > 60 ? '...' : ''}"`);

  // ── Primary: Gemini native YouTube video processing ───────────────────────
  // Gemini 2.5 Flash can watch YouTube videos directly via fileData URI.
  // This gives access to the full audio transcript without any 3rd party service.
  try {
    const response = await safeGenerate({
      model: modelName,
      contents: [
        { fileData: { mimeType: "video/*", fileUri: episode.youtubeUrl } },
        extractionPrompt
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: insightSchema,
      }
    }, 'extract-insights-video');

    const data = JSON.parse(response.text?.trim() || '{}');
    onStatus('Extraction complete.');
    return {
      summary: data.summary || '',
      keyTactics: data.keyTactics || [],
      keyMetrics: data.keyMetrics || [],
      businessInsights: data.businessInsights || [],
      relevantCategories: (data.relevantCategories || []).filter((c: string) => categoryNames.includes(c)),
      fullReport: data.fullReport || '',
      sources: [episode.youtubeUrl],
      extractedAt: new Date().toISOString(),
    };
  } catch (videoErr: any) {
    // ── Fallback: search-based extraction ────────────────────────────────────
    // Video unavailable, private, or quota exceeded → use Google Search to find
    // show notes, transcript snippets, published summaries, and extract from those.
    onStatus(`Direct video processing unavailable. Using search-based fallback...`);

    // Fallback Pass 1: search for episode content
    const fallbackSearch = await safeGenerate({
      model: modelName,
      contents: `Find and summarize this DTC podcast episode.

Episode: "${episode.title}" by ${episode.founderName}
YouTube: ${episode.youtubeUrl}

Search for:
1. "${episode.founderName}" "${episode.title}" transcript OR "show notes"
2. "${episode.founderName}" "${episode.title.slice(0, 40)}" key takeaways
3. "${episode.founderName}" podcast business tactics DTC ecommerce

${extractionPrompt}`,
      config: {
        tools: [{ googleSearch: {} }],
      }
    }, 'extract-insights-fallback-grounded-search');

    const fallbackRaw = fallbackSearch.text?.trim() || '';

    // Fallback Pass 2: extract structured JSON
    const fallbackResponse = await safeGenerate({
      model: modelName,
      contents: `Extract the DTC business intelligence from the research below.

RESEARCH:
${fallbackRaw.slice(0, 25000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: insightSchema,
      }
    }, 'extract-insights-fallback-json');

    const data = JSON.parse(fallbackResponse.text?.trim() || '{}');
    onStatus('Extraction complete (search fallback).');
    return {
      summary: data.summary || '',
      keyTactics: data.keyTactics || [],
      keyMetrics: data.keyMetrics || [],
      businessInsights: data.businessInsights || [],
      relevantCategories: (data.relevantCategories || []).filter((c: string) => categoryNames.includes(c)),
      fullReport: data.fullReport
        ? `> ⚠️ Extracted via search fallback (direct video unavailable: ${videoErr.message?.slice(0, 60)})\n\n${data.fullReport}`
        : '',
      sources: [episode.youtubeUrl],
      extractedAt: new Date().toISOString(),
    };
  }
}
