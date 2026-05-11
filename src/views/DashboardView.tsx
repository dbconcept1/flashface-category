import { useState } from 'react';
import { Category, Weights } from '../types';
import { calculateDecisionScore, calculateLtvCac } from '../utils';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
}

export function DashboardView({ categories, weights, maxClv }: Props) {
  const activeCategories = categories.filter(c => c.status !== 'Killed');
  
  const totalCategories = categories.length;
  const avgClv = activeCategories.length > 0
    ? activeCategories.reduce((sum, c) => sum + c.estimatedCLV, 0) / activeCategories.length
    : 0;

  const categoriesWithScores = categories.map(c => ({
    ...c,
    score: calculateDecisionScore(c, weights, maxClv),
    ltvCac: calculateLtvCac(c.estimatedCLV, c.estimatedCAC)
  }));

  const bestScore = Math.max(0, ...categoriesWithScores.map(c => c.score));
  const bestLtvCac = Math.max(0, ...categoriesWithScores.filter(c => c.estimatedCAC > 0).map(c => c.ltvCac));

  const winner = categoriesWithScores.find(c => c.status === 'Winner');

  // Top list — shows top 5 by default, expandable
  const [showAllTopList, setShowAllTopList] = useState(false);
  const topListAll = categoriesWithScores
    .filter(c => c.status !== 'Killed')
    .sort((a, b) => b.score - a.score);
  const topList = showAllTopList ? topListAll : topListAll.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#1a1a1a] divide-x divide-[#1a1a1a] bg-[#0d0d0d] rounded-xl overflow-hidden">
        <KpiCell label="Analyzed" value={totalCategories.toString()} />
        <KpiCell label="Avg CLV" value={`€${Math.round(avgClv)}`} mono tooltip="Average Estimated Customer Lifetime Value across all tracked categories" />
        <KpiCell label="Top Score" value={bestScore.toFixed(1)} mono highlight tooltip="The highest decision score currently generated in the tracking system." />
        <KpiCell label="Max LTV:CAC" value={`${bestLtvCac.toFixed(1)}x`} mono highlight tooltip="The highest Lifetime Value to Customer Acquisition Cost Ratio found so far." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Winner */}
        <div>
          <p className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.14em] mb-2.5">Current Winner</p>
          {winner ? (
            <div className="bg-[#0d0d0d] border border-[#4ade80]/15 p-5 rounded-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 font-mono text-5xl font-black text-[#4ade80]/08 select-none">
                 {winner.score.toFixed(1)}
               </div>
               <div className="relative z-10">
                 <h1 className="text-lg font-bold text-[#f0f0f0] mb-0.5 leading-tight">{winner.name}</h1>
                 <p className="text-xs text-[#555] mb-5">{winner.targetAudience}</p>
                 
                 <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-left">
                   <div>
                     <p className="text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a] mb-1">Unit Model</p>
                     <p className="text-base font-mono text-[#4ade80] font-bold tracking-tight">
                       {winner.ltvCac}x <span className="text-xs text-[#555] font-normal">LTV:CAC</span>
                     </p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a] mb-1">Lifetime Value</p>
                     <p className="text-base font-mono text-[#f0f0f0] tracking-tight">€{winner.estimatedCLV}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a] mb-1">Acquisition</p>
                     <p className="text-sm text-[#aaa]">{winner.acquisitionDifficulty}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a] mb-1">Lock-in Signal</p>
                     <p className="text-sm text-[#aaa] line-clamp-2">{winner.monthlyConsumptionReason || '—'}</p>
                   </div>
                 </div>
               </div>
            </div>
          ) : (
            <div className="bg-[#0d0d0d] border border-[#1a1a1a] p-6 rounded-xl flex items-center justify-center text-[#3a3a3a] text-sm h-[200px]">
              No winner designated yet
            </div>
          )}
        </div>

        {/* Ranked Table */}
        <div>
          <p className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.14em] mb-2.5">Ranked Active Categories</p>
          <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl overflow-hidden">
             <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#1a1a1a] text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a]">
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium text-right cursor-help" title="Lifetime Value to Customer Acquisition Cost Ratio">LTV:CAC</th>
                    <th className="py-2.5 px-4 font-medium text-right cursor-help" title="Algorithmic Decision Score">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]">
                  {topList.map((cat, i) => (
                    <tr key={cat.id} className="hover:bg-[#111] transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-[#333] font-mono w-4 shrink-0">{i + 1}</span>
                          <span className="font-medium text-[#d0d0d0]">{cat.name}</span>
                        </div>
                      </td>
                      <td 
                        className="py-2.5 px-4 text-right font-mono text-[#555] text-sm cursor-help"
                        title={cat.ltvCac === 0 ? "0 generally means AI is missing data. Run deep search." : undefined}
                      >
                        {cat.ltvCac}x
                      </td>
                      <td className="py-2.5 px-4 text-right cursor-help" title="Expected Value Score calculated via structural model.">
                        <span className="font-mono font-semibold text-[#4ade80] text-sm">{cat.score.toFixed(1)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
             {topListAll.length > 5 && (
               <button
                 onClick={() => setShowAllTopList(v => !v)}
                 className="w-full py-2 text-[11px] text-[#3a3a3a] hover:text-[#e05000] border-t border-[#141414] transition-colors font-mono"
               >
                 {showAllTopList ? `▲ Show top 5` : `▼ Show all ${topListAll.length}`}
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCell({ label, value, highlight, mono, tooltip }: { label: string, value: string, highlight?: boolean, mono?: boolean, tooltip?: string }) {
  return (
    <div className="px-5 py-4 flex flex-col justify-center cursor-help" title={tooltip}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[#3a3a3a] mb-1.5 font-medium">{label}</p>
      <p className={`text-xl font-bold ${mono ? 'font-mono tracking-tight' : ''} ${highlight ? 'text-[#4ade80]' : 'text-[#f0f0f0]'}`}>
        {value}
      </p>
    </div>
  );
}
