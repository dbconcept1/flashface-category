/**
 * Brain OS — Personal Knowledge Management System
 * ──────────────────────────────────────────────────────────────────────────
 * The operator's personal decision OS. Every entry is structured with a
 * title, content, and crucially an "implication" — what it means for action.
 *
 * Priority tiers:
 *   CORE      → Always injected into every GPT conversation (~60 entries max)
 *   REFERENCE → Compiled into a dense appendix, always injected but compact
 *   ARCHIVED  → Stored, never injected
 *
 * The compiled brain is passed to ChatGPTView and prepended to every message.
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import type { BrainEntry, BrainEntryType, BrainPriority } from '../types';
import {
  Brain, Plus, Search, X, Trash2, ChevronDown, ChevronUp,
  Zap, Quote, Star, User, Lightbulb, Shield, GitMerge, FileText,
  Upload, Sparkles, Loader2, CheckCircle2, AlertCircle, Info,
  Copy, Check,
} from 'lucide-react';
import { cn } from '../utils';
import { compileBrain, estimateBrainTokens } from '../lib/brainCompiler';
import { getApiKey } from '../lib/settings';
import { GoogleGenAI } from '@google/genai';

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<BrainEntryType, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
}> = {
  principle: { label: 'Principle',  icon: <Zap        className="w-3.5 h-3.5" />, bg: 'bg-violet-500/12', text: 'text-violet-400',  border: 'border-violet-500/25' },
  quote:     { label: 'Quote',      icon: <Quote      className="w-3.5 h-3.5" />, bg: 'bg-blue-500/12',   text: 'text-blue-400',    border: 'border-blue-500/25' },
  brand:     { label: 'Brand',      icon: <Star       className="w-3.5 h-3.5" />, bg: 'bg-amber-500/12',  text: 'text-amber-400',   border: 'border-amber-500/25' },
  founder:   { label: 'Founder',    icon: <User       className="w-3.5 h-3.5" />, bg: 'bg-pink-500/12',   text: 'text-pink-400',    border: 'border-pink-500/25' },
  insight:   { label: 'Insight',    icon: <Lightbulb  className="w-3.5 h-3.5" />, bg: 'bg-teal-500/12',   text: 'text-teal-400',    border: 'border-teal-500/25' },
  rule:      { label: 'Hard Rule',  icon: <Shield     className="w-3.5 h-3.5" />, bg: 'bg-rose-500/12',   text: 'text-rose-400',    border: 'border-rose-500/25' },
  process:   { label: 'Process',    icon: <GitMerge   className="w-3.5 h-3.5" />, bg: 'bg-emerald-500/12',text: 'text-emerald-400', border: 'border-emerald-500/25' },
  note:      { label: 'Note',       icon: <FileText   className="w-3.5 h-3.5" />, bg: 'bg-gray-500/12',   text: 'text-gray-400',    border: 'border-gray-500/25' },
};

const PRIORITY_CONFIG: Record<BrainPriority, {
  label: string;
  sublabel: string;
  dotColor: string;
  ring: string;
  headerBg: string;
  headerText: string;
}> = {
  core:      { label: 'Core',      sublabel: 'Always in GPT context', dotColor: 'bg-[#e05000]',    ring: 'ring-1 ring-[#e05000]/30',      headerBg: 'bg-[#e05000]/08',   headerText: 'text-[#e05000]' },
  reference: { label: 'Reference', sublabel: 'Compact appendix',      dotColor: 'bg-blue-400',     ring: 'ring-1 ring-blue-500/20',       headerBg: 'bg-blue-500/08',    headerText: 'text-blue-400' },
  archived:  { label: 'Archived',  sublabel: 'Not injected',          dotColor: 'bg-gray-600',     ring: 'ring-1 ring-gray-700/40',       headerBg: 'bg-gray-800/40',    headerText: 'text-gray-500' },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as BrainEntryType[];
const ALL_PRIORITIES: BrainPriority[] = ['core', 'reference', 'archived'];

const EMPTY_FORM: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'principle',
  title: '',
  content: '',
  source: '',
  implication: '',
  tags: [],
  priority: 'core',
};

// ─── Gemini Vision extraction ─────────────────────────────────────────────────

async function extractBrainEntryFromImage(
  base64Data: string,
  mimeType: string,
): Promise<Partial<Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>>> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured in Settings.');

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are a knowledge extraction AI. The user has shared a screenshot or image they want to save as a brain entry in their personal knowledge OS.

Analyze the image carefully and extract:
1. A clear, concise title (max 10 words)
2. The main content/knowledge from the image (what it says, shows, or communicates)
3. What type of knowledge this is (choose one: principle, quote, brand, founder, insight, rule, process, note)
4. What this means for business decisions — the actionable implication
5. 2-4 relevant tags (lowercase, single words or short phrases)

Return ONLY valid JSON with these exact keys:
{
  "title": "...",
  "content": "...",
  "type": "principle|quote|brand|founder|insight|rule|process|note",
  "implication": "...",
  "tags": ["tag1", "tag2"]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { parts: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType } },
      ]},
    ],
  });

  const raw = response.text?.trim() || '{}';
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    title:       parsed.title || '',
    content:     parsed.content || '',
    type:        (ALL_TYPES.includes(parsed.type) ? parsed.type : 'note') as BrainEntryType,
    implication: parsed.implication || '',
    tags:        Array.isArray(parsed.tags) ? parsed.tags : [],
    priority:    'core',
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: BrainEntryType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
      cfg.bg, cfg.text, cfg.border,
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: BrainPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dotColor)} />
      <span className="text-[10px] text-[#484848] font-medium">{cfg.label}</span>
    </span>
  );
}

function FilterChip({
  label, active, onClick, colorClass,
}: { label: string; active: boolean; onClick: () => void; colorClass?: string }) {
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

function EntryCard({
  entry, onExpand, onDelete, onPriorityChange,
}: {
  entry: BrainEntry;
  onExpand: () => void;
  onDelete: () => void;
  onPriorityChange: (p: BrainPriority) => void;
}) {
  const pcfg = PRIORITY_CONFIG[entry.priority];
  const excerpt = entry.content.length > 160
    ? entry.content.slice(0, 160) + '…'
    : entry.content;

  return (
    <div
      className={cn(
        'group bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#252525] rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col gap-2',
        pcfg.ring,
      )}
      onClick={onExpand}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={entry.type} />
        <div className="flex items-center gap-2 shrink-0">
          <PriorityDot priority={entry.priority} />
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-[#2a2a2a] hover:text-[#f87171] transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4 className="text-[#f0f0f0] font-semibold text-sm leading-tight line-clamp-2">{entry.title}</h4>

      {/* Content excerpt */}
      <p className="text-[#484848] text-xs leading-relaxed">{excerpt}</p>

      {/* Implication — the most important field */}
      {entry.implication && (
        <div className="mt-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2.5 py-2">
          <p className="text-[10px] text-[#333] uppercase font-bold tracking-wider mb-0.5">Apply</p>
          <p className="text-xs text-[#aaa] leading-relaxed line-clamp-2">{entry.implication}</p>
        </div>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 4).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-[#1a1a1a] text-[#3a3a3a] text-[10px] rounded">#{tag}</span>
          ))}
          {entry.tags.length > 4 && (
            <span className="text-[#2a2a2a] text-[10px] self-center">+{entry.tags.length - 4}</span>
          )}
        </div>
      )}

      {/* Quick priority toggle inline */}
      <div className="flex gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
        {ALL_PRIORITIES.map(p => {
          const pc = PRIORITY_CONFIG[p];
          return (
            <button
              key={p}
              onClick={() => onPriorityChange(p)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium border transition-all',
                entry.priority === p
                  ? cn(pc.headerBg, pc.headerText, 'border-transparent')
                  : 'bg-transparent text-[#333] border-[#1e1e1e] hover:text-[#666]',
              )}
            >
              {pc.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Entry Form (modal/panel) ────────────────────────────────────────────────

interface EntryFormProps {
  initial: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>;
  onSave: (data: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

function EntryForm({ initial, onSave, onCancel, isEditing }: EntryFormProps) {
  const [form, setForm] = useState(initial);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '));
  const fileRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.title.trim() || !form.content.trim()) return;
    onSave({
      ...form,
      title: form.title.trim(),
      content: form.content.trim(),
      source: form.source?.trim() || undefined,
      implication: form.implication.trim(),
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  const handleImageFile = useCallback(async (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setExtractError('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
      return;
    }
    setIsExtracting(true);
    setExtractError(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => {
          const result = (e.target as FileReader).result as string;
          res(result.split(',')[1]); // strip "data:image/...;base64,"
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const extracted = await extractBrainEntryFromImage(base64, file.type);
      setForm(prev => ({
        ...prev,
        title:       extracted.title     || prev.title,
        content:     extracted.content   || prev.content,
        type:        extracted.type      || prev.type,
        implication: extracted.implication || prev.implication,
        priority:    extracted.priority  || prev.priority,
      }));
      if (extracted.tags && extracted.tags.length > 0) {
        setTagsInput(extracted.tags.join(', '));
      }
    } catch (e: any) {
      setExtractError(e.message || 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) { e.preventDefault(); handleImageFile(file); }
    }
  }, [handleImageFile]);

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-5" onPaste={handlePaste} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

      {/* Image extraction strip */}
      <div className="shrink-0">
        <div
          className="border border-dashed border-[#252525] rounded-xl p-4 text-center hover:border-[#383838] transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          {isExtracting ? (
            <div className="flex items-center justify-center gap-2 text-violet-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Gemini reading image…</span>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5 text-[#333] mx-auto mb-1" />
              <p className="text-xs text-[#333]">Drop, paste, or click to extract from screenshot</p>
              <p className="text-[10px] text-[#252525] mt-0.5">Gemini Vision reads the image and fills the form</p>
            </>
          )}
        </div>
        {extractError && (
          <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />{extractError}
          </p>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
      </div>

      {/* Type + Priority */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div>
          <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">Type</label>
          <select
            value={form.type}
            onChange={e => set('type', e.target.value as BrainEntryType)}
            className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#e05000]/60"
          >
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">Priority</label>
          <select
            value={form.priority}
            onChange={e => set('priority', e.target.value as BrainPriority)}
            className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#e05000]/60"
          >
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label} — {PRIORITY_CONFIG[p].sublabel}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Title */}
      <div className="shrink-0">
        <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">
          Title <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          placeholder="Give this a clear, memorable title…"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          className="w-full bg-[#111] border border-[#1e1e1e] text-[#f0f0f0] placeholder-[#2a2a2a] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#e05000]/60"
        />
      </div>

      {/* Content */}
      <div className="shrink-0">
        <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">
          Knowledge / Content <span className="text-rose-500">*</span>
        </label>
        <textarea
          placeholder="What is the principle, quote, insight, or knowledge?"
          value={form.content}
          onChange={e => set('content', e.target.value)}
          rows={4}
          className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] placeholder-[#2a2a2a] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#e05000]/60 resize-none"
        />
      </div>

      {/* Implication — highlighted as critical */}
      <div className="shrink-0 border border-[#e05000]/20 rounded-xl p-3 bg-[#e05000]/03">
        <label className="block text-[10px] text-[#e05000] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Zap className="w-3 h-3" />
          What this means for decisions <span className="text-rose-500">*</span>
        </label>
        <p className="text-[10px] text-[#3a3a3a] mb-2">GPT reads this first. Make it specific and actionable.</p>
        <textarea
          placeholder="When evaluating X, always consider Y because… / Never do Z because… / Always start with…"
          value={form.implication}
          onChange={e => set('implication', e.target.value)}
          rows={3}
          className="w-full bg-transparent border border-[#1e1e1e] text-[#d0d0d0] placeholder-[#2a2a2a] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#e05000]/40 resize-none"
        />
      </div>

      {/* Source */}
      <div className="shrink-0">
        <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">Source (optional)</label>
        <input
          type="text"
          placeholder="URL, book, person name, podcast, etc."
          value={form.source || ''}
          onChange={e => set('source', e.target.value)}
          className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] placeholder-[#2a2a2a] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#e05000]/60"
        />
      </div>

      {/* Tags */}
      <div className="shrink-0">
        <label className="block text-[10px] text-[#484848] font-semibold uppercase tracking-wider mb-1.5">Tags (comma separated)</label>
        <input
          type="text"
          placeholder="retention, brand, acquisition, pricing…"
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] placeholder-[#2a2a2a] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#e05000]/60"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleSave}
          disabled={!form.title.trim() || !form.content.trim()}
          className="flex-1 py-2.5 bg-[#e05000] hover:bg-[#c74800] disabled:bg-[#1e1e1e] disabled:text-[#333] text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {isEditing ? 'Save Changes' : 'Add to Brain'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#666] hover:text-[#aaa] rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function EntryDetail({
  entry, onEdit, onClose, onDelete,
}: {
  entry: BrainEntry;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a] shrink-0">
        <TypeBadge type={entry.type} />
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="px-3 py-1.5 text-xs bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#666] hover:text-[#aaa] rounded-lg transition-colors">Edit</button>
          <button onClick={onDelete} className="px-3 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-lg transition-colors">Delete</button>
          <button onClick={onClose} className="p-1.5 text-[#333] hover:text-[#aaa] transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex items-center gap-2">
          <PriorityDot priority={entry.priority} />
          <span className="text-[10px] text-[#333]">
            Added {new Date(entry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <h2 className="text-xl font-bold text-[#f0f0f0] leading-tight">{entry.title}</h2>

        <div>
          <p className="text-[10px] text-[#484848] font-bold uppercase tracking-wider mb-2">Knowledge</p>
          <p className="text-sm text-[#d0d0d0] leading-relaxed whitespace-pre-wrap">{entry.content}</p>
        </div>

        {entry.implication && (
          <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4">
            <p className="text-[10px] text-[#e05000] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Decision Implication
            </p>
            <p className="text-sm text-[#c0c0c0] leading-relaxed">{entry.implication}</p>
          </div>
        )}

        {entry.source && (
          <div>
            <p className="text-[10px] text-[#484848] font-bold uppercase tracking-wider mb-1">Source</p>
            <p className="text-xs text-[#666]">{entry.source}</p>
          </div>
        )}

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map(tag => (
              <span key={tag} className="px-2 py-1 bg-[#1a1a1a] text-[#484848] text-xs rounded-lg">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compiled brain preview ────────────────────────────────────────────────────

function CompilePanel({
  entries, onClose,
}: { entries: BrainEntry[]; onClose: () => void }) {
  const compiled = compileBrain(entries);
  const tokens = estimateBrainTokens(entries);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(compiled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
          <div>
            <h3 className="font-bold text-[#f0f0f0]">Compiled Brain Context</h3>
            <p className="text-xs text-[#484848] mt-0.5">
              ~{tokens.toLocaleString()} tokens · {entries.filter(e => e.priority === 'core').length} core + {entries.filter(e => e.priority === 'reference').length} reference entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#e05000]/15 border border-[#e05000]/20 text-[#e05000] hover:bg-[#e05000]/25 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="p-1.5 text-[#333] hover:text-[#aaa]"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {compiled ? (
            <>
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 mb-4">
                <p className="text-xs text-[#4ade80] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  This text is automatically prepended to every AI chat conversation.
                  GPT reads your full brain before every response.
                </p>
              </div>
              <pre className={cn(
                'text-xs text-[#666] font-mono leading-relaxed whitespace-pre-wrap overflow-hidden transition-all',
                expanded ? 'max-h-none' : 'max-h-48',
              )}>
                {compiled}
              </pre>
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-3 flex items-center gap-1 text-xs text-[#484848] hover:text-[#aaa] transition-colors"
              >
                {expanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show full text</>}
              </button>
            </>
          ) : (
            <div className="text-center py-12">
              <Brain className="w-10 h-10 text-[#1e1e1e] mx-auto mb-3" />
              <p className="text-sm text-[#484848]">No core or reference entries yet.</p>
              <p className="text-xs text-[#333] mt-1">Add entries and set priority to Core or Reference.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props {
  entries: BrainEntry[];
  onAdd: (entry: BrainEntry) => void;
  onUpdate: (entry: BrainEntry) => void;
  onDelete: (id: string) => void;
}

export function BrainView({ entries, onAdd, onUpdate, onDelete }: Props) {
  const [search, setSearch]               = useState('');
  const [filterType, setFilterType]       = useState<BrainEntryType | 'All'>('All');
  const [filterPriority, setFilterPriority] = useState<BrainPriority | 'All'>('All');
  const [showForm, setShowForm]           = useState(false);
  const [editingEntry, setEditingEntry]   = useState<BrainEntry | null>(null);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [showCompile, setShowCompile]     = useState(false);
  const [formInitial, setFormInitial]     = useState<Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>>(EMPTY_FORM);

  const tokenCount = useMemo(() => estimateBrainTokens(entries), [entries]);
  const coreCount  = entries.filter(e => e.priority === 'core').length;
  const refCount   = entries.filter(e => e.priority === 'reference').length;

  const filtered = useMemo(() => {
    let result = [...entries];
    if (filterType !== 'All') result = result.filter(e => e.type === filterType);
    if (filterPriority !== 'All') result = result.filter(e => e.priority === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.implication.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    // Sort: core first, then reference, then archived; within tier, newest first
    const ORDER: Record<BrainPriority, number> = { core: 0, reference: 1, archived: 2 };
    return result.sort((a, b) => {
      const pd = ORDER[a.priority] - ORDER[b.priority];
      if (pd !== 0) return pd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [entries, filterType, filterPriority, search]);

  const expandedEntry = entries.find(e => e.id === expandedId);

  const handleAdd = (data: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    onAdd({ id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now });
    setShowForm(false);
    setFormInitial(EMPTY_FORM);
  };

  const handleUpdate = (data: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingEntry) return;
    onUpdate({ ...editingEntry, ...data, updatedAt: new Date().toISOString() });
    setEditingEntry(null);
    setExpandedId(null);
  };

  const openNew = () => {
    setFormInitial(EMPTY_FORM);
    setShowForm(true);
    setEditingEntry(null);
  };

  const openEdit = (entry: BrainEntry) => {
    setEditingEntry(entry);
    setFormInitial({
      type: entry.type, title: entry.title, content: entry.content,
      source: entry.source, implication: entry.implication, tags: entry.tags,
      priority: entry.priority,
    });
    setShowForm(true);
  };

  const handlePriorityChange = (entry: BrainEntry, p: BrainPriority) => {
    onUpdate({ ...entry, priority: p, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="h-full flex overflow-hidden bg-[#080808]">

      {/* ── Left sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-[#1a1a1a] flex flex-col py-4 px-3 gap-4 overflow-y-auto">

        {/* Stats */}
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl px-3 py-3 space-y-2">
          <p className="text-[10px] text-[#333] font-bold uppercase tracking-wider">Brain Status</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-[#484848]">Total entries</span>
              <span className="text-xs text-[#f0f0f0] font-mono">{entries.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-[#e05000]">Core (in every chat)</span>
              <span className="text-xs text-[#e05000] font-mono">{coreCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-blue-400">Reference</span>
              <span className="text-xs text-blue-400 font-mono">{refCount}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[#1a1a1a]">
              <span className="text-[11px] text-[#333]">~GPT tokens</span>
              <span className="text-[11px] text-[#484848] font-mono">~{tokenCount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Priority filter */}
        <div>
          <p className="text-[10px] text-[#333] font-bold uppercase tracking-wider mb-2 px-0.5">Priority</p>
          <div className="space-y-1">
            <FilterChip label="All" active={filterPriority === 'All'} onClick={() => setFilterPriority('All')} />
            {ALL_PRIORITIES.map(p => {
              const pc = PRIORITY_CONFIG[p];
              return (
                <FilterChip
                  key={p}
                  label={`${pc.label}`}
                  active={filterPriority === p}
                  onClick={() => setFilterPriority(p)}
                  colorClass={cn(pc.headerBg, pc.headerText, 'border-transparent')}
                />
              );
            })}
          </div>
        </div>

        {/* Type filter */}
        <div>
          <p className="text-[10px] text-[#333] font-bold uppercase tracking-wider mb-2 px-0.5">Type</p>
          <div className="space-y-1">
            <FilterChip label="All" active={filterType === 'All'} onClick={() => setFilterType('All')} />
            {ALL_TYPES.map(t => {
              const tc = TYPE_CONFIG[t];
              return (
                <FilterChip
                  key={t}
                  label={tc.label}
                  active={filterType === t}
                  onClick={() => setFilterType(t)}
                  colorClass={cn(tc.bg, tc.text, 'border-transparent')}
                />
              );
            })}
          </div>
        </div>

        {/* GPT info */}
        <div className="mt-auto bg-[#111]/60 border border-[#1a1a1a] rounded-xl px-3 py-3">
          <p className="text-[10px] text-[#333] flex items-center gap-1">
            <Info className="w-3 h-3" />
            Brain is live in GPT
          </p>
          <p className="text-[10px] text-[#252525] mt-1 leading-relaxed">
            All core + reference entries are automatically injected into every AI Assistant conversation.
          </p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 border-b border-[#1a1a1a] px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#333]" />
              <input
                type="text"
                placeholder="Search brain…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] placeholder-[#2a2a2a] text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-[#e05000]/40"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#333] hover:text-[#666]">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {filtered.length !== entries.length && (
              <span className="text-xs text-[#484848]">{filtered.length} of {entries.length}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowCompile(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#666] hover:text-[#aaa] rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Preview Context
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#e05000] hover:bg-[#c74800] text-white rounded-lg font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Entry
            </button>
          </div>
        </div>

        {/* Entry grid + right panel */}
        <div className="flex-1 overflow-hidden flex">

          {/* Cards grid */}
          <div className={cn('flex-1 overflow-y-auto p-5', (showForm || expandedEntry) ? 'hidden lg:block' : '')}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Brain className="w-12 h-12 text-[#1a1a1a] mb-4" />
                {entries.length === 0 ? (
                  <>
                    <p className="text-sm font-semibold text-[#484848]">Your brain is empty</p>
                    <p className="text-xs text-[#333] mt-1 max-w-xs leading-relaxed">
                      Add your operating principles, key quotes, brand inspirations, founder insights, and hard rules.
                      Everything here gets injected into your AI conversations.
                    </p>
                    <button
                      onClick={openNew}
                      className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-[#e05000] hover:bg-[#c74800] text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add first entry
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#484848]">No entries match your filter</p>
                    <button onClick={() => { setSearch(''); setFilterType('All'); setFilterPriority('All'); }} className="mt-2 text-xs text-[#e05000] hover:text-[#ff6820] transition-colors">Clear filters</button>
                  </>
                )}
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 space-y-4">
                {filtered.map(entry => (
                  <div key={entry.id} className="break-inside-avoid">
                    <EntryCard
                      entry={entry}
                      onExpand={() => { setExpandedId(entry.id); setShowForm(false); }}
                      onDelete={() => onDelete(entry.id)}
                      onPriorityChange={p => handlePriorityChange(entry, p)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: form or detail */}
          {(showForm || expandedEntry) && (
            <div className="w-full lg:w-[400px] shrink-0 border-l border-[#1a1a1a] flex flex-col overflow-hidden bg-[#080808]">
              {showForm ? (
                <>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a] shrink-0">
                    <h3 className="text-sm font-semibold text-[#f0f0f0]">
                      {editingEntry ? 'Edit Entry' : 'New Brain Entry'}
                    </h3>
                    <button
                      onClick={() => { setShowForm(false); setEditingEntry(null); }}
                      className="p-1 text-[#333] hover:text-[#aaa] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <EntryForm
                    initial={formInitial}
                    onSave={editingEntry ? handleUpdate : handleAdd}
                    onCancel={() => { setShowForm(false); setEditingEntry(null); }}
                    isEditing={!!editingEntry}
                  />
                </>
              ) : expandedEntry ? (
                <EntryDetail
                  entry={expandedEntry}
                  onEdit={() => openEdit(expandedEntry)}
                  onClose={() => setExpandedId(null)}
                  onDelete={() => { onDelete(expandedEntry.id); setExpandedId(null); }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Compile modal */}
      {showCompile && (
        <CompilePanel
          entries={entries}
          onClose={() => setShowCompile(false)}
        />
      )}
    </div>
  );
}
