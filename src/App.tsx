import { useState, useEffect, useRef } from 'react';
import { Category, Weights, CategoryStatus } from './types';
import { INITIAL_CATEGORIES, INITIAL_WEIGHTS } from './data';
import { DashboardView } from './views/DashboardView';
import { CategoriesView } from './views/CategoriesView';
import { ComparisonView } from './views/ComparisonView';
import { EditCategoryView } from './views/EditCategoryView';
import { ImportView } from './views/ImportView';
import { ExportView } from './views/ExportView';
import { PromptsView } from './views/PromptsView';
import { DiscoveryView } from './views/DiscoveryView';
import { cn } from './utils';
import { Target, LayoutGrid, BarChart2, Plus, Settings2, Sparkles, FileText, DownloadCloud, Loader2, Terminal, Radar, Menu, Activity, CheckCircle2, AlertCircle, Cloud } from 'lucide-react';
import { agenticDeepResearchCategory, discoverDtcCategories } from './services/aiService';
import stringSimilarity from 'string-similarity';
import { lsLoadCategories, saveAllLayers, loadBestCategories } from './lib/db';

type ViewMode = 'dashboard' | 'categories' | 'comparison' | 'edit' | 'import' | 'export' | 'prompts' | 'discovery';

export default function App() {
  // Layer 3 (localStorage) is the only synchronous source — used for instant first render.
  // Layers 1 (server file) + 2 (IndexedDB) are loaded async in useEffect below and will
  // immediately replace this with whichever source has the most categories.
  const [categories, setCategories] = useState<Category[]>(() => {
    const ls = lsLoadCategories();
    return ls.length > 0 ? ls : INITIAL_CATEGORIES;
  });

  // Save status indicator
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [weights, setWeights] = useState<Weights>(INITIAL_WEIGHTS);
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showWeightsMenu, setShowWeightsMenu] = useState(false);
  const [enhancingIds, setEnhancingIds] = useState<Record<string, any>>({});

  const [importState, setImportState] = useState<{
    tasks: import('./views/ImportView').DocumentTask[];
  }>({
    tasks: []
  });

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isBulkResearching, setIsBulkResearching] = useState(false);
  const [isMainSidebarOpen, setIsMainSidebarOpen] = useState(true);
  const [discoveryProgress, setDiscoveryProgress] = useState<import('./services/aiService').DiscoveryProgress | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bulkResearchAbortRef = useRef<AbortController | null>(null);
  const categoriesRef = useRef(categories);

  useEffect(() => {
    categoriesRef.current = categories;

    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    setSaveStatus('saving');

    saveAllLayers(categories);

    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('saved'), 600);
    const clearTimer = setTimeout(() => setSaveStatus('idle'), 4000);
    return () => clearTimeout(clearTimer);
  }, [categories]);

  // On mount: load from server file + IndexedDB (async). If either has more categories
  // than what localStorage gave us on first render, upgrade immediately (no data loss).
  useEffect(() => {
    loadBestCategories().then(({ categories: best, source }) => {
      if (best.length > 0) {
        setCategories(prev => {
          if (best.length > prev.length) {
            console.info(`[Persistence] Loaded ${best.length} categories from ${source} (had ${prev.length} from localStorage)`);
            return best;
          }
          return prev;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-off deduplication sweep on startup
  useEffect(() => {
    setCategories(prev => {
      const deduped: Category[] = [];
      for (const cat of prev) {
        const existingNames = deduped.map(c => c.name.toLowerCase());
        const bestMatch = existingNames.length > 0 ? stringSimilarity.findBestMatch(cat.name.toLowerCase(), existingNames).bestMatch : null;
        if (bestMatch && bestMatch.rating > 0.85) {
          console.log('Automated deduplication removed:', cat.name);
          continue; // skip duplicate
        }
        deduped.push(cat);
      }
      return deduped.length !== prev.length ? deduped : prev;
    });
  }, []);

  // Maximum CLV in active dataset used for normalized relative scoring
  const maxClv = Math.max(1, ...categories.filter(c => c.status !== 'Killed').map(c => c.estimatedCLV));

  const handleSaveCategory = (cat: Category) => {
    setCategories(prev => {
      const exists = prev.find(c => c.id === cat.id);
      if (exists) {
        return prev.map(c => c.id === cat.id ? cat : c);
      }
      return [...prev, cat];
    });
    setEditingId(null);
    setCurrentView('categories');
  };

  const handleUpdateStatus = (id: string, status: CategoryStatus) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, status, lastUpdated: new Date().toISOString() } : c));
  };

  const handleDeleteCategory = (id: string) => {
     setCategories(prev => prev.filter(c => c.id !== id));
     setCurrentView('categories');
  };

  const openEditor = (id: string | null) => {
    setEditingId(id);
    setCurrentView('edit');
  };

  const handleDeepSearch = async (id: string) => {
    const category = categoriesRef.current.find(c => c.id === id);
    if (!category) return;
    
    try {
      const enriched = await agenticDeepResearchCategory(
        category, 
        (progress) => setEnhancingIds(prev => ({ ...prev, [id]: progress })),
        (partialUpdate) => {
          setCategories(prev => prev.map(c => {
            if (c.id === id) {
              return {
                ...c,
                ...partialUpdate,
                agentResults: {
                  ...(c.agentResults || {}),
                  ...(partialUpdate.agentResults || {})
                },
                lastUpdated: new Date().toISOString()
              };
            }
            return c;
          }));
        }
      );
      
      setCategories(prev => prev.map(c => {
        if (c.id === id) {
          return {
            ...c,
            ...enriched,
            agentResults: {
              ...(c.agentResults || {}),
              ...(enriched.agentResults || {})
            },
            lastUpdated: new Date().toISOString()
          };
        }
        return c;
      }));
    } catch (e: any) {
      alert("Deep Search API Error: " + e.message);
    } finally {
      setTimeout(() => {
        setEnhancingIds(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 3000); // Leave success message visible for 3 seconds
    }
  };

  const processWithConcurrency = (items: Category[], concurrency: number, action: (id: string) => Promise<void>, signal?: AbortSignal): Promise<void> => {
    let index = 0;
    const workers = Array(concurrency).fill(null).map(async () => {
      while (index < items.length && !signal?.aborted) {
        const current = items[index++];
        try {
          await action(current.id);
        } catch (e) {
          console.error(e);
        }
      }
    });
    return Promise.all(workers).then(() => {});
  };

  /** Returns true if the category has any agent results that failed or are missing */
  const hasIncompleteAgents = (c: Category): boolean => {
    if (!c.agentResults) return false;
    const keys = ['unitEconomics', 'marketDynamics', 'localCompetitors', 'globalCompetitors', 'legalLogistics', 'suppliersBudget', 'foundersAndTeam'] as const;
    return keys.some(key => {
      const r = c.agentResults![key];
      return !r || r.startsWith('Error:');
    });
  };

  const handleDeepSearchAllNew = () => {
    const toResearch = categories.filter(c => c.status !== 'Killed' && !c.agentResults?.unitEconomics);
    if (toResearch.length === 0) return;
    const controller = new AbortController();
    bulkResearchAbortRef.current = controller;
    setIsBulkResearching(true);
    processWithConcurrency(toResearch, 1, handleDeepSearch, controller.signal)
      .finally(() => { setIsBulkResearching(false); bulkResearchAbortRef.current = null; });
  };

  const handleRefreshFailed = () => {
    const toRefresh = categories.filter(c => c.status !== 'Killed' && hasIncompleteAgents(c));
    if (toRefresh.length === 0) { alert('No failed or incomplete agent results found.'); return; }
    const controller = new AbortController();
    bulkResearchAbortRef.current = controller;
    setIsBulkResearching(true);
    processWithConcurrency(toRefresh, 1, handleDeepSearch, controller.signal)
      .finally(() => { setIsBulkResearching(false); bulkResearchAbortRef.current = null; });
  };

  const handleRefreshResearched = () => {
    const toRefresh = categories.filter(c => c.status !== 'Killed' && !!c.agentResults?.unitEconomics);
    if (toRefresh.length === 0) return;
    const controller = new AbortController();
    bulkResearchAbortRef.current = controller;
    setIsBulkResearching(true);
    processWithConcurrency(toRefresh, 1, handleDeepSearch, controller.signal)
      .finally(() => { setIsBulkResearching(false); bulkResearchAbortRef.current = null; });
  };

  const handleStopBulkResearch = () => {
    if (bulkResearchAbortRef.current) {
      bulkResearchAbortRef.current.abort();
    }
  };

  const handleStartDiscovery = async (prompt: string) => {
    if (isDiscovering) return;
    setIsDiscovering(true);
    setDiscoveryProgress(null);
    setDiscoveryError(null);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await discoverDtcCategories(
        prompt,
        () => categoriesRef.current.map(c => c.name),
        (prog) => setDiscoveryProgress(prog),
        (foundCat) => handleImport([foundCat]),
        controller.signal
      );
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setDiscoveryError(e.message || "An error occurred during discovery.");
      }
    } finally {
      setIsDiscovering(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopDiscovery = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleImport = (extracted: Partial<Category>[]) => {
    setCategories(prev => {
      let currentCategories = [...prev];
      const newItems: Category[] = [];
      
      for (const e of extracted) {
        const potentialName = e.name || 'Unknown Category';
        const potentialAudience = e.targetAudience || 'Unknown Audience';
        
        // Deduplicate against existing + already processed new items
        const allNames = [...currentCategories, ...newItems].map(c => c.name.toLowerCase());
        const bestMatch = allNames.length > 0 ? stringSimilarity.findBestMatch(potentialName.toLowerCase(), allNames).bestMatch : null;
        
        // If similarity is very high (>0.85), merge it instead of skipping
        if (bestMatch && bestMatch.rating > 0.85) {
          console.log('Merging duplicate:', potentialName, 'into', bestMatch.target, 'with', bestMatch.rating.toFixed(2));
          
          // Find the exact match in either currentCategories or newItems
          const targetNameLower = bestMatch.target.toLowerCase();
          const existIdx = currentCategories.findIndex(c => c.name.toLowerCase() === targetNameLower);
          
          if (existIdx !== -1) {
            currentCategories[existIdx] = {
              ...currentCategories[existIdx],
              notes: currentCategories[existIdx].notes + '\n\n' + (e.notes || ''),
            };
          } else {
            const newIdx = newItems.findIndex(c => c.name.toLowerCase() === targetNameLower);
            if (newIdx !== -1) {
              newItems[newIdx] = {
                 ...newItems[newIdx],
                 notes: newItems[newIdx].notes + '\n\n' + (e.notes || ''),
              };
            }
          }
          continue;
        }

        newItems.push({
          id: crypto.randomUUID(),
          name: potentialName,
          industry: e.industry || 'Uncategorized',
          targetAudience: potentialAudience,
          estimatedCLV: e.estimatedCLV || 0,
          estimatedCAC: e.estimatedCAC || 0,
          monthlyChurnPercent: e.monthlyChurnPercent || 10,
          marketSizeNL: e.marketSizeNL || 'Unknown',
          marketSizeScore: e.marketSizeScore || 5,
          realMonthlyConsumption: e.realMonthlyConsumption || false,
          monthlyConsumptionReason: e.monthlyConsumptionReason || '',
          acquisitionDifficulty: e.acquisitionDifficulty as any || 'Medium',
          emotionalLoyalty: e.emotionalLoyalty as any || 'Medium',
          brandType: 'Digital' as any,
          awarenessLevel: 'Solution Aware' as any,
          storyDepth: e.storyDepth || 5,
          microNichePotential: e.microNichePotential || 5,
          score: 0,
          status: 'Researching' as const,
          notes: e.notes || '',
          lastUpdated: new Date().toISOString()
        } as Category);
      }
      return [...newItems, ...currentCategories];
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-orange-500/30 selection:text-orange-200">
      
      {/* Sidebar Layout */}
      <div className="flex h-screen overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className={cn(
          "bg-gray-950 border-r border-gray-900 flex flex-col z-50 transition-all duration-300 relative",
          isMainSidebarOpen ? "w-64" : "w-0 overflow-hidden border-none"
        )}>
          <div className="h-16 flex items-center px-6 border-b border-gray-900 w-64 shrink-0 justify-between">
            <span className="font-extrabold tracking-widest text-[#FF1493] text-2xl drop-shadow-[2px_2px_0_#00FF00]">
              <span className="text-[#FF1493] relative">
                <span className="absolute -left-1 text-[#00FFFF] mix-blend-screen mix-blend-difference">F</span>
                F
              </span>
              L
              <span className="text-white relative">
                <span className="absolute -left-0.5 text-[#00FFFF]">A</span>
                <span className="absolute -left-1 text-[#FF1493]">A</span>
                A
              </span>
              S
              <span className="text-[#00FF00]">H</span>
              F
              <span className="text-white">A</span>
              C
              <span className="text-[#8A2BE2] relative drop-shadow-none">E</span>
              <span className="sr-only">FLASHFACE</span>
            </span>
          </div>

          <nav className="flex-1 py-6 px-4 space-y-2 w-64 shrink-0 overflow-y-auto">
            <NavItem 
              icon={<Target className="w-5 h-5" />} 
              label="Dashboard" 
              active={currentView === 'dashboard'} 
              onClick={() => setCurrentView('dashboard')} 
            />
            <NavItem 
              icon={<LayoutGrid className="w-5 h-5" />} 
              label="All Categories" 
              active={currentView === 'categories'} 
              onClick={() => setCurrentView('categories')} 
            />
            <NavItem 
              icon={<BarChart2 className="w-5 h-5" />} 
              label="Comparison Matrix" 
              active={currentView === 'comparison'} 
              onClick={() => setCurrentView('comparison')} 
            />
            <NavItem 
              icon={<Radar className={`w-5 h-5 ${isDiscovering ? 'animate-pulse text-emerald-400' : ''}`} />} 
              label="Discovery Swarm" 
              active={currentView === 'discovery'} 
              onClick={() => setCurrentView('discovery')} 
            />
            <NavItem 
              icon={importState.tasks.some(t => t.status === 'extracting') ? <Loader2 className="w-5 h-5 animate-spin text-orange-500" /> : <FileText className="w-5 h-5" />} 
              label="Import Data" 
              active={currentView === 'import'} 
              onClick={() => setCurrentView('import')} 
            />
            <NavItem 
              icon={<DownloadCloud className="w-5 h-5" />} 
              label="Export Data" 
              active={currentView === 'export'} 
              onClick={() => setCurrentView('export')} 
            />
            <NavItem 
              icon={<Terminal className="w-5 h-5" />} 
              label="AI Prompts" 
              active={currentView === 'prompts'} 
              onClick={() => setCurrentView('prompts')} 
            />
          </nav>

          <div className="p-4 border-t border-gray-900 w-64 shrink-0">
            <button 
              onClick={() => openEditor(null)}
              className="w-full flex items-center justify-center p-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium transition-colors border border-orange-500 shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)]"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Category
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
          
          {/* Top Header */}
          <header className="h-16 bg-[#050505]/80 backdrop-blur-md border-b border-gray-900 flex items-center justify-between px-4 lg:px-8 z-10 shrink-0">
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setIsMainSidebarOpen(!isMainSidebarOpen)}
                className="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors"
                title="Toggle Main Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-white capitalize">
                {currentView === 'edit' ? (editingId ? 'Edit Category' : 'New Category') : currentView.replace('-', ' ')}
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Save status + category count indicator */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs font-mono">
                <Cloud className="w-3 h-3 text-gray-500" />
                <span className="text-gray-400">{categories.length}</span>
                {saveStatus === 'saving' && <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />}
                {saveStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {saveStatus === 'error' && <AlertCircle className="w-3 h-3 text-rose-400" />}
              </div>

              <div className="relative">
              <button 
                onClick={() => setShowWeightsMenu(!showWeightsMenu)}
                className="flex items-center space-x-2 text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-800 px-4 py-2 border border-gray-800 rounded-lg transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                <span className="text-sm font-medium">Smart Weights</span>
              </button>

              {/* Weights Dropdown */}
              {showWeightsMenu && (
                <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6 z-50">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-800">
                    <h4 className="text-white font-bold">Calculation Weights</h4>
                    <span className="text-xs text-gray-500">Live Recalc</span>
                  </div>
                  <div className="space-y-4">
                    <WeightSlider name="CLV" value={weights.clv} min={0} max={50} onChange={v => setWeights({...weights, clv: v})} />
                    <WeightSlider name="Retention (1-Churn)" value={weights.retention} min={0} max={50} onChange={v => setWeights({...weights, retention: v})} />
                    <WeightSlider name="Acquisition Ease" value={weights.acquisition} min={0} max={50} onChange={v => setWeights({...weights, acquisition: v})} />
                    <WeightSlider name="Market Size" value={weights.marketSize} min={0} max={50} onChange={v => setWeights({...weights, marketSize: v})} />
                    <WeightSlider name="Emotional Loyalty" value={weights.loyalty} min={0} max={50} onChange={v => setWeights({...weights, loyalty: v})} />
                  </div>
                  <div className="mt-6 pt-4 border-t border-gray-800 text-center">
                    <p className="text-xs text-gray-500">These parameters drive the "Overall Decision Score"</p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </header>

          {/* Scrollable Context */}
          <main className={cn("flex-1 scroll-smooth relative", currentView === 'categories' ? 'overflow-hidden' : 'overflow-y-auto p-8')}>
            {currentView === 'dashboard' && <DashboardView categories={categories} weights={ weights} maxClv={maxClv} />}
            {currentView === 'categories' && <CategoriesView categories={categories} weights={weights} maxClv={maxClv} onEdit={openEditor} onUpdateStatus={handleUpdateStatus} onDeepSearch={handleDeepSearch} onDeepSearchAllNew={handleDeepSearchAllNew} onRefreshResearched={handleRefreshResearched} onRefreshFailed={handleRefreshFailed} onStopBulkResearch={handleStopBulkResearch} isBulkResearching={isBulkResearching} enhancingIds={enhancingIds} />}
            {currentView === 'comparison' && <ComparisonView categories={categories} weights={weights} maxClv={maxClv} />}
            {currentView === 'import' && <ImportView onImport={handleImport} state={importState} setState={setImportState} existingCategories={categories} />}
            {currentView === 'discovery' && (
              <DiscoveryView 
                isDiscovering={isDiscovering}
                progress={discoveryProgress}
                error={discoveryError}
                onStart={handleStartDiscovery}
                onStop={handleStopDiscovery}
                onClose={() => setCurrentView('dashboard')} 
              />
            )}
            {currentView === 'export' && <ExportView categories={categories} />}
            {currentView === 'prompts' && <PromptsView />}
            {currentView === 'edit' && (
              <EditCategoryView 
                category={editingId ? categories.find(c => c.id === editingId) || null : null} 
                onSave={handleSaveCategory}
                onCancel={() => setCurrentView('categories')}
                onDelete={handleDeleteCategory}
              />
            )}
          </main>
        </div>

      </div>
    </div>
  );
}

// Subcomponents

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-orange-500/10 text-orange-400 font-semibold border border-orange-500/20' 
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900 border border-transparent'
      }`}
    >
      {icon}
      <span className="ml-3 text-sm">{label}</span>
    </button>
  );
}

function WeightSlider({ name, value, min, max, onChange }: { name: string, value: number, min: number, max: number, onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400 uppercase tracking-wider">{name}</span>
        <span className="text-orange-400 font-bold">{value}%</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        value={value} 
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-orange-500 h-1bg-gray-800 rounded-lg appearance-none cursor-pointer"
        style={{
          boxShadow: 'none'
        }}
      />
    </div>
  );
}

