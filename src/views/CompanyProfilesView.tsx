/**
 * Company Intelligence Profiles
 * ─────────────────────────────────────────────────────────────────────────────
 * Long-lived dossiers for companies you're watching over time.
 * Drop text notes, paste ad screenshots, log meeting intel, track product
 * launches. AI synthesises everything into a running master brief.
 *
 * VIEWS
 *   ProfileList   — grid of all company cards
 *   ProfileDetail — full dossier for one company
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { CompanyProfile, IntelEntry, IntelEntryType, CompanyReviewScan } from '../types';
import {
  Building2, Plus, X, ChevronLeft, Sparkles, Loader2, ExternalLink,
  FileText, Megaphone, Users, Package, Newspaper, DollarSign,
  Zap, Share2, Inbox, Image, RefreshCw, Edit3, Trash2, Search,
  Link2, AlertCircle, CheckCircle2, ScanLine, CalendarClock, Star,
} from 'lucide-react';
import { cn } from '../utils';
import { generateCompanyBrief } from '../services/companyService';
import { scanCompanyReputation } from '../services/reputationService';

// ─── Entry type config ────────────────────────────────────────────────────────

interface EntryTypeConfig {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
}

const ENTRY_TYPE_CONFIG: Record<IntelEntryType, EntryTypeConfig> = {
  note:     { label: 'Note',     icon: <FileText   className="w-3.5 h-3.5" />, bg: 'bg-gray-800/60',    text: 'text-gray-400',   border: 'border-gray-700/40' },
  ad:       { label: 'Ad',       icon: <Megaphone  className="w-3.5 h-3.5" />, bg: 'bg-pink-500/10',    text: 'text-pink-400',   border: 'border-pink-500/20' },
  meeting:  { label: 'Meeting',  icon: <Users      className="w-3.5 h-3.5" />, bg: 'bg-blue-500/10',    text: 'text-blue-400',   border: 'border-blue-500/20' },
  product:  { label: 'Product',  icon: <Package    className="w-3.5 h-3.5" />, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  press:    { label: 'Press',    icon: <Newspaper  className="w-3.5 h-3.5" />, bg: 'bg-yellow-500/10',  text: 'text-yellow-400', border: 'border-yellow-500/20' },
  funding:  { label: 'Funding',  icon: <DollarSign className="w-3.5 h-3.5" />, bg: 'bg-violet-500/10',  text: 'text-violet-400', border: 'border-violet-500/20' },
  campaign: { label: 'Campaign', icon: <Zap        className="w-3.5 h-3.5" />, bg: 'bg-orange-500/10',  text: 'text-orange-400', border: 'border-orange-500/20' },
  social:   { label: 'Social',   icon: <Share2     className="w-3.5 h-3.5" />, bg: 'bg-cyan-500/10',    text: 'text-cyan-400',   border: 'border-cyan-500/20' },
  general:  { label: 'General',  icon: <Inbox      className="w-3.5 h-3.5" />, bg: 'bg-gray-800/60',    text: 'text-gray-500',   border: 'border-gray-700/40' },
};

// ─── Image compression ────────────────────────────────────────────────────────

function compressImage(dataUrl: string, maxWidth = 1200): Promise<string> {
  return new Promise(resolve => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  profiles: CompanyProfile[];
  onChange: React.Dispatch<React.SetStateAction<CompanyProfile[]>>;
}

// ─── Entry type badge ─────────────────────────────────────────────────────────

function EntryTypeBadge({ type, size = 'sm' }: { type: IntelEntryType; size?: 'xs' | 'sm' }) {
  const cfg = ENTRY_TYPE_CONFIG[type];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 font-medium rounded-full border',
      size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
      cfg.bg, cfg.text, cfg.border,
    )}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Master Brief renderer ────────────────────────────────────────────────────

const BRIEF_SECTIONS = [
  'POSITIONING', 'BUSINESS MODEL', 'PRODUCT & MOVES',
  'MARKETING & ADS', 'FINANCIAL SIGNALS', 'RISKS & WEAKNESSES', 'WATCH NEXT',
];

function MasterBrief({ brief }: { brief: string }) {
  const parsed = useMemo(() => {
    const result: { label: string; body: string }[] = [];
    let current: { label: string; lines: string[] } | null = null;

    for (const line of brief.split('\n')) {
      const matched = BRIEF_SECTIONS.find(s => line.startsWith(s + ':'));
      if (matched) {
        if (current) result.push({ label: current.label, body: current.lines.join(' ').trim() });
        current = { label: matched, lines: [line.slice(matched.length + 1).trim()] };
      } else if (current && line.trim()) {
        current.lines.push(line.trim());
      }
    }
    if (current) result.push({ label: current.label, body: current.lines.join(' ').trim() });
    return result.length ? result : [{ label: 'BRIEF', body: brief }];
  }, [brief]);

  const SECTION_COLORS: Record<string, string> = {
    'POSITIONING':       'text-blue-400',
    'BUSINESS MODEL':    'text-violet-400',
    'PRODUCT & MOVES':   'text-emerald-400',
    'MARKETING & ADS':   'text-pink-400',
    'FINANCIAL SIGNALS': 'text-yellow-400',
    'RISKS & WEAKNESSES':'text-rose-400',
    'WATCH NEXT':        'text-orange-400',
  };

  return (
    <div className="space-y-3">
      {parsed.map(({ label, body }) => (
        <div key={label} className="bg-gray-900/50 border border-gray-800/60 rounded-xl px-4 py-3">
          <p className={cn('text-[9px] font-bold uppercase tracking-widest mb-1', SECTION_COLORS[label] ?? 'text-gray-500')}>
            {label}
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Reputation panel (renders a CompanyReviewScan) ──────────────────────────

function ReputationPanel({ scan, companyName }: { scan: CompanyReviewScan; companyName: string }) {
  return (
    <div className="space-y-4">
      {/* Overall */}
      {scan.overallReputation && (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">Overall Reputation</p>
          <p className="text-sm text-gray-300 leading-relaxed">{scan.overallReputation}</p>
        </div>
      )}

      {/* Trustpilot */}
      {(scan.trustpilotScore !== undefined || scan.trustpilotSentiment) && (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Trustpilot</p>
            {scan.trustpilotScore !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-emerald-400">{scan.trustpilotScore.toFixed(1)}</span>
                <span className="text-xs text-gray-600">/5</span>
                {scan.trustpilotTotal && <span className="text-xs text-gray-600">({scan.trustpilotTotal.toLocaleString()} reviews)</span>}
              </div>
            )}
          </div>
          {scan.trustpilotSentiment && <p className="text-xs text-gray-400 leading-relaxed">{scan.trustpilotSentiment}</p>}
          {scan.trustpilotSample && scan.trustpilotSample.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {scan.trustpilotSample.map((s, i) => (
                <blockquote key={i} className="text-xs text-gray-500 border-l-2 border-gray-700 pl-3 italic">"{s}"</blockquote>
              ))}
            </div>
          )}
          {scan.trustpilotUrl && (
            <a href={scan.trustpilotUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">View on Trustpilot →</a>
          )}
        </div>
      )}

      {/* Reddit */}
      {(scan.redditSentiment || (scan.redditSample && scan.redditSample.length > 0)) && (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Reddit</p>
          {scan.redditSentiment && <p className="text-xs text-gray-400 leading-relaxed">{scan.redditSentiment}</p>}
          {scan.redditSample && scan.redditSample.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {scan.redditSample.map((s, i) => (
                <blockquote key={i} className="text-xs text-gray-500 border-l-2 border-orange-900 pl-3">"{s}"</blockquote>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LinkedIn */}
      {scan.linkedinUpdates && scan.linkedinUpdates.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">LinkedIn Updates</p>
          <ul className="space-y-1.5">
            {scan.linkedinUpdates.map((s, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-2"><span className="text-gray-700 shrink-0">•</span>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Legal */}
      {scan.legalFlags && scan.legalFlags.length > 0 && (
        <div className="bg-rose-900/20 border border-rose-900/40 rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Legal Flags</p>
          <ul className="space-y-1.5">
            {scan.legalFlags.map((s, i) => (
              <li key={i} className="text-xs text-rose-300 flex gap-2"><span className="shrink-0">⚠</span>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Glassdoor */}
      {scan.glassdoorRating !== undefined && (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 flex items-center justify-between">
          <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Glassdoor (Employer Rating)</p>
          <span className="text-lg font-bold text-teal-400">{scan.glassdoorRating.toFixed(1)}<span className="text-xs text-gray-600 font-normal">/5</span></span>
        </div>
      )}

      <p className="text-[10px] text-gray-700 text-right">
        Scanned {new Date(scan.scannedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

// ─── Company profile detail view ──────────────────────────────────────────────

function ProfileDetail({
  profile,
  onBack,
  onUpdate,
  onDelete,
}: {
  profile: CompanyProfile;
  onBack: () => void;
  onUpdate: (updater: (current: CompanyProfile) => CompanyProfile) => void;
  onDelete: () => void;
}) {
  const [text, setText]             = useState('');
  const [source, setSource]         = useState('');
  const [entryType, setEntryType]   = useState<IntelEntryType>('note');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState('');
  const [isBriefing, setIsBriefing] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [editName, setEditName]     = useState(false);
  const [nameVal, setNameVal]       = useState(profile.name);
  const [urlVal, setUrlVal]         = useState(profile.url ?? '');
  const [industryVal, setIndustryVal] = useState(profile.industry ?? '');
  const [activeTab, setActiveTab]   = useState<'entries' | 'brief' | 'reputation'>('entries');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError]   = useState<string | null>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  // Paste image capture — active when this view is mounted
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const compressed = await compressImage(raw);
      setPendingImage(compressed);
      setEntryType('ad'); // default to "ad" when image is pasted
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const saveEdit = () => {
    onUpdate(current => ({
      ...current,
      name: nameVal.trim() || current.name,
      url: urlVal.trim() || undefined,
      industry: industryVal.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }));
    setEditName(false);
  };

  const addEntry = () => {
    if (!text.trim() && !pendingImage) return;
    const entry: IntelEntry = {
      id: crypto.randomUUID(),
      type: entryType,
      content: text.trim(),
      imageDataUrl: pendingImage ?? undefined,
      imageCaption: imageCaption.trim() || undefined,
      source: source.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    onUpdate(current => ({
      ...current,
      entries: [entry, ...current.entries],
      updatedAt: new Date().toISOString(),
    }));
    setText(''); setSource(''); setPendingImage(null); setImageCaption('');
    setEntryType('note');
    textareaRef.current?.focus();
  };

  const deleteEntry = (id: string) => {
    onUpdate(current => ({
      ...current,
      entries: current.entries.filter(e => e.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  };

  const refreshBrief = async () => {
    setIsBriefing(true);
    setBriefError(null);
    try {
      const brief = await generateCompanyBrief(profile);
      onUpdate(current => ({
        ...current,
        aiMasterBrief: brief,
        briefUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setActiveTab('brief');
    } catch (e: any) {
      setBriefError(e?.message ?? 'Brief generation failed');
    } finally {
      setIsBriefing(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const scan = await scanCompanyReputation(profile.name, profile.url);
      onUpdate(current => ({
        ...current,
        reviewScan: scan,
        lastScanned: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setActiveTab('reputation');
    } catch (e: any) {
      setScanError(e?.message ?? 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSchedule = () => {
    onUpdate(current => ({ ...current, scheduledScan: !current.scheduledScan, updatedAt: new Date().toISOString() }));
  };

  const sortedEntries = useMemo(() =>
    [...profile.entries].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()),
    [profile.entries]
  );

  const metaAdsUrl = profile.metaAdsPageId
    ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(profile.metaAdsPageId)}&search_type=keyword_unordered`
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(profile.name)}&search_type=keyword_unordered`;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-0.5 text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1 text-sm">
            <ChevronLeft className="w-4 h-4" /> Companies
          </button>
        </div>
        <div className="flex gap-2">
          {/* Reputation scan */}
          <button
            onClick={handleScan}
            disabled={isScanning}
            title="Scan Trustpilot, Reddit, LinkedIn & legal"
            className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
          >
            {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanLine className="w-3 h-3" />}
            {isScanning ? 'Scanning…' : 'Scan'}
          </button>
          {/* Weekly schedule toggle */}
          <button
            onClick={toggleSchedule}
            title={profile.scheduledScan ? 'Weekly scan ON — click to disable' : 'Enable weekly auto-scan'}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all',
              profile.scheduledScan
                ? 'bg-violet-500/10 text-violet-400 border-violet-500/25 hover:border-violet-500/40'
                : 'text-gray-600 border-gray-800 hover:text-gray-400 hover:border-gray-700'
            )}
          >
            <CalendarClock className="w-3 h-3" />
            {profile.scheduledScan ? 'Weekly ✓' : 'Schedule'}
          </button>
          <a href={metaAdsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/20 hover:border-blue-500/40 px-3 py-1.5 rounded-lg transition-all"
            title="Search Meta Ads Library">
            Meta Ads <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={() => setEditName(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all">
            <Edit3 className="w-3 h-3" /> Edit
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-rose-500/60 border border-rose-500/15 hover:border-rose-500/30 px-3 py-1.5 rounded-lg transition-all">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Company title */}
      {editName ? (
        <div className="space-y-2 bg-[#0d0d0d] border border-gray-800 rounded-xl p-4">
          <div className="grid grid-cols-3 gap-2">
            <input value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="Company name" className="col-span-3 px-3 py-2 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
            <input value={urlVal} onChange={e => setUrlVal(e.target.value)} placeholder="Website URL" className="col-span-2 px-3 py-2 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
            <input value={industryVal} onChange={e => setIndustryVal(e.target.value)} placeholder="Industry" className="px-3 py-2 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-gray-600" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveEdit} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold">Save</button>
            <button onClick={() => setEditName(false)} className="px-4 py-1.5 text-gray-500 text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            {profile.industry && <span className="text-xs text-orange-400/80">{profile.industry}</span>}
            {profile.url && (
              <a href={profile.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1">
                {profile.url.replace(/^https?:\/\//, '')} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            <span className="text-xs text-gray-700">{profile.entries.length} entries</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {([
          ['entries',    `Intel (${profile.entries.length})`],
          ['brief',      'AI Brief'],
          ['reputation', 'Reputation'],
        ] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors rounded-t-lg -mb-px border border-transparent',
              activeTab === tab
                ? 'text-white border-gray-800 border-b-[#080808] bg-[#0d0d0d]'
                : 'text-gray-600 hover:text-gray-400'
            )}>
            {label}
            {tab === 'brief'      && profile.aiMasterBrief && <span className="ml-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full inline-block" />}
            {tab === 'reputation' && profile.reviewScan    && <span className="ml-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />}
          </button>
        ))}
      </div>

      {/* ── Entries tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <div className="space-y-4">
          {/* Quick-add panel */}
          <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-600">Drop Intel Here</p>

            {/* Image preview */}
            {pendingImage && (
              <div className="relative w-full">
                <img src={pendingImage} alt="Pasted" className="rounded-lg max-h-48 object-contain border border-gray-800" />
                <button onClick={() => { setPendingImage(null); setImageCaption(''); }}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1">
                  <X className="w-3 h-3" />
                </button>
                <input value={imageCaption} onChange={e => setImageCaption(e.target.value)}
                  placeholder="Caption / description of this image…"
                  className="mt-2 w-full px-3 py-1.5 bg-[#0a0a0a] border border-gray-800 text-gray-300 text-xs rounded-lg focus:outline-none focus:border-gray-600 placeholder-gray-600" />
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={() => {/* handled globally */}}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addEntry(); }}
              placeholder={pendingImage ? "Add context for this image (optional)…" : "Paste text, Ctrl+V to paste an image, or type any intel freely…"}
              rows={4}
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600 resize-none"
            />

            <div className="flex flex-wrap gap-2 items-end justify-between">
              <div className="flex flex-wrap gap-2">
                {/* Type selector */}
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(ENTRY_TYPE_CONFIG) as IntelEntryType[]).map(t => {
                    const cfg = ENTRY_TYPE_CONFIG[t];
                    return (
                      <button key={t} onClick={() => setEntryType(t)}
                        className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border transition-all',
                          entryType === t ? cn(cfg.bg, cfg.text, cfg.border) : 'bg-transparent text-gray-600 border-gray-800 hover:text-gray-400'
                        )}>
                        {cfg.icon} {cfg.label}
                      </button>
                    );
                  })}
                </div>
                {/* Source */}
                <input value={source} onChange={e => setSource(e.target.value)}
                  placeholder="Source (URL, name, meeting…)"
                  className="px-3 py-1 bg-[#0a0a0a] border border-gray-800 text-gray-400 text-xs rounded-lg focus:outline-none focus:border-gray-600 placeholder-gray-600 h-[28px]" />
              </div>
              <button
                onClick={addEntry}
                disabled={!text.trim() && !pendingImage}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Intel
              </button>
            </div>
            <p className="text-[10px] text-gray-700">Paste image with Ctrl+V anywhere on this page · Cmd+Enter to add</p>
          </div>

          {/* Entry timeline */}
          {sortedEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-sm">
              No intel yet. Start dropping notes, screenshots, or anything useful.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedEntries.map(entry => (
                <div key={entry.id}
                  className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-4 group">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntryTypeBadge type={entry.type} />
                      {entry.source && (
                        <span className="text-[10px] text-gray-600 flex items-center gap-1">
                          <Link2 className="w-2.5 h-2.5" /> {entry.source.replace(/^https?:\/\//, '').slice(0, 40)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-700">
                        {new Date(entry.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </span>
                      <button onClick={() => deleteEntry(entry.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-rose-400 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {entry.content && (
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                  )}
                  {entry.imageDataUrl && (
                    <div className="mt-2">
                      <img src={entry.imageDataUrl} alt={entry.imageCaption ?? 'Intel image'}
                        className="rounded-lg max-h-64 object-contain border border-gray-800 cursor-zoom-in"
                        onClick={() => window.open(entry.imageDataUrl)} />
                      {entry.imageCaption && (
                        <p className="text-[11px] text-gray-600 mt-1 italic">{entry.imageCaption}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Brief tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'brief' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              {profile.briefUpdatedAt && (
                <p className="text-[11px] text-gray-600">
                  Last generated {new Date(profile.briefUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{profile.entries.length} entries analysed
                </p>
              )}
            </div>
            <button
              onClick={refreshBrief}
              disabled={isBriefing || profile.entries.length === 0}
              className="flex items-center gap-1.5 text-sm text-orange-400 border border-orange-500/25 hover:border-orange-500/40 px-4 py-2 rounded-xl transition-all disabled:opacity-40"
            >
              {isBriefing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isBriefing ? 'Generating…' : profile.aiMasterBrief ? 'Refresh Brief' : 'Generate Brief'}
            </button>
          </div>

          {briefError && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {briefError}
            </div>
          )}

          {profile.aiMasterBrief ? (
            <MasterBrief brief={profile.aiMasterBrief} />
          ) : (
            <div className="text-center py-12">
              <Sparkles className="w-10 h-10 text-gray-800 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No brief yet.</p>
              <p className="text-gray-700 text-xs mt-1">
                {profile.entries.length === 0
                  ? 'Add some intel entries first, then generate a brief.'
                  : 'Click "Generate Brief" to synthesise all your intel into a structured report.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Reputation tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'reputation' && (
        <div className="space-y-4">
          {scanError && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {scanError}
            </div>
          )}
          {profile.reviewScan ? (
            <ReputationPanel scan={profile.reviewScan} companyName={profile.name} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScanLine className="w-10 h-10 text-gray-800 mb-4" />
              <p className="text-gray-500 font-medium">No reputation scan yet.</p>
              <p className="text-gray-700 text-sm mt-1 max-w-xs">
                Click <strong className="text-gray-500">Scan</strong> at the top to pull Trustpilot reviews,
                Reddit sentiment, LinkedIn updates, and legal flags.
              </p>
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors disabled:opacity-40"
              >
                {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                {isScanning ? 'Scanning…' : 'Run Scan Now'}
              </button>
              {profile.scheduledScan && (
                <p className="text-[10px] text-violet-500/70 mt-3">Weekly scan is enabled — will run automatically each week.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Profile list card ────────────────────────────────────────────────────────

function ProfileCard({ profile, onClick }: { profile: CompanyProfile; onClick: () => void }) {
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<IntelEntryType, number>> = {};
    for (const e of profile.entries) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }, [profile.entries]);

  const topTypes = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3) as [IntelEntryType, number][];

  return (
    <button
      onClick={onClick}
      className="bg-[#0d0d0d] border border-gray-800 hover:border-gray-700 rounded-xl p-5 text-left transition-all hover:shadow-[0_0_20px_-8px_rgba(255,255,255,0.05)] group w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-white font-bold leading-tight group-hover:text-orange-50 transition-colors">
            {profile.name}
          </h4>
          {profile.industry && <p className="text-xs text-orange-400/70 mt-0.5">{profile.industry}</p>}
          {profile.url && (
            <p className="text-[11px] text-gray-700 mt-0.5">
              {profile.url.replace(/^https?:\/\//, '').slice(0, 32)}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono text-gray-700 bg-gray-900 px-1.5 py-0.5 rounded shrink-0">
          {profile.entries.length}
        </span>
      </div>

      {/* Entry type distribution */}
      {topTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {topTypes.map(([type, count]) => (
            <EntryTypeBadge key={type} type={type} size="xs" />
          ))}
        </div>
      )}

      {/* AI brief snippet */}
      {profile.aiMasterBrief && (
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {profile.aiMasterBrief.replace(/^[A-Z &]+:\s*/m, '').split('\n')[0]}
        </p>
      )}

      {/* Last updated */}
      <p className="text-[10px] text-gray-700 mt-2 pt-2 border-t border-gray-800/60">
        {new Date(profile.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        {profile.aiMasterBrief ? ' · Brief ready' : ''}
      </p>
    </button>
  );
}

// ─── Add Company modal ────────────────────────────────────────────────────────

function AddCompanyModal({ onAdd, onClose }: { onAdd: (p: CompanyProfile) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [industry, setIndustry] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    onAdd({ id: crypto.randomUUID(), name: name.trim(), url: url.trim() || undefined, industry: industry.trim() || undefined, entries: [], createdAt: now, updatedAt: now });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-bold text-lg">New Company Profile</h3>
            <p className="text-xs text-gray-600 mt-0.5">Add a company you want to build intelligence on</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Company name *" autoFocus
            className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600" />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Website (optional)"
            className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600" />
          <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Industry (optional)"
            className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600" />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={submit} disabled={!name.trim()}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors">
            Create Profile
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-400 border border-gray-800 rounded-xl text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CompanyProfilesView({ profiles, onChange }: Props) {
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [search, setSearch]       = useState('');

  const activeProfile = profiles.find(p => p.id === activeId) ?? null;

  const updateProfile = useCallback((profileId: string, updater: (current: CompanyProfile) => CompanyProfile) => {
    onChange(prev => prev.map(p => p.id === profileId ? updater(p) : p));
  }, [onChange]);

  const deleteProfile = useCallback((id: string) => {
    onChange(prev => prev.filter(p => p.id !== id));
    setActiveId(null);
  }, [onChange]);

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.industry?.toLowerCase().includes(q) ||
      p.entries.some(e => e.content?.toLowerCase().includes(q))
    );
  }, [profiles, search]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [filtered]
  );

  if (activeProfile) {
    return (
      <ProfileDetail
        profile={activeProfile}
        onBack={() => setActiveId(null)}
        onUpdate={(updater) => updateProfile(activeProfile.id, updater)}
        onDelete={() => deleteProfile(activeProfile.id)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Company Intelligence</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Long-lived dossiers. Drop anything — screenshots, notes, meeting intel, ads,
            product moves. AI synthesises it all into a running brief.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-colors border border-orange-500 shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] shrink-0"
        >
          <Plus className="w-4 h-4" /> New Company
        </button>
      </div>

      {/* Search */}
      {profiles.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search companies & entries…"
            className="w-full pl-9 pr-4 py-2 bg-[#0d0d0d] border border-gray-800 text-white placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-700"
          />
        </div>
      )}

      {/* Empty state */}
      {profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Building2 className="w-12 h-12 text-gray-800 mb-4" />
          <p className="text-gray-500 font-medium">No company profiles yet.</p>
          <p className="text-gray-700 text-sm mt-1 max-w-xs">
            Add any company you want to track over time — competitors, interesting brands,
            potential partners. Drop intel whenever you find something.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/25 rounded-lg text-sm transition-colors">
            Add your first company
          </button>
        </div>
      )}

      {/* Grid */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(p => (
            <ProfileCard key={p.id} profile={p} onClick={() => setActiveId(p.id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddCompanyModal
          onAdd={p => { onChange(prev => [p, ...prev]); setActiveId(p.id); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
