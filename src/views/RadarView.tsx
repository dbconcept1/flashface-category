/**
 * Intel Radar View
 *
 * Two-tab intelligence scanner:
 *   Tab 1 — Companies to Watch: finds scaling companies before mainstream press
 *   Tab 2 — Hidden Investors: surfaces quiet capital holders by region
 *
 * Every found item can be promoted to existing modules in one click:
 *   Company → Company Intelligence + optionally a Category
 *   Founder  → Founders module
 *   Investor → Founders module (marked as investor in notes)
 *   Any item → Brain OS (one-click)
 */

import { useState, useRef } from 'react';
import { cn } from '../utils';
import type {
  RadarCompany, RadarInvestor, RadarRegion,
  CompanyProfile, FounderProfile, BrainEntry,
} from '../types';
import { scanCompanies, scanInvestors } from '../services/radarService';
import {
  Globe2, Building2, UserCircle2, Brain, Telescope,
  Copy, Check, AlertCircle, Loader2, Plus, ExternalLink,
  Zap, MapPin, TrendingUp, DollarSign, Users, Search,
  ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';

// ─── Region config ────────────────────────────────────────────────────────────

type RegionSelectOption = RadarRegion | 'ALL';

const REGION_META: Record<RegionSelectOption, { label: string; flag: string }> = {
  ALL: { label: 'All Regions', flag: '🌍' },
  NL:  { label: 'Netherlands',  flag: '🇳🇱' },
  IE:  { label: 'Ireland',       flag: '🇮🇪' },
  FR:  { label: 'France',        flag: '🇫🇷' },
  DE:  { label: 'Germany',       flag: '🇩🇪' },
  US:  { label: 'United States', flag: '🇺🇸' },
  BR:  { label: 'Brazil',        flag: '🇧🇷' },
  OTHER: { label: 'Other',       flag: '🌐' },
};

const INVESTOR_TYPE_LABELS: Record<string, string> = {
  'angel':         'Angel',
  'family-office': 'Family Office',
  'operator':      'Operator',
  'exit-founder':  'Exit Founder',
  'hnwi':          'HNWI',
  'unknown':       'Investor',
};

const INVESTOR_TYPE_COLORS: Record<string, string> = {
  'angel':         'text-[#60a5fa] bg-[#1e3a5f]',
  'family-office': 'text-[#a78bfa] bg-[#2e1b5e]',
  'operator':      'text-[#34d399] bg-[#0d3526]',
  'exit-founder':  'text-[#fbbf24] bg-[#3d2e00]',
  'hnwi':          'text-[#f87171] bg-[#3d1515]',
  'unknown':       'text-[#888] bg-[#1a1a1a]',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface RadarViewProps {
  radarCompanies: RadarCompany[];
  radarInvestors: RadarInvestor[];
  onUpdateCompanies: (companies: RadarCompany[]) => void;
  onUpdateInvestors: (investors: RadarInvestor[]) => void;
  companyProfiles: CompanyProfile[];
  founders: FounderProfile[];
  onAddCompanyProfile: (profile: CompanyProfile) => void;
  onAddFounderProfile: (profile: FounderProfile) => void;
  onAddCategory: (partial: { name: string; industry?: string; notes?: string }) => void;
  onAddBrainEntry: (entry: BrainEntry) => void;
  onNavigateToCompanies: () => void;
  onNavigateToFounders: () => void;
  brainEntries: BrainEntry[];
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors bg-[#1a1a1a] hover:bg-[#242424] border border-[#252525] text-[#666] hover:text-[#aaa]"
      title={text}
    >
      {copied ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Company card ─────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  onAddToCompanyIntel,
  onAddFounder,
  onAddToCategory,
  onPushToBrain,
}: {
  company: RadarCompany;
  onAddToCompanyIntel: () => void;
  onAddFounder: () => void;
  onAddToCategory: () => void;
  onPushToBrain: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const flag = REGION_META[company.region]?.flag ?? '🌐';

  const alreadyInCompanyIntel = !!company.linkedCompanyId;
  const alreadyAsFounder = !!company.linkedFounderId;
  const alreadyInBrain = !!company.linkedBrainEntryId;
  const alreadyInCategories = !!company.linkedCategoryId;

  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{flag}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[#f0f0f0] font-semibold text-sm leading-tight">{company.companyName}</h3>
                {company.websiteUrl && (
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#444] hover:text-[#e65200] transition-colors"
                    title="Open website"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#161616] border border-[#252525] text-[#888] font-medium">
                  {company.industry}
                </span>
                <span className="text-[10px] text-[#555] flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" /> {company.country}
                </span>
                {company.estimatedRevenue && (
                  <span className="text-[10px] text-[#4ade80] flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5" /> {company.estimatedRevenue}
                  </span>
                )}
                {company.employeeCount && (
                  <span className="text-[10px] text-[#555] flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" /> {company.employeeCount}
                  </span>
                )}
                {company.fundingStatus && company.fundingStatus !== 'Unknown' && (
                  <span className="text-[10px] text-[#888] px-1.5 py-0.5 rounded bg-[#141414] border border-[#1e1e1e]">
                    {company.fundingStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[#333] hover:text-[#666] transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-[#777] text-xs mt-2.5 leading-relaxed">{company.description}</p>

        {/* Growth signals — always show first 2 */}
        {company.growthSignals.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333]">Growth Signals</p>
            {company.growthSignals.slice(0, expanded ? undefined : 2).map((sig, i) => (
              <div key={i} className="flex items-start gap-2">
                <Zap className="w-2.5 h-2.5 text-[#e65200] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#666] leading-relaxed">{sig}</p>
              </div>
            ))}
            {!expanded && company.growthSignals.length > 2 && (
              <button onClick={() => setExpanded(true)} className="text-[10px] text-[#444] hover:text-[#666] transition-colors">
                +{company.growthSignals.length - 2} more signals...
              </button>
            )}
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t border-[#141414] pt-3">
            {company.whyNotFamous && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">Why Not Famous Yet</p>
                <p className="text-[11px] text-[#555] leading-relaxed">{company.whyNotFamous}</p>
              </div>
            )}
            {company.founderName && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">Founder</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-[#888]">{company.founderName}</span>
                  {company.founderLinkedinSearch && (
                    <CopyButton text={company.founderLinkedinSearch} label="Copy LinkedIn Search" />
                  )}
                </div>
              </div>
            )}
            {company.sources.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">Sources</p>
                <div className="flex flex-wrap gap-1">
                  {company.sources.slice(0, 5).map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-[#444] hover:text-[#e65200] transition-colors underline underline-offset-2 truncate max-w-[200px]"
                    >
                      {src.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        <CopyButton text={company.linkedinSearchQuery} label="LinkedIn Search" />
        <button
          onClick={onAddToCompanyIntel}
          disabled={alreadyInCompanyIntel}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
            alreadyInCompanyIntel
              ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
              : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
          )}
        >
          <Building2 className="w-3 h-3" />
          {alreadyInCompanyIntel ? 'In Company Intel ✓' : '+ Company Intel'}
        </button>
        {company.founderName && (
          <button
            onClick={onAddFounder}
            disabled={alreadyAsFounder}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
              alreadyAsFounder
                ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
                : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
            )}
          >
            <UserCircle2 className="w-3 h-3" />
            {alreadyAsFounder ? 'Founder Added ✓' : `+ Founder: ${company.founderName.split(' ')[0]}`}
          </button>
        )}
        <button
          onClick={onAddToCategory}
          disabled={alreadyInCategories}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
            alreadyInCategories
              ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
              : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
          )}
        >
          <Plus className="w-3 h-3" />
          {alreadyInCategories ? 'In Categories ✓' : '+ Category'}
        </button>
        <button
          onClick={onPushToBrain}
          disabled={alreadyInBrain}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
            alreadyInBrain
              ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
              : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
          )}
        >
          <Brain className="w-3 h-3" />
          {alreadyInBrain ? 'In Brain ✓' : '→ Brain'}
        </button>
      </div>
    </div>
  );
}

// ─── Investor card ────────────────────────────────────────────────────────────

function InvestorCard({
  investor,
  onAddFounder,
  onPushToBrain,
}: {
  investor: RadarInvestor;
  onAddFounder: () => void;
  onPushToBrain: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const flag = REGION_META[investor.region]?.flag ?? '🌐';
  const typeLabel = INVESTOR_TYPE_LABELS[investor.investorType] ?? 'Investor';
  const typeColor = INVESTOR_TYPE_COLORS[investor.investorType] ?? INVESTOR_TYPE_COLORS['unknown'];
  const alreadyAsFounder = !!investor.linkedFounderId;
  const alreadyInBrain = !!investor.linkedBrainEntryId;

  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{flag}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[#f0f0f0] font-semibold text-sm">{investor.fullName}</h3>
                {investor.linkedinUrl && (
                  <a
                    href={investor.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#444] hover:text-[#0a66c2] transition-colors"
                    title="Open LinkedIn"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", typeColor)}>
                  {typeLabel}
                </span>
                <span className="text-[10px] text-[#555] flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" /> {investor.country}
                </span>
                {investor.estimatedCapacity && (
                  <span className="text-[10px] text-[#fbbf24] flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" /> {investor.estimatedCapacity}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[#333] hover:text-[#666] transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Investment focus */}
        {investor.investmentFocus && (
          <p className="text-[11px] text-[#555] mt-2 leading-relaxed">
            <span className="text-[#444]">Focus: </span>{investor.investmentFocus}
          </p>
        )}

        {/* Background summary */}
        <p className="text-[#777] text-xs mt-2 leading-relaxed">{investor.background}</p>

        {/* Evidence of capital */}
        <div className="mt-3 flex items-start gap-2">
          <Zap className="w-2.5 h-2.5 text-[#fbbf24] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#666] leading-relaxed">{investor.evidenceOfCapital}</p>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t border-[#141414] pt-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">Why Not On Investor Lists</p>
              <p className="text-[11px] text-[#555] leading-relaxed">{investor.whyHidden}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">How to Approach</p>
              <p className="text-[11px] text-[#555] leading-relaxed">{investor.connectionApproach}</p>
            </div>
            {investor.sources.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#333] mb-1">Sources</p>
                <div className="flex flex-wrap gap-1">
                  {investor.sources.slice(0, 5).map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-[#444] hover:text-[#e65200] transition-colors underline underline-offset-2 truncate max-w-[200px]"
                    >
                      {src.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        <CopyButton text={investor.linkedinSearchQuery} label="Copy LinkedIn Search" />
        <button
          onClick={onAddFounder}
          disabled={alreadyAsFounder}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
            alreadyAsFounder
              ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
              : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
          )}
        >
          <UserCircle2 className="w-3 h-3" />
          {alreadyAsFounder ? 'In Founders ✓' : '+ Founder Profile'}
        </button>
        <button
          onClick={onPushToBrain}
          disabled={alreadyInBrain}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
            alreadyInBrain
              ? "text-[#4ade80] border-[#1a3a1a] bg-[#0a1f0a] cursor-default"
              : "text-[#aaa] border-[#252525] bg-[#141414] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#333]"
          )}
        >
          <Brain className="w-3 h-3" />
          {alreadyInBrain ? 'In Brain ✓' : '→ Brain'}
        </button>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function RadarView({
  radarCompanies,
  radarInvestors,
  onUpdateCompanies,
  onUpdateInvestors,
  companyProfiles,
  founders,
  onAddCompanyProfile,
  onAddFounderProfile,
  onAddCategory,
  onAddBrainEntry,
  onNavigateToCompanies,
  onNavigateToFounders,
  brainEntries,
}: RadarViewProps) {
  const [tab, setTab] = useState<'companies' | 'investors'>('companies');
  const [selectedRegions, setSelectedRegions] = useState<Set<RegionSelectOption>>(new Set(['ALL']));
  const [isScanning, setIsScanning] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const ALL_REGIONS: RadarRegion[] = ['NL', 'IE', 'FR', 'DE', 'US', 'BR'];

  const getActiveRegions = (): RadarRegion[] => {
    if (selectedRegions.has('ALL')) return ALL_REGIONS;
    return ALL_REGIONS.filter(r => selectedRegions.has(r));
  };

  const toggleRegion = (r: RegionSelectOption) => {
    setSelectedRegions(prev => {
      const next = new Set(prev);
      if (r === 'ALL') {
        return new Set<RegionSelectOption>(['ALL']);
      }
      next.delete('ALL');
      if (next.has(r)) {
        next.delete(r);
        if (next.size === 0) next.add('ALL');
      } else {
        next.add(r);
        if (next.size === ALL_REGIONS.length) return new Set<RegionSelectOption>(['ALL']);
      }
      return next;
    });
  };

  const addLog = (msg: string) => {
    setScanLog(prev => [...prev, msg]);
    setTimeout(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const handleScan = async () => {
    if (isScanning) return;
    const regions = getActiveRegions();
    if (regions.length === 0) return;

    setIsScanning(true);
    setScanLog([]);
    setScanError(null);

    try {
      if (tab === 'companies') {
        const found = await scanCompanies(regions, addLog, brainEntries);
        onUpdateCompanies([...found, ...radarCompanies]);
      } else {
        const found = await scanInvestors(regions, addLog, brainEntries);
        onUpdateInvestors([...found, ...radarInvestors]);
      }
    } catch (e: any) {
      setScanError(e?.message || 'Scan failed. Try again.');
    } finally {
      setIsScanning(false);
    }
  };

  // ── Company action handlers ──────────────────────────────────────────────────

  const handleAddCompanyToIntel = (company: RadarCompany) => {
    const existing = companyProfiles.find(p => p.name.toLowerCase() === company.companyName.toLowerCase());
    if (existing) {
      onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedCompanyId: existing.id } : c));
      onNavigateToCompanies();
      return;
    }
    const now = new Date().toISOString();
    const newProfile: CompanyProfile = {
      id: crypto.randomUUID(),
      name: company.companyName,
      url: company.websiteUrl,
      industry: company.industry,
      description: `${company.description}\n\nFound via Intel Radar scan (${company.scannedAt.slice(0, 10)}).`,
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    onAddCompanyProfile(newProfile);
    onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedCompanyId: newProfile.id } : c));
    onNavigateToCompanies();
  };

  const handleAddCompanyFounder = (company: RadarCompany) => {
    if (!company.founderName) return;
    const existing = founders.find(f => f.name.toLowerCase() === company.founderName!.toLowerCase());
    if (existing) {
      onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedFounderId: existing.id } : c));
      onNavigateToFounders();
      return;
    }
    const now = new Date().toISOString();
    const newFounder: FounderProfile = {
      id: crypto.randomUUID(),
      name: company.founderName,
      currentCompany: company.companyName,
      notes: [
        `Discovered via Intel Radar — ${company.country}, ${company.industry}`,
        company.founderLinkedinSearch ? `LinkedIn search: ${company.founderLinkedinSearch}` : '',
        `Company: ${company.companyName}${company.websiteUrl ? ` (${company.websiteUrl})` : ''}`,
        company.estimatedRevenue ? `Revenue signal: ${company.estimatedRevenue}` : '',
        '',
        'Growth signals:',
        ...company.growthSignals.map(s => `  • ${s}`),
      ].filter(l => l !== null && l !== undefined).join('\n').trim(),
      keyInsights: company.growthSignals.slice(0, 3),
      pastCompanies: [],
      createdAt: now,
      updatedAt: now,
    };
    onAddFounderProfile(newFounder);
    onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedFounderId: newFounder.id } : c));
    onNavigateToFounders();
  };

  const handleAddCompanyToCategory = (company: RadarCompany) => {
    onAddCategory({
      name: company.companyName,
      industry: company.industry,
      notes: `Found via Intel Radar.\n\n${company.description}\n\nGrowth signals:\n${company.growthSignals.join('\n')}`,
    });
    onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedCategoryId: 'pending' } : c));
  };

  const handlePushCompanyToBrain = (company: RadarCompany) => {
    const now = new Date().toISOString();
    const entry: BrainEntry = {
      id: crypto.randomUUID(),
      type: 'brand',
      title: `Radar: ${company.companyName}`,
      content: [
        company.description,
        '',
        `**Country:** ${company.country} | **Industry:** ${company.industry}`,
        company.estimatedRevenue ? `**Revenue signal:** ${company.estimatedRevenue}` : '',
        company.employeeCount ? `**Team:** ${company.employeeCount}` : '',
        '',
        '**Growth signals:**',
        ...company.growthSignals.map(s => `- ${s}`),
        '',
        company.whyNotFamous ? `**Why under the radar:** ${company.whyNotFamous}` : '',
      ].filter(l => l !== null && l !== undefined).join('\n').trim(),
      source: `Intel Radar — ${company.scannedAt.slice(0, 10)}`,
      implication: `Watch ${company.companyName}: ${company.description.slice(0, 120)}`,
      tags: [company.country, company.industry, 'radar', 'company-watch'],
      priority: 'reference',
      confidence: 'strong',
      createdAt: now,
      updatedAt: now,
    };
    onAddBrainEntry(entry);
    onUpdateCompanies(radarCompanies.map(c => c.id === company.id ? { ...c, linkedBrainEntryId: entry.id } : c));
  };

  // ── Investor action handlers ─────────────────────────────────────────────────

  const handleAddInvestorAsFounder = (investor: RadarInvestor) => {
    const existing = founders.find(f => f.name.toLowerCase() === investor.fullName.toLowerCase());
    if (existing) {
      onUpdateInvestors(radarInvestors.map(i => i.id === investor.id ? { ...i, linkedFounderId: existing.id } : i));
      onNavigateToFounders();
      return;
    }
    const now = new Date().toISOString();
    const typeLabel = INVESTOR_TYPE_LABELS[investor.investorType] ?? 'Investor';
    const newFounder: FounderProfile = {
      id: crypto.randomUUID(),
      name: investor.fullName,
      linkedinUrl: investor.linkedinUrl,
      currentRole: typeLabel,
      notes: [
        `[HIDDEN INVESTOR] Discovered via Intel Radar`,
        `Country: ${investor.country} | Type: ${typeLabel}`,
        '',
        `**Background:** ${investor.background}`,
        '',
        `**Evidence of Capital:** ${investor.evidenceOfCapital}`,
        investor.estimatedCapacity ? `**Estimated deal size:** ${investor.estimatedCapacity}` : '',
        '',
        `**Investment focus:** ${investor.investmentFocus}`,
        '',
        `**Why hidden:** ${investor.whyHidden}`,
        '',
        `**How to approach:** ${investor.connectionApproach}`,
        '',
        `**LinkedIn search:** ${investor.linkedinSearchQuery}`,
      ].filter(l => l !== null && l !== undefined).join('\n').trim(),
      keyInsights: [
        investor.evidenceOfCapital,
        investor.connectionApproach,
      ].filter(Boolean),
      pastCompanies: [],
      createdAt: now,
      updatedAt: now,
    };
    onAddFounderProfile(newFounder);
    onUpdateInvestors(radarInvestors.map(i => i.id === investor.id ? { ...i, linkedFounderId: newFounder.id } : i));
    onNavigateToFounders();
  };

  const handlePushInvestorToBrain = (investor: RadarInvestor) => {
    const now = new Date().toISOString();
    const typeLabel = INVESTOR_TYPE_LABELS[investor.investorType] ?? 'Investor';
    const entry: BrainEntry = {
      id: crypto.randomUUID(),
      type: 'founder',
      title: `Hidden Investor: ${investor.fullName}`,
      content: [
        `**Type:** ${typeLabel} | **Country:** ${investor.country}`,
        '',
        investor.background,
        '',
        `**Evidence of capital:** ${investor.evidenceOfCapital}`,
        investor.estimatedCapacity ? `**Estimated deal size:** ${investor.estimatedCapacity}` : '',
        `**Investment focus:** ${investor.investmentFocus}`,
        '',
        `**Why hidden:** ${investor.whyHidden}`,
        '',
        `**How to approach:** ${investor.connectionApproach}`,
        '',
        `**LinkedIn search (paste in Google):** \`${investor.linkedinSearchQuery}\``,
      ].filter(l => l !== null && l !== undefined).join('\n').trim(),
      source: `Intel Radar — ${investor.scannedAt.slice(0, 10)}`,
      implication: `Potential hidden investor: ${investor.fullName} (${investor.country}). ${investor.evidenceOfCapital.slice(0, 100)}`,
      tags: [investor.country, typeLabel.toLowerCase(), 'investor', 'radar', 'hidden-capital'],
      priority: 'reference',
      confidence: 'strong',
      createdAt: now,
      updatedAt: now,
    };
    onAddBrainEntry(entry);
    onUpdateInvestors(radarInvestors.map(i => i.id === investor.id ? { ...i, linkedBrainEntryId: entry.id } : i));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const activeRegions = getActiveRegions();
  const displayedItems = tab === 'companies' ? radarCompanies : radarInvestors;
  const lastScan = displayedItems.length > 0
    ? (tab === 'companies' ? radarCompanies[0]?.scannedAt : radarInvestors[0]?.scannedAt)
    : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Telescope className="w-5 h-5 text-[#e65200]" />
            <h2 className="text-lg font-bold text-[#f0f0f0]">Intel Radar</h2>
          </div>
          <p className="text-[#555] text-sm leading-relaxed max-w-xl">
            Surfaces scaling companies before mainstream press finds them, and hidden investors who write checks quietly — no VC lists, no Forbes coverage.
          </p>
        </div>
        {lastScan && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-[#333] uppercase tracking-wider">Last scan</p>
            <p className="text-[11px] text-[#444] font-mono">{lastScan.slice(0, 10)}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0e0e0e] rounded-lg p-1 border border-[#1a1a1a] w-fit">
        <button
          onClick={() => setTab('companies')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            tab === 'companies'
              ? "bg-[#161616] text-[#f0f0f0] shadow-sm"
              : "text-[#444] hover:text-[#888]"
          )}
        >
          <Globe2 className="w-3.5 h-3.5" />
          Companies to Watch
          {radarCompanies.length > 0 && (
            <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded", tab === 'companies' ? "bg-[#e65200]/15 text-[#e65200]" : "bg-[#161616] text-[#333]")}>
              {radarCompanies.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('investors')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            tab === 'investors'
              ? "bg-[#161616] text-[#f0f0f0] shadow-sm"
              : "text-[#444] hover:text-[#888]"
          )}
        >
          <Users className="w-3.5 h-3.5" />
          Hidden Investors
          {radarInvestors.length > 0 && (
            <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded", tab === 'investors' ? "bg-[#e65200]/15 text-[#e65200]" : "bg-[#161616] text-[#333]")}>
              {radarInvestors.length}
            </span>
          )}
        </button>
      </div>

      {/* Region selector + scan button */}
      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl p-4 space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#333] mb-2.5">Target Regions</p>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'NL', 'IE', 'FR', 'DE', 'US', 'BR'] as RegionSelectOption[]).map(r => {
              const meta = REGION_META[r];
              const active = selectedRegions.has(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleRegion(r)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    active
                      ? "border-[#e65200]/40 bg-[#e65200]/08 text-[#f0f0f0]"
                      : "border-[#1e1e1e] bg-[#141414] text-[#444] hover:text-[#888] hover:border-[#2a2a2a]"
                  )}
                >
                  <span>{meta.flag}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] text-[#444]">
            {selectedRegions.has('ALL')
              ? `Scanning all ${ALL_REGIONS.length} regions`
              : `Scanning ${activeRegions.length} region${activeRegions.length !== 1 ? 's' : ''}: ${activeRegions.join(', ')}`
            }
          </div>
          <button
            onClick={handleScan}
            disabled={isScanning || activeRegions.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              isScanning
                ? "bg-[#1a1a1a] text-[#555] border border-[#252525] cursor-not-allowed"
                : "border border-[#e65200]/30 text-[#f0f0f0] hover:border-[#e65200]/60"
            )}
            style={!isScanning ? { background: 'linear-gradient(135deg,#e65200 0%,#cc4900 100%)', boxShadow: '0 2px 12px rgba(230,82,0,0.3)' } : {}}
          >
            {isScanning
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
              : <><Search className="w-4 h-4" /> Scan Now</>
            }
          </button>
        </div>
      </div>

      {/* Scan log */}
      {(isScanning || scanLog.length > 0) && (
        <div className="bg-[#080808] border border-[#1a1a1a] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#141414] flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#333]">Scan Log</p>
            {!isScanning && (
              <button onClick={() => setScanLog([])} className="text-[10px] text-[#333] hover:text-[#666] transition-colors">
                Clear
              </button>
            )}
          </div>
          <div
            ref={logRef}
            className="p-4 font-mono text-[11px] text-[#555] space-y-1 max-h-40 overflow-y-auto"
          >
            {scanLog.map((line, i) => (
              <p key={i} className={i === scanLog.length - 1 && isScanning ? "text-[#888]" : ""}>{`> ${line}`}</p>
            ))}
            {isScanning && <p className="text-[#e65200] animate-pulse">{'> Thinking...'}</p>}
          </div>
        </div>
      )}

      {/* Error */}
      {scanError && (
        <div className="flex items-start gap-3 p-4 bg-[#f87171]/05 border border-[#f87171]/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
          <div>
            <p className="text-[#f87171] text-sm font-medium">Scan failed</p>
            <p className="text-[#888] text-xs mt-1">{scanError}</p>
          </div>
          <button onClick={() => setScanError(null)} className="ml-auto text-[#444] hover:text-[#888]">×</button>
        </div>
      )}

      {/* Empty state */}
      {!isScanning && displayedItems.length === 0 && scanLog.length === 0 && (
        <div className="text-center py-16 border border-[#141414] rounded-xl border-dashed">
          {tab === 'companies' ? (
            <>
              <Globe2 className="w-10 h-10 text-[#1e1e1e] mx-auto mb-4" />
              <p className="text-[#444] font-medium">No companies scanned yet</p>
              <p className="text-[#2a2a2a] text-sm mt-1 max-w-sm mx-auto">
                Select your target regions and hit "Scan Now" to find scaling companies before they hit mainstream press.
              </p>
            </>
          ) : (
            <>
              <Users className="w-10 h-10 text-[#1e1e1e] mx-auto mb-4" />
              <p className="text-[#444] font-medium">No investors scanned yet</p>
              <p className="text-[#2a2a2a] text-sm mt-1 max-w-sm mx-auto">
                Select regions and run a scan to find quiet capital — angels, family offices, and exit founders who invest without press coverage.
              </p>
            </>
          )}
        </div>
      )}

      {/* Results header */}
      {displayedItems.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[#f0f0f0] font-semibold text-sm">
              {tab === 'companies'
                ? `${radarCompanies.length} Company${radarCompanies.length !== 1 ? 'ies' : ''} Found`
                : `${radarInvestors.length} Investor${radarInvestors.length !== 1 ? 's' : ''} Found`
              }
            </p>
          </div>
          <button
            onClick={() => {
              if (tab === 'companies') {
                if (window.confirm('Clear all company radar results? This cannot be undone.')) {
                  onUpdateCompanies([]);
                }
              } else {
                if (window.confirm('Clear all investor radar results? This cannot be undone.')) {
                  onUpdateInvestors([]);
                }
              }
            }}
            className="text-[11px] text-[#2a2a2a] hover:text-[#555] transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Results grid */}
      {tab === 'companies' && radarCompanies.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {radarCompanies.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              onAddToCompanyIntel={() => handleAddCompanyToIntel(company)}
              onAddFounder={() => handleAddCompanyFounder(company)}
              onAddToCategory={() => handleAddCompanyToCategory(company)}
              onPushToBrain={() => handlePushCompanyToBrain(company)}
            />
          ))}
        </div>
      )}

      {tab === 'investors' && radarInvestors.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {radarInvestors.map(investor => (
            <InvestorCard
              key={investor.id}
              investor={investor}
              onAddFounder={() => handleAddInvestorAsFounder(investor)}
              onPushToBrain={() => handlePushInvestorToBrain(investor)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
