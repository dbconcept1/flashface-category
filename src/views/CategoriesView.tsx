import { useState, Fragment } from 'react';
import { Category, Weights, CategoryStatus } from '../types';
import { calculateDecisionScore, calculateLtvCac, cn, getMacroSector } from '../utils';
import { LayoutGrid, List, Search, Ban, Trophy, Sparkles, Loader2, Square, AlertCircle, CheckCircle2 } from 'lucide-react';

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
  enhancingIds: Record<string, any>;
}

export function CategoriesView({ categories, weights, maxClv, onEdit, onUpdateStatus, onDeepSearch, onDeepSearchAllNew, onRefreshResearched, onRefreshFailed, onStopBulkResearch, isBulkResearching, bulkStats, enhancingIds }: Props) {
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
    <div className="flex w-full h-full absolute inset-0 overflow-hidden bg-[#050505]">
      {/* Sidebar Menu for Macro Sectors */}
      <div 
        className={cn(
          "bg-[#0a0a0a] border-r border-gray-900 flex flex-col h-full shrink-0 z-20 transition-all duration-300",
          isSidebarOpen ? "w-64" : "w-0 overflow-hidden border-none"
        )}
      >
        <div className="p-4 border-b border-gray-900 shrink-0 w-64">
          <h3 className="font-bold text-gray-500 text-[10px] uppercase tracking-widest flex items-center justify-between">
            Mother Categories
            <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{groupedCategories.length}</span>
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 w-64">
          {groupedCategories.map(group => {
            const isExpanded = expandedMacros[group.macro] !== false; // expanded by default
            return (
              <div key={group.macro} className="space-y-1">
                <button 
                  onClick={() => toggleMacro(group.macro)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800/50 transition-colors group cursor-pointer text-left"
                >
                  <span className="text-sm font-medium text-gray-300 group-hover:text-white truncate">{group.macro}</span>
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded">{group.totalCount}</span>
                </button>
                {isExpanded && (
                  <div className="pl-3 space-y-0.5 border-l border-gray-800/50 ml-2 py-1">
                    {group.groups.map(sub => (
                      <button 
                        key={sub.industry}
                        onClick={() => {
                          const el = document.getElementById(`industry-${sub.industry.replace(/\s+/g, '-')}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors text-left"
                      >
                        <span className="truncate pr-2">{sub.industry}</span>
                        <span className="text-[9px] font-mono opacity-50">{sub.categories.length}</span>
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
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4 p-4 lg:p-6 border-b border-gray-900 bg-[#0a0a0a] shrink-0 z-10 sticky top-0 w-full">
          <div className="flex items-center gap-3 self-start xl:self-center shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors"
              title="Toggle Sidebar"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 font-mono font-bold text-lg px-3 py-1 rounded-lg">
            {categoriesWithScores.length}
          </div>
          <span className="text-gray-400 font-medium">Categories</span>
        </div>
        
        <div className="relative w-full xl:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search categories..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto xl:ml-auto">
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="flex-1 sm:flex-none bg-gray-900 border border-gray-800 text-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
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
                className="flex items-center px-3 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap animate-pulse"
              >
                <Square className="w-3 h-3 mr-1.5" />
                Stop Queue
              </button>
            ) : (
              <>
                <button
                  onClick={onDeepSearchAllNew}
                  className="flex items-center px-3 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Research New
                </button>
                <button
                  onClick={onRefreshFailed}
                  className="flex items-center px-3 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                  title="Re-run only categories with failed or missing agent results"
                >
                  Retry Failed
                </button>
                <button
                  onClick={onRefreshResearched}
                  className="flex items-center px-3 py-2 bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-200 text-xs rounded-lg font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                  title="Full re-research of all researched categories"
                >
                  Refresh All
                </button>
              </>
            )}
          </div>
          <div className="flex items-center bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button 
              onClick={() => setViewMode('table')}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === 'table' ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white")}
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === 'grid' ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white")}
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
            ? "bg-orange-500/5 border-orange-500/15 text-orange-400"
            : bulkStats && bulkStats.failed > 0
            ? "bg-rose-500/5 border-rose-500/15"
            : "bg-emerald-500/5 border-emerald-500/15"
        )}>
          <div className="flex items-center gap-3">
            {isBulkResearching
              ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              : bulkStats && bulkStats.failed > 0
              ? <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
              : <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            }
            {isBulkResearching && bulkStats && (
              <>
                <div className="w-32 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${Math.round(((bulkStats.done + bulkStats.failed) / bulkStats.total) * 100)}%` }}
                  />
                </div>
                <span>{bulkStats.done + bulkStats.failed} / {bulkStats.total} complete</span>
              </>
            )}
            {isBulkResearching && !bulkStats && <span>Starting queue...</span>}
            {!isBulkResearching && bulkStats && (
              <span className={bulkStats.failed > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                Research finished — {bulkStats.done} succeeded{bulkStats.failed > 0 ? `, ${bulkStats.failed} failed` : ''}
              </span>
            )}
          </div>
          {isBulkResearching && (
            <button
              onClick={onStopBulkResearch}
              className="text-gray-500 hover:text-rose-400 transition-colors text-xs uppercase tracking-wider"
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
                 <h1 className="text-2xl font-black text-white tracking-tight uppercase">{macroGroup.macro}</h1>
                 <div className="h-px flex-1 bg-gray-800"></div>
              </div>
              {macroGroup.groups.map(group => (
                <div key={group.industry} id={`industry-${group.industry.replace(/\s+/g, '-')}`} className="space-y-4 pl-0 md:pl-6 border-l-0 md:border-l-2 border-gray-900">
                  <h2 className="text-xl font-bold border-b border-gray-800 pb-2 text-gray-300 uppercase tracking-widest flex items-center justify-between">
                    {group.industry}
                    <span className="text-sm font-mono text-gray-500 bg-gray-900 border border-gray-800 px-3 py-1 rounded-full" title="Number of categories in this industry">{group.categories.length}</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {group.categories.map(cat => (
                <div 
                  key={cat.id} 
                  className={cn(
                    "group relative bg-[#111111] border rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-black/50 overflow-hidden cursor-pointer flex flex-col",
                    cat.status === 'Killed' ? "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 border-gray-800" : "border-gray-800 hover:border-orange-500/50"
                  )}
                  onClick={() => onEdit(cat.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 right-pr-4">
                      <h3 className="text-xl font-bold text-white mb-1 line-clamp-2 leading-tight group-hover:text-orange-400 transition-colors uppercase tracking-tight">{cat.name}</h3>
                      <p className="text-sm text-gray-400 line-clamp-1">{cat.targetAudience}</p>
                    </div>
                    <div className="text-right bg-gray-900 rounded-lg px-3 py-2 border border-gray-800 min-w-[60px]">
                      <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest leading-none mb-1 cursor-help" title="Score = (LTV:CAC + Base CLV + Market Size) * (Multipliers)">Score</p>
                      <p className="text-xl font-bold text-emerald-400 font-mono leading-none cursor-help" title="Expected Value Index generated via weighted structural scoring.">{cat.score.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 my-6">
                    <div>
                      <p className="text-xs text-gray-500 uppercase min-h-[16px]" title="Lifetime Value to Customer Acquisition Cost Ratio (Max 10x)">LTV:CAC</p>
                      <p 
                        className={cn("text-lg font-mono font-medium cursor-help", cat.ltvCac >= 4 ? "text-emerald-400" : cat.ltvCac < 2 ? "text-rose-400" : "text-gray-300")}
                        title={cat.ltvCac === 0 ? "0 typically means the AI could not find reliable numerical data yet, or CAC is 0." : "Higher is better. >3 is healthy."}
                      >
                        {cat.ltvCac}x
                      </p>
                    </div>
                    <div>
                       <p className="text-xs text-gray-500 uppercase min-h-[16px]" title="Estimated Customer Lifetime Value">CLV</p>
                       <p 
                         className="text-lg font-mono font-medium text-gray-300 cursor-help"
                         title={cat.estimatedCLV === 0 ? "0 means no reliable data was found during research, run 'Deep Research AI' to fill." : undefined}
                       >
                         €{cat.estimatedCLV}
                       </p>
                    </div>
                    <div>
                       <p className="text-xs text-gray-500 uppercase min-h-[16px]">Market Size</p>
                       <p className="text-sm font-medium text-gray-300 truncate" title={cat.marketSizeNL}>{cat.marketSizeNL}</p>
                       <p className="text-xs font-bold text-orange-400 mt-1 truncate" title="Exact Audience Size (NL)">{cat.audienceSizeNL || <span className="opacity-30">N/A</span>}</p>
                    </div>
                     <div>
                       <p className="text-xs text-gray-500 uppercase min-h-[16px]">Loyalty</p>
                       <p className={cn("text-sm font-medium", 
                        cat.emotionalLoyalty === 'High' ? 'text-emerald-400' : 
                        cat.emotionalLoyalty === 'Low' ? 'text-rose-400' : 'text-gray-300'
                       )}>{cat.emotionalLoyalty}</p>
                    </div>
                  </div>

                  <div className="mt-auto border-t border-gray-800 pt-4 flex justify-between items-center">
                    <span className={cn("inline-flex items-center px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider", 
                      cat.status === 'Winner' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      cat.status === 'Killed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      cat.status === 'Shortlisted' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                      'bg-gray-800 text-gray-400 border border-gray-700'
                    )}>
                      {cat.status === 'Winner' && <Trophy className="w-3 h-3 mr-1" />}
                      {cat.status}
                    </span>
                    
                    <div className="flex gap-2 items-center w-full justify-end" onClick={e => e.stopPropagation()}>
                      {enhancingIds[cat.id] && (
                        <div className="flex flex-col items-end mr-2 w-full max-w-[120px]">
                          <div className="flex w-full justify-between items-center mb-1">
                            <span className="text-[10px] text-orange-400 italic font-mono">{getProgress(cat.id)}%</span>
                            <span className="text-[10px] items-end text-orange-400 italic truncate ml-2">
                              {enhancingIds[cat.id].overall || 'Thinking...'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${getProgress(cat.id)}%` }} />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeepSearch(cat.id); }}
                        disabled={!!enhancingIds[cat.id]}
                        className="flex text-xs items-center px-2 py-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded transition-colors disabled:opacity-50"
                        title="Deep Research with AI"
                      >
                        {enhancingIds[cat.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      </button>
                      {cat.status !== 'Killed' && (
                        <button 
                          onClick={() => onUpdateStatus(cat.id, 'Killed')}
                          className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                          title="Kill Category"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {cat.status !== 'Winner' && cat.status !== 'Killed' && (
                        <button 
                          onClick={() => onUpdateStatus(cat.id, 'Winner')}
                          className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
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
            <div className="py-12 text-center text-gray-500 text-sm">No categories found.</div>
          )}
        </div>
          </div>
        )}

        {/* Table View — single unified scroll container, one sticky header */}
        {viewMode === 'table' && (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[860px] bg-[#111111]">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-gray-800 bg-gray-900 text-gray-500 uppercase tracking-widest text-[10px]">
                  <th className="py-2 px-3 font-normal sticky left-0 z-30 bg-gray-900 shadow-[4px_0_12px_rgba(0,0,0,0.5)] border-r border-gray-800" title="The business category name">Category</th>
                  <th className="py-2 px-2 font-normal text-right cursor-help w-[60px]" title="Score = (LTV:CAC + Base CLV + Market Size) * (Acquisition Difficulty, Loyalty, Story, Niche Multipliers)">Score</th>
                  <th className="py-2 px-2 font-normal text-right cursor-help w-[60px]" title="Customer Lifetime Value / Acquisition Cost. 0 means not enough AI data found.">LTV:CAC</th>
                  <th className="py-2 px-2 font-normal text-right cursor-help w-[80px]" title="Estimated Customer Lifetime Value in Euros">CLV</th>
                  <th className="py-2 px-2 font-normal cursor-help w-[80px]" title="Estimated difficulty to acquire a customer">Acq. Diff</th>
                  <th className="py-2 px-2 font-normal cursor-help min-w-[120px]" title="Exact Audience Size in NL (Calculated)">Audience</th>
                  <th className="py-2 px-2 font-normal cursor-help w-[80px]" title="How emotionally attached a customer is to the product/service">Loyalty</th>
                  <th className="py-2 px-2 font-normal cursor-help w-[100px]" title="Current tracking pipeline status">Status</th>
                  <th className="py-2 px-2 font-normal text-right w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedCategories.map(macroGroup => (
                  <Fragment key={macroGroup.macro}>
                    {/* Macro sector banner — stays visible as you scroll into sub-industries */}
                    <tr className="sticky top-[29px] z-10">
                      <td colSpan={9} className="py-2 px-4 bg-[#050505] border-y border-gray-800">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-black text-white tracking-tight uppercase">{macroGroup.macro}</span>
                          <div className="h-px flex-1 bg-gray-800/60"></div>
                          <span className="text-[9px] font-mono text-gray-600">{macroGroup.totalCount}</span>
                        </div>
                      </td>
                    </tr>
                    {macroGroup.groups.map(group => (
                      <Fragment key={group.industry}>
                        {/* Industry sub-group header */}
                        <tr id={`industry-${group.industry.replace(/\s+/g, '-')}`} className="bg-[#0a0a0a] border-b border-gray-800">
                          <td colSpan={9} className="py-1.5 px-4 pl-8">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{group.industry}</span>
                            <span className="ml-2 text-[9px] font-mono text-gray-600 bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded">{group.categories.length}</span>
                          </td>
                        </tr>
                        {group.categories.map((c) => (
                          <tr
                            key={c.id}
                            className={cn(
                              "group hover:bg-gray-800/30 transition-colors cursor-pointer",
                              c.status === 'Killed' && "opacity-50",
                              enhancingIds[c.id]?.__state === 'queued' && "bg-yellow-500/[0.04]",
                              enhancingIds[c.id]?.__state === 'error' && "bg-rose-500/[0.04]",
                              enhancingIds[c.id]?.__state === 'done' && "bg-emerald-500/[0.04]",
                            )}
                            onClick={() => onEdit(c.id)}
                          >
                            <td className="py-2 px-3 sticky left-0 z-10 bg-[#111111] group-hover:bg-[#1a1a1a] transition-colors shadow-[4px_0_12px_rgba(0,0,0,0.5)] border-r border-gray-800" title={c.targetAudience}>
                              <p className="text-sm font-bold text-white leading-tight">{c.name}</p>
                              <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-1">{c.targetAudience}</p>
                            </td>
                            <td className="py-2 px-2 text-emerald-400 font-mono font-bold text-right text-sm">{c.score.toFixed(1)}</td>
                            <td
                              className={cn("py-2 px-2 text-xs font-mono text-right cursor-help whitespace-nowrap", c.ltvCac >= 4 ? "text-emerald-400" : c.ltvCac < 2 ? "text-rose-400" : "text-gray-300")}
                              title={c.ltvCac === 0 ? "0 typically means the AI could not find reliable numerical data yet, or CAC is 0." : "Higher is better. >3 is healthy."}
                            >
                              {c.ltvCac}x
                            </td>
                            <td
                              className="py-2 px-2 text-xs text-gray-300 font-mono text-right cursor-help whitespace-nowrap"
                              title={c.estimatedCLV === 0 ? "0 means no reliable data was found during research, run 'Deep Research AI' to fill." : undefined}
                            >
                              €{c.estimatedCLV}
                            </td>
                            <td className={cn("py-2 px-2 text-xs whitespace-nowrap", c.acquisitionDifficulty === 'Easy' ? 'text-emerald-400' : c.acquisitionDifficulty === 'Hard' ? 'text-rose-400' : 'text-gray-400')}>{c.acquisitionDifficulty}</td>
                            <td className="py-2 px-2 text-xs font-medium text-orange-400 leading-tight" title={c.audienceSizeNL}>{c.audienceSizeNL || <span className="opacity-30">N/A</span>}</td>
                            <td className={cn("py-2 px-2 text-xs whitespace-nowrap", c.emotionalLoyalty === 'High' ? 'text-emerald-400' : c.emotionalLoyalty === 'Low' ? 'text-rose-400' : 'text-gray-400')}>{c.emotionalLoyalty}</td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider",
                                c.status === 'Winner' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                c.status === 'Killed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                c.status === 'Shortlisted' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                'bg-gray-800 text-gray-400 border border-gray-700'
                              )}>
                                {c.status}
                              </span>
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
                                      <span className="text-[10px] text-yellow-400 font-mono">Queued</span>
                                    </div>
                                  );
                                  if (state === 'error') return (
                                    <div className="flex items-center gap-1.5 w-[80px]" title={entry.__error}>
                                      <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                                      <span className="text-[10px] text-rose-400 truncate">Failed</span>
                                    </div>
                                  );
                                  if (state === 'done') return (
                                    <div className="flex items-center gap-1.5 w-[80px]">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span className="text-[10px] text-emerald-400">Done</span>
                                    </div>
                                  );
                                  // running
                                  return (
                                    <div className="flex flex-col items-end w-[100px] shrink-0">
                                      <div className="flex w-full justify-between items-center mb-1">
                                        <span className="text-[10px] text-orange-400 font-mono">{getProgress(c.id)}%</span>
                                        <span className="text-[10px] text-orange-400 truncate ml-1 max-w-[60px]">{entry.overall || 'Thinking...'}</span>
                                      </div>
                                      <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${getProgress(c.id)}%` }} />
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
                                      ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                      : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-40"
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
                    <td colSpan={9} className="py-12 text-center text-gray-500 text-sm">No categories found.</td>
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
