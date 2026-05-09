import { Category, Weights } from './types';

export function calculateLtvCac(clv: number, cac: number): number {
  if (cac === 0) return 0;
  return Number((clv / cac).toFixed(2));
}

export function calculateDecisionScore(category: Category, weights: Weights, maxClv: number): number {
  // Normalize CLV
  const clvScore = maxClv > 0 ? (category.estimatedCLV / maxClv) * 100 : 0;
  
  // Retention (100 - churn %)
  const retentionScore = Math.max(0, 100 - category.monthlyChurnPercent);
  
  // Acquisition Difficulty
  let acqScore = 50;
  if (category.acquisitionDifficulty === 'Easy') acqScore = 100;
  if (category.acquisitionDifficulty === 'Hard') acqScore = 30; // 30 per user prompt: Hard=3
  // Actually user said: Easy=10, Medium=6, Hard=3. We scale to 100: Easy=100, Medium=60, Hard=30
  if (category.acquisitionDifficulty === 'Medium') acqScore = 60;

  // Emotional Loyalty
  let loyaltyScore = 50;
  if (category.emotionalLoyalty === 'High') loyaltyScore = 100;
  // User said: High=10, Medium=6, Low=3
  if (category.emotionalLoyalty === 'Medium') loyaltyScore = 60;
  if (category.emotionalLoyalty === 'Low') loyaltyScore = 30;

  const mktScore = category.marketSizeScore;

  const totalWeight = weights.clv + weights.retention + weights.acquisition + weights.marketSize + weights.loyalty;
  if (totalWeight === 0) return 0;

  const rawScore = (
    (clvScore * weights.clv) +
    (retentionScore * weights.retention) +
    (acqScore * weights.acquisition) +
    (mktScore * weights.marketSize) +
    (loyaltyScore * weights.loyalty)
  ) / totalWeight;

  return Math.round(rawScore * 10) / 10;
}

export function getMacroSector(industry: string = ''): string {
  const str = industry.toLowerCase();
  
  if (str.match(/sleep|supplement|health|wellness|biohack|longevity|fitness|workout|nutrition|diet|vitamin|mushroom/)) return "Health, Wellness & Biohacking";
  if (str.match(/beauty|cosmetic|skin|hair|perfume|makeup|anti-aging/)) return "Beauty & Personal Care";
  if (str.match(/pet|dog|cat|bird|aquarium|equine|vet/)) return "Pets & Animals";
  if (str.match(/home|cleaning|smart home|furniture|decor|garden|kitchen/)) return "Home & Environment";
  if (str.match(/apparel|fashion|clothing|shoe|wearable|jewelry|watch/)) return "Apparel & Accessories";
  if (str.match(/tech|gadget|electronics|software|app|saas|digital/)) return "Tech & Digital Services";
  if (str.match(/food|beverage|snack|coffee|tea|drink|pantry|grocer/)) return "Food & Beverage";
  if (str.match(/kid|baby|toddler|toy|parenting/)) return "Kids & Maternity";
  if (str.match(/b2b|prosumer|education|course|tool|business|office/)) return "Prosumer & B2B";
  if (str.match(/finance|fintech|investing|crypto/)) return "Finance & Wealth";
  
  return "Miscellaneous & Niche";
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
