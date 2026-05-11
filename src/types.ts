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
  createdAt: string;
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
