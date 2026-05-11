import { useState, useMemo } from 'react';
import { TrackedBrand, Category } from '../types';
import {
  Bookmark, Plus, X, Loader2, AlertCircle, RefreshCw,
  ExternalLink, CheckCircle2, ArrowRight, ChevronDown, ChevronUp,
  Tag, Zap,
} from 'lucide-react';
import { cn } from '../utils';
import type { BrandInput } from '../services/brandService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  brands: TrackedBrand[];
  /** Add brand and trigger AI research in background. Returns immediately. */
  onAdd: (input: BrandInput) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onAddToCategories: (brand: TrackedBrand) => void;
  /** Existing categories — used to indicate if a category already exists. */
  categories: Category[];
}

// ─── Ad channel color map ─────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  instagram:   'bg-pink-500/15 text-pink-400 border-pink-500/25',
  tiktok:      'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  facebook:    'bg-blue-500/15 text-blue-400 border-blue-500/25',
  google:      'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  youtube:     'bg-red-500/15 text-red-400 border-red-500/25',
  email:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  seo:         'bg-teal-500/15 text-teal-400 border-teal-500/25',
  influencer:  'bg-violet-500/15 text-violet-400 border-violet-500/25',
  podcast:     'bg-orange-500/15 text-orange-400 border-orange-500/25',
};

