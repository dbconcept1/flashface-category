import { useState, useMemo } from 'react';
import { IntelNote, IntelSourceType, AIInsight } from '../types';
import {
  Brain, Plus, Search, X, Mic, Lightbulb, FileText,
  BarChart2, Users, TrendingUp, Trash2, Sparkles, Loader2,
  CheckCircle2, AlertCircle, BookmarkPlus,
} from 'lucide-react';
import { cn } from '../utils';

// ─── Insight type config ──────────────────────────────────────────────────────

const INSIGHT_CONFIG: Record<AIInsight['type'], { label: string; bgClass: string; textClass: string }> = {
  metric:     { label: 'Metric',     bgClass: 'bg-[#4ade80]/08', textClass: 'text-[#4ade80]' },
  principle:  { label: 'Principle',  bgClass: 'bg-violet-500/10',  textClass: 'text-violet-400'  },
  competitor: { label: 'Competitor', bgClass: 'bg-[#f87171]/08',    textClass: 'text-[#f87171]'    },
  market:     { label: 'Market',     bgClass: 'bg-teal-500/10',    textClass: 'text-teal-400'    },
  tactic:     { label: 'Tactic',     bgClass: 'bg-[#e05000]/08',  textClass: 'text-[#e05000]'  },
};

function InsightChip({ insight }: { insight: AIInsight }) {
  const cfg = INSIGHT_CONFIG[insight.type];
  return (
    <div className={cn('rounded-lg px-3 py-2 border border-[#1e1e1e]/60', cfg.bgClass)}>
      <p className={cn('text-[10px] font-bold uppercase tracking-[0.1em] mb-0.5', cfg.textClass)}>
        {cfg.label}
        {insight.value !== undefined && insight.value !== 0 && (
          <span className="ml-1.5 font-mono">{insight.value}{insight.unit ? ` ${insight.unit}` : ''}</span>
        )}
      </p>
      <p className="text-xs text-[#aaa] leading-relaxed">{insight.text}</p>
    </div>
  );
}

const SOURCE_CONFIG: Record<IntelSourceType, {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: React.ReactNode;
}> = {
  Thought:    { label: 'Thought',    bgClass: 'bg-violet-500/15',  textClass: 'text-violet-400',  borderClass: 'border-violet-500/25',  icon: <Lightbulb className="w-3 h-3" /> },
  Podcast:    { label: 'Podcast',    bgClass: 'bg-[#e05000]/15',  textClass: 'text-[#e05000]',  borderClass: 'border-[#e05000]/20',  icon: <Mic className="w-3 h-3" /> },
  Article:    { label: 'Article',    bgClass: 'bg-blue-500/15',    textClass: 'text-blue-400',    borderClass: 'border-blue-500/25',    icon: <FileText className="w-3 h-3" /> },
  Data:       { label: 'Data',       bgClass: 'bg-emerald-500/15', textClass: 'text-[#4ade80]', borderClass: 'border-emerald-500/25', icon: <BarChart2 className="w-3 h-3" /> },
  Competitor: { label: 'Competitor', bgClass: 'bg-rose-500/15',    textClass: 'text-[#f87171]',    borderClass: 'border-[#f87171]/20',    icon: <Users className="w-3 h-3" /> },
  Market:     { label: 'Market',     bgClass: 'bg-teal-500/15',    textClass: 'text-teal-400',    borderClass: 'border-teal-500/25',    icon: <TrendingUp className="w-3 h-3" /> },
};

const ALL_SOURCES: IntelSourceType[] = ['Thought', 'Podcast', 'Article', 'Data', 'Competitor', 'Market'];

interface Props {
  notes: IntelNote[];
  onAdd: (note: IntelNote) => void;
  onDelete: (id: string) => void;
  /** Triggers AI enrichment and waits for the state update to complete. */
  onEnrich?: (id: string) => Promise<void>;
  /** Convert an intel note into a Brain OS entry. */
  onPushToBrain?: (note: IntelNote) => void;
}

function SourceBadge({ source }: { source: IntelSourceType }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
      cfg.bgClass, cfg.textClass, cfg.borderClass,
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function FilterChip({
  label, active, onClick, colorClass,
}: {
  label: string; active: boolean; onClick: () => void; colorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
        active && colorClass ? colorClass :
        active ? 'bg-[#e05000]/15 text-[#e05000] border-[#e05000]/20' :
        'bg-[#111] text-[#484848] border-[#1e1e1e] hover:border-[#252525] hover:text-[#aaa]',
      )}
    >
      {label}
    </button>
  );
}

