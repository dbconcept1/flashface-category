import { useState, useEffect, useRef } from 'react';
import { Category, Weights, CategoryStatus, BrandType, AwarenessLevel } from './types';
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
import { Target, LayoutGrid, BarChart2, Plus, Settings2, FileText, DownloadCloud, Loader2, Terminal, Radar, Menu, CheckCircle2, AlertCircle, Cloud, Euro, MessageSquare, Brain, TrendingUp, Headphones } from 'lucide-react';
import { agenticDeepResearchCategory, discoverDtcCategories, createInitialProgress } from './services/aiService';
import stringSimilarity from 'string-similarity';
import { lsLoadCategories, saveAllLayers, loadBestCategories, flushGithubSave } from './lib/db';
import { SettingsView } from './views/SettingsView';
import { ChatGPTView } from './views/ChatGPTView';
import { IntelView } from './views/IntelView';
import { BrainView } from './views/BrainView';
import { FinanceView } from './views/FinanceView';
import { BrandTrackerView } from './views/BrandTrackerView';
import { CompanyProfilesView } from './views/CompanyProfilesView';
import { IdeasView } from './views/IdeasView';
import type { IntelNote, FinanceScenario, TrackedBrand, CompanyProfile, Idea, FounderPodcast, PodcastEpisode, BrainEntry, BrainConversation } from './types';
import { loadBestBrain, saveBrainAllLayers } from './lib/brainDb';
import { loadBestConversations, saveConversationsAllLayers } from './lib/conversationDb';
import { syncChatGptConnectorExtras } from './lib/chatgptConnector';
import { enrichNote } from './services/intelService';
import { researchBrand } from './services/brandService';
import type { BrandInput } from './services/brandService';
import { Store, Building2, Lightbulb } from 'lucide-react';
import { PodcastIntelView } from './views/PodcastIntelView';
import { discoverFounderEpisodes, extractEpisodeInsights } from './services/podcastService';
import { getSettings, calcBudgetPercent } from './lib/settings';
import { useResearchSetter } from './lib/researchContext';
import { FoundersView } from './views/FoundersView';
import type { FounderProfile } from './types';
import { scanCompanyReputation } from './services/reputationService';
import { UserCircle2 } from 'lucide-react';

type ViewMode = 'dashboard' | 'categories' | 'comparison' | 'edit' | 'import' | 'export' | 'prompts' | 'discovery' | 'settings' | 'chatgpt' | 'brain' | 'intel' | 'finance' | 'brands' | 'companies' | 'ideas' | 'podcasts' | 'founders';

