export type CategoryStatus = 'Researching' | 'Shortlisted' | 'Killed' | 'Winner';
export type AcquisitionDifficulty = 'Easy' | 'Medium' | 'Hard';
export type EmotionalLoyalty = 'Low' | 'Medium' | 'High';
export type BrandType = 'Solution-based' | 'Aesthetic-Pleasure';
export type AwarenessLevel = 'Unaware' | 'Problem-aware' | 'Solution-aware' | 'Product-aware';

export interface Category {
  id: string;
  name: string;
  industry?: string;
  targetAudience: string;
  realMonthlyConsumption: boolean;
  monthlyConsumptionReason: string;
  estimatedCLV: number;
  estimatedCAC: number;
  monthlyChurnPercent: number;
  marketSizeNL: string;
  marketSizeGlobal?: string;
  marketSizeEU?: string;
  audienceSizeNL?: string;
  /** TAM: total count of entities in NL that could ever be your customer */
  tamNL?: number;
  /** SAM: count after realistic reachability filters (social, digital, geography) */
  samNL?: number;
  /** SOM: count that can realistically buy given budget, need, and awareness */
  somNL?: number;
  /** Step-by-step funnel breakdown as readable text (each filter with source) */
  funnelBreakdownNL?: string;
  regulatoryRiskNL?: 'Low' | 'Medium' | 'High';
  legalAndAdRestrictions?: string;
  marketSizeScore: number;
  acquisitionDifficulty: AcquisitionDifficulty;
  emotionalLoyalty: EmotionalLoyalty;
  storyDepth: number;
  brandType: BrandType;
  microNichePotential: number;
  awarenessLevel: AwarenessLevel;
  status: CategoryStatus;
  lastUpdated: string;
  notionIdea?: string;
  cagr?: string;
  agentResults?: {
    unitEconomics?: string;
    marketDynamics?: string;
    localCompetitors?: string;
    globalCompetitors?: string;
    legalLogistics?: string;
    suppliersBudget?: string;
    foundersAndTeam?: string;
    adIntelligence?: string;
    retentionEngineering?: string;
    searchTrends?: string;
  };
  notes: string;
  researchSources?: string[];
}

export interface Weights {
  clv: number;
  retention: number;
  acquisition: number;
  marketSize: number;
  loyalty: number;
  storyDepth: number;
  microNiche: number;
}

// ─── Intel Brain ─────────────────────────────────────────────────────────────

export type IntelSourceType = 'Thought' | 'Podcast' | 'Article' | 'Data' | 'Competitor' | 'Market';

/**
 * A single AI-extracted data point from a note.
 * Types:
 *   metric     — a number with a unit (e.g. "LTV:CAC = 4.2x")
 *   principle  — a business rule or mental model
 *   competitor — intel about a specific brand/company
 *   market     — market size, trend, or audience insight
 *   tactic     — an actionable approach or growth tactic
 */
export interface AIInsight {
  type: 'metric' | 'principle' | 'competitor' | 'market' | 'tactic';
  text: string;
  /** Numeric value, if the insight contains a measurable number. */
  value?: number;
  /** Unit for the value: 'EUR', '%', 'x', 'months', etc. */
  unit?: string;
}