function channelClass(ch: string) {
  const key = ch.toLowerCase().replace(/\s+/g, '').replace('ads', '');
  return CHANNEL_COLORS[key] ?? 'bg-gray-800 text-gray-400 border-gray-700';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Pulsing skeleton card shown while AI is researching */
function ResearchingCard({ brand, onDelete }: { brand: TrackedBrand; onDelete: () => void }) {
  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-500/5 to-transparent animate-pulse" />
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-white font-bold">{brand.name}</h4>
          {brand.url && (
            <a href={brand.url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5">
              {brand.url.replace(/^https?:\/\//, '')} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <button onClick={onDelete} className="text-gray-700 hover:text-rose-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-violet-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Researching with AI…</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-2 bg-gray-800 rounded animate-pulse w-3/4" />
        <div className="h-2 bg-gray-800 rounded animate-pulse w-1/2" />
        <div className="h-2 bg-gray-800 rounded animate-pulse w-5/6" />
      </div>
    </div>
  );
}

/** Error card */
function ErrorCard({ brand, onRetry, onDelete }: { brand: TrackedBrand; onRetry: () => void; onDelete: () => void }) {
  return (
    <div className="bg-[#0d0d0d] border border-rose-500/25 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-white font-bold">{brand.name}</h4>
        <button onClick={onDelete} className="text-gray-700 hover:text-rose-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-start gap-2 text-xs text-rose-400 mb-4">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{brand.error ?? 'Research failed.'}</span>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all"
      >
        <RefreshCw className="w-3 h-3" /> Retry research
      </button>
    </div>
  );
}

/** Complete brand intel card */
function BrandCard({
  brand, onDelete, onAddToCategories, isLinked,
}: {
  brand: TrackedBrand;
  onDelete: () => void;
  onAddToCategories: () => void;
  isLinked: boolean;
  categories?: Category[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const ltvCac = brand.estimatedCLV && brand.estimatedCAC && brand.estimatedCAC > 0
    ? (brand.estimatedCLV / brand.estimatedCAC).toFixed(1)
    : null;

  return (
    <>
      <div className="bg-[#0d0d0d] border border-gray-800 hover:border-gray-700 rounded-xl transition-all">
        {/* Card header */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h4 className="text-white font-bold leading-tight">{brand.name}</h4>
              {brand.url && (
                <a href={brand.url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5">
                  {brand.url.replace(/^https?:\/\//, '').slice(0, 30)} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
            <button onClick={onDelete} className="text-gray-700 hover:text-rose-400 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category badge */}
          {brand.detectedCategory && (
            <div className="flex items-center gap-1.5 mb-3">
              <Tag className="w-3 h-3 text-orange-400/70" />
              <span className="text-xs text-orange-400/90 font-medium">{brand.detectedCategory}</span>
              {brand.detectedIndustry && (
                <span className="text-[10px] text-gray-600">/ {brand.detectedIndustry}</span>
              )}
            </div>
          )}

          {/* Core insight */}
          {brand.coreInsight && (
            <p className="text-xs text-gray-400 italic border-l-2 border-orange-500/30 pl-3 mb-4 leading-relaxed">
              "{brand.coreInsight}"
            </p>
          )}

          {/* Metrics row */}
          {(brand.pricePoint || ltvCac || brand.estimatedCLV) && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {brand.pricePoint && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-gray-700">Price</p>
                  <p className="text-xs font-mono text-white font-bold mt-0.5">{brand.pricePoint}</p>
                </div>
              )}
              {brand.estimatedCLV ? (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-gray-700">Est. LTV</p>
                  <p className="text-xs font-mono text-white font-bold mt-0.5">€{brand.estimatedCLV}</p>
                </div>
              ) : null}
              {ltvCac && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-gray-700">LTV:CAC</p>
                  <p className={cn('text-xs font-mono font-bold mt-0.5',
                    parseFloat(ltvCac) >= 3 ? 'text-emerald-400' : 'text-orange-400'
                  )}>{ltvCac}x</p>
                </div>
              )}
            </div>
          )}

          {/* Ad channels */}
          {brand.adChannels && brand.adChannels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {brand.adChannels.map(ch => (
                <span key={ch} className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border', channelClass(ch))}>
                  {ch}
                </span>
              ))}
            </div>
          )}

          {/* Strengths / weaknesses toggle */}
          {((brand.keyStrengths?.length ?? 0) + (brand.weaknesses?.length ?? 0)) > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 transition-colors mb-3"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Hide' : 'Show'} strengths & weaknesses
            </button>
          )}

          {expanded && (
            <div className="space-y-3 mb-4">
              {brand.keyStrengths && brand.keyStrengths.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-emerald-600 mb-1">Strengths</p>
                  <ul className="space-y-1">
                    {brand.keyStrengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brand.weaknesses && brand.weaknesses.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-rose-600 mb-1">Weaknesses</p>
                  <ul className="space-y-1">
                    {brand.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-rose-500 mt-0.5 shrink-0">−</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-3 border-t border-gray-800/60">
            {brand.aiSummary && (
              <button
                onClick={() => setShowFull(true)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all"
              >
                <Zap className="w-3 h-3" /> Full Intel
              </button>
            )}
            {isLinked ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500 px-3 py-1.5">
                <CheckCircle2 className="w-3 h-3" /> In Categories
              </span>
            ) : (
              <button
                onClick={onAddToCategories}
                className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 border border-orange-500/25 hover:border-orange-500/40 px-3 py-1.5 rounded-lg transition-all"
              >
                <ArrowRight className="w-3 h-3" /> Add to Categories
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Intel Modal */}
      {showFull && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowFull(false)}
        >
          <div
            className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-white font-bold text-xl">{brand.name}</h3>
                {brand.detectedCategory && (
                  <p className="text-sm text-orange-400/80 mt-0.5">{brand.detectedCategory}</p>
                )}
              </div>
              <button onClick={() => setShowFull(false)} className="text-gray-500 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4">
              {brand.coreInsight && (
                <p className="text-sm text-gray-300 italic border-l-2 border-orange-500/40 pl-4">
                  "{brand.coreInsight}"
                </p>
              )}

              {/* Data grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Business Model',   brand.businessModel],
                  ['Target Audience',  brand.targetAudience],
                  ['Price Point',      brand.pricePoint],
                  ['Est. LTV',         brand.estimatedCLV ? `€${brand.estimatedCLV}` : null],
                  ['Est. CAC',         brand.estimatedCAC ? `€${brand.estimatedCAC}` : null],
                  ['LTV:CAC',          ltvCac ? `${ltvCac}x` : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="bg-gray-900/60 rounded-lg p-3 border border-gray-800">
                    <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-0.5">{label}</p>
                    <p className="text-gray-200 font-medium">{value}</p>
                  </div>
                ))}
              </div>

              {/* Full report */}
              {brand.aiSummary && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Full Report</p>
                  <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{brand.aiSummary}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-800 shrink-0 flex justify-between items-center">
              {!isLinked ? (
                <button
                  onClick={() => { onAddToCategories(); setShowFull(false); }}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors"
                >
                  <ArrowRight className="w-4 h-4" /> Add to Categories
                </button>
              ) : (
                <span className="text-sm text-emerald-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Already in Categories
                </span>
              )}
              <button onClick={() => setShowFull(false)} className="text-xs text-gray-600 hover:text-gray-400">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function BrandTrackerView({ brands, onAdd, onDelete, onRetry, onAddToCategories, categories }: Props) {
  const [showModal, setShowModal]     = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | TrackedBrand['status']>('all');
  const [form, setForm]               = useState({ name: '', url: '', description: '' });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onAdd({
      name: form.name.trim(),
      url: form.url.trim() || undefined,
      userDescription: form.description.trim() || undefined,
    });
    setForm({ name: '', url: '', description: '' });
    setShowModal(false);
  };

  const filtered = useMemo(() => {
    return brands
      .filter(b => filterStatus === 'all' || b.status === filterStatus)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [brands, filterStatus]);

  const counts = useMemo(() => ({
    researching: brands.filter(b => b.status === 'researching').length,
    complete:    brands.filter(b => b.status === 'complete').length,
    error:       brands.filter(b => b.status === 'error').length,
  }), [brands]);

  const linkedIds = useMemo(() => new Set(brands.filter(b => !!b.linkedCategoryId).map(b => b.id)), [brands]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Brand Tracker</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Drop any brand name. AI researches it — category, business model, CLV/CAC estimates,
            ad channels, strengths, weaknesses — and links it to your category data.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-colors border border-orange-500 shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] shrink-0"
        >
          <Plus className="w-4 h-4" />
          Track Brand
        </button>
      </div>

      {/* Filter chips */}
      {brands.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ['all',         `All (${brands.length})`],
            ['complete',    `Researched (${counts.complete})`],
            ['researching', `Researching (${counts.researching})`],
            ['error',       `Failed (${counts.error})`],
          ] as const).filter(([, label]) => !label.includes('(0)')).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                filterStatus === val
                  ? val === 'error'
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                    : val === 'researching'
                    ? 'bg-violet-500/15 text-violet-400 border-violet-500/25'
                    : 'bg-orange-500/15 text-orange-400 border-orange-500/25'
                  : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-700 hover:text-gray-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {brands.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bookmark className="w-12 h-12 text-gray-800 mb-4" />
          <p className="text-gray-500 font-medium">No brands tracked yet.</p>
          <p className="text-gray-700 text-sm mt-1">
            See an interesting brand? Drop the name here — AI does the rest.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors"
          >
            Track your first brand
          </button>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(brand => {
            if (brand.status === 'researching') {
              return <ResearchingCard key={brand.id} brand={brand} onDelete={() => onDelete(brand.id)} />;
            }
            if (brand.status === 'error') {
              return (
                <ErrorCard
                  key={brand.id}
                  brand={brand}
                  onRetry={() => onRetry(brand.id)}
                  onDelete={() => onDelete(brand.id)}
                />
              );
            }
            return (
              <BrandCard
                key={brand.id}
                brand={brand}
                onDelete={() => onDelete(brand.id)}
                onAddToCategories={() => onAddToCategories(brand)}
                isLinked={linkedIds.has(brand.id)}
                categories={categories}
              />
            );
          })}
        </div>
      )}

      {/* ── Add Brand Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              if (e.key === 'Escape') setShowModal(false);
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-white font-bold text-lg">Track a Brand</h3>
                <p className="text-xs text-gray-600 mt-0.5">AI will research it automatically</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-200"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-600 mb-1.5">Brand Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Boldking, HelloFresh, Ritual Vitamins"
                  autoFocus
                  className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-600 mb-1.5">Website (optional)</label>
                <input
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://boldking.com"
                  className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-600 mb-1.5">Your Notes (optional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Why is this brand interesting? What did you notice? Any context…"
                  rows={3}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600 resize-none"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim()}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Research Brand
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-400 border border-gray-800 rounded-xl text-sm"
              >
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-gray-700 text-center mt-3">
              AI research starts immediately. Takes 20-40 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
