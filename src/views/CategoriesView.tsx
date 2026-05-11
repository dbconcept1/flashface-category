import { useState, Fragment } from 'react';
import { Category, Weights, CategoryStatus } from '../types';
import { calculateDecisionScore, calculateLtvCac, cn, getMacroSector } from '../utils';
import { LayoutGrid, List, Search, Ban, Trophy, Sparkles, Loader2, Square, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CategoryResearchState } from '../services/aiService';
import { useResearchState } from '../lib/researchContext';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
  onEdit: (id: string) => void;
  onUpdateStatus: (id: string, status: CategoryStatus) => void;
  onDeepSearch: (id: string) => void;
  onDeepSearchAllNew: () => void;
  onRefreshResearched: () => void;
  onRefreshFailed: () => void;
  onStopBulkResearch: () => void;
  isBulkResearching: boolean;
  bulkStats: { total: number; done: number; failed: number } | null;
}

export function CategoriesView({ categories, weights, maxClv, onEdit, onUpdateStatus, onDeepSearch, onDeepSearchAllNew, onRefreshResearched, onRefreshFailed, onStopBulkResearch, isBulkResearching, bulkStats }: Props) {
  const enhancingIds = useResearchState();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CategoryStatus | 'All'>('All');

  const [expandedMacros, setExpandedMacros] = useState<Record<string, boolean>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const getProgress = (id: string) => {
    const p = enhancingIds[id];
    if (!p || !p.agents) return 0;
    const agents = Object.values(p.agents);
    if (agents.length === 0) return 0;
    const done = agents.filter((a: any) => a.status === 'completed' || a.status === 'error').length;
    return Math.min(100, Math.round((done / agents.length) * 100));
  };

  /** Derived from persisted agentResults — survives page reload */
  const getAiResearchStatus = (c: Category): 'none' | 'partial' | 'done' | 'error' => {
    if (!c.agentResults) return 'none';
    const keys = ['unitEconomics', 'marketDynamics', 'localCompetitors', 'globalCompetitors',
      'legalLogistics', 'suppliersBudget', 'foundersAndTeam', 'adIntelligence',
      'retentionEngineering', 'searchTrends'] as const;
    const vals = keys.map(k => c.agentResults![k] ?? '');
    const errors = vals.filter(v => v.startsWith('Error:'));
    const filled = vals.filter(v => v && !v.startsWith('Error:'));
    if (filled.length === 0 && errors.length === 0) return 'none';
    if (filled.length === keys.length) return 'done';
    if (errors.length > 0 && filled.length === 0) return 'error';
    return 'partial';
  };

  const categoriesWithScores = categories
    .map(c => ({
      ...c,
      score: calculateDecisionScore(c, weights, maxClv),
      ltvCac: calculateLtvCac(c.estimatedCLV, c.estimatedCAC)
    }))
    .filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.targetAudience.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' ? true : c.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => b.score - a.score);

  const groupedCategories = (() => {
    const byMacro: Record<string, { industry: string; categories: typeof categoriesWithScores }[]> = {};
    const industries = Array.from(new Set(categoriesWithScores.map(c => c.industry || 'Uncategorized'))).sort();
    
    industries.forEach(ind => {
      const macro = getMacroSector(ind);
      if (!byMacro[macro]) byMacro[macro] = [];
      byMacro[macro].push({
        industry: ind,
        categories: categoriesWithScores.filter(c => (c.industry || 'Uncategorized') === ind)
      });
    });
    
    return Object.entries(byMacro).map(([macro, groups]) => ({
      macro,
      totalCount: groups.reduce((acc, g) => acc + g.categories.length, 0),
      groups: groups.sort((a, b) => b.categories.length - a.categories.length)
    })).sort((a, b) => b.totalCount - a.totalCount);
  })();

  const toggleMacro = (macro: string) => {
    setExpandedMacros(prev => ({ ...prev, [macro]: prev[macro] === undefined ? false : !prev[macro] }));
  };

  return (
    <div className="flex w-full h-full absolute inset-0 overflow-hidden bg-[#080808]">
      {/* Sidebar Menu for Macro Sectors */}
      <div 
        className={cn(
          "bg-[#080808] border-r border-[#141414] flex flex-col h-full shrink-0 z-20 transition-all duration-200",
          isSidebarOpen ? "w-52" : "w-0 overflow-hidden border-none"
        )}
      >
        <div className="p-3 border-b border-[#141414] shrink-0 w-52">
          <h3 className="font-semibold text-[#333] text-[10px] uppercase tracking-[0.14em] flex items-center justify-between">
            Sectors
            <span className="bg-[#141414] text-[#3a3a3a] px-1.5 py-0.5 rounded font-mono text-[10px]">{groupedCategories.length}</span>
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 w-52">
          {groupedCategories.map(group => {
            const isExpanded = expandedMacros[group.macro] !== false; // expanded by default
            return (
              <div key={group.macro} className="space-y-1">
                <button 
                  onClick={() => toggleMacro(group.macro)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#0f0f0f] transition-colors group cursor-pointer text-left"
                >
                  <span className="text-[12px] font-medium text-[#555] group-hover:text-[#aaa] truncate">{group.macro}</span>
                </button>
                {isExpanded && (
                  <div className="pl-3 space-y-0.5 border-l border-[#1e1e1e]/50 ml-2 py-1">
                    {group.groups.map(sub => (
                      <button 
                        key={sub.industry}
                        onClick={() => {
                          const el = document.getElementById(`industry-${sub.industry.replace(/\s+/g, '-')}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-[#484848] hover:text-[#e05000] hover:bg-[#e05000]/08 transition-colors text-left"
                      >
                        <span className="truncate pr-2">{sub.industry}</span>
                        <span className="text-[10px] font-mono opacity-60">{sub.categories.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-3 px-4 py-3 border-b border-[#141414] bg-[#080808] shrink-0 z-10 sticky top-0 w-full">
          <div className="flex items-center gap-3 self-start xl:self-center shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#666] hover:text-[#f0f0f0] rounded-lg transition-colors"
              title="Toggle Sidebar"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          <div className="bg-[#111] border border-[#1e1e1e] text-[#e05000] font-mono font-semibold text-sm px-2.5 py-1 rounded-md">
            {categoriesWithScores.length}
          </div>
          <span className="text-[#484848] text-[13px]">categories</span>
        </div>
        
        <div className="relative w-full xl:w-64 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#333]" />
          <input 
            type="text" 
            placeholder="Search..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0d0d0d] border border-[#1a1a1a] text-[#e0e0e0] rounded-lg pl-8 pr-3 py-1.5 text-[13px] focus:outline-none focus:border-[#e05000]/40 transition-colors placeholder:text-[#2a2a2a]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto xl:ml-auto">
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="flex-1 sm:flex-none bg-[#0d0d0d] border border-[#1a1a1a] text-[#666] rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#e05000]/40 transition-colors"
          >
            <option value="All">All Statuses</option>
            <option value="Researching">Researching</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Killed">Killed</option>
            <option value="Winner">Winner</option>
          </select>
          <div className="flex items-center gap-2 flex-wrap">
            {isBulkResearching ? (
              <button
                onClick={onStopBulkResearch}
                className="flex items-center px-3 py-2 bg-[#f87171]/08 text-[#f87171] border border-[#f87171]/20 hover:bg-[#f87171]/12 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap animate-pulse"
              >
                <Square className="w-3 h-3 mr-1.5" />
                Stop Queue
              </button>
            ) : (
              <>
                <button
                  onClick={onDeepSearchAllNew}
                  className="flex items-center px-3 py-2 bg-[#e05000]/08 text-[#e05000] border border-[#e05000]/15 hover:bg-[#e05000]/15 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Research New
                </button>
                <button
                  onClick={onRefreshFailed}
                  className="flex items-center px-3 py-2 bg-[#d4ac0d]/08 text-[#d4ac0d] border border-[#d4ac0d]/15 hover:bg-yellow-500/20 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                  title="Re-run only categories with failed or missing agent results"
                >
                  Retry Failed
                </button>
                <button
                  onClick={onRefreshResearched}
                  className="flex items-center px-3 py-2 bg-[#1a1a1a] text-[#666] border border-[#252525] hover:bg-[#222] hover:text-[#d0d0d0] text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                  title="Full re-research of all researched categories"
                >
                  Refresh All
                </button>
              </>
            )}
          </div>
          <div className="flex items-center bg-[#111] rounded-lg p-1 border border-[#1e1e1e]">
            <button 
              onClick={() => setViewMode('table')}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === 'table' ? "bg-[#1a1a1a] text-[#f0f0f0]" : "text-[#484848] hover:text-[#f0f0f0]")}
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === 'grid' ? "bg-[#1a1a1a] text-[#f0f0f0]" : "text-[#484848] hover:text-[#f0f0f0]")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk research progress banner — shown between controls and content for both view modes */}
      {(isBulkResearching || bulkStats) && (
        <div className={cn(
          "shrink-0 flex items-center justify-between px-4 py-2 border-b text-xs font-mono",
          isBulkResearching
            ? "bg-[#e05000]/5 border-[#e05000]/15 text-[#e05000]"
            : bulkStats && bulkStats.failed > 0
            ? "bg-rose-500/5 border-[#f87171]/15"
            : "bg-emerald-500/5 border-emerald-500/15"
        )}>
          <div className="flex items-center gap-3">
            {isBulkResearching
              ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              : bulkStats && bulkStats.failed > 0
              ? <AlertCircle className="w-3 h-3 text-[#f87171] shrink-0" />
              : <CheckCircle2 className="w-3 h-3 text-[#4ade80] shrink-0" />
            }
            {isBulkResearching && bulkStats && (
              <>
                <div className="w-32 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e05000] transition-all duration-500"
                    style={{ width: `${Math.round(((bulkStats.done + bulkStats.failed) / bulkStats.total) * 100)}%` }}
                  />
                </div>
                <span>{bulkStats.done + bulkStats.failed} / {bulkStats.total} complete</span>
              </>
            )}
            {isBulkResearching && !bulkStats && <span>Starting queue...</span>}
            {!isBulkResearching && bulkStats && (
              <span className={bulkStats.failed > 0 ? 'text-[#f87171]' : 'text-[#4ade80]'}>
                Research finished — {bulkStats.done} succeeded{bulkStats.failed > 0 ? `, ${bulkStats.failed} failed` : ''}
              </span>
            )}
          </div>
          {isBulkResearching && (
            <button
              onClick={onStopBulkResearch}
              className="text-[#484848] hover:text-[#f87171] transition-colors text-xs uppercase tracking-wider"
            >stop</button>
          )}
        </div>
      )}

      {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="space-y-16">
          {groupedCategories.map(macroGroup => (
            <div key={macroGroup.macro} className="space-y-8">
              <div className="flex items-center gap-4">
                 <h1 className="text-2xl font-black text-[#f0f0f0] tracking-tight uppercase">{macroGroup.macro}</h1>
                 <div className="h-px flex-1 bg-[#1a1a1a]"></div>
              </div>
              {macroGroup.groups.map(group => (
                <div key={group.industry} id={`industry-${group.industry.replace(/\s+/g, '-')}`} className="space-y-4 pl-0 md:pl-6 border-l-0 md:border-l-2 border-[#141414]">
                  <h2 className="text-xl font-bold border-b border-[#1e1e1e] pb-2 text-[#aaa] uppercase tracking-[0.1em] flex items-center justify-between">
                    {group.industry}
                    <span className="text-sm font-mono text-[#484848] bg-[#111] border border-[#1e1e1e] px-3 py-1 rounded-full" title="Number of categories in this industry">{group.categories.length}</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {group.categories.map(cat => (
                <div 
                  key={cat.id} 
                  className={cn(
                    "group relative bg-[#0d0d0d] border rounded-xl p-6 transition-all hover:shadow-xl hover:shadow-black/50 overflow-hidden cursor-pointer flex flex-col",
                    cat.status === 'Killed' ? "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 border-[#1e1e1e]" : "border-[#1e1e1e] hover:border-[#e05000]/25"
                  )}
                  onClick={() => onEdit(cat.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 right-pr-4">
                      <h3 className="text-xl font-bold text-[#f0f0f0] mb-1 line-clamp-2 leading-tight group-hover:text-[#e05000] transition-colors uppercase tracking-tight">{cat.name}</h3>
                      <p className="text-sm text-[#666] line-clamp-1">{cat.targetAudience}</p>
                    </div>
                    <div className="text-right bg-[#111] rounded-lg px-3 py-2 border border-[#1e1e1e] min-w-[60px]">
                      <p className="text-[10px] text-[#484848] font-mono uppercase tracking-[0.1em] leading-none mb-1 cursor-help" title="Score = (LTV:CAC + Base CLV + Market Size) * (Multipliers)">Score</p>
                      <p className="text-xl font-bold text-[#4ade80] font-mono leading-none cursor-help" title="Expected Value Index generated via weighted structural scoring.">{cat.score.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 my-6">
                    <div>
                      <p className="text-xs text-[#484848] uppercase min-h-[16px]" title="Lifetime Value to Customer Acquisition Cost Ratio (Max 10x)">LTV:CAC</p>
                      <p 
                        className={cn("text-lg font-mono font-medium cursor-help", cat.ltvCac >= 4 ? "text-[#4ade80]" : cat.ltvCac < 2 ? "text-[#f87171]" : "text-[#aaa]")}
                        title={cat.ltvCac === 0 ? "0 typically means the AI could not find reliable numerical data yet, or CAC is 0." : "Higher is better. >3 is healthy."}
                      >
                        {cat.ltvCac}x
                      </p>
                    </div>
                    <div>
                       <p className="text-xs text-[#484848] uppercase min-h-[16px]" title="Estimated Customer Lifetime Value">CLV</p>
                       <p 
                         className="text-lg font-mono font-medium text-[#aaa] cursor-help"
                         title={cat.estimatedCLV === 0 ? "0 means no reliable data was found during research, run 'Deep Research AI' to fill." : undefined}
                       >
                         €{cat.estimatedCLV}
                       </p>
                    </div>
                    <div>
                       <p className="text-xs text-[#484848] uppercase min-h-[16px]">Market Size (NL)</p>
                       <p className="text-sm font-medium text-[#aaa] truncate" title={cat.marketSizeNL}>{cat.marketSizeNL || <span className="opacity-30">N/A</span>}</p>
                       {/* TAM → SAM → SOM funnel */}
                       {cat.somNL != null ? (
                         <div
                           className="mt-1.5 flex items-center gap-1 text-[10px] font-mono cursor-help"
                           title={cat.funnelBreakdownNL || 'TAM → SAM → SOM funnel'}
                         >
                           <span className="text-[#484848]">{(cat.tamNL ?? 0).toLocaleString()}</span>
                           <span className="text-[#2a2a2a]">→</span>
                           <span className="text-[#666]">{(cat.samNL ?? 0).toLocaleString()}</span>
                           <span className="text-[#2a2a2a]">→</span>
                           <span className="text-[#e05000] font-bold">{(cat.somNL).toLocaleString()}</span>
                           <span className="text-[#3a3a3a] ml-0.5">SOM</span>
                         </div>
                       ) : (
                         <p className="text-xs font-bold text-[#e05000] mt-1 truncate" title="Audience Size NL">{cat.audienceSizeNL || <span className="opacity-30">N/A</span>}</p>
                       )}
                    </div>
                     <div>
                       <p className="text-xs text-[#484848] uppercase min-h-[16px]">Loyalty</p>
                       <p className={cn("text-sm font-medium", 
                        cat.emotionalLoyalty === 'High' ? 'text-[#4ade80]' : 
                        cat.emotionalLoyalty === 'Low' ? 'text-[#f87171]' : 'text-[#aaa]'
                       )}>{cat.emotionalLoyalty}</p>
                    </div>
                  </div>

                  <div className="mt-auto border-t border-[#1e1e1e] pt-4 flex justify-between items-center">
                    <span className={cn("inline-flex items-center px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider", 
                      cat.status === 'Winner' ? 'bg-[#4ade80]/08 text-[#4ade80] border border-[#4ade80]/15' :
                      cat.status === 'Killed' ? 'bg-[#f87171]/08 text-[#f87171] border border-[#f87171]/15' :
                      cat.status === 'Shortlisted' ? 'bg-[#e05000]/08 text-[#e05000] border border-[#e05000]/15' :
                      'bg-[#1a1a1a] text-[#666] border border-[#252525]'
                    )}>
                      {cat.status === 'Winner' && <Trophy className="w-3 h-3 mr-1" />}
                      {cat.status}
                    </span>
                    {(() => {
                      const ai = getAiResearchStatus(cat);
                      if (ai === 'none') return null;
                      return (
                        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ml-1',
                          ai === 'done'    ? 'bg-[#4ade80]/08 text-[#4ade80] border border-[#4ade80]/15' :
                          ai === 'partial' ? 'bg-[#d4ac0d]/08 text-[#d4ac0d] border border-[#d4ac0d]/15' :
                                            'bg-[#f87171]/08 text-[#f87171] border border-[#f87171]/15'
                        )} title={ai === 'done' ? 'All 10 AI agents completed' : ai === 'partial' ? 'Some agents completed, some failed or missing' : 'AI research failed'}>
                          {ai === 'done' ? 'AI ✓' : ai === 'partial' ? 'AI ⚠' : 'AI ✗'}
                        </span>
                      );
                    })()}
                    
                    <div className="flex gap-2 items-center w-full justify-end" onClick={e => e.stopPropagation()}>
                      {enhancingIds[cat.id] && (
                        <div className="flex flex-col items-end mr-2 w-full max-w-[120px]">
                          <div className="flex w-full justify-between items-center mb-1">
                            <span className="text-[10px] text-[#e05000] italic font-mono">{getProgress(cat.id)}%</span>
                            <span className="text-[10px] items-end text-[#e05000] italic truncate ml-2">
                              {enhancingIds[cat.id].overall || 'Thinking...'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-[#111] rounded-full overflow-hidden">
                            <div className="h-full bg-[#e05000] transition-all duration-300" style={{ width: `${getProgress(cat.id)}%` }} />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeepSearch(cat.id); }}
                        disabled={!!enhancingIds[cat.id]}
                        className="flex text-xs items-center px-2 py-1 bg-[#e05000]/08 text-[#e05000] hover:bg-[#e05000]/15 rounded transition-colors disabled:opacity-50"
                        title="Deep Research with AI"
                      >
                        {enhancingIds[cat.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      </button>
                      {cat.status !== 'Killed' && (
                        <button 
                          onClick={() => onUpdateStatus(cat.id, 'Killed')}
                          className="p-1.5 text-[#484848] hover:text-[#f87171] hover:bg-[#f87171]/08 rounded transition-colors"
                          title="Kill Category"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {cat.status !== 'Winner' && cat.status !== 'Killed' && (
                        <button 
                          onClick={() => onUpdateStatus(cat.id, 'Winner')}
                          className="p-1.5 text-[#484848] hover:text-[#4ade80] hover:bg-[#4ade80]/08 rounded transition-colors"
                          title="Mark as Winner"
                        >
                          <Trophy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
            ))}
            </div>
          ))}
          {groupedCategories.length === 0 && (
            <div className="py-12 text-center text-[#484848] text-sm">No categories found.</div>
          )}
        </div>
          </div>
        )}

        {/* Table View — single unified scroll container, one sticky header */}
        {viewMode === 'table' && (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[860px] bg-[#080808]">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-[#1a1a1a] bg-[#080808] text-[10px] text-[#333] uppercase tracking-[0.12em]">
                  <th className="py-2.5 px-3 font-medium sticky left-0 z-30 bg-[#080808] shadow-[4px_0_8px_rgba(0,0,0,0.6)] border-r border-[#1a1a1a]" title="The business category name">Category</th>
                  <th className="py-2.5 px-2 font-medium text-right cursor-help w-[60px]" title="Score = (LTV:CAC + Base CLV + Market Size) * (Acquisition Difficulty, Loyalty, Story, Niche Multipliers)">Score</th>
                  <th className="py-2.5 px-2 font-medium text-right cursor-help w-[60px]" title="Customer Lifetime Value / Acquisition Cost. 0 means not enough AI data found.">LTV:CAC</th>
                  <th className="py-2.5 px-2 font-medium text-right cursor-help w-[80px]" title="Estimated Customer Lifetime Value in Euros">CLV</th>
                  <th className="py-2.5 px-2 font-medium cursor-help w-[80px]" title="Estimated difficulty to acquire a customer">Acq.</th>
                  <th className="py-2.5 px-2 font-medium cursor-help min-w-[120px]" title="Exact Audience Size in NL (Calculated)">Audience</th>
                  <th className="py-2.5 px-2 font-medium cursor-help w-[80px]" title="How emotionally attached a customer is to the product/service">Loyalty</th>
                  <th className="py-2.5 px-2 font-medium cursor-help w-[100px]" title="Current tracking pipeline status">Status</th>
                  <th className="py-2.5 px-2 font-medium text-right w-[80px]">Act.</th>
                </tr>
              </thead>
              <tbody>
                {groupedCategories.map(macroGroup => (
                  <Fragment key={macroGroup.macro}>
                    {/* Macro sector banner */}
                    <tr className="sticky top-[33px] z-10">
                      <td colSpan={9} className="py-1.5 px-3 bg-[#080808] border-y border-[#141414]">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#444] tracking-[0.12em] uppercase">{macroGroup.macro}</span>
                          <div className="h-px flex-1 bg-[#141414]"></div>
                          <span className="text-[10px] font-mono text-[#2a2a2a]">{macroGroup.totalCount}</span>
                        </div>
                      </td>
                    </tr>
                    {macroGroup.groups.map(group => (
                      <Fragment key={group.industry}>
                        {/* Industry sub-group header */}
                        <tr id={`industry-${group.industry.replace(/\s+/g, '-')}`} className="bg-[#080808] border-b border-[#141414]">
                          <td colSpan={9} className="py-1.5 px-3 pl-6">
                            <span className="text-[10px] font-medium text-[#333] uppercase tracking-[0.12em]">{group.industry}</span>
                            <span className="ml-2 text-[9px] font-mono text-[#2a2a2a]">{group.categories.length}</span>
                          </td>
                        </tr>
                        {group.categories.map((c) => (
                          <tr
                            key={c.id}
                            className={cn(
                              "group hover:bg-[#0f0f0f] transition-colors cursor-pointer border-b border-[#0f0f0f]",
                              c.status === 'Killed' && "opacity-40",
                              enhancingIds[c.id]?.__state === 'queued' && "bg-[#d4ac0d]/03",
                              enhancingIds[c.id]?.__state === 'error' && "bg-[#f87171]/03",
                              enhancingIds[c.id]?.__state === 'done' && "bg-[#4ade80]/03",
                            )}
                            onClick={() => onEdit(c.id)}
                          >
                            <td className="py-2 px-3 sticky left-0 z-10 bg-[#080808] group-hover:bg-[#0f0f0f] transition-colors shadow-[4px_0_8px_rgba(0,0,0,0.7)] border-r border-[#141414]" title={c.targetAudience}>
                              <p className="text-[13px] font-semibold text-[#d0d0d0] leading-tight">{c.name}</p>
                              <p className="text-[11px] text-[#333] leading-tight mt-0.5 line-clamp-1">{c.targetAudience}</p>
                            </td>
                            <td className="py-2 px-2 text-[#4ade80] font-mono font-semibold text-right text-sm">{c.score.toFixed(1)}</td>
                            <td
                              className={cn("py-2 px-2 text-xs font-mono text-right cursor-help whitespace-nowrap", c.ltvCac >= 4 ? "text-[#4ade80]" : c.ltvCac < 2 ? "text-[#f87171]" : "text-[#aaa]")}
                              title={c.ltvCac === 0 ? "0 typically means the AI could not find reliable numerical data yet, or CAC is 0." : "Higher is better. >3 is healthy."}
                            >
                              {c.ltvCac}x
                            </td>
                            <td
                              className="py-2 px-2 text-xs text-[#aaa] font-mono text-right cursor-help whitespace-nowrap"
                              title={c.estimatedCLV === 0 ? "0 means no reliable data was found during research, run 'Deep Research AI' to fill." : undefined}
                            >
                              €{c.estimatedCLV}
                            </td>
                            <td className={cn("py-2 px-2 text-xs whitespace-nowrap", c.acquisitionDifficulty === 'Easy' ? 'text-[#4ade80]' : c.acquisitionDifficulty === 'Hard' ? 'text-[#f87171]' : 'text-[#666]')}>{c.acquisitionDifficulty}</td>
                            <td
                              className="py-2 px-2 leading-tight"
                              title={c.funnelBreakdownNL || c.audienceSizeNL || 'Run deep research to compute TAM→SAM→SOM funnel'}
                            >
                              {c.somNL != null ? (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1 font-mono text-[10px]">
                                    <span className="text-[#484848]">{(c.tamNL ?? 0).toLocaleString()}</span>
                                    <span className="text-[#2a2a2a]">→</span>
                                    <span className="text-[#666]">{(c.samNL ?? 0).toLocaleString()}</span>
                                    <span className="text-[#2a2a2a]">→</span>
                                    <span className="text-[#e05000] font-bold">{(c.somNL).toLocaleString()}</span>
                                  </div>
                                  <span className="text-[9px] uppercase tracking-wider text-[#3a3a3a]">TAM → SAM → SOM</span>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-[#e05000]">{c.audienceSizeNL || <span className="opacity-30">N/A</span>}</span>
                              )}
                            </td>
                            <td className={cn("py-2 px-2 text-xs whitespace-nowrap", c.emotionalLoyalty === 'High' ? 'text-[#4ade80]' : c.emotionalLoyalty === 'Low' ? 'text-[#f87171]' : 'text-[#666]')}>{c.emotionalLoyalty}</td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider",
                                c.status === 'Winner' ? 'bg-[#4ade80]/08 text-[#4ade80] border border-[#4ade80]/15' :
                                c.status === 'Killed' ? 'bg-[#f87171]/08 text-[#f87171] border border-[#f87171]/15' :
                                c.status === 'Shortlisted' ? 'bg-[#e05000]/08 text-[#e05000] border border-[#e05000]/15' :
                                'bg-[#1a1a1a] text-[#666] border border-[#252525]'
                              )}>
                                {c.status}
                              </span>
                              {(() => {
                                const ai = getAiResearchStatus(c);
                                if (ai === 'none') return null;
                                return (
                                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ml-1',
                                    ai === 'done'    ? 'bg-[#4ade80]/08 text-[#4ade80] border border-[#4ade80]/15' :
                                    ai === 'partial' ? 'bg-[#d4ac0d]/08 text-[#d4ac0d] border border-[#d4ac0d]/15' :
                                                      'bg-[#f87171]/08 text-[#f87171] border border-[#f87171]/15'
                                  )} title={ai === 'done' ? 'All 10 AI agents completed' : ai === 'partial' ? 'Some agents completed, some failed or missing' : 'AI research failed'}>
                                    {ai === 'done' ? 'AI ✓' : ai === 'partial' ? 'AI ⚠' : 'AI ✗'}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {(() => {
                                  const entry = enhancingIds[c.id];
                                  if (!entry) return null;
                                  const state = entry.__state || 'running';
                                  if (state === 'queued') return (
                                    <div className="flex items-center gap-1.5 w-[80px]">
                                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                                      <span className="text-xs text-[#d4ac0d] font-mono">Queued</span>
                                    </div>
                                  );
                                  if (state === 'error') return (
                                    <div className="flex items-center gap-1.5 w-[80px]" title={entry.__error}>
                                      <AlertCircle className="w-3 h-3 text-[#f87171] shrink-0" />
                                      <span className="text-xs text-[#f87171] truncate">Failed</span>
                                    </div>
                                  );
                                  if (state === 'done') return (
                                    <div className="flex items-center gap-1.5 w-[80px]">
                                      <CheckCircle2 className="w-3 h-3 text-[#4ade80] shrink-0" />
                                      <span className="text-xs text-[#4ade80]">Done</span>
                                    </div>
                                  );
                                  // running
                                  return (
                                    <div className="flex flex-col items-end w-[100px] shrink-0">
                                      <div className="flex w-full justify-between items-center mb-1">
                                        <span className="text-xs text-[#e05000] font-mono">{getProgress(c.id)}%</span>
                                        <span className="text-xs text-[#e05000] truncate ml-1 max-w-[60px]">{entry.overall || 'Thinking...'}</span>
                                      </div>
                                      <div className="w-full h-1 bg-[#111] rounded-full overflow-hidden">
                                        <div className="h-full bg-[#e05000] transition-all duration-300" style={{ width: `${getProgress(c.id)}%` }} />
                                      </div>
                                    </div>
                                  );
                                })()}
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeepSearch(c.id); }}
                                  disabled={!!enhancingIds[c.id] && enhancingIds[c.id]?.__state !== 'error'}
                                  className={cn(
                                    "inline-flex items-center px-1.5 py-1 rounded transition-colors shrink-0",
                                    enhancingIds[c.id]?.__state === 'error'
                                      ? "bg-[#f87171]/08 text-[#f87171] hover:bg-[#f87171]/12"
                                      : "bg-[#e05000]/08 text-[#e05000] hover:bg-[#e05000]/15 disabled:opacity-40"
                                  )}
                                  title={enhancingIds[c.id]?.__state === 'error' ? 'Retry research' : 'Deep Search AI'}
                                >
                                  {enhancingIds[c.id]?.__state === 'running'
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : enhancingIds[c.id]?.__state === 'error'
                                    ? <AlertCircle className="w-3.5 h-3.5" />
                                    : <Sparkles className="w-3.5 h-3.5" />
                                  }
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
                {groupedCategories.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#484848] text-sm">No categories found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    );
}