const VIEW_TITLES: Partial<Record<ViewMode, string>> = {
  dashboard: 'Overview',
  categories: 'Categories',
  comparison: 'Comparison Matrix',
  discovery: 'Discovery Swarm',
  import: 'Import Data',
  export: 'Export Data',
  prompts: 'AI Prompts',
  chatgpt: 'AI Assistant',
  settings: 'Settings',
  brain: 'Brain OS',
  intel: 'Intel Notes',
  finance: 'Financial Model',
  brands: 'Brand Tracker',
  companies: 'Company Intelligence',
  ideas: 'Ideas Board',
  podcasts: 'Podcast Intel',
  founders: 'Founders',
};

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
  const [importState, setImportState] = useState<{
    tasks: import('./views/ImportView').DocumentTask[];
  }>({
    tasks: []
  });

  const setEnhancingIds = useResearchSetter();

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isBulkResearching, setIsBulkResearching] = useState(false);
  const [spendingRefresh, setSpendingRefresh] = useState(0);
  const [bulkStats, setBulkStats] = useState<{ total: number; done: number; failed: number } | null>(null);
  const [brainEntries, setBrainEntries] = useState<BrainEntry[]>([]);
  const [conversations, setConversations] = useState<BrainConversation[]>([]);
  const [intelNotes, setIntelNotes] = useState<IntelNote[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_intel_notes') || '[]'); } catch { return []; }
  });
  const [financeScenarios, setFinanceScenarios] = useState<FinanceScenario[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_finance_scenarios') || '[]'); } catch { return []; }
  });
  const [trackedBrands, setTrackedBrands] = useState<TrackedBrand[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_brands') || '[]'); } catch { return []; }
  });
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_companies') || '[]'); } catch { return []; }
  });
  const [ideas, setIdeas] = useState<Idea[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_ideas') || '[]'); } catch { return []; }
  });
  const [founders, setFounders] = useState<FounderProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_founders') || '[]'); } catch { return []; }
  });
  const [founderPodcasts, setFounderPodcasts] = useState<FounderPodcast[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_podcasts') || '[]'); } catch { return []; }
  });
  const [podcastEpisodes, setPodcastEpisodes] = useState<PodcastEpisode[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_podcast_episodes') || '[]'); } catch { return []; }
  });
  const [scanningFounderId, setScanningFounderId] = useState<string | null>(null);
  const [extractingEpisodeIds, setExtractingEpisodeIds] = useState<string[]>([]);
  const [podcastScanErrors, setPodcastScanErrors] = useState<Record<string, string>>({});

  // ── Brain: 3-layer init + persist ───────────────────────────────────────────
  const hasLoadedBrainRef = useRef(false);
  // On mount: load from best available layer (API > IndexedDB > localStorage)
  useEffect(() => {
    loadBestBrain().then(({ entries, source }) => {
      if (entries.length > 0) {
        setBrainEntries(entries);
        console.info(`[Brain] Loaded ${entries.length} entries from ${source}`);
      }
    }).finally(() => { hasLoadedBrainRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // On change: save to all 3 layers (guarded to prevent overwriting on first render)
  useEffect(() => {
    if (!hasLoadedBrainRef.current) return;
    saveBrainAllLayers(brainEntries);
  }, [brainEntries]);

  // ── Conversations: 3-layer init ──────────────────────────────────────────────
  useEffect(() => {
    loadBestConversations().then(({ conversations: best, source }) => {
      if (best.length > 0) {
        setConversations(best);
        console.info(`[Conversations] Loaded ${best.length} from ${source}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist brain + intel + finance + brands + companies + ideas to localStorage
  useEffect(() => { localStorage.setItem('flashface_intel_notes', JSON.stringify(intelNotes)); }, [intelNotes]);
  useEffect(() => { localStorage.setItem('flashface_finance_scenarios', JSON.stringify(financeScenarios)); }, [financeScenarios]);
  useEffect(() => { localStorage.setItem('flashface_brands', JSON.stringify(trackedBrands)); }, [trackedBrands]);
  useEffect(() => { localStorage.setItem('flashface_companies', JSON.stringify(companyProfiles)); }, [companyProfiles]);
  useEffect(() => { localStorage.setItem('flashface_ideas', JSON.stringify(ideas)); }, [ideas]);
  useEffect(() => { localStorage.setItem('flashface_founders', JSON.stringify(founders)); }, [founders]);
  useEffect(() => { localStorage.setItem('flashface_podcasts', JSON.stringify(founderPodcasts)); }, [founderPodcasts]);
  useEffect(() => { localStorage.setItem('flashface_podcast_episodes', JSON.stringify(podcastEpisodes)); }, [podcastEpisodes]);

  // Browser-only datasets are mirrored to the ChatGPT connector so Actions can
  // read the same operational state as the live app.
  useEffect(() => {
    syncChatGptConnectorExtras({
      intelNotes,
      financeScenarios,
      trackedBrands,
      companyProfiles,
      ideas,
      founders,
      founderPodcasts,
      podcastEpisodes,
    }).catch((error) => {
      console.warn('[ChatGPT Connector] Extras sync failed', error);
    });
  }, [intelNotes, financeScenarios, trackedBrands, companyProfiles, ideas, founders, founderPodcasts, podcastEpisodes]);

  const handleAddBrainEntry   = (e: BrainEntry) => setBrainEntries(prev => [e, ...prev]);
  const handleUpdateBrainEntry = (e: BrainEntry) => setBrainEntries(prev => prev.map(x => x.id === e.id ? e : x));
  const handleDeleteBrainEntry = (id: string)    => setBrainEntries(prev => prev.filter(x => x.id !== id));

  const handleSaveConversation = (conv: BrainConversation) => {
    setConversations(prev => {
      const exists = prev.some(c => c.id === conv.id);
      const next = exists ? prev.map(c => c.id === conv.id ? conv : c) : [conv, ...prev];
      saveConversationsAllLayers(next);
      return next;
    });
  };

  // When the user clicks "Save to Brain" on a chat message, navigate to Brain
  // and pre-fill the entry form with the message content.
  const [prefillBrainContent, setPrefillBrainContent] = useState<string | null>(null);
  const handleSaveToBrain = (content: string) => {
    setPrefillBrainContent(content);
    setCurrentView('brain');
  };

  const handleAddNote = (note: IntelNote) => setIntelNotes(prev => [note, ...prev]);
  const handleDeleteNote = (id: string) => setIntelNotes(prev => prev.filter(n => n.id !== id));
  const handleAddScenario = (s: FinanceScenario) => setFinanceScenarios(prev => [s, ...prev]);
  const handleDeleteScenario = (id: string) => setFinanceScenarios(prev => prev.filter(s => s.id !== id));

  const handleEnrichNote = async (id: string) => {
    const note = intelNotes.find(n => n.id === id);
    if (!note) return;
    const enrichment = await enrichNote(note.content);
    setIntelNotes(prev => prev.map(n => n.id === id
      ? {
          ...n,
          ...enrichment,
          title: n.title || enrichment.suggestedTitle,
          source: n.source || enrichment.suggestedSource,
          tags: [...new Set([...n.tags, ...enrichment.suggestedTags])],
          updatedAt: new Date().toISOString(),
        }
      : n
    ));
  };

  const handleAddBrand = (input: BrandInput) => {
    const id = crypto.randomUUID();
    const brand: TrackedBrand = { id, ...input, status: 'researching', createdAt: new Date().toISOString() };
    setTrackedBrands(prev => [brand, ...prev]);
    researchBrand(input).then(result => {
      setTrackedBrands(prev => prev.map(b => b.id === id ? { ...b, ...result, status: 'complete', lastResearched: new Date().toISOString() } : b));
    }).catch((e: any) => {
      setTrackedBrands(prev => prev.map(b => b.id === id ? { ...b, status: 'error', error: e?.message ?? 'Research failed' } : b));
    });
  };

  const handleRetryBrand = (id: string) => {
    const brand = trackedBrands.find(b => b.id === id);
    if (!brand) return;
    setTrackedBrands(prev => prev.map(b => b.id === id ? { ...b, status: 'researching', error: undefined } : b));
    researchBrand({ name: brand.name, url: brand.url, userDescription: brand.userDescription }).then(result => {
      setTrackedBrands(prev => prev.map(b => b.id === id ? { ...b, ...result, status: 'complete', lastResearched: new Date().toISOString() } : b));
    }).catch((e: any) => {
      setTrackedBrands(prev => prev.map(b => b.id === id ? { ...b, status: 'error', error: e?.message ?? 'Research failed' } : b));
    });
  };

  const handleToggleBrandSchedule = (id: string) => {
    setTrackedBrands(prev => prev.map(b =>
      b.id === id ? { ...b, scheduledUpdate: !b.scheduledUpdate } : b
    ));
  };

    const handleAddBrandToCategories = (brand: TrackedBrand) => {
    const catId = crypto.randomUUID();
    handleImport([{
      id: catId,
      name: brand.detectedCategory || brand.name,
      industry: brand.detectedIndustry,
      targetAudience: brand.targetAudience || '',
      estimatedCLV: brand.estimatedCLV || 0,
      estimatedCAC: brand.estimatedCAC || 0,
      notes: `Brand Intel: ${brand.name}\n\n${brand.aiSummary || ''}`,
    }]);
    setTrackedBrands(prev => prev.map(b => b.id === brand.id ? { ...b, linkedCategoryId: catId } : b));
  };

  // ── Podcast Intel handlers ────────────────────────────────────────────────

  const handleAddFounder = (data: { founderName: string; channelQuery: string; description?: string }) => {
    setFounderPodcasts(prev => [...prev, { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() }]);
  };

  const handleDeleteFounder = (id: string) => {
    setFounderPodcasts(prev => prev.filter(f => f.id !== id));
    setPodcastEpisodes(prev => prev.filter(e => e.founderId !== id));
  };

  const handleScanFounder = async (founder: FounderPodcast) => {
    if (scanningFounderId) return;
    setScanningFounderId(founder.id);
    // clear previous error for this founder
    setPodcastScanErrors(prev => { const n = { ...prev }; delete n[founder.id]; return n; });
    try {
      const existingUrls = new Set(podcastEpisodes.filter(e => e.founderId === founder.id).map(e => e.youtubeUrl));
      const found = await discoverFounderEpisodes(founder, existingUrls, () => {});
      const newEpisodes: PodcastEpisode[] = found.map(ep => ({
        ...ep,
        id: crypto.randomUUID(),
        processingStatus: 'pending' as const,
        createdAt: new Date().toISOString(),
      }));
      if (newEpisodes.length > 0) {
        setPodcastEpisodes(prev => [...newEpisodes, ...prev]);
      }
      setFounderPodcasts(prev => prev.map(f => f.id === founder.id ? { ...f, lastScanned: new Date().toISOString() } : f));
    } catch (e: any) {
      setPodcastScanErrors(prev => ({ ...prev, [founder.id]: e.message || 'Scan failed' }));
    } finally {
      setScanningFounderId(null);
    }
  };

  const handleExtractEpisode = async (episode: PodcastEpisode) => {
    if (extractingEpisodeIds.includes(episode.id)) return;
    setExtractingEpisodeIds(prev => [...prev, episode.id]);
    setPodcastEpisodes(prev => prev.map(e => e.id === episode.id ? { ...e, processingStatus: 'processing' as const } : e));
    try {
      const result = await extractEpisodeInsights(episode, categories.map(c => c.name), () => {});
      setPodcastEpisodes(prev => prev.map(e => e.id === episode.id ? { ...e, ...result, processingStatus: 'complete' as const } : e));
    } catch (err: any) {
      setPodcastEpisodes(prev => prev.map(e => e.id === episode.id ? { ...e, processingStatus: 'error' as const, errorMessage: err.message } : e));
    } finally {
      setExtractingEpisodeIds(prev => prev.filter(id => id !== episode.id));
    }
  };

  const handleDeleteEpisode = (id: string) => {
    setPodcastEpisodes(prev => prev.filter(e => e.id !== id));
  };

  const handleSendEpisodeToIntelBrain = (episode: PodcastEpisode) => {
    const note: IntelNote = {
      id: crypto.randomUUID(),
      title: `${episode.founderName}: ${episode.title}`,
      content: episode.fullReport || [
        episode.summary || '',
        episode.keyTactics?.length ? `## Key Tactics\n${episode.keyTactics.map(t => `- ${t}`).join('\n')}` : '',
        episode.keyMetrics?.length ? `## Key Metrics\n${episode.keyMetrics.map(m => `- ${m}`).join('\n')}` : '',
        episode.businessInsights?.length ? `## Business Insights\n${episode.businessInsights.map(b => `- ${b}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n'),
      source: 'Podcast',
      tags: [episode.founderName, ...(episode.relevantCategories || [])].filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleAddNote(note);
    alert(`Saved to Intel Brain: "${note.title}"`);
  };

  /**
   * Create (or navigate to) a FounderProfile linked to a podcast founder.
   * If the podcast entry already has a linked profile, just navigate there.
   */
  const handleLinkPodcastToFounderProfile = (founder: FounderPodcast) => {
    if (founder.linkedFounderProfileId) {
      setCurrentView('founders');
      return;
    }
    const now = new Date().toISOString();
    const newProfile: FounderProfile = {
      id: crypto.randomUUID(),
      name: founder.founderName,
      notes: `Added from Podcast Intel.\nTracked channel: ${founder.channelQuery}${founder.description ? `\n\n${founder.description}` : ''}`,
      pastCompanies: [],
      keyInsights: [],
      createdAt: now,
      updatedAt: now,
    };
    setFounders(prev => [...prev, newProfile]);
    setFounderPodcasts(prev => prev.map(f =>
      f.id === founder.id ? { ...f, linkedFounderProfileId: newProfile.id } : f
    ));
    setCurrentView('founders');
  };

  /**
   * Create (or navigate to) a CompanyProfile linked to a tracked brand.
   * If the brand already has a linked company, just navigate there.
   */
  const handleLinkBrandToCompany = (brandId: string) => {
    const brand = trackedBrands.find(b => b.id === brandId);
    if (!brand) return;
    if (brand.linkedCompanyId) {
      setCurrentView('companies');
      return;
    }
    const now = new Date().toISOString();
    const newProfile: CompanyProfile = {
      id: crypto.randomUUID(),
      name: brand.name,
      url: brand.url,
      industry: brand.detectedIndustry,
      description: brand.coreInsight || brand.userDescription,
      entries: [],
      linkedBrandId: brand.id,
      createdAt: now,
      updatedAt: now,
    };
    setCompanyProfiles(prev => [...prev, newProfile]);
    setTrackedBrands(prev => prev.map(b =>
      b.id === brandId ? { ...b, linkedCompanyId: newProfile.id } : b
    ));
    setCurrentView('companies');
  };

  const [isMainSidebarOpen, setIsMainSidebarOpen] = useState(true);
  const [discoveryProgress, setDiscoveryProgress] = useState<import('./services/aiService').DiscoveryProgress | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bulkResearchAbortRef = useRef<AbortController | null>(null);
  const bulkCallbackRef = useRef<((succeeded: boolean) => void) | null>(null);
  const categoriesRef = useRef(categories);
  // Prevent writing seed/localStorage data back to the server file before the async
  // load from server + IndexedDB has completed. Without this guard, a fresh browser
  // session with an empty localStorage would race and overwrite the server file with
  // INITIAL_CATEGORIES before loadBestCategories could read the real data.
  const hasLoadedFromPersistenceRef = useRef(false);

  // Flush any pending debounced GitHub save when the user closes/refreshes the tab,
  // so the very last change is always committed even if the 8s debounce hasn't fired.
  useEffect(() => {
    const handleUnload = () => flushGithubSave();
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  useEffect(() => {
    categoriesRef.current = categories;

    // Don't persist until the initial async load is complete — avoids race where
    // seed data overwrites server file / IndexedDB before real data is read.
    if (!hasLoadedFromPersistenceRef.current) return;

    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    setSaveStatus('saving');

    saveAllLayers(categories).then(({ api, idb }) => {
      // Only show error if BOTH async layers fail — localStorage is always written
      if (!api && !idb) {
        setSaveStatus('error');
        saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 6000);
      } else {
        setSaveStatus('saved');
        saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 4000);
      }
    });
  }, [categories]);

  // On mount: load the best persisted state from all 3 layers (epoch-merged).
  // Must complete BEFORE we start writing back, to avoid overwriting real data
  // with INITIAL_CATEGORIES from an empty localStorage.
  useEffect(() => {
    loadBestCategories().then(({ categories: best, source }) => {
      if (best.length > 0) {
        // Always apply the merged result — it may differ from localStorage even
        // with the same count (e.g. a research update landed in IDB/server but
        // not in localStorage for this device).
        setCategories(prev => {
          const isDifferent = JSON.stringify(best.map(c => c.id + c.lastUpdated)) !==
                              JSON.stringify(prev.map(c => c.id + c.lastUpdated));
          if (isDifferent) {
            console.info(`[Persistence] Hydrated from ${source}: ${best.length} categories`);
            return best;
          }
          return prev;
        });
      }
    }).finally(() => {
      // Allow saves only once we know what the real persisted state is.
      hasLoadedFromPersistenceRef.current = true;
      // If nothing changed from initial state, still need to save INITIAL_CATEGORIES
      // to all layers (first-ever run scenario where no layer had any data).
      if (!lsLoadCategories().length) {
        saveAllLayers(categoriesRef.current);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On load: auto-research scheduled brands that haven't been updated in >7 days
  useEffect(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const due = trackedBrands.filter(b =>
      b.scheduledUpdate &&
      b.status === 'complete' &&
      (!b.lastResearched || now - new Date(b.lastResearched).getTime() > SEVEN_DAYS_MS)
    );
    if (!due.length) return;
    due.forEach(brand => {
      setTrackedBrands(prev => prev.map(b => b.id === brand.id ? { ...b, status: 'researching', error: undefined } : b));
      researchBrand({ name: brand.name, url: brand.url, userDescription: brand.userDescription }).then(result => {
        setTrackedBrands(prev => prev.map(b =>
          b.id === brand.id ? { ...b, ...result, status: 'complete', lastResearched: new Date().toISOString() } : b
        ));
      }).catch((e: any) => {
        setTrackedBrands(prev => prev.map(b =>
          b.id === brand.id ? { ...b, status: 'error', error: e?.message ?? 'Scheduled research failed' } : b
        ));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On load: auto-scan reputation for companies with scheduledScan enabled and >7 days old
  useEffect(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const due = companyProfiles.filter(p =>
      p.scheduledScan &&
      (!p.lastScanned || now - new Date(p.lastScanned).getTime() > SEVEN_DAYS_MS)
    );
    if (!due.length) return;
    due.forEach(profile => {
      scanCompanyReputation(profile.name, profile.url).then(scan => {
        setCompanyProfiles(prev => prev.map(p =>
          p.id === profile.id ? { ...p, reviewScan: scan, lastScanned: new Date().toISOString(), updatedAt: new Date().toISOString() } : p
        ));
      }).catch((e: any) => console.warn(`[Reputation] Scheduled scan failed for ${profile.name}:`, e?.message));
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

    // Transition queued → running (preserve agent list from queued initial state)
    setEnhancingIds(prev => {
      const existing = prev[id];
      return {
        ...prev,
        [id]: { ...(existing || createInitialProgress()), __state: 'running', overall: 'Preparing agents...' }
      };
    });

    let succeeded = false;
    try {
      const enriched = await agenticDeepResearchCategory(
        category,
        (progress) => setEnhancingIds(prev => ({ ...prev, [id]: { ...progress, __state: 'running' } })),
        (partialUpdate) => {
          setCategories(prev => prev.map(c => {
            if (c.id === id) {
              return {
                ...c,
                ...partialUpdate,
                agentResults: { ...(c.agentResults || {}), ...(partialUpdate.agentResults || {}) },
                lastUpdated: new Date().toISOString()
              };
            }
            return c;
          }));
        }
      );

      succeeded = true;
      setEnhancingIds(prev => ({
        ...prev,
        [id]: { ...(prev[id] || createInitialProgress()), __state: 'done', overall: 'All 7 agents complete' }
      }));
      setCategories(prev => prev.map(c => {
        if (c.id === id) {
          return {
            ...c,
            ...enriched,
            agentResults: { ...(c.agentResults || {}), ...(enriched.agentResults || {}) },
            lastUpdated: new Date().toISOString()
          };
        }
        return c;
      }));
    } catch (e: any) {
      // Store error in state — no alert, no auto-clear. Stays red until user retries.
      setEnhancingIds(prev => ({
        ...prev,
        [id]: {
          ...(prev[id] || createInitialProgress()),
          __state: 'error',
          __error: e.message,
          overall: e.message?.slice(0, 100) || 'Unknown error'
        }
      }));
    } finally {
      // Notify bulk queue tracker
      bulkCallbackRef.current?.(succeeded);
      setSpendingRefresh(v => v + 1);
      // Auto-clear success state after 4s — errors persist until re-run
      if (succeeded) {
        setTimeout(() => {
          setEnhancingIds(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 4000);
      }
    }
  };

  /** Set up a bulk research run: pre-populate queued state, wire stats callback. Returns AbortController. */
  const initBulkResearch = (toResearch: Category[]) => {
    const total = toResearch.length;
    const counter = { done: 0, failed: 0 };
    setBulkStats({ total, done: 0, failed: 0 });
    // Pre-populate all items as queued so rows immediately show they're in line
    setEnhancingIds(prev => {
      const next = { ...prev };
      toResearch.forEach((c, i) => {
        next[c.id] = {
          ...createInitialProgress(),
          __state: 'queued',
          overall: `Queued — position ${i + 1} of ${total}`
        };
      });
      return next;
    });
    bulkCallbackRef.current = (succeeded: boolean) => {
      if (succeeded) counter.done++;
      else counter.failed++;
      setBulkStats({ total, done: counter.done, failed: counter.failed });
    };
    const controller = new AbortController();
    bulkResearchAbortRef.current = controller;
    setIsBulkResearching(true);
    return controller;
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

  /** Returns true if the category has any agent results that failed or are missing (all 9 agents) */
  const hasIncompleteAgents = (c: Category): boolean => {
    if (!c.agentResults) return false;
    const keys = ['unitEconomics', 'marketDynamics', 'localCompetitors', 'globalCompetitors', 'legalLogistics', 'suppliersBudget', 'foundersAndTeam', 'adIntelligence', 'retentionEngineering', 'searchTrends'] as const;
    return keys.some(key => {
      const r = c.agentResults![key];
      return !r || r.startsWith('Error:');
    });
  };

  const handleDeepSearchAllNew = () => {
    const toResearch = categories.filter(c => c.status !== 'Killed' && !c.agentResults?.unitEconomics);
    if (toResearch.length === 0) return;
    const controller = initBulkResearch(toResearch);
    processWithConcurrency(toResearch, 2, handleDeepSearch, controller.signal)
      .finally(() => {
        setIsBulkResearching(false);
        bulkResearchAbortRef.current = null;
        bulkCallbackRef.current = null;
        setTimeout(() => setBulkStats(null), 8000);
      });
  };

  const handleRefreshFailed = () => {
    const toRefresh = categories.filter(c => c.status !== 'Killed' && hasIncompleteAgents(c));
    if (toRefresh.length === 0) { alert('No failed or incomplete agent results found.'); return; }
    const controller = initBulkResearch(toRefresh);
    processWithConcurrency(toRefresh, 2, handleDeepSearch, controller.signal)
      .finally(() => {
        setIsBulkResearching(false);
        bulkResearchAbortRef.current = null;
        bulkCallbackRef.current = null;
        setTimeout(() => setBulkStats(null), 8000);
      });
  };

  const handleRefreshResearched = () => {
    const toRefresh = categories.filter(c => c.status !== 'Killed' && !!c.agentResults?.unitEconomics);
    if (toRefresh.length === 0) return;
    const controller = initBulkResearch(toRefresh);
    processWithConcurrency(toRefresh, 2, handleDeepSearch, controller.signal)
      .finally(() => {
        setIsBulkResearching(false);
        bulkResearchAbortRef.current = null;
        bulkCallbackRef.current = null;
        setTimeout(() => setBulkStats(null), 8000);
      });
  };

  const handleStopBulkResearch = () => {
    if (bulkResearchAbortRef.current) {
      bulkResearchAbortRef.current.abort();
      // Clear all queued-but-not-started items immediately
      setEnhancingIds(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          if (next[id]?.__state === 'queued') delete next[id];
        });
        return next;
      });
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
          brandType: 'Solution-based' as BrandType,
          awarenessLevel: 'Problem-aware' as AwarenessLevel,
          storyDepth: e.storyDepth || 5,
          microNichePotential: e.microNichePotential || 5,
          status: 'Researching' as const,
          notes: e.notes || '',
          lastUpdated: new Date().toISOString()
        } as Category);
      }
      return [...newItems, ...currentCategories];
    });
  };

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0] font-sans">
      
      {/* Sidebar Layout */}
      <div className="flex h-screen overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className={cn(
          "bg-[#080808] border-r border-[#1a1a1a] flex flex-col z-50 transition-all duration-200 relative",
          isMainSidebarOpen ? "w-64" : "w-0 overflow-hidden border-none"
        )}>
          <div className="h-12 flex items-center px-4 border-b border-[#181818] w-64 shrink-0 justify-between">
            <div className="flex items-center gap-2.5">
              {/* Logomark */}
              <div className="w-6 h-6 rounded-md bg-[#e65200] flex items-center justify-center shrink-0" style={{boxShadow:'0 0 10px rgba(230,82,0,0.4)'}}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10V4l4-2 4 2v6l-4 2-4-2z" fill="white" fillOpacity="0.9"/>
                  <path d="M6 2v10M2 4l4 2 4-2" stroke="white" strokeWidth="0.5" strokeOpacity="0.4"/>
                </svg>
              </div>
              <span className="font-black tracking-[-0.02em] text-[14px] leading-none">
                <span className="text-[#e65200]">Flash</span><span className="text-[#efefef]">Face</span>
                <span className="ml-1.5 text-[9px] font-semibold tracking-widest uppercase text-[#2e2e2e] align-middle">OS</span>
              </span>
            </div>
          </div>

          <nav className="flex-1 py-3 px-2.5 w-64 shrink-0 overflow-y-auto space-y-4">

            <NavSection label="Command">
              <NavItem
                icon={<Target className="w-[15px] h-[15px]" />}
                label="Overview"
                active={currentView === 'dashboard'}
                onClick={() => setCurrentView('dashboard')}
              />
              <NavItem
                icon={<MessageSquare className="w-[15px] h-[15px]" />}
                label="AI Assistant"
                active={currentView === 'chatgpt'}
                onClick={() => setCurrentView('chatgpt')}
              />
            </NavSection>

            <NavSection label="Market Research">
              <NavItem
                icon={<LayoutGrid className="w-[15px] h-[15px]" />}
                label="Categories"
                active={currentView === 'categories'}
                onClick={() => setCurrentView('categories')}
              />
              <NavItem
                icon={<Radar className={`w-[15px] h-[15px] ${isDiscovering ? 'animate-pulse text-[#4ade80]' : ''}`} />}
                label="Discovery Swarm"
                active={currentView === 'discovery'}
                onClick={() => setCurrentView('discovery')}
              />
              <NavItem
                icon={<BarChart2 className="w-[15px] h-[15px]" />}
                label="Comparison"
                active={currentView === 'comparison'}
                onClick={() => setCurrentView('comparison')}
              />
            </NavSection>

            <NavSection label="Intel Brain">
              <NavItem
                icon={<Brain className="w-[15px] h-[15px]" />}
                label="Brain OS"
                badge={brainEntries.filter(e => e.priority !== 'archived').length || undefined}
                active={currentView === 'brain'}
                onClick={() => setCurrentView('brain')}
              />
              <NavItem
                icon={<FileText className="w-[15px] h-[15px]" />}
                label="Intel Notes"
                badge={intelNotes.length > 0 ? intelNotes.length : undefined}
                active={currentView === 'intel'}
                onClick={() => setCurrentView('intel')}
              />
              <NavItem
                icon={<Store className="w-[15px] h-[15px]" />}
                label="Brand Tracker"
                badge={trackedBrands.length > 0 ? trackedBrands.length : undefined}
                active={currentView === 'brands'}
                onClick={() => setCurrentView('brands')}
              />
              <NavItem
                icon={<Building2 className="w-[15px] h-[15px]" />}
                label="Company Intelligence"
                badge={companyProfiles.length > 0 ? companyProfiles.length : undefined}
                active={currentView === 'companies'}
                onClick={() => setCurrentView('companies')}
              />
              <NavItem
                icon={<Lightbulb className="w-[15px] h-[15px]" />}
                label="Ideas Board"
                badge={ideas.filter(i => i.status !== 'killed').length || undefined}
                active={currentView === 'ideas'}
                onClick={() => setCurrentView('ideas')}
              />
              <NavItem
                icon={<UserCircle2 className="w-[15px] h-[15px]" />}
                label="Founders"
                badge={founders.length > 0 ? founders.length : undefined}
                active={currentView === 'founders'}
                onClick={() => setCurrentView('founders')}
              />
              <NavItem
                icon={<Headphones className="w-[15px] h-[15px]" />}
                label="Podcast Intel"
                badge={podcastEpisodes.filter(e => e.processingStatus === 'complete').length || undefined}
                active={currentView === 'podcasts'}
                onClick={() => setCurrentView('podcasts')}
              />
              <NavItem
                icon={importState.tasks.some(t => t.status === 'extracting')
                  ? <Loader2 className="w-[15px] h-[15px] animate-spin text-[#e05000]" />
                  : <FileText className="w-[15px] h-[15px]" />}
                label="Import Data"
                active={currentView === 'import'}
                onClick={() => setCurrentView('import')}
              />
            </NavSection>

            <NavSection label="Finance">
              <NavItem
                icon={<TrendingUp className="w-[15px] h-[15px]" />}
                label="Financial Model"
                active={currentView === 'finance'}
                onClick={() => setCurrentView('finance')}
              />
            </NavSection>

            <NavSection label="System">
              <NavItem
                icon={<Terminal className="w-[15px] h-[15px]" />}
                label="AI Prompts"
                active={currentView === 'prompts'}
                onClick={() => setCurrentView('prompts')}
              />
              <NavItem
                icon={<DownloadCloud className="w-[15px] h-[15px]" />}
                label="Export"
                active={currentView === 'export'}
                onClick={() => setCurrentView('export')}
              />
              <NavItem
                icon={<Settings2 className="w-[15px] h-[15px]" />}
                label="Settings"
                active={currentView === 'settings'}
                onClick={() => setCurrentView('settings')}
              />
            </NavSection>

          </nav>

          <div className="p-3 border-t border-[#181818] w-64 shrink-0 space-y-2">
            {/* Budget micro-bar */}
            {(() => {
              const s = getSettings();
              void spendingRefresh;
              if (s.spendingEur === 0 && s.budgetLimitEur === null) return null;
              const pct = calcBudgetPercent(s);
              const color = pct >= 90 ? '#f87171' : pct >= 70 ? '#e65200' : '#4ade80';
              return (
                <button onClick={() => setCurrentView('settings')} className="w-full group" title={`€${s.spendingEur.toFixed(3)} spent${s.budgetLimitEur ? ` / €${s.budgetLimitEur} budget` : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{color: s.spendingEur > 0.001 ? color : '#333'}}>API Budget</span>
                    <span className="text-[10px] font-mono" style={{color: s.spendingEur > 0.001 ? color : '#333'}}>€{s.spendingEur.toFixed(2)}{s.budgetLimitEur ? `/${s.budgetLimitEur}` : ''}</span>
                  </div>
                  <div className="h-[2px] w-full bg-[#181818] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.min(100,pct)}%`, background: color}}></div>
                  </div>
                </button>
              );
            })()}
            {['categories', 'comparison', 'discovery', 'dashboard'].includes(currentView) ? (
              <button
                onClick={() => openEditor(null)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150"
                style={{background:'linear-gradient(135deg,#e65200 0%,#cc4900 100%)', color:'#fff', boxShadow:'0 2px 12px rgba(230,82,0,0.3)'}}
              >
                <Plus className="w-4 h-4" />
                New Category
              </button>
            ) : currentView === 'brain' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Brain OS</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{brainEntries.filter(e => e.priority !== 'archived').length} in context</p>
              </div>
            ) : currentView === 'intel' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Intel Brain</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{intelNotes.length} note{intelNotes.length !== 1 ? 's' : ''}</p>
              </div>
            ) : currentView === 'brands' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Brand Tracker</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{trackedBrands.length} brand{trackedBrands.length !== 1 ? 's' : ''}</p>
              </div>
            ) : currentView === 'companies' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Company Intel</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{companyProfiles.length} profile{companyProfiles.length !== 1 ? 's' : ''}</p>
              </div>
            ) : currentView === 'ideas' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Ideas</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{ideas.filter(i => i.status !== 'killed').length} active</p>
              </div>
            ) : currentView === 'founders' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Founders</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{founders.length} profile{founders.length !== 1 ? 's' : ''}</p>
              </div>
            ) : currentView === 'podcasts' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Podcast Intel</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{podcastEpisodes.filter(e => e.processingStatus === 'complete').length} extracted</p>
              </div>
            ) : currentView === 'finance' ? (
              <div className="text-center py-1">
                <p className="text-[10px] text-[#333] uppercase tracking-[0.1em] font-semibold">Finance</p>
                <p className="text-xs text-[#3a3a3a] mt-0.5">{financeScenarios.length} scenario{financeScenarios.length !== 1 ? 's' : ''}</p>
              </div>
            ) : (
              <button
                onClick={() => openEditor(null)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#141414] hover:bg-[#1c1c1c] text-[#666] hover:text-[#aaa] rounded-lg text-sm font-medium transition-colors border border-[#1e1e1e]"
              >
                <Plus className="w-4 h-4" />
                New Category
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
          
          {/* Top Header */}
          <header className="h-12 bg-[#080808] border-b border-[#1a1a1a] flex items-center justify-between px-4 lg:px-6 z-10 shrink-0">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setIsMainSidebarOpen(!isMainSidebarOpen)}
                className="p-1.5 bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#555] hover:text-[#aaa] rounded-md transition-colors"
                title="Toggle Main Menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <h1 className="text-sm font-semibold text-[#f0f0f0] tracking-tight">
                {currentView === 'edit'
                  ? (editingId ? 'Edit Category' : 'New Category')
                  : (VIEW_TITLES[currentView] ?? currentView)}
              </h1>
            </div>
            
            <div className="flex items-center gap-2">                {/* Bulk research progress — visible on every tab while a queue is running */}
                {(isBulkResearching || bulkStats) && (
                  <div className={cn(
                    "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border",
                    isBulkResearching
                      ? "bg-[#e05000]/08 border-[#e05000]/20 text-[#e05000]"
                      : bulkStats && bulkStats.failed > 0
                      ? "bg-[#f87171]/08 border-[#f87171]/20 text-[#f87171]"
                      : "bg-[#4ade80]/08 border-[#4ade80]/20 text-[#4ade80]"
                  )}>
                    {isBulkResearching
                      ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      : bulkStats && bulkStats.failed > 0
                      ? <AlertCircle className="w-3 h-3 shrink-0" />
                      : <CheckCircle2 className="w-3 h-3 shrink-0" />
                    }
                    <span>
                      {isBulkResearching
                        ? bulkStats
                          ? `Researching ${bulkStats.done + bulkStats.failed}/${bulkStats.total}`
                          : 'Starting queue...'
                        : bulkStats && bulkStats.failed > 0
                        ? `Done — ${bulkStats.done} ok, ${bulkStats.failed} failed`
                        : `Done — ${bulkStats?.done ?? 0} researched`
                      }
                    </span>
                    {isBulkResearching && (
                      <button
                        onClick={handleStopBulkResearch}
                        className="ml-0.5 text-[#555] hover:text-[#f87171] transition-colors font-bold"
                        title="Stop bulk research"
                      >×</button>
                    )}
                  </div>
                )}
              {/* Spending pill */}
              {(() => {
                const s = getSettings();
                // eslint-disable-next-line react-hooks/exhaustive-deps
                void spendingRefresh;
                const pct = calcBudgetPercent(s);
                if (s.spendingEur === 0 && s.budgetLimitEur === null) return null;
                return (
                  <button
                    onClick={() => setCurrentView('settings')}
                    title="API spending — click to open Settings"
                    className={cn(
                      "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors",
                      pct >= 100 ? "bg-[#f87171]/08 border-[#f87171]/20 text-[#f87171]" :
                      pct >= 80  ? "bg-[#e05000]/08 border-[#e05000]/20 text-[#e05000]" :
                                   "bg-[#111] border-[#1e1e1e] text-[#666] hover:text-[#aaa]"
                    )}
                  >
                    <Euro className="w-3 h-3" />
                    {s.spendingEur.toFixed(2)}
                    {s.budgetLimitEur !== null && ` / €${s.budgetLimitEur}`}
                  </button>
                );
              })()}
              {/* Save status + category count indicator */}
              <div
                className={cn(
                  "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors",
                  saveStatus === 'error'
                    ? "bg-[#f87171]/08 border-[#f87171]/20"
                    : "bg-[#111] border-[#1e1e1e]"
                )}
                title={saveStatus === 'error' ? 'Server + IndexedDB both failed to save. Data is safe in localStorage but close the tab carefully.' : undefined}
              >
                <Cloud className="w-3 h-3 text-[#444]" />
                <span className="text-[#666]">{categories.length}</span>
                {saveStatus === 'saving' && <Loader2 className="w-3 h-3 text-[#d4ac0d] animate-spin" />}
                {saveStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-[#4ade80]" />}
                {saveStatus === 'error' && <AlertCircle className="w-3 h-3 text-[#f87171]" aria-label="Save error — localStorage is still safe" />}
              </div>

              <div className="relative">
              <button 
                onClick={() => setShowWeightsMenu(!showWeightsMenu)}
                className="flex items-center gap-1.5 text-[#555] hover:text-[#aaa] bg-[#111] hover:bg-[#181818] px-3 py-1.5 border border-[#1e1e1e] rounded-md text-xs font-medium transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Weights</span>
              </button>

              {/* Weights Dropdown */}
              {showWeightsMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-[#111] border border-[#1e1e1e] rounded-xl shadow-2xl p-5 z-50">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1e1e1e]">
                    <h4 className="text-[#f0f0f0] font-semibold text-sm">Calculation Weights</h4>
                    <span className="text-[10px] text-[#444] uppercase tracking-wider font-mono">Live Recalc</span>
                  </div>
                  <div className="space-y-3.5">
                    <WeightSlider name="CLV" value={weights.clv} min={0} max={50} onChange={v => setWeights({...weights, clv: v})} />
                    <WeightSlider name="Retention (1-Churn)" value={weights.retention} min={0} max={50} onChange={v => setWeights({...weights, retention: v})} />
                    <WeightSlider name="Acquisition Ease" value={weights.acquisition} min={0} max={50} onChange={v => setWeights({...weights, acquisition: v})} />
                    <WeightSlider name="Market Size" value={weights.marketSize} min={0} max={50} onChange={v => setWeights({...weights, marketSize: v})} />
                    <WeightSlider name="Emotional Loyalty" value={weights.loyalty} min={0} max={50} onChange={v => setWeights({...weights, loyalty: v})} />
                    <WeightSlider name="Story Depth & Moat" value={weights.storyDepth} min={0} max={50} onChange={v => setWeights({...weights, storyDepth: v})} />
                    <WeightSlider name="Micro-niche Potential" value={weights.microNiche} min={0} max={50} onChange={v => setWeights({...weights, microNiche: v})} />
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#1a1a1a] text-center">
                    <p className="text-[11px] text-[#444]">These parameters drive the "Overall Decision Score"</p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </header>

          {/* Scrollable Context */}
          <main className={cn("flex-1 scroll-smooth relative", currentView === 'categories' ? 'overflow-hidden' : 'overflow-y-auto p-6')}>
            {currentView === 'dashboard' && <DashboardView categories={categories} weights={ weights} maxClv={maxClv} />}
            {currentView === 'categories' && <CategoriesView categories={categories} weights={weights} maxClv={maxClv} onEdit={openEditor} onUpdateStatus={handleUpdateStatus} onDeepSearch={handleDeepSearch} onDeepSearchAllNew={handleDeepSearchAllNew} onRefreshResearched={handleRefreshResearched} onRefreshFailed={handleRefreshFailed} onStopBulkResearch={handleStopBulkResearch} isBulkResearching={isBulkResearching} bulkStats={bulkStats} />}
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
            {currentView === 'settings' && <SettingsView onRefreshSpending={() => setSpendingRefresh(v => v + 1)} />}
            {currentView === 'chatgpt' && <ChatGPTView categories={categories} weights={weights} maxClv={maxClv} brainEntries={brainEntries} conversations={conversations} onGoToSettings={() => setCurrentView('settings')} onGoToBrain={() => setCurrentView('brain')} onSaveConversation={handleSaveConversation} onSaveToBrain={handleSaveToBrain} />}
            {currentView === 'brain' && <BrainView entries={brainEntries} onAdd={handleAddBrainEntry} onUpdate={handleUpdateBrainEntry} onDelete={handleDeleteBrainEntry} prefillContent={prefillBrainContent} onClearPrefill={() => setPrefillBrainContent(null)} />}
            {currentView === 'intel' && <IntelView notes={intelNotes} onAdd={handleAddNote} onDelete={handleDeleteNote} onEnrich={handleEnrichNote} />}
            {currentView === 'brands' && <BrandTrackerView brands={trackedBrands} onAdd={handleAddBrand} onDelete={(id) => setTrackedBrands(prev => prev.filter(b => b.id !== id))} onRetry={handleRetryBrand} onAddToCategories={handleAddBrandToCategories} onToggleSchedule={handleToggleBrandSchedule} categories={categories} companies={companyProfiles} onLinkToCompany={handleLinkBrandToCompany} />}
            {currentView === 'companies' && <CompanyProfilesView profiles={companyProfiles} onChange={setCompanyProfiles} />}
            {currentView === 'ideas' && <IdeasView ideas={ideas} onAdd={(idea) => setIdeas(prev => [idea, ...prev])} onUpdate={(idea) => setIdeas(prev => prev.map(i => i.id === idea.id ? idea : i))} onDelete={(id) => setIdeas(prev => prev.filter(i => i.id !== id))} />}
            {currentView === 'founders' && <FoundersView founders={founders} companies={companyProfiles} onChange={setFounders} />}
            {currentView === 'podcasts' && (
              <PodcastIntelView
                founders={founderPodcasts}
                episodes={podcastEpisodes}
                scanningFounderId={scanningFounderId}
                extractingEpisodeIds={extractingEpisodeIds}
                founderProfiles={founders}
                scanErrors={podcastScanErrors}
                onAddFounder={handleAddFounder}
                onDeleteFounder={handleDeleteFounder}
                onScanFounder={handleScanFounder}
                onExtractEpisode={handleExtractEpisode}
                onDeleteEpisode={handleDeleteEpisode}
                onSendToIntelBrain={handleSendEpisodeToIntelBrain}
                onLinkToFounderProfile={handleLinkPodcastToFounderProfile}
              />
            )}
            {currentView === 'finance' && <FinanceView scenarios={financeScenarios} onAdd={handleAddScenario} onDelete={handleDeleteScenario} />}
            {currentView === 'edit' && (
              <EditCategoryView 
                category={editingId ? categories.find(c => c.id === editingId) || null : null} 
                onSave={handleSaveCategory}
                onCancel={() => setCurrentView('categories')}
                onDelete={handleDeleteCategory}
                onSpendingChange={() => setSpendingRefresh(v => v + 1)}
                onPartialUpdate={(partial) => {
                  if (!editingId) return;
                  setCategories(prev => prev.map(c =>
                    c.id === editingId ? {
                      ...c,
                      ...partial,
                      agentResults: { ...(c.agentResults || {}), ...(partial.agentResults || {}) },
                      lastUpdated: new Date().toISOString()
                    } : c
                  ));
                }}
              />
            )}
          </main>
        </div>

      </div>
    </div>
  );
}

// Subcomponents

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pt-1 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#2a2a2a]">{label}</p>
      {children}
    </div>
  );
}

function NavItem({
  icon, label, active, onClick, badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-2.5 py-[7px] text-[12.5px] transition-all duration-100 rounded-lg group relative overflow-hidden",
        active
          ? 'text-[#efefef] bg-[#161616]'
          : 'text-[#484848] hover:text-[#aaaaaa] hover:bg-[#0f0f0f]'
      )}
    >
      {/* Active accent bar */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-[#e65200]" style={{boxShadow:'0 0 6px rgba(230,82,0,0.6)'}} />
      )}
      <span className="flex items-center gap-2.5 pl-0.5">
        <span className={cn("transition-colors shrink-0", active ? "text-[#e65200]" : "text-[#303030] group-hover:text-[#555]")}>
          {icon}
        </span>
        <span className="font-medium leading-none">{label}</span>
      </span>
      {badge !== undefined && (
        <span className={cn(
          "text-[9px] font-mono px-1.5 py-0.5 rounded",
          active ? "bg-[#e65200]/15 text-[#e65200]" : "bg-[#161616] text-[#383838]"
        )}>{badge}</span>
      )}
    </button>
  );
}

function WeightSlider({ name, value, min, max, onChange }: { name: string, value: number, min: number, max: number, onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-[#555] uppercase tracking-[0.1em] text-[10px] font-medium">{name}</span>
        <span className="text-[#e65200] font-mono text-[11px]">{value}%</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        value={value} 
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-[#e65200] h-1 bg-[#1e1e1e] rounded-lg appearance-none cursor-pointer"
        style={{ boxShadow: 'none' }}
      />
    </div>
  );
}

