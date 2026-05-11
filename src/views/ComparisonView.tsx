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
    <div className="flex flex-col items-center justify-center p-12 bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl">
        <p className="text-[#333] text-sm">
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

  const isBest = (val: number, arr: number[], higherIsBetter = true) => {
    const hi = Math.max(...arr); const lo = Math.min(...arr);
    if (hi === lo) return false; // all identical — no meaningful winner
    return higherIsBetter ? val === hi : val === lo;
  };
  const isWorst = (val: number, arr: number[], higherIsBetter = true) => {
    const hi = Math.max(...arr); const lo = Math.min(...arr);
    if (hi === lo) return false; // all identical — no meaningful loser
    return higherIsBetter ? val === lo : val === hi;
  };

  const getHeatmapClass = (val: number, arr: number[], higherIsBetter = true) => {
    if (isBest(val, arr, higherIsBetter)) return "bg-[#4ade80]/08 text-[#4ade80] font-bold border-[#4ade80]/20";
    if (isWorst(val, arr, higherIsBetter)) return "bg-[#f87171]/08 text-[#f87171] border-[#f87171]/15";
    return "text-[#aaa] border-transparent";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#d0d0d0] tracking-tight">Decision Matrix</h2>
          <p className="text-xs text-[#444] mt-0.5">High-density one-lens comparison across all metrics.</p>
        </div>
        <select 
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-[#0d0d0d] border border-[#1a1a1a] text-[#d0d0d0] rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#e05000]/40 transition-colors"
        >
          <option value="All">All Active Categories</option>
          <option value="Researching">Researching</option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Winner">Winner</option>
        </select>
      </div>

      <div className="bg-[#080808] border border-[#141414] rounded-xl overflow-auto max-h-[calc(100vh-180px)]">
        <table className="w-full text-left border-collapse whitespace-nowrap text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#080808] border-b border-[#141414] text-[10px] text-[#2e2e2e] uppercase tracking-[0.12em] font-medium">
              <th className="py-2.5 px-3 sticky left-0 z-20 bg-[#080808] shadow-[4px_0_8px_rgba(0,0,0,0.7)] border-r border-[#141414] cursor-help" title="The business category name">Category</th>
              <th className="py-2.5 px-3 cursor-help" title="Score = (LTV:CAC ratio + Relative CLV + Market Size + Retention) multiplied by Qualitative Factors (Acquisition Difficulty, Brand Loyalty, Story Depth, etc).">Score</th>
              <th className="py-2.5 px-3 cursor-help" title="Customer Lifetime Value divided by Customer Acquisition Cost. Healthy is >3x. 0 often means not enough sources found.">LTV:CAC</th>
              <th className="py-2.5 px-3 cursor-help" title="Estimated Customer Lifetime Value in Euros. Calculated from recurring purchases or high initial ticket size.">CLV</th>
              <th className="py-2.5 px-3 cursor-help" title="Estimated Customer Acquisition Cost in Euros. Expected cost to acquire one buying user.">CAC</th>
              <th className="py-2.5 px-3 cursor-help" title="Estimated Monthly Churn Percentage. Lower is better.">Churn</th>
              <th className="py-2.5 px-3 cursor-help" title="Compound Annual Growth Rate">CAGR</th>
              <th className="py-2.5 px-3 cursor-help" title="Global Market Size">Global</th>
              <th className="py-2.5 px-3 cursor-help" title="European Union Market Size">EU</th>
              <th className="py-2.5 px-3 cursor-help" title="Netherlands Market Size">NL</th>
              <th className="py-2.5 px-3 cursor-help" title="TAM → SAM → SOM funnel.">TAM→SOM</th>
              <th className="py-2.5 px-3 cursor-help" title="Regulatory Risk in the NL.">Reg.</th>
              <th className="py-2.5 px-3 cursor-help" title="Estimated difficulty of user acquisition.">Acq.</th>
              <th className="py-2.5 px-3 cursor-help" title="Estimated loyalty level of customers.">Loyalty</th>
              <th className="py-2.5 px-3 cursor-help" title="Micro-niche popularity scale (1-10)">Niche</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0f0f0f]">
            {selectedCategories.map(c => (
              <tr key={c.id} className="group hover:bg-[#0d0d0d] transition-colors">
                <td className="py-2 px-3 font-semibold text-[#d0d0d0] sticky left-0 z-10 bg-[#080808] group-hover:bg-[#0d0d0d] shadow-[4px_0_8px_rgba(0,0,0,0.7)] border-r border-[#141414]">
                  <div className="truncate w-48" title={c.name}>{c.name}</div>
                  <div className="text-[10px] uppercase font-mono text-[#484848]">{c.industry || 'Uncategorized'}</div>
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
                <td className="p-2 px-4 text-[#aaa] font-mono text-sm max-w-[120px] truncate" title={c.cagr}>{c.cagr || '-'}</td>
                <td className="p-2 px-4 text-[#aaa] font-mono text-sm max-w-[150px] truncate" title={c.marketSizeGlobal}>{c.marketSizeGlobal || '-'}</td>
                <td className="p-2 px-4 text-[#aaa] font-mono text-sm max-w-[120px] truncate" title={c.marketSizeEU}>{c.marketSizeEU || '-'}</td>
                <td className="p-2 px-4 text-[#aaa] font-mono text-sm max-w-[120px] truncate" title={c.marketSizeNL}>{c.marketSizeNL || '-'}</td>
                <td className="p-2 px-4" title={c.funnelBreakdownNL || 'Run deep research to compute TAM→SAM→SOM funnel'}>
                  {c.somNL != null ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="text-[#484848]">{(c.tamNL ?? 0).toLocaleString()}</span>
                        <span className="text-[#2a2a2a]">→</span>
                        <span className="text-[#666]">{(c.samNL ?? 0).toLocaleString()}</span>
                        <span className="text-[#2a2a2a]">→</span>
                        <span className="text-[#e05000] font-bold">{c.somNL.toLocaleString()}</span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-[#3a3a3a]">TAM → SAM → SOM</span>
                    </div>
                  ) : (
                    <span className="text-[#3a3a3a] text-xs">-</span>
                  )}
                </td>
                <td className="p-2 px-4 font-medium">
                  <span className={cn(c.regulatoryRiskNL === 'Low' ? 'text-[#4ade80]' : c.regulatoryRiskNL === 'High' ? 'text-[#f87171]' : 'text-[#e05000]')}>
                    {c.regulatoryRiskNL || '-'}
                  </span>
                </td>
                <td className="p-2 px-4 font-medium">
                   <span className={cn(c.acquisitionDifficulty === 'Easy' ? 'text-[#4ade80]' : c.acquisitionDifficulty === 'Hard' ? 'text-[#f87171]' : 'text-[#666]')}>
                    {c.acquisitionDifficulty}
                  </span>
                </td>
                <td className="p-2 px-4 font-medium">
                    <span className={cn(c.emotionalLoyalty === 'High' ? 'text-[#4ade80]' : c.emotionalLoyalty === 'Low' ? 'text-[#f87171]' : 'text-[#666]')}>
                    {c.emotionalLoyalty}
                  </span>
                </td>
                <td className="p-2 px-4 text-[#aaa] font-mono text-sm">{c.microNichePotential}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
