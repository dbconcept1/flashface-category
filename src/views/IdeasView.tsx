/**
 * Ideas Board
 * ─────────────────────────────────────────────────────────────────────────────
 * A structured space to capture ideas across categories, creative briefs,
 * product concepts, and random sparks. Each idea has a status workflow and
 * can be AI-expanded into a strategic assessment.
 */

import { useState, useMemo } from 'react';
import type { Idea, IdeaStatus, IdeaTag } from '../types';
import {
  Lightbulb, Plus, X, Sparkles, Loader2, ChevronDown, ChevronUp,
  Zap, Package, Megaphone, BarChart2, Wrench, Cpu, Bookmark,
  FileText, Inbox, CheckCircle2, XCircle, Search,
} from 'lucide-react';
import { cn } from '../utils';
import { expandIdea } from '../services/ideaService';

// ─── Config ───────────────────────────────────────────────────────────────────

const TAG_CONFIG: Record<IdeaTag, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  strategy:   { label: 'Strategy',   icon: <BarChart2    className="w-3 h-3" />, bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20' },
  product:    { label: 'Product',    icon: <Package      className="w-3 h-3" />, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  creative:   { label: 'Creative',   icon: <Zap          className="w-3 h-3" />, bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/20' },
  marketing:  { label: 'Marketing',  icon: <Megaphone    className="w-3 h-3" />, bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20' },
  operations: { label: 'Operations', icon: <Wrench       className="w-3 h-3" />, bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/20' },
  tech:       { label: 'Tech',       icon: <Cpu          className="w-3 h-3" />, bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/20' },
  brand:      { label: 'Brand',      icon: <Bookmark     className="w-3 h-3" />, bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  content:    { label: 'Content',    icon: <FileText     className="w-3 h-3" />, bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/20' },
  other:      { label: 'Other',      icon: <Inbox        className="w-3 h-3" />, bg: 'bg-gray-800/60',    text: 'text-gray-400',    border: 'border-gray-700/40' },
};

const STATUS_CONFIG: Record<IdeaStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  raw:       { label: 'Raw Idea',   bg: 'bg-gray-800/60',    text: 'text-gray-400',   border: 'border-gray-700/40',   dot: 'bg-gray-500' },
  exploring: { label: 'Exploring',  bg: 'bg-blue-500/10',    text: 'text-blue-400',   border: 'border-blue-500/20',   dot: 'bg-blue-400' },
  decided:   { label: 'Decided',    bg: 'bg-emerald-500/10', text: 'text-emerald-400',border: 'border-emerald-500/20',dot: 'bg-emerald-400' },
  killed:    { label: 'Killed',     bg: 'bg-rose-500/10',    text: 'text-rose-400',   border: 'border-rose-500/20',   dot: 'bg-rose-400' },
};

const STATUS_ORDER: IdeaStatus[] = ['raw', 'exploring', 'decided', 'killed'];
const ALL_TAGS = Object.keys(TAG_CONFIG) as IdeaTag[];

// ─── AI Expansion sections renderer ──────────────────────────────────────────

const EXPANSION_SECTIONS = [
  'THE REAL OPPORTUNITY', 'IDEAL CUSTOMER', 'BUSINESS MODEL',
  'FASTEST TEST', 'RISKS', 'VERDICT',
];

const SECTION_COLORS: Record<string, string> = {
  'THE REAL OPPORTUNITY': 'text-orange-400',
  'IDEAL CUSTOMER':       'text-blue-400',
  'BUSINESS MODEL':       'text-violet-400',
  'FASTEST TEST':         'text-emerald-400',
  'RISKS':                'text-rose-400',
  'VERDICT':              'text-yellow-400',
};

function ExpansionPanel({ text }: { text: string }) {
  const parsed = useMemo(() => {
    const result: { label: string; body: string }[] = [];
    let current: { label: string; lines: string[] } | null = null;
    for (const line of text.split('\n')) {
      const matched = EXPANSION_SECTIONS.find(s => line.startsWith(s + ':'));
      if (matched) {
        if (current) result.push({ label: current.label, body: current.lines.join(' ').trim() });
        current = { label: matched, lines: [line.slice(matched.length + 1).trim()] };
      } else if (current && line.trim()) {
        current.lines.push(line.trim());
      }
    }
    if (current) result.push({ label: current.label, body: current.lines.join(' ').trim() });
    return result.length ? result : [{ label: 'AI EXPANSION', body: text }];
  }, [text]);

  return (
    <div className="space-y-2 mt-3">
      {parsed.map(({ label, body }) => (
        <div key={label} className="bg-gray-900/60 border border-gray-800/60 rounded-xl px-3 py-2.5">
          <p className={cn('text-[9px] font-bold uppercase tracking-widest mb-0.5', SECTION_COLORS[label] ?? 'text-gray-500')}>
            {label}
          </p>
          <p className="text-xs text-gray-300 leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Idea card ────────────────────────────────────────────────────────────────

function IdeaCard({
  idea, onUpdate, onDelete,
}: {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const statusCfg = STATUS_CONFIG[idea.status];

  const handleExpand = async () => {
    setExpanding(true);
    setExpandError(null);
    try {
      const text = await expandIdea(idea);
      onUpdate({ ...idea, aiExpansion: text, expansionGeneratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setExpanded(true);
    } catch (e: any) {
      setExpandError(e?.message ?? 'Expansion failed');
    } finally {
      setExpanding(false);
    }
  };

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(idea.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onUpdate({ ...idea, status: next, updatedAt: new Date().toISOString() });
  };

  return (
    <div className={cn('bg-[#0d0d0d] border rounded-xl p-4 transition-all group',
      idea.status === 'killed' ? 'border-rose-500/15 opacity-60' : 'border-gray-800 hover:border-gray-700'
    )}>
      <div className="flex items-start gap-3">
        {/* Status dot / toggle */}
        <button
          onClick={cycleStatus}
          title={`Status: ${statusCfg.label} — click to advance`}
          className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0 transition-all ring-2 ring-transparent hover:ring-4 hover:ring-offset-1 hover:ring-offset-[#0d0d0d]', statusCfg.dot)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-white font-semibold text-sm leading-tight">{idea.title}</h4>
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-rose-400 transition-all shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {idea.description && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{idea.description}</p>
          )}

          {/* Tags */}
          {idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {idea.tags.map(t => {
                const cfg = TAG_CONFIG[t];
                return (
                  <span key={t} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium', cfg.bg, cfg.text, cfg.border)}>
                    {cfg.icon} {cfg.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Status badge */}
          <div className="flex items-center justify-between mt-2">
            <span className={cn('inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', statusCfg.bg, statusCfg.text, statusCfg.border)}>
              <span className={cn('w-1 h-1 rounded-full', statusCfg.dot)} /> {statusCfg.label}
            </span>
            <span className="text-[10px] text-gray-700">
              {new Date(idea.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </div>

          {/* AI expand */}
          {expandError && (
            <p className="text-[10px] text-rose-400 mt-2">{expandError}</p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              onClick={idea.aiExpansion ? () => setExpanded(v => !v) : handleExpand}
              disabled={expanding}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 px-2.5 py-1 rounded-lg transition-all"
            >
              {expanding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {expanding ? 'Thinking…' : idea.aiExpansion ? (expanded ? 'Hide expansion' : 'Show expansion') : 'AI Expand'}
            </button>
            {idea.aiExpansion && !expanded && (
              <button onClick={handleExpand} disabled={expanding}
                className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 px-2 py-1 rounded-lg transition-all">
                <Loader2 className="w-3 h-3" /> Refresh
              </button>
            )}
          </div>

          {expanded && idea.aiExpansion && (
            <ExpansionPanel text={idea.aiExpansion} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Idea modal ───────────────────────────────────────────────────────────

function AddIdeaModal({ onAdd, onClose }: { onAdd: (idea: Idea) => void; onClose: () => void }) {
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<IdeaTag[]>([]);
  const [status, setStatus]         = useState<IdeaStatus>('raw');

  const toggleTag = (t: IdeaTag) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const submit = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      status,
      createdAt: now,
      updatedAt: now,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-bold text-lg">New Idea</h3>
            <p className="text-xs text-gray-600 mt-0.5">Capture it fast, expand with AI later</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder="What's the idea? (one clear sentence)"
            className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600" />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Any context, hypothesis, why it came up… (optional)"
            rows={3}
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600 resize-none" />

          {/* Tags */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map(t => {
                const cfg = TAG_CONFIG[t];
                const selected = selectedTags.includes(t);
                return (
                  <button key={t} onClick={() => toggleTag(t)}
                    className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium transition-all',
                      selected ? cn(cfg.bg, cfg.text, cfg.border) : 'bg-transparent text-gray-600 border-gray-800 hover:text-gray-400'
                    )}>
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Initial Status</p>
            <div className="flex gap-2">
              {STATUS_ORDER.slice(0, 3).map(s => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      status === s ? cn(cfg.bg, cfg.text, cfg.border) : 'bg-transparent text-gray-600 border-gray-800 hover:text-gray-400'
                    )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={submit} disabled={!title.trim()}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors">
            Add Idea
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-400 border border-gray-800 rounded-xl text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  ideas: Idea[];
  onAdd: (idea: Idea) => void;
  onUpdate: (idea: Idea) => void;
  onDelete: (id: string) => void;
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function IdeasView({ ideas, onAdd, onUpdate, onDelete }: Props) {
  const [showAdd, setShowAdd]             = useState(false);
  const [filterStatus, setFilterStatus]   = useState<IdeaStatus | 'all'>('all');
  const [filterTag, setFilterTag]         = useState<IdeaTag | 'all'>('all');
  const [search, setSearch]               = useState('');

  const counts = useMemo(() => {
    const c: Record<IdeaStatus, number> = { raw: 0, exploring: 0, decided: 0, killed: 0 };
    ideas.forEach(i => c[i.status]++);
    return c;
  }, [ideas]);

  const filtered = useMemo(() => {
    let result = ideas;
    if (filterStatus !== 'all') result = result.filter(i => i.status === filterStatus);
    if (filterTag !== 'all') result = result.filter(i => i.tags.includes(filterTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.aiExpansion?.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [ideas, filterStatus, filterTag, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Ideas Board</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Capture ideas fast. Tag them. Let AI stress-test and expand the interesting ones.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-colors border border-orange-500 shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] shrink-0"
        >
          <Plus className="w-4 h-4" /> New Idea
        </button>
      </div>

      {/* Stats row */}
      {ideas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterStatus('all')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-all',
              filterStatus === 'all' ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300 hover:border-gray-700'
            )}>
            All ({ideas.length})
          </button>
          {STATUS_ORDER.filter(s => counts[s] > 0).map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-all',
                  filterStatus === s ? cn(cfg.bg, cfg.text, cfg.border) : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300 hover:border-gray-700'
                )}>
                {cfg.label} ({counts[s]})
              </button>
            );
          })}
        </div>
      )}

      {/* Tag filter + search */}
      {ideas.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ideas…"
              className="pl-7 pr-3 py-1.5 bg-[#0d0d0d] border border-gray-800 text-white placeholder-gray-600 rounded-lg text-xs focus:outline-none focus:border-gray-700 w-48" />
          </div>
          {(['all', ...ALL_TAGS] as const).map(t => {
            if (t === 'all') return (
              <button key="all" onClick={() => setFilterTag('all')}
                className={cn('px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all',
                  filterTag === 'all' ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-transparent text-gray-600 border-gray-800 hover:text-gray-400'
                )}>
                All tags
              </button>
            );
            const cfg = TAG_CONFIG[t];
            return (
              <button key={t} onClick={() => setFilterTag(filterTag === t ? 'all' : t)}
                className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium transition-all',
                  filterTag === t ? cn(cfg.bg, cfg.text, cfg.border) : 'bg-transparent text-gray-600 border-gray-800 hover:text-gray-400'
                )}>
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Lightbulb className="w-12 h-12 text-gray-800 mb-4" />
          <p className="text-gray-500 font-medium">No ideas yet.</p>
          <p className="text-gray-700 text-sm mt-1 max-w-sm">
            Capture every interesting idea here — category plays, creative directions,
            product concepts, growth tactics. AI will help you stress-test the good ones.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors">
            Add your first idea
          </button>
        </div>
      )}

      {/* Idea grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(idea => (
            <IdeaCard key={idea.id} idea={idea} onUpdate={onUpdate} onDelete={() => onDelete(idea.id)} />
          ))}
        </div>
      )}

      {filtered.length === 0 && ideas.length > 0 && (
        <p className="text-center text-sm text-gray-600 py-8">No ideas match current filters.</p>
      )}

      {showAdd && <AddIdeaModal onAdd={onAdd} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
