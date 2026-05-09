import { useState } from 'react';
import { Category, Weights, CategoryStatus } from '../types';
import { calculateDecisionScore, calculateLtvCac, cn } from '../utils';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
}

export function ComparisonView({ categories, weights, maxClv }: Props) {
  const [filter, setFilter] = useState<CategoryStatus | 'All'>('All');

  const selectedCategories = categories
    .filter(c => filter === 'All' ? c.status !== 'Killed' : c.status === filter)
    .map(c => ({
      ...c,
      score: calculateDecisionScore(c, weights, maxClv),
      ltvCac: calculateLtvCac(c.estimatedCLV, c.estimatedCAC)
    }))
    .sort((a, b) => b.score - a.score);

  if (selectedCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-900 border border-gray-800 rounded-lg">
        <p className="text-gray-400 font-mono text-sm max-w-sm text-center">
          No categories match the current filter.
        </p>
      </div>
    );
  }

  const scores = selectedCategories.map(c => c.score);
  const ltvCacs = selectedCategories.map(c => c.ltvCac);
  const clvs = selectedCategories.map(c => c.estimatedCLV);
  const cacs = selectedCategories.map(c => c.estimatedCAC);
  const churns = selectedCategories.map(c => c.monthlyChurnPercent);

  const isBest = (val: number, arr: number[], higherIsBetter = true) => higherIsBetter ? val === Math.max(...arr) : val === Math.min(...arr);
  const isWorst = (val: number, arr: number[], higherIsBetter = true) => higherIsBetter ? val === Math.min(...arr) : val === Math.max(...arr);

  const getHeatmapClass = (val: number, arr: number[], higherIsBetter = true) => {
    if (isBest(val, arr, higherIsBetter)) return "bg-emerald-500/10 text-emerald-400 font-bold border-emerald-500/30";
    if (isWorst(val, arr, higherIsBetter)) return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    return "text-gray-300 border-transparent";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Executive Decision Matrix</h2>
          <p className="text-sm text-gray-400">High-density "One Lens" comparison across all metrics.</p>
        </div>
        <select 
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="All">All Active Categories</option>
          <option value="Researching">Researching</option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Winner">Winner</option>
        </select>
      </div>

      <div className="bg-[#111111] border border-gray-800 shadow-2xl rounded-xl overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-900 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-widest font-mono">
              <th className="py-4 px-4 sticky left-0 z-20 bg-gray-900 shadow-[4px_0_12px_rgba(0,0,0,0.5)] border-r border-gray-800 cursor-help" title="The business category name">Category</th>
              <th className="py-4 px-4 cursor-help" title="Score = (LTV:CAC ratio + Relative CLV + Market Size + Retention) multiplied by Qualitative Factors (Acquisition Difficulty, Brand Loyalty, Story Depth, etc).">Score</th>
              <th className="py-4 px-4 cursor-help" title="Customer Lifetime Value divided by Customer Acquisition Cost. Healthy is >3x. 0 often means not enough sources found.">LTV:CAC</th>
              <th className="py-4 px-4 cursor-help" title="Estimated Customer Lifetime Value in Euros. Calculated from recurring purchases or high initial ticket size.">Est. CLV</th>
              <th className="py-4 px-4 cursor-help" title="Estimated Customer Acquisition Cost in Euros. Expected cost to acquire one buying user.">Est. CAC</th>
              <th className="py-4 px-4 cursor-help" title="Estimated Monthly Churn Percentage. Lower is better. 0% may indicate a lack of sources or one-off purchases.">Churn</th>
              <th className="py-4 px-4 cursor-help" title="Compound Annual Growth Rate">CAGR</th>
              <th className="py-4 px-4 cursor-help" title="Global Market Size">Global Mkt</th>
              <th className="py-4 px-4 cursor-help" title="European Union Market Size">EU Mkt</th>
              <th className="py-4 px-4 cursor-help" title="Netherlands Market Size">NL Mkt</th>
              <th className="py-4 px-4 cursor-help" title="Regulatory Risk in the NL. Low is better.">Reg. Risk</th>
              <th className="py-4 px-4 cursor-help" title="Estimated difficulty of user acquisition.">Acq. Diff</th>
              <th className="py-4 px-4 cursor-help" title="Estimated loyalty level of customers in this market.">Loyalty</th>
              <th className="py-4 px-4 cursor-help" title="Micro-niche popularity scale (1-10)">Niche Pop</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {selectedCategories.map(c => (
              <tr key={c.id} className="group hover:bg-gray-800/30 transition-colors">
                <td className="py-3 px-4 font-bold text-white sticky left-0 z-10 bg-[#111111] group-hover:bg-[#1a1a1a] shadow-[4px_0_12px_rgba(0,0,0,0.5)] border-r border-gray-800">
                  <div className="truncate w-48" title={c.name}>{c.name}</div>
                  <div className="text-[10px] uppercase font-mono text-gray-500">{c.industry || 'Uncategorized'}</div>
                </td>
                <td className="p-2">
                  <div className={cn("px-2 py-1 rounded inline-block text-center min-w-[3rem] font-mono border", getHeatmapClass(c.score, scores))}>
                    {c.score.toFixed(1)}
                  </div>
                </td>
                <td className="p-2 cursor-help" title={c.ltvCac === 0 ? "0 generally means reliable CAC/CLV was not discovered or unit economics is missing. Run Deep Research AI." : undefined}>
                   <div className={cn("px-2 py-1 rounded inline-block font-mono border", getHeatmapClass(c.ltvCac, ltvCacs))}>
                    {c.ltvCac}x
                  </div>
                </td>
                <td className="p-2 cursor-help" title={c.estimatedCLV === 0 ? "0 means reliable CLV was not discovered. AI missing this data." : undefined}>
                   <div className={cn("px-2 py-1 rounded inline-block font-mono border", getHeatmapClass(c.estimatedCLV, clvs))}>
                    €{c.estimatedCLV}
                  </div>
                </td>
                 <td className="p-2 cursor-help" title={c.estimatedCAC === 0 ? "0 means reliable CAC was not discovered. AI missing this data. Red is high cost, Green is low cost." : undefined}>
                   <div className={cn("px-2 py-1 rounded inline-block font-mono border", getHeatmapClass(c.estimatedCAC, cacs, false))}>
                    €{c.estimatedCAC}
                  </div>
                </td>
                <td className="p-2 cursor-help" title={c.monthlyChurnPercent === 0 ? "0% implies either missing data, or absolutely no churn (extremely rare). Red represents high churn." : "Red represents high churn, Green represents low/zero churn."}>
                   <div className={cn("px-2 py-1 rounded inline-block font-mono border", getHeatmapClass(c.monthlyChurnPercent, churns, false))}>
                    {c.monthlyChurnPercent}%
                  </div>
                </td>
                <td className="p-2 px-4 text-gray-300 font-mono text-sm max-w-[120px] truncate" title={c.cagr}>{c.cagr || '-'}</td>
                <td className="p-2 px-4 text-gray-300 font-mono text-sm max-w-[150px] truncate" title={c.marketSizeGlobal}>{c.marketSizeGlobal || '-'}</td>
                <td className="p-2 px-4 text-gray-300 font-mono text-sm max-w-[120px] truncate" title={c.marketSizeEU}>{c.marketSizeEU || '-'}</td>
                <td className="p-2 px-4 text-gray-300 font-mono text-sm max-w-[120px] truncate" title={c.marketSizeNL}>{c.marketSizeNL || '-'}</td>
                <td className="p-2 px-4 font-medium">
                  <span className={cn(c.regulatoryRiskNL === 'Low' ? 'text-emerald-400' : c.regulatoryRiskNL === 'High' ? 'text-rose-400' : 'text-orange-400')}>
                    {c.regulatoryRiskNL || '-'}
                  </span>
                </td>
                <td className="p-2 px-4 font-medium">
                   <span className={cn(c.acquisitionDifficulty === 'Easy' ? 'text-emerald-400' : c.acquisitionDifficulty === 'Hard' ? 'text-rose-400' : 'text-gray-400')}>
                    {c.acquisitionDifficulty}
                  </span>
                </td>
                <td className="p-2 px-4 font-medium">
                    <span className={cn(c.emotionalLoyalty === 'High' ? 'text-emerald-400' : c.emotionalLoyalty === 'Low' ? 'text-rose-400' : 'text-gray-400')}>
                    {c.emotionalLoyalty}
                  </span>
                </td>
                <td className="p-2 px-4 text-gray-300 font-mono text-sm">{c.microNichePotential}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
