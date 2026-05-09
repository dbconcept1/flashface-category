import { Category, Weights } from './types';

export function calculateLtvCac(clv: number, cac: number): number {
  if (cac === 0) return 0;
  return Number((clv / cac).toFixed(2));
}

export function calculateDecisionScore(category: Category, weights: Weights, maxClv: number): number {
  // Normalize CLV relative to the best in the dataset
  const clvScore = maxClv > 0 ? (category.estimatedCLV / maxClv) * 100 : 0;
  
  // Retention (100 - churn %)
  const retentionScore = Math.max(0, 100 - category.monthlyChurnPercent);
  
  // Acquisition Difficulty: Easy=100, Medium=60, Hard=30
  let acqScore = 60;
  if (category.acquisitionDifficulty === 'Easy') acqScore = 100;
  if (category.acquisitionDifficulty === 'Medium') acqScore = 60;
  if (category.acquisitionDifficulty === 'Hard') acqScore = 30;

  // Emotional Loyalty: High=100, Medium=60, Low=30
  let loyaltyScore = 60;
  if (category.emotionalLoyalty === 'High') loyaltyScore = 100;
  if (category.emotionalLoyalty === 'Medium') loyaltyScore = 60;
  if (category.emotionalLoyalty === 'Low') loyaltyScore = 30;

  // Market size score (0-100 manual rating)
  const mktScore = category.marketSizeScore;

  // Story depth & micro-niche (0–10 scale → 0–100)
  const storyScore = Math.min(100, (category.storyDepth || 0) * 10);
  const nicheScore = Math.min(100, (category.microNichePotential || 0) * 10);

  // Solution-based brands have historically stronger retention — 5% score bonus
  const brandMultiplier = category.brandType === 'Solution-based' ? 1.05 : 1.0;

  const totalWeight =
    weights.clv + weights.retention + weights.acquisition +
    weights.marketSize + weights.loyalty + weights.storyDepth + weights.microNiche;
  if (totalWeight === 0) return 0;

  const rawScore = (
    (clvScore    * weights.clv) +
    (retentionScore * weights.retention) +
    (acqScore    * weights.acquisition) +
    (mktScore    * weights.marketSize) +
    (loyaltyScore * weights.loyalty) +
    (storyScore  * weights.storyDepth) +
    (nicheScore  * weights.microNiche)
  ) / totalWeight;

  return Math.round(rawScore * brandMultiplier * 10) / 10;
}

export function getMacroSector(industry: string = ''): string {
  const str = industry.toLowerCase();

  if (str.match(/gaming|esport|game console|streamer|twitch|video game/)) return "Gaming & Entertainment";
  if (str.match(/sport(?!swear)|athlet|cycling|tennis|golf|surf|ski(?!n)|swim|runner|martial|crossfit|yoga(?! wear)/)) return "Sports & Athletics";
  if (str.match(/travel|tourism|holiday|vacation|luggage|suitcase|expat|nomad/)) return "Travel & Lifestyle";
  if (str.match(/sleep|supplement|health|wellness|biohack|longevity|fitness|workout|nutrition|diet|vitamin|mushroom|yoga|meditation/)) return "Health, Wellness & Biohacking";
  if (str.match(/beauty|cosmetic|skin|hair|perfume|makeup|anti-aging|grooming/)) return "Beauty & Personal Care";
  if (str.match(/pet|dog|cat|bird|aquarium|equine|vet/)) return "Pets & Animals";
  if (str.match(/home|cleaning|smart home|furniture|decor|garden|kitchen/)) return "Home & Environment";
  if (str.match(/apparel|fashion|clothing|shoe|wearable|jewelry|watch/)) return "Apparel & Accessories";
  if (str.match(/tech|gadget|electronics|software|app|saas|digital/)) return "Tech & Digital Services";
  if (str.match(/food|beverage|snack|coffee|tea|drink|pantry|grocer/)) return "Food & Beverage";
  if (str.match(/kid|baby|toddler|toy|parenting/)) return "Kids & Maternity";
  if (str.match(/b2b|prosumer|education|course|tool|business|office/)) return "Prosumer & B2B";
  if (str.match(/finance|fintech|investing|crypto|insurance|mortgage|wealth|tax/)) return "Finance & Wealth";
  
  return "Miscellaneous & Niche";
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
