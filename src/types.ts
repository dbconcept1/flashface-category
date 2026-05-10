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