export interface IntelNote {
  id: string;
  title: string;
  content: string;
  source: IntelSourceType;
  tags: string[];
  /** AI-extracted insights (populated by enrichment, optional). */
  aiInsights?: AIInsight[];
  /** ISO timestamp of last AI enrichment run. */
  enrichedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Brand Tracker ────────────────────────────────────────────────────────────

export type BrandStatus = 'researching' | 'complete' | 'error';

/**
 * A brand being tracked for competitive and category intelligence.
 * Populated by AI research from brandService.ts.
 * If linkedCategoryId is set, this brand has been promoted to a Category entry.
 */
export interface TrackedBrand {
  id: string;
  name: string;
  /** Brand website URL (user-provided, optional). */
  url?: string;
  /** Raw user description or notes when the brand was added. */
  userDescription?: string;
  status: BrandStatus;
  error?: string;
  // ── AI-populated fields (all optional until research completes) ───────────
  /** Specific product category detected (e.g. "Pet Food Subscription"). */
  detectedCategory?: string;
  /** Broader industry (e.g. "Pet Care"). */
  detectedIndustry?: string;
  /** How the brand makes money. */
  businessModel?: string;
  /** Specific audience description. */
  targetAudience?: string;
  /** Typical price (e.g. "€29-49/month"). */
  pricePoint?: string;
  /** Estimated Customer Lifetime Value in EUR. */
  estimatedCLV?: number;
  /** Estimated Customer Acquisition Cost in EUR. */
  estimatedCAC?: number;
  /** Main marketing channels (e.g. ["Instagram", "TikTok", "Google Ads"]). */
  adChannels?: string[];
  /** Competitive advantages. */
  keyStrengths?: string[];
  /** Vulnerabilities or market gaps. */
  weaknesses?: string[];
  /** One sentence: why this brand matters. */
  coreInsight?: string;
  /** Full brand intel report (3-4 paragraphs). */
  aiSummary?: string;
  /** Set when user promotes this brand to a Category entry. */
  linkedCategoryId?: string;
  /** ID of a CompanyProfile in this app linked to this brand. */
  linkedCompanyId?: string;
  /** When true, a weekly auto-research run is triggered on app load if overdue. */
  scheduledUpdate?: boolean;
  /** ISO timestamp of last completed AI research run. */
  lastResearched?: string;
  /** Meta Ads Library page name/ID for direct deep-link. */
  metaAdsPageId?: string;
  /** Quick-summary of what changed in the latest scheduled research vs previous. */
  latestDelta?: string;
  createdAt: string;
}

// ─── Brain OS ─────────────────────────────────────────────────────────────────

/**
 * Entry type — what kind of knowledge this is.
 * Controls how it's formatted when compiled into the GPT system prompt.
 */
export type BrainEntryType =
  | 'principle'  // A core belief or rule you operate by
  | 'quote'      // A quote that shaped your thinking
  | 'brand'      // A brand you admire — what you take from it
  | 'founder'    // A founder you study — what you apply
  | 'insight'    // A market or business insight you've validated
  | 'rule'       // A hard rule (NEVER do / ALWAYS do)
  | 'process'    // A process, framework, or method you follow
  | 'note';      // Free-form thought or reference

/**
 * Priority tier: determines whether this entry is included in GPT context.
 *   core      = ALWAYS injected into every chat (max ~60 entries)
 *   reference = Compiled into a searchable appendix injected into every chat
 *   archived  = Stored only — never injected
 */
export type BrainPriority = 'core' | 'reference' | 'archived';

/**
 * Confidence level:
 *   verified  — backed by cited sources (URLs, named studies, real data)
 *   strong    — based on repeated direct experience or widely-known principle
 *   belief    — personal conviction, not independently verified
 *
 * GPT receives the confidence level and calibrates uncertainty accordingly:
 *   verified → "According to operator's verified research…"
 *   belief   → "Operator believes (not independently verified) that…"
 */
export type BrainConfidence = 'verified' | 'strong' | 'belief';

export interface BrainEntry {
  id: string;
  type: BrainEntryType;
  title: string;
  /** Main content — the knowledge itself. */
  content: string;
  /** Where it came from: URL, book, person, podcast, etc. */
  source?: string;
  /** Source URLs used to verify this entry (populated by Search enrichment). */
  verifiedSources?: string[];
  /** ISO timestamp of last Gemini Search enrichment run. */
  verifiedAt?: string;
  /**
   * What this means for YOUR specific decisions and actions.
   * This is what GPT reads first — it must be actionable.
   */
  implication: string;
  tags: string[];
  priority: BrainPriority;
  /**
   * Confidence level — how certain is this knowledge?
   * GPT uses this to frame its responses appropriately.
   */
  confidence: BrainConfidence;
  createdAt: string;
  updatedAt: string;
}

// ─── Saved Conversations ──────────────────────────────────────────────────────

/**
 * A single chat message (user or AI).
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A complete saved conversation with metadata.
 * Stored permanently — never auto-deleted.
 * The brainSnapshot records what brain entries were active at the time.
 */
export interface BrainConversation {
  id: string;
  /** Auto-generated from first user message (first 80 chars). */
  title: string;
  messages: ConversationMessage[];
  /** Which AI model was used for this conversation. */
  model: string;
  /** ISO date of first message. */
  createdAt: string;
  /** ISO date of last message (updated on each reply). */
  updatedAt: string;
  /** Count of brain entries (core + reference) active at conversation start. */
  brainEntryCount: number;
}

// ─── Podcast Intel ────────────────────────────────────────────────────────────

/**
 * A DTC founder/podcaster being tracked for ongoing intelligence.
 * The agent scans for their latest YouTube episodes and extracts insights.
 */
export interface FounderPodcast {
  id: string;
  founderName: string;
  /** YouTube @handle, channel name, or search phrase (e.g. "@TheDiaryOfACEO") */
  channelQuery: string;
  /** Why this founder is being tracked */
  description?: string;
  createdAt: string;
  lastScanned?: string;
  /** ID of a FounderProfile in this app linked to this podcast founder. */
  linkedFounderProfileId?: string;
}

/**
 * A single YouTube podcast episode fetched and (optionally) extracted by AI.
 */
export interface PodcastEpisode {
  id: string;
  founderId: string;
  founderName: string;
  title: string;
  youtubeUrl: string;
  publishDate?: string;
  processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  summary?: string;
  keyTactics?: string[];
  keyMetrics?: string[];
  businessInsights?: string[];
  /** Names of tracked categories this episode is most relevant to */
  relevantCategories?: string[];
  /** Full structured markdown intelligence report */
  fullReport?: string;
  sources?: string[];
  extractedAt?: string;
  createdAt: string;
}

// ─── Company Intelligence Profiles ───────────────────────────────────────────

/**
 * Type of intel entry inside a company profile.
 * Maps to icons + colour coding in the UI.
 */
export type IntelEntryType =
  | 'note'      // generic text note
  | 'ad'        // screenshot/description of an ad
  | 'meeting'   // notes from a meeting / conversation
  | 'product'   // new product launch or feature
  | 'press'     // press release / article
  | 'funding'   // fundraising, valuation, revenue numbers
  | 'campaign'  // marketing campaign or promo
  | 'social'    // social post / viral content
  | 'general';  // catch-all

/**
 * A single piece of intelligence dropped into a company profile.
 * Can be text, an image (base64), or both.
 */
export interface IntelEntry {
  id: string;
  type: IntelEntryType;
  /** Main text content — free-form, any length. */
  content: string;
  /** Base64 data-URL of a pasted/dropped image (jpeg compressed). */
  imageDataUrl?: string;
  imageCaption?: string;
  /** Source URL, article link, person name, or meeting context. */
  source?: string;
  addedAt: string;
}

/**
 * AI-powered weekly reputation snapshot for a company.
 * Stores Trustpilot, Reddit, LinkedIn, legal, and Glassdoor data.
 */
export interface CompanyReviewScan {
  /** Trustpilot rating out of 5.0 */
  trustpilotScore?: number;
  /** Total number of Trustpilot reviews */
  trustpilotTotal?: number;
  trustpilotUrl?: string;
  /** 1-2 sentences: what customers love vs hate */
  trustpilotSentiment?: string;
  /** 2-3 verbatim review snippets (mix positive + negative) */
  trustpilotSample?: string[];
  /** Overall Reddit sentiment in 1-2 sentences */
  redditSentiment?: string;
  /** 2-3 notable Reddit quotes or thread summaries */
  redditSample?: string[];
  /** Up to 4 recent LinkedIn company posts/announcements */
  linkedinUpdates?: string[];
  /** Any lawsuits, class actions, regulatory fines, FTC/GDPR issues */
  legalFlags?: string[];
  /** Glassdoor employer rating out of 5.0 */
  glassdoorRating?: number;
  /** 2-3 sentence synthesis of overall public perception */
  overallReputation?: string;
  scannedAt: string;
}

/**
 * A long-lived intelligence dossier for a specific company.
 * Grows over time as entries are added. AI synthesises everything
 * into a master brief that can be regenerated on demand.
 */
export interface CompanyProfile {
  id: string;
  name: string;
  url?: string;
  industry?: string;
  /** Optional short description / positioning note. */
  description?: string;
  entries: IntelEntry[];
  /** AI-synthesised master brief — regenerated with "Refresh Brief". */
  aiMasterBrief?: string;
  /** ISO timestamp of last brief generation. */
  briefUpdatedAt?: string;
  /** Meta Ads Library page ID/name for direct deep-link. */
  metaAdsPageId?: string;
  linkedCategoryId?: string;
  linkedBrandId?: string;
  /** Latest AI reputation scan (Trustpilot, Reddit, LinkedIn, legal). */
  reviewScan?: CompanyReviewScan;
  /** When true, a weekly auto-scan runs on app load if overdue. */
  scheduledScan?: boolean;
  /** ISO timestamp of last completed reputation scan. */
  lastScanned?: string;
  /** IDs of FounderProfile entries linked to this company. */
  linkedFounderIds?: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Founder Profiles ─────────────────────────────────────────────────────────

/**
 * An entrepreneur or operator being tracked over time.
 * Links to company profiles and builds an intelligence dossier.
 */
export interface FounderProfile {
  id: string;
  name: string;
  linkedinUrl?: string;
  /** Direct URL to a photo (optional — UI shows initials if absent). */
  photoUrl?: string;
  currentCompany?: string;
  currentRole?: string;
  /** Previous companies built or led. */
  pastCompanies?: string[];
  /** IDs of CompanyProfile entries in this app linked to this founder. */
  linkedCompanyIds?: string[];
  /** Free-form intel notes. */
  notes: string;
  /** AI-extracted career/pattern facts. */
  keyInsights?: string[];
  /** AI-generated 2-3 paragraph founder assessment. */
  aiSummary?: string;
  summaryUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type IdeaStatus = 'raw' | 'exploring' | 'decided' | 'killed';
export type IdeaTag =
  | 'strategy' | 'product' | 'creative' | 'marketing'
  | 'operations' | 'tech' | 'brand' | 'content' | 'other';

// ─── Intel Radar ──────────────────────────────────────────────────────────────

/** Supported target regions for radar scans. */
export type RadarRegion = 'NL' | 'IE' | 'FR' | 'DE' | 'US' | 'BR' | 'OTHER';

/** How a hidden investor built or stores their capital. */
export type RadarInvestorType =
  | 'angel'          // Individual angel investor
  | 'family-office'  // Family office / generational wealth
  | 'operator'       // Industry operator with capital to deploy
  | 'exit-founder'   // Built and exited a company, now investing quietly
  | 'hnwi'           // High-net-worth individual, source varied
  | 'unknown';

/**
 * A scaling company discovered by the Intel Radar that has NOT yet been
 * covered prominently by major tech/business press.
 */
export interface RadarCompany {
  id: string;
  companyName: string;
  websiteUrl?: string;
  /** ISO country code or full country name. */
  country: string;
  region: RadarRegion;
  industry: string;
  /** 1-2 sentence description of what they do and who they serve. */
  description: string;
  foundedYear?: string;
  /** Revenue range if signal found, e.g. "$1M–$5M ARR". */
  estimatedRevenue?: string;
  /** Approximate headcount, e.g. "11–50". */
  employeeCount?: string;
  /** Bootstrapped / Pre-seed / Seed / Series A / Unknown */
  fundingStatus?: string;
  /** Concrete, verifiable evidence items — each ends with a source URL. */
  growthSignals: string[];
  /** Why this company hasn't been featured in mainstream press yet. */
  whyNotFamous: string;
  founderName?: string;
  /**
   * Ready-to-paste Google search query to find the founder on LinkedIn.
   * Format: "Firstname Lastname" "CompanyName" site:linkedin.com/in
   */
  founderLinkedinSearch?: string;
  /**
   * Ready-to-paste Google search query to find the company on LinkedIn.
   * Format: "CompanyName" site:linkedin.com/company
   */
  linkedinSearchQuery: string;
  sources: string[];
  // ── Promotion state (filled when user promotes to existing modules) ─────────
  linkedCompanyId?: string;
  linkedFounderId?: string;
  linkedCategoryId?: string;
  linkedBrainEntryId?: string;
  scannedAt: string;
  createdAt: string;
}

/**
 * A hidden investor discovered by the Intel Radar — someone with real capital
 * who is NOT on mainstream investor lists, not a named VC partner, and rarely
 * covered by tech press.
 */
export interface RadarInvestor {
  id: string;
  fullName: string;
  /** ISO country code or full country name. */
  country: string;
  region: RadarRegion;
  investorType: RadarInvestorType;
  /** What they tend to back: sector, stage, geography. */
  investmentFocus: string;
  /** 2-3 sentences: how they built or inherited their wealth. */
  background: string;
  /** The specific signal(s) that indicate they have capital to invest. */
  evidenceOfCapital: string;
  /** Evidence-based estimate, e.g. "€250k–€1M per deal". */
  estimatedCapacity?: string;
  /**
   * EXACT Google search to find their LinkedIn profile — ready to paste.
   * Format: "Full Name" site:linkedin.com/in OR "Full Name" "Company" investor
   */
  linkedinSearchQuery: string;
  /** Direct LinkedIn URL if found during scan. */
  linkedinUrl?: string;
  /** How to best approach this person for a first connection / conversation. */
  connectionApproach: string;
  /** Why they don't appear on Midas List, AngelList spotlight, or VC directories. */
  whyHidden: string;
  sources: string[];
  // ── Promotion state ──────────────────────────────────────────────────────────
  linkedFounderId?: string;
  linkedBrainEntryId?: string;
  scannedAt: string;
  createdAt: string;
}

/**
 * A single idea — can be a category exploration, creative brief,
 * product concept, or anything else worth capturing.
 */
export interface Idea {
  id: string;
  title: string;
  description: string;
  tags: IdeaTag[];
  status: IdeaStatus;
  linkedCategoryId?: string;
  aiExpansion?: string;
  expansionGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export interface FinanceScenario {
  id: string;
  name: string;
  pricePerUnit: number;
  unitsPerMonth: number;
  cogsPct: number;
  cacEur: number;
  monthlyChurnPct: number;
  fixedMonthlyCosts: number;
  createdAt: string;
}
