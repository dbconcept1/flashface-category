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
    <div className="space-y-6">
      {/* High Density KPI Headers */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-gray-800 divide-x divide-gray-800 bg-[#111111] rounded-lg shadow-sm">
        <KpiCell label="Analyzed Categories" value={totalCategories.toString()} />
        <KpiCell label="Avg CLV" value={`€${Math.round(avgClv)}`} mono tooltip="Average Estimated Customer Lifetime Value across all tracked categories" />
        <KpiCell label="Ceiling Score" value={bestScore.toFixed(1)} mono highlight tooltip="The highest decision score currently generated in the tracking system." />
        <KpiCell label="Max LTV:CAC" value={`${bestLtvCac.toFixed(1)}x`} mono highlight tooltip="The highest Lifetime Value to Customer Acquisition Cost Ratio found so far." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Executive Summary of Current Winner */}
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Current Winner Designation</h2>
          {winner ? (
            <div className="bg-[#111111] border border-emerald-500/30 p-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.05)] relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 font-mono text-5xl font-black text-emerald-500/10 -mt-2 -mr-2">
                 {winner.score.toFixed(1)}
               </div>
               <div className="relative z-10">
                 <h1 className="text-2xl font-bold text-white mb-1 leading-tight">{winner.name}</h1>
                 <p className="text-sm text-gray-400 mb-6">{winner.targetAudience}</p>
                 
                 <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-left">
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Unit Model</p>
                     <p className="text-lg font-mono text-emerald-400 font-bold tracking-tight">
                       {winner.ltvCac}x <span className="text-sm text-gray-400 font-normal ml-1">Ratio</span>
                     </p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Lifetime Val</p>
                     <p className="text-lg font-mono text-white tracking-tight">€{winner.estimatedCLV}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Acquisition Loop</p>
                     <p className="text-sm text-white">{winner.acquisitionDifficulty}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Behavioral Lock-in</p>
                     <p className="text-sm text-white">{winner.monthlyConsumptionReason}</p>
                   </div>
                 </div>
               </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center justify-center text-gray-500 h-[220px]">
              No 'Winner' designated currently.
            </div>
          )}
        </div>

        {/* Highest Signal Competitors */}
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Ranked active categories</h2>
          <div className="bg-[#111111] border border-gray-800 rounded-xl overflow-hidden">
             <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-900/50 border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-3 px-4 font-normal">Category</th>
                    <th className="py-3 px-4 font-normal text-right cursor-help" title="Lifetime Value to Customer Acquisition Cost Ratio">LTV:CAC</th>
                    <th className="py-3 px-4 font-normal text-right cursor-help" title="Algorithmic Decision Score">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {topList.map((cat, i) => (
                    <tr key={cat.id} className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-gray-500 font-mono font-bold w-4">{i + 1}.</span>
                          <span className="font-semibold text-gray-200">{cat.name}</span>
                        </div>
                      </td>
                      <td 
                        className="py-3 px-4 text-right font-mono text-gray-400 cursor-help"
                        title={cat.ltvCac === 0 ? "0 generally means AI is missing data. Run deep search." : undefined}
                      >
                        {cat.ltvCac}x
                      </td>
                      <td className="py-3 px-4 text-right cursor-help" title="Expected Value Score calculated via structural model.">
                        <span className="font-mono font-bold text-emerald-400">{cat.score.toFixed(1)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
             {topListAll.length > 5 && (
               <button
                 onClick={() => setShowAllTopList(v => !v)}
                 className="w-full py-2 text-xs text-gray-500 hover:text-orange-400 border-t border-gray-800 transition-colors font-mono"
               >
                 {showAllTopList ? `▲ Show Top 5` : `▼ Show all ${topListAll.length} active`}
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
    <div className="px-6 py-4 flex flex-col justify-center cursor-help" title={tooltip}>
      <p className="text-xs max-w-[120px] uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${mono ? 'font-mono tracking-tight' : ''} ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