function NoteCard({
  note, isEnriching, onExpand, onDelete, onPushToBrain, pushed,
}: {
  note: IntelNote;
  isEnriching: boolean;
  onExpand: () => void;
  onDelete: () => void;
  onPushToBrain?: (note: IntelNote) => void;
  pushed?: boolean;
}) {
  const excerpt = note.content.slice(0, 180);
  const isTruncated = note.content.length > 180;

  return (
    <div
      className="group bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#252525] rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col"
      onClick={onExpand}
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <SourceBadge source={note.source} />
        <div className="flex items-center gap-1.5 shrink-0">
          {note.enrichedAt && !isEnriching && (
            <span title="AI enriched" className="text-violet-500/60">
              <Sparkles className="w-3 h-3" />
            </span>
          )}
          {isEnriching && <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />}
          {note.enrichedAt && onPushToBrain && (
            <button
              onClick={e => { e.stopPropagation(); onPushToBrain(note); }}
              title={pushed ? 'Already pushed to Brain OS' : 'Push to Brain OS'}
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-all',
                pushed ? 'text-[#4ade80]/70' : 'text-[#2a2a2a] hover:text-[#e05000]',
              )}
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-[#2a2a2a] hover:text-[#f87171] transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {note.title && (
        <h4 className="text-[#f0f0f0] font-semibold text-sm mt-2 mb-1 leading-tight line-clamp-2">{note.title}</h4>
      )}
      <p className="text-[#484848] text-xs leading-relaxed flex-1">
        {excerpt}{isTruncated && <span className="text-[#2a2a2a]">…</span>}
      </p>

      {/* AI insights preview (top 2) */}
      {note.aiInsights && note.aiInsights.length > 0 && (
        <div className="mt-3 space-y-1">
          {note.aiInsights.slice(0, 2).map((ins, i) => {
            const cfg = INSIGHT_CONFIG[ins.type];
            return (
              <div key={i} className={cn('rounded px-2 py-1', cfg.bgClass)}>
                <p className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.textClass)}>
                  {cfg.label}
                  {ins.value !== undefined && ins.value !== 0 && (
                    <span className="ml-1 font-mono">{ins.value}{ins.unit ? ` ${ins.unit}` : ''}</span>
                  )}
                </p>
                <p className="text-[11px] text-[#666] leading-tight line-clamp-1">{ins.text}</p>
              </div>
            );
          })}
          {note.aiInsights.length > 2 && (
            <p className="text-[10px] text-[#2a2a2a]">+{note.aiInsights.length - 2} more insights</p>
          )}
        </div>
      )}

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {note.tags.slice(0, 4).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-[#1a1a1a] text-[#484848] text-[10px] rounded">#{tag}</span>
          ))}
          {note.tags.length > 4 && (
            <span className="text-[#2a2a2a] text-[10px] self-center">+{note.tags.length - 4}</span>
          )}
        </div>
      )}
      <p className="text-[10px] text-[#2a2a2a] mt-2">
        {new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

export function IntelView({ notes, onAdd, onDelete, onEnrich, onPushToBrain }: Props) {
  const [search, setSearch]             = useState('');
  const [filterSource, setFilterSource] = useState<IntelSourceType | 'All'>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [enrichError, setEnrichError]   = useState<string | null>(null);
  const [pushedToBrainIds, setPushedToBrainIds] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: '', content: '', source: 'Thought' as IntelSourceType, tags: '',
  });

  const handleAddNote = () => {
    if (!form.content.trim()) return;
    const now = new Date().toISOString();
    onAdd({
      id: crypto.randomUUID(),
      title: form.title.trim(),
      content: form.content.trim(),
      source: form.source,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: now,
      updatedAt: now,
    });
    setForm({ title: '', content: '', source: 'Thought', tags: '' });
    setShowAddModal(false);
  };

  const handleEnrich = async (id: string) => {
    setEnrichingIds(prev => new Set([...prev, id]));
    setEnrichError(null);
    try {
      await onEnrich(id);
    } catch (e: any) {
      setEnrichError(e.message ?? 'Enrichment failed.');
    } finally {
      setEnrichingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const filtered = useMemo(() => {
    return notes
      .filter(n => filterSource === 'All' || n.source === filterSource)
      .filter(n => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some(t => t.toLowerCase().includes(q)) ||
          (n.aiInsights ?? []).some(ins => ins.text.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notes, filterSource, search]);

  const expandedNote = expandedId ? notes.find(n => n.id === expandedId) ?? null : null;
  const enrichedCount = notes.filter(n => !!n.enrichedAt).length;
  const brainWorthyCount = notes.filter(n => n.enrichedAt && (n.aiInsights?.some(i => i.type === 'principle' || i.type === 'metric') ?? false)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#f0f0f0]">Intel Brain</h2>
          <p className="text-sm text-[#484848] mt-0.5">
            Dump anything — podcast notes, thoughts, data points, competitor intel.
            AI extracts structured insights from each note.
          </p>
          {enrichedCount > 0 && (
            <p className="text-[11px] text-violet-500/70 mt-1">
              <Sparkles className="w-3 h-3 inline mr-1" />
              {enrichedCount} of {notes.length} notes AI-enriched
            </p>
          )}
          {brainWorthyCount > 0 && onPushToBrain && (
            <button
              onClick={() => {
                notes
                  .filter(n => n.enrichedAt && n.aiInsights?.some(i => i.type === 'principle' || i.type === 'metric'))
                  .forEach(n => { onPushToBrain(n); setPushedToBrainIds(prev => new Set([...prev, n.id])); });
              }}
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
            >
              <BookmarkPlus className="w-3 h-3" />
              Auto-promote {brainWorthyCount} insight{brainWorthyCount !== 1 ? 's' : ''} to Brain OS
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#e05000] hover:bg-[#e05000] text-[#f0f0f0] rounded-xl font-semibold text-sm transition-colors border border-[#e05000] shadow-none shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Note
        </button>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <FilterChip label={`All (${notes.length})`} active={filterSource === 'All'} onClick={() => setFilterSource('All')} />
          {ALL_SOURCES.map(s => {
            const count = notes.filter(n => n.source === s).length;
            if (count === 0) return null;
            const cfg = SOURCE_CONFIG[s];
            return (
              <FilterChip
                key={s}
                label={`${cfg.label} (${count})`}
                active={filterSource === s}
                onClick={() => setFilterSource(filterSource === s ? 'All' : s)}
                colorClass={filterSource === s ? cn(cfg.bgClass, cfg.textClass, cfg.borderClass) : undefined}
              />
            );
          })}
        </div>
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#484848] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes + insights…"
            className="w-full pl-9 pr-3 py-2 bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:border-gray-600"
          />
        </div>
      </div>

      {/* Enrich error banner */}
      {enrichError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f87171]/08 border border-[#f87171]/20 rounded-lg text-sm text-[#f87171]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{enrichError}</span>
          <button onClick={() => setEnrichError(null)} className="ml-auto text-rose-500/60 hover:text-[#f87171]"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Brain className="w-12 h-12 text-gray-800 mb-4" />
          <p className="text-[#484848] font-medium">
            {notes.length === 0 ? 'Your brain is empty. Start capturing.' : 'No notes match your filter.'}
          </p>
          {notes.length === 0 && (
            <button onClick={() => setShowAddModal(true)} className="mt-4 px-4 py-2 bg-[#e05000]/20 hover:bg-[#e05000]/30 text-[#e05000] border border-[#e05000]/20 rounded-lg text-sm transition-colors">
              Add your first note
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              isEnriching={enrichingIds.has(note.id)}
              onExpand={() => setExpandedId(note.id)}
              onDelete={() => onDelete(note.id)}
              onPushToBrain={onPushToBrain ? (n) => { onPushToBrain(n); setPushedToBrainIds(prev => new Set([...prev, n.id])); } : undefined}
              pushed={pushedToBrainIds.has(note.id)}
            />
          ))}
        </div>
      )}

      {/* ── Add Note Modal ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-[#080808] border border-[#1e1e1e] rounded-xl w-full max-w-lg p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote();
              if (e.key === 'Escape') setShowAddModal(false);
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[#f0f0f0] font-bold text-lg">Add to Brain</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#484848] hover:text-[#d0d0d0]"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {ALL_SOURCES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, source: s }))}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    form.source === s
                      ? cn(SOURCE_CONFIG[s].bgClass, SOURCE_CONFIG[s].textClass, SOURCE_CONFIG[s].borderClass)
                      : 'bg-[#111] text-[#484848] border-[#1e1e1e] hover:border-[#252525]',
                  )}
                >
                  {SOURCE_CONFIG[s].icon}
                  {SOURCE_CONFIG[s].label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title (optional — AI can generate one)"
                className="w-full px-4 py-2.5 bg-[#090909] border border-[#1e1e1e] text-[#f0f0f0] placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600"
              />
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Dump anything — podcast notes, a stat you heard, a thought, competitor intel, a CLV ratio…"
                rows={6}
                autoFocus
                className="w-full px-4 py-3 bg-[#090909] border border-[#1e1e1e] text-[#f0f0f0] placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600 resize-none"
              />
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Tags (comma separated): ltv, retention, nl-market…"
                className="w-full px-4 py-2.5 bg-[#090909] border border-[#1e1e1e] text-[#f0f0f0] placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddNote}
                disabled={!form.content.trim()}
                className="flex-1 py-2.5 bg-[#e05000] hover:bg-[#e05000] disabled:opacity-40 disabled:cursor-not-allowed text-[#f0f0f0] rounded-xl font-semibold text-sm transition-colors"
              >
                Save to Brain
              </button>
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2.5 bg-[#111] hover:bg-[#1a1a1a] text-[#666] border border-[#1e1e1e] rounded-xl text-sm">
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-[#2a2a2a] text-center mt-3">⌘ + Enter to save quickly</p>
          </div>
        </div>
      )}

      {/* ── Expanded Note Modal ─────────────────────────────────────────────── */}
      {expandedNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setExpandedId(null)}
        >
          <div
            className="bg-[#080808] border border-[#1e1e1e] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4 shrink-0 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceBadge source={expandedNote.source} />
                  {expandedNote.enrichedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-violet-400/80 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> AI enriched
                    </span>
                  )}
                </div>
                {expandedNote.title && (
                  <h3 className="text-[#f0f0f0] font-bold text-xl mt-2 leading-tight">{expandedNote.title}</h3>
                )}
                <p className="text-xs text-[#3a3a3a] mt-1">
                  {new Date(expandedNote.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setExpandedId(null)} className="text-[#484848] hover:text-[#d0d0d0] shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-5">
              <p className="text-[#aaa] text-sm leading-relaxed whitespace-pre-wrap">{expandedNote.content}</p>

              {expandedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-[#1e1e1e]/60">
                  {expandedNote.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-[#1a1a1a] text-[#666] text-xs rounded-md">#{tag}</span>
                  ))}
                </div>
              )}

              {expandedNote.aiInsights && expandedNote.aiInsights.length > 0 && (
                <div className="pt-3 border-t border-[#1e1e1e]/60">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#3a3a3a] mb-3">
                    AI Insights ({expandedNote.aiInsights.length})
                  </p>
                  <div className="space-y-2">
                    {expandedNote.aiInsights.map((ins, i) => <InsightChip key={i} insight={ins} />)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-[#1e1e1e] shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleEnrich(expandedNote.id)}
                disabled={enrichingIds.has(expandedNote.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                  enrichingIds.has(expandedNote.id)
                    ? 'bg-violet-500/10 border-violet-500/25 text-violet-400 cursor-not-allowed'
                    : expandedNote.enrichedAt
                    ? 'bg-[#111] border-[#1e1e1e] text-[#484848] hover:text-violet-400 hover:border-violet-500/25'
                    : 'bg-violet-500/15 border-violet-500/25 text-violet-400 hover:bg-violet-500/25',
                )}
              >
                {enrichingIds.has(expandedNote.id)
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : expandedNote.enrichedAt
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {enrichingIds.has(expandedNote.id) ? 'Enriching…' : expandedNote.enrichedAt ? 'Re-enrich' : 'Enrich with AI'}
              </button>
              {onPushToBrain && (
                <button
                  onClick={() => {
                    onPushToBrain(expandedNote);
                    setPushedToBrainIds(prev => new Set([...prev, expandedNote.id]));
                    setExpandedId(null);
                  }}
                  title="Convert this intel note into a Brain OS entry"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                    pushedToBrainIds.has(expandedNote.id)
                      ? 'bg-[#4ade80]/10 border-[#4ade80]/25 text-[#4ade80]'
                      : 'bg-[#111] border-[#1e1e1e] text-[#484848] hover:text-[#e05000] hover:border-[#e05000]/25',
                  )}
                >
                  {pushedToBrainIds.has(expandedNote.id)
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <BookmarkPlus className="w-3.5 h-3.5" />}
                  {pushedToBrainIds.has(expandedNote.id) ? 'Pushed to Brain' : 'Push to Brain OS'}
                </button>
              )}
              </div>
              <button
                onClick={() => { onDelete(expandedNote.id); setExpandedId(null); }}
                className="text-xs text-rose-500 hover:text-[#f87171] transition-colors"
              >
                Delete note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
