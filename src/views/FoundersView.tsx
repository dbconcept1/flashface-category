/**
 * Founder Tracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Track founders, their companies, and career patterns.
 * Add notes, link to Company Intelligence profiles, and run AI research
 * to auto-fill career summaries keyed to LinkedIn, press, and public data.
 */

import { useState, useRef, useMemo, useEffect } from 'react';
import type { FounderProfile, CompanyProfile } from '../types';
import {
  UserCircle2, Plus, X, ExternalLink, Loader2, Sparkles,
  Search, Edit3, Trash2, AlertCircle, Link2, Building2,
} from 'lucide-react';
import { cn } from '../utils';
import { researchFounder } from '../services/reputationService';

// ─── Avatar helpers ─────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  'from-orange-500 to-rose-500',
  'from-violet-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-blue-500 to-cyan-500',
  'from-yellow-500 to-orange-500',
  'from-pink-500 to-rose-500',
];

function avatarGradient(name: string): string {
  const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
}

function Avatar({ founder, size = 'md' }: { founder: FounderProfile; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-11 h-11 text-base';
  if (founder.photoUrl) {
    return <img src={founder.photoUrl} alt={founder.name} className={cn(cls, 'rounded-full object-cover shrink-0')} />;
  }
  return (
    <div className={cn(cls, 'rounded-full bg-gradient-to-br shrink-0 flex items-center justify-center font-bold text-white', avatarGradient(founder.name))}>
      {initials(founder.name)}
    </div>
  );
}

// ─── Add founder modal ───────────────────────────────────────────────────────

function AddFounderModal({ onAdd, onClose, companies }: {
  onAdd: (f: Omit<FounderProfile, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
  companies: CompanyProfile[];
}) {
  const [name, setName]               = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [company, setCompany]         = useState('');
  const [role, setRole]               = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!company.trim() || companies.length === 0) return [];
    const q = company.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [company, companies]);

  const submit = () => {
    if (!name.trim()) return;
    // Find matching company profile ID if name exactly matches
    const matchedCompany = companies.find(c => c.name.toLowerCase() === company.trim().toLowerCase());
    onAdd({
      name: name.trim(),
      linkedinUrl: linkedinUrl.trim() || undefined,
      currentCompany: company.trim() || undefined,
      currentRole: role.trim() || undefined,
      notes: '',
      pastCompanies: [],
      keyInsights: [],
      linkedCompanyIds: matchedCompany ? [matchedCompany.id] : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0d0d] border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">New Founder</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name *"
            className="w-full px-3 py-2.5 bg-[#080808] border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-gray-600 placeholder:text-gray-700"
          />
          <input
            value={linkedinUrl}
            onChange={e => setLinkedinUrl(e.target.value)}
            placeholder="LinkedIn URL (optional)"
            className="w-full px-3 py-2.5 bg-[#080808] border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-gray-600 placeholder:text-gray-700"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                value={company}
                onChange={e => { setCompany(e.target.value); setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Current company"
                className="w-full px-3 py-2.5 bg-[#080808] border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-gray-600 placeholder:text-gray-700"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-gray-700 rounded-xl overflow-hidden z-10 shadow-xl">
                  {suggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                      onMouseDown={() => { setCompany(s.name); setShowSuggestions(false); }}
                    >
                      <Link2 className="w-3 h-3 text-orange-400 shrink-0" />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Current role"
              className="px-3 py-2.5 bg-[#080808] border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-gray-600 placeholder:text-gray-700"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Add Founder
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-gray-600 hover:text-gray-400 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Founder detail modal ────────────────────────────────────────────────────

function FounderModal({
  founder,
  companies,
  onUpdate,
  onDelete,
  onClose,
  onLinkFounderCompanies,
}: {
  founder: FounderProfile;
  companies: CompanyProfile[];
  onUpdate: (updater: (current: FounderProfile) => FounderProfile) => void;
  onDelete: () => void;
  onClose: () => void;
  onLinkFounderCompanies?: (founderId: string, companyIds: string[]) => void;
}) {
  const [edit, setEdit]         = useState(false);
  const [nameVal, setNameVal]   = useState(founder.name);
  const [liVal, setLiVal]       = useState(founder.linkedinUrl ?? '');
  const [compVal, setCompVal]   = useState(founder.currentCompany ?? '');
  const [roleVal, setRoleVal]   = useState(founder.currentRole ?? '');
  const [pastVal, setPastVal]   = useState((founder.pastCompanies ?? []).join(', '));
  const [notes, setNotes]       = useState(founder.notes);
  const [isResearching, setIsResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const lastSavedNotesRef = useRef(founder.notes);

  const linkedCompanies = useMemo(
    () => companies.filter(c => founder.linkedCompanyIds?.includes(c.id)),
    [companies, founder.linkedCompanyIds]
  );

  const companySuggestions = useMemo(() => {
    if (!companySearch.trim()) return companies.filter(c => !founder.linkedCompanyIds?.includes(c.id)).slice(0, 6);
    const q = companySearch.toLowerCase();
    return companies
      .filter(c => !founder.linkedCompanyIds?.includes(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [companies, companySearch, founder.linkedCompanyIds]);

  const linkCompany = (companyId: string) => {
    const newIds = [...new Set([...(founder.linkedCompanyIds ?? []), companyId])];
    onLinkFounderCompanies?.(founder.id, newIds);
    setCompanySearch('');
    setShowCompanySearch(false);
  };

  const unlinkCompany = (companyId: string) => {
    const newIds = (founder.linkedCompanyIds ?? []).filter(id => id !== companyId);
    onLinkFounderCompanies?.(founder.id, newIds);
  };

  useEffect(() => {
    lastSavedNotesRef.current = founder.notes;
    setNotes(founder.notes);
  }, [founder.id, founder.notes]);

  const saveEdit = () => {
    onUpdate(current => ({
      ...current,
      name: nameVal.trim() || current.name,
      linkedinUrl: liVal.trim() || undefined,
      currentCompany: compVal.trim() || undefined,
      currentRole: roleVal.trim() || undefined,
      pastCompanies: pastVal.split(',').map(s => s.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    }));
    setEdit(false);
  };

  const saveNotes = () => {
    if (notes === lastSavedNotesRef.current) return;
    lastSavedNotesRef.current = notes;
    onUpdate(current => ({ ...current, notes, updatedAt: new Date().toISOString() }));
  };

  const runResearch = async () => {
    setIsResearching(true);
    setResearchError(null);
    try {
      const result = await researchFounder(founder.name, founder.linkedinUrl, founder.currentCompany);
      onUpdate(current => ({
        ...current,
        currentCompany: result.currentCompany ?? current.currentCompany,
        currentRole: result.currentRole ?? current.currentRole,
        pastCompanies: result.pastCompanies?.length ? result.pastCompanies : current.pastCompanies,
        keyInsights: result.keyInsights?.length ? result.keyInsights : current.keyInsights,
        aiSummary: result.aiSummary ?? current.aiSummary,
        summaryUpdatedAt: result.aiSummary ? new Date().toISOString() : current.summaryUpdatedAt,
        updatedAt: new Date().toISOString(),
      }));
    } catch (e: any) {
      setResearchError(e?.message ?? 'Research failed');
    } finally {
      setIsResearching(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Delete ${founder.name}?`)) {
      onDelete();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-gray-800 rounded-2xl w-full max-w-2xl my-8 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-800/60">
          <Avatar founder={founder} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{founder.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {[founder.currentRole, founder.currentCompany].filter(Boolean).join(' @ ') || 'No role set'}
            </p>
            {founder.linkedinUrl && (
              <a
                href={founder.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400/70 hover:text-blue-400 mt-1"
              >
                <Link2 className="w-3 h-3" /> LinkedIn <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEdit(v => !v)} className="p-1.5 text-gray-600 hover:text-gray-300 rounded-lg border border-gray-800 transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="p-1.5 text-rose-500/50 hover:text-rose-400 rounded-lg border border-rose-500/15 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-600 hover:text-gray-400 rounded-lg border border-gray-800 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Edit Form */}
          {edit && (
            <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Edit Profile</p>
              <input value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="Full name"
                className="w-full px-3 py-2 bg-[#080808] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
              <input value={liVal} onChange={e => setLiVal(e.target.value)} placeholder="LinkedIn URL"
                className="w-full px-3 py-2 bg-[#080808] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
              <div className="grid grid-cols-2 gap-2">
                <input value={compVal} onChange={e => setCompVal(e.target.value)} placeholder="Current company"
                  className="px-3 py-2 bg-[#080808] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
                <input value={roleVal} onChange={e => setRoleVal(e.target.value)} placeholder="Current role"
                  className="px-3 py-2 bg-[#080808] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
              </div>
              <input value={pastVal} onChange={e => setPastVal(e.target.value)} placeholder="Past companies (comma-separated)"
                className="w-full px-3 py-2 bg-[#080808] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold">Save</button>
                <button onClick={() => setEdit(false)} className="px-4 py-1.5 text-gray-600 text-xs">Cancel</button>
              </div>
            </div>
          )}

          {/* Past companies */}
          {(founder.pastCompanies?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Past Companies</p>
              <div className="flex flex-wrap gap-1.5">
                {founder.pastCompanies!.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 bg-gray-800/50 border border-gray-700/40 rounded-full text-xs text-gray-400">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Linked company profiles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Linked Company Profiles</p>
              {onLinkFounderCompanies && (
                <button
                  onClick={() => setShowCompanySearch(v => !v)}
                  className="text-[10px] text-orange-400/70 hover:text-orange-400 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Link
                </button>
              )}
            </div>
            {showCompanySearch && onLinkFounderCompanies && (
              <div className="mb-2 relative">
                <input
                  autoFocus
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  placeholder="Search company profiles…"
                  className="w-full px-3 py-2 bg-[#080808] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600"
                />
                {companySuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-gray-700 rounded-xl overflow-hidden z-10 shadow-xl">
                    {companySuggestions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                        onClick={() => linkCompany(c.id)}
                      >
                        <Building2 className="w-3 h-3 text-orange-400 shrink-0" />
                        {c.name}
                        {c.industry && <span className="text-gray-600 text-xs ml-auto">{c.industry}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {companySuggestions.length === 0 && companySearch && (
                  <p className="text-xs text-gray-700 mt-1 px-1">No matches in Company Profiles</p>
                )}
              </div>
            )}
            {linkedCompanies.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {linkedCompanies.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-xs text-orange-400">
                    {c.name}
                    {onLinkFounderCompanies && (
                      <button onClick={() => unlinkCompany(c.id)} className="hover:text-rose-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-700 italic">No companies linked yet</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Drop any intel here — patterns you've noticed, deal context, observations…"
              rows={4}
              className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-gray-800 rounded-xl text-white text-sm leading-relaxed focus:outline-none focus:border-gray-700 resize-none placeholder:text-gray-700"
            />
          </div>

          {/* Key insights */}
          {(founder.keyInsights?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Key Insights</p>
              <ul className="space-y-1.5">
                {founder.keyInsights!.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-orange-500 shrink-0 mt-0.5">›</span>{insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Summary */}
          {founder.aiSummary && (
            <div className="bg-[#0d0d0d] border border-orange-500/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400/70">AI Assessment</p>
                {founder.summaryUpdatedAt && (
                  <p className="text-[10px] text-gray-700">
                    {new Date(founder.summaryUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{founder.aiSummary}</p>
            </div>
          )}

          {/* AI Research button */}
          {researchError && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {researchError}
            </div>
          )}
          <button
            onClick={runResearch}
            disabled={isResearching}
            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/25 hover:border-violet-500/40 text-violet-400 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          >
            {isResearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isResearching ? 'Researching founder…' : founder.aiSummary ? 'Refresh AI Research' : 'Run AI Research'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Founder card ────────────────────────────────────────────────────────────

function FounderCard({ founder, onClick }: { founder: FounderProfile; onClick: () => void }) {
  const pastPreview = founder.pastCompanies?.slice(0, 3) ?? [];
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#0d0d0d] border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all group space-y-3"
    >
      {/* Avatar + name row */}
      <div className="flex items-center gap-3">
        <Avatar founder={founder} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate group-hover:text-orange-100 transition-colors">{founder.name}</p>
          <p className="text-xs text-gray-600 truncate">
            {[founder.currentRole, founder.currentCompany].filter(Boolean).join(' @ ') || <span className="italic">No role</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {founder.linkedinUrl && <Link2 className="w-3 h-3 text-blue-500/50" />}
          {founder.aiSummary   && <Sparkles className="w-3 h-3 text-violet-500/50" />}
        </div>
      </div>

      {/* Past companies pills */}
      {pastPreview.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pastPreview.map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-gray-800/60 rounded-full text-[10px] text-gray-500">{c}</span>
          ))}
          {(founder.pastCompanies?.length ?? 0) > 3 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] text-gray-700">+{founder.pastCompanies!.length - 3} more</span>
          )}
        </div>
      )}

      {/* First insight */}
      {founder.keyInsights?.[0] && (
        <p className="text-xs text-gray-600 line-clamp-2 border-l-2 border-gray-800 pl-2">
          {founder.keyInsights[0]}
        </p>
      )}
    </button>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

interface Props {
  founders: FounderProfile[];
  companies: CompanyProfile[];
  onChange: React.Dispatch<React.SetStateAction<FounderProfile[]>>;
  onLinkFounderCompanies?: (founderId: string, companyIds: string[]) => void;
}

export function FoundersView({ founders, companies, onChange, onLinkFounderCompanies }: Props) {
  const [search, setSearch]             = useState('');
  const [showAdd, setShowAdd]           = useState(false);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return founders;
    return founders.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.currentCompany?.toLowerCase().includes(q) ||
      f.currentRole?.toLowerCase().includes(q) ||
      f.pastCompanies?.some(c => c.toLowerCase().includes(q))
    );
  }, [founders, search]);

  const selected = useMemo(() => founders.find(f => f.id === selectedId) ?? null, [founders, selectedId]);

  const addFounder = (data: Omit<FounderProfile, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const founder: FounderProfile = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    onChange(prev => [founder, ...prev]);
  };

  const updateFounder = (id: string, updater: (current: FounderProfile) => FounderProfile) => {
    onChange(prev => prev.map(f => f.id === id ? updater(f) : f));
  };

  const deleteFounder = (id: string) => {
    onChange(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-700" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search founders, companies, roles…"
            className="w-full pl-8 pr-4 py-2.5 bg-[#0d0d0d] border border-gray-800 rounded-xl text-sm text-white focus:outline-none focus:border-gray-700 placeholder:text-gray-700"
          />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> New Founder
        </button>
      </div>

      {/* Empty state */}
      {founders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UserCircle2 className="w-12 h-12 text-gray-800 mb-4" />
          <p className="text-gray-500 font-medium">No founders yet.</p>
          <p className="text-gray-700 text-sm mt-1 max-w-xs">
            Track founders, link them to company profiles, and run AI research to understand their career patterns.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add First Founder
          </button>
        </div>
      )}

      {/* Grid */}
      {founders.length > 0 && filtered.length === 0 && (
        <p className="text-gray-700 text-sm py-8 text-center">No founders match "{search}".</p>
      )}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(f => (
            <FounderCard key={f.id} founder={f} onClick={() => setSelectedId(f.id)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddFounderModal onAdd={addFounder} onClose={() => setShowAdd(false)} companies={companies} />
      )}
      {selected && (
        <FounderModal
          founder={selected}
          companies={companies}
          onUpdate={(updater) => updateFounder(selected.id, updater)}
          onDelete={() => deleteFounder(selected.id)}
          onClose={() => setSelectedId(null)}
          onLinkFounderCompanies={onLinkFounderCompanies}
        />
      )}
    </div>
  );
}
