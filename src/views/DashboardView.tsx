import { useState, useEffect, useRef, useCallback } from 'react';
import { Category, Weights } from '../types';
import { calculateDecisionScore, calculateLtvCac } from '../utils';
import { Trophy, TrendingUp, Users, Zap, Radar, AlertCircle, CheckCircle2, Loader2, FileText, RefreshCw, Copy } from 'lucide-react';
import { ScoreRing } from '../components/ScoreRing';
import { scanMarketSignals, SIGNAL_TYPE_LABELS, type MarketSignal, type SignalUrgency } from '../services/signalService';
import { generateInvestmentMemo } from '../services/memoService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
}

/** Smoothly count up from 0 to target over ~700ms */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const startVal = 0;
    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(startVal + (target - startVal) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    startRef.current = null;
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

export function DashboardView({ categories, weights, maxClv }: Props) {
  const activeCategories = categories.filter(c => c.status !== 'Killed');
  
  const totalCategories = categories.length;
  const avgClv = activeCategories.length > 0
    ? activeCategories.reduce((sum, c) => sum + c.estimatedCLV, 0) / activeCategories.length
    : 0;

  const categoriesWithScores = categories.map(c => ({
    ...c,
    score: calculateDecisionScore(c, weights, maxClv),
    ltvCac: calculateLtvCac(c.estimatedCLV, c.estimatedCAC)
  }));

  const bestScore = Math.max(0, ...categoriesWithScores.map(c => c.score));
  const bestLtvCac = Math.max(0, ...categoriesWithScores.filter(c => c.estimatedCAC > 0).map(c => c.ltvCac));

  const winner = categoriesWithScores.find(c => c.status === 'Winner');

  const [showAllTopList, setShowAllTopList] = useState(false);
  const topListAll = categoriesWithScores
    .filter(c => c.status !== 'Killed')
    .sort((a, b) => b.score - a.score);
  const topList = showAllTopList ? topListAll : topListAll.slice(0, 6);

  const shortlisted = categoriesWithScores.filter(c => c.status === 'Shortlisted').length;
  const researched  = categoriesWithScores.filter(c => !!c.agentResults?.unitEconomics).length;

  // Animated KPI values
  const animTotal     = useCountUp(totalCategories);
  const animAvgClv    = useCountUp(Math.round(avgClv));
  const animBestScore = useCountUp(bestScore, 900);
  const animLtvCac    = useCountUp(bestLtvCac, 900);

  // ── Market Signals ────────────────────────────────────────
  const [signals, setSignals] = useState<MarketSignal[]>(() => {
    try { return JSON.parse(localStorage.getItem('flashface_market_signals') || '[]'); } catch { return []; }
  });
  const [signalStatus, setSignalStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalMsg, setSignalMsg] = useState<string>('');

  const handleScanSignals = useCallback(async () => {
    if (signalStatus === 'scanning') return;
    setSignalStatus('scanning');
    setSignalError(null);
    const topNames = topListAll.slice(0, 5).map(c => c.name);
    try {
      const found = await scanMarketSignals(topNames, setSignalMsg);
      setSignals(found);
      localStorage.setItem('flashface_market_signals', JSON.stringify(found));
      setSignalStatus('done');
    } catch (e: any) {
      setSignalError(e.message || 'Signal scan failed');
      setSignalStatus('error');
    }
  }, [signalStatus, topListAll]);

  // ── Investment Memo ───────────────────────────────────────
  const [memoStatus, setMemoStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [memo, setMemo] = useState<string>('');
  const [memoCopied, setMemoCopied] = useState(false);
  const [showMemo, setShowMemo] = useState(false);

  const handleGenerateMemo = useCallback(async () => {
    if (memoStatus === 'generating') return;
    setMemoStatus('generating');
    try {
      const text = await generateInvestmentMemo(categories, weights, maxClv);
      setMemo(text);
      setMemoStatus('done');
      setShowMemo(true);
    } catch (e: any) {
      setMemoStatus('error');
    }
  }, [memoStatus, categories, weights, maxClv]);

  const handleCopyMemo = () => {
    navigator.clipboard.writeText(memo);
    setMemoCopied(true);
    setTimeout(() => setMemoCopied(false), 2000);
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── KPI Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl overflow-hidden border border-[#181818] divide-x divide-[#181818]" style={{background:'#0c0c0c'}}>
        <KpiCell
          icon={<Users className="w-3.5 h-3.5" />}
          label="Analyzed"
          value={Math.round(animTotal).toString()}
          sub={`${shortlisted} shortlisted · ${researched} researched`}
          delay={0}
        />
        <KpiCell
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Avg CLV"
          value={`€${Math.round(animAvgClv)}`}
          mono
          sub="estimated lifetime value"
          delay={60}
        />
        <KpiCell
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Top Score"
          value={animBestScore.toFixed(1)}
          mono
          highlight
          sub="algorithmic decision score"
          delay={120}
        />
        <KpiCell
          icon={<Trophy className="w-3.5 h-3.5" />}
          label="Max LTV:CAC"
          value={`${animLtvCac.toFixed(1)}x`}
          mono
          highlight
          sub="lifetime value leverage"
          delay={180}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── Winner Card ──────────────────────────────────── */}
        <div className="lg:col-span-2">
          <SectionHeader label="Current Winner" />
          {winner ? (
            <div
              className="rounded-xl p-5 relative overflow-hidden border border-[#4ade80]/12 card-hover"
              style={{
                background: 'linear-gradient(145deg, #0c0c0c 0%, #0e130e 100%)',
                boxShadow: '0 0 40px rgba(74,222,128,0.05), inset 0 0 0 1px rgba(74,222,128,0.08)'
              }}
            >
              {/* Background score watermark */}
              <div className="absolute -right-2 -bottom-3 font-mono font-black select-none pointer-events-none"
                style={{fontSize: 90, color: 'rgba(74,222,128,0.04)', letterSpacing: '-0.06em', lineHeight:1}}>
                {winner.score.toFixed(0)}
              </div>

              {/* Top row: name + ring */}
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-[#4ade80]/60 bg-[#4ade80]/08 px-2 py-0.5 rounded-full border border-[#4ade80]/15">
                      Winner
                    </span>
                    {winner.industry && (
                      <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-[#2a2a2a] border border-[#1e1e1e] px-2 py-0.5 rounded-full">
                        {winner.industry}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-[#efefef] leading-snug mb-0.5 line-clamp-2">{winner.name}</h2>
                  <p className="text-xs text-[#444] line-clamp-1">{winner.targetAudience}</p>
                </div>
                <ScoreRing score={winner.score} size={60} stroke={4} label="score" />
              </div>

              {/* Metrics */}
              <div className="relative z-10 mt-4 grid grid-cols-2 gap-3">
                <MetricTile
                  label="LTV:CAC"
                  value={`${winner.ltvCac}x`}
                  color="#4ade80"
                  highlight
                />
                <MetricTile
                  label="CLV"
                  value={`€${winner.estimatedCLV.toLocaleString()}`}
                  color="#efefef"
                />
                <MetricTile
                  label="Acquisition"
                  value={winner.acquisitionDifficulty}
                  color={winner.acquisitionDifficulty === 'Easy' ? '#4ade80' : winner.acquisitionDifficulty === 'Hard' ? '#f87171' : '#facc15'}
                />
                <MetricTile
                  label="Monthly Churn"
                  value={`${winner.monthlyChurnPercent}%`}
                  color={winner.monthlyChurnPercent < 5 ? '#4ade80' : winner.monthlyChurnPercent > 10 ? '#f87171' : '#facc15'}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#181818] bg-[#0c0c0c] flex flex-col items-center justify-center py-14 text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#141414] flex items-center justify-center mb-2">
                <Trophy className="w-5 h-5 text-[#282828]" />
              </div>
              <p className="text-[#3a3a3a] text-sm font-medium">No winner designated</p>
              <p className="text-[#282828] text-xs">Mark the best category as Winner in the edit view</p>
            </div>
          )}
        </div>

        {/* ── Ranked Leaderboard ───────────────────────────── */}
        <div className="lg:col-span-3">
          <SectionHeader label="Ranked Categories" />
          <div className="rounded-xl overflow-hidden border border-[#181818]" style={{background:'#0c0c0c'}}>
            <div className="divide-y divide-[#141414]">
              {topList.map((cat, i) => {
                const barW = bestScore > 0 ? (cat.score / bestScore) * 100 : 0;
                const scoreCol = cat.score >= 72 ? '#4ade80' : cat.score >= 50 ? '#facc15' : '#f87171';
                const statusColors: Record<string, string> = {
                  Winner: '#4ade80', Shortlisted: '#60a5fa', Researching: '#555', Killed: '#333'
                };
                return (
                  <div key={cat.id} className="px-4 py-3 hover:bg-[#0f0f0f] transition-colors group" style={{animation: `slideUp 0.28s cubic-bezier(0.16,1,0.3,1) ${i * 40}ms both`}}>
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <span className="text-[11px] font-mono text-[#282828] w-5 shrink-0 text-right">{i + 1}</span>

                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-medium text-[#ccc] text-[13px] truncate">{cat.name}</span>
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded"
                            style={{color: statusColors[cat.status], background: `${statusColors[cat.status]}15`, border: `1px solid ${statusColors[cat.status]}25`}}>
                            {cat.status}
                          </span>
                        </div>
                        {/* Score bar */}
                        <div className="h-[3px] w-full bg-[#141414] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${barW}%`,
                              background: `linear-gradient(90deg, ${scoreCol}99, ${scoreCol})`,
                              boxShadow: `0 0 6px ${scoreCol}55`,
                              animation: `score-bar-grow 0.7s cubic-bezier(0.4,0,0.2,1) ${i * 40 + 100}ms both`
                            }}
                          />
                        </div>
                      </div>

                      {/* LTV:CAC */}
                      <span className="text-[12px] font-mono text-[#444] w-12 text-right shrink-0"
                        title={cat.ltvCac === 0 ? 'Run deep research to populate' : undefined}>
                        {cat.ltvCac > 0 ? `${cat.ltvCac}x` : '—'}
                      </span>

                      {/* Score */}
                      <span className="text-[13px] font-mono font-bold w-10 text-right shrink-0" style={{color: scoreCol}}>
                        {cat.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {topListAll.length > 6 && (
              <button
                onClick={() => setShowAllTopList(v => !v)}
                className="w-full py-2.5 text-[11px] text-[#333] hover:text-[#e65200] border-t border-[#141414] transition-colors font-mono"
              >
                {showAllTopList ? `↑ Show top 6` : `↓ Show all ${topListAll.length} categories`}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── Market Signals + Investment Memo row ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Market Pulse */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <SectionHeader label="Market Pulse" />
              <span className="text-[9px] uppercase tracking-[0.16em] font-bold px-1.5 py-0.5 rounded border"
                style={{color:'#60a5fa', background:'rgba(96,165,250,0.08)', borderColor:'rgba(96,165,250,0.2)'}}>
                AI Live
              </span>
            </div>
            <button
              onClick={handleScanSignals}
              disabled={signalStatus === 'scanning'}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all"
              style={{
                background: signalStatus === 'scanning' ? 'rgba(96,165,250,0.05)' : 'rgba(96,165,250,0.08)',
                borderColor: 'rgba(96,165,250,0.2)',
                color: '#60a5fa',
                opacity: signalStatus === 'scanning' ? 0.6 : 1,
              }}
            >
              {signalStatus === 'scanning'
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning…</>
                : <><RefreshCw className="w-3 h-3" /> {signals.length > 0 ? 'Refresh' : 'Scan Now'}</>
              }
            </button>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{borderColor:'#181818', background:'#0c0c0c'}}>
            {signalStatus === 'scanning' && (
              <div className="px-4 py-3 border-b border-[#161616]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] animate-pulse shrink-0" />
                  <p className="text-[11px] text-[#444] font-mono">{signalMsg || 'Initializing search agents…'}</p>
                </div>
              </div>
            )}
            {signalError && (
              <div className="px-4 py-3 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#f87171] shrink-0" />
                <p className="text-xs text-[#f87171]">{signalError}</p>
              </div>
            )}
            {signals.length === 0 && signalStatus !== 'scanning' && !signalError && (
              <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
                <Radar className="w-6 h-6 text-[#222]" />
                <p className="text-[#333] text-sm font-medium">No signals scanned yet</p>
                <p className="text-[#242424] text-xs max-w-[220px]">Click "Scan Now" to run a live AI-powered market pulse across your top 5 categories</p>
              </div>
            )}
            {signals.length > 0 && (
              <div className="divide-y divide-[#141414]">
                {signals.slice(0, 5).map(sig => (
                  <SignalCard key={sig.id} signal={sig} />
                ))}
                {signals.length > 0 && (
                  <div className="px-4 py-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-[#282828]" />
                    <span className="text-[10px] text-[#282828] font-mono">
                      Scanned {new Date(signals[0]?.detectedAt).toLocaleTimeString('en-NL', {hour:'2-digit',minute:'2-digit'})} · {signals.length} signals
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Investment Memo */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <SectionHeader label="Investment Memo" />
              <span className="text-[9px] uppercase tracking-[0.16em] font-bold px-1.5 py-0.5 rounded border"
                style={{color:'#e65200', background:'rgba(230,82,0,0.08)', borderColor:'rgba(230,82,0,0.2)'}}>
                AI Generated
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {memo && (
                <button onClick={handleCopyMemo}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all"
                  style={{background:'rgba(74,222,128,0.05)', borderColor:'rgba(74,222,128,0.2)', color:'#4ade80'}}>
                  {memoCopied ? <><CheckCircle2 className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              )}
              <button
                onClick={handleGenerateMemo}
                disabled={memoStatus === 'generating'}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all"
                style={{
                  background: memoStatus === 'generating' ? 'rgba(230,82,0,0.05)' : 'rgba(230,82,0,0.08)',
                  borderColor: 'rgba(230,82,0,0.2)',
                  color: '#e65200',
                  opacity: memoStatus === 'generating' ? 0.6 : 1,
                }}
              >
                {memoStatus === 'generating'
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                  : <><FileText className="w-3 h-3" /> {memo ? 'Regenerate' : 'Generate Memo'}</>
                }
              </button>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{borderColor:'#181818', background:'#0c0c0c'}}>
            {memoStatus === 'error' && (
              <div className="px-4 py-3 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#f87171] shrink-0" />
                <p className="text-xs text-[#f87171]">Memo generation failed. Check API key in Settings.</p>
              </div>
            )}
            {!memo && memoStatus !== 'generating' && memoStatus !== 'error' && (
              <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
                <FileText className="w-6 h-6 text-[#222]" />
                <p className="text-[#333] text-sm font-medium">No memo generated yet</p>
                <p className="text-[#242424] text-xs max-w-[240px]">Generate a PE-grade investment memo from your top 5 scored categories — ready for investor meetings</p>
              </div>
            )}
            {memoStatus === 'generating' && !memo && (
              <div className="px-4 py-10 flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-[#e65200] animate-spin" />
                <p className="text-[#444] text-sm">Drafting investment memo…</p>
              </div>
            )}
            {memo && (
              <>
                <button
                  onClick={() => setShowMemo(v => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between border-b border-[#141414] text-[11px] hover:bg-[#0f0f0f] transition-colors"
                  style={{color:'#666'}}
                >
                  <span className="font-medium text-[#aaa]">Investment Memo — {new Date().toLocaleDateString('en-NL', {month:'short',year:'numeric'})}</span>
                  <span>{showMemo ? '▲ Collapse' : '▼ Expand'}</span>
                </button>
                {showMemo && (
                  <div className="px-5 py-4 max-h-80 overflow-y-auto prose prose-invert prose-sm prose-headings:text-[#ccc] prose-p:text-[#888] prose-li:text-[#888] prose-table:text-[#888] prose-strong:text-[#ccc] max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{memo}</ReactMarkdown>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[9.5px] font-bold text-[#2a2a2a] uppercase tracking-[0.18em]">{label}</p>
  );
}

const URGENCY_STYLES: Record<SignalUrgency, { color: string; bg: string; border: string }> = {
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.08)',   border: 'rgba(248,113,113,0.2)' },
  high:     { color: '#facc15', bg: 'rgba(250,204,21,0.07)',    border: 'rgba(250,204,21,0.2)' },
  medium:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.07)',   border: 'rgba(96,165,250,0.2)' },
  low:      { color: '#555',    bg: 'transparent',             border: 'transparent' },
};

function SignalCard({ signal }: { signal: MarketSignal }) {
  const style = URGENCY_STYLES[signal.urgency];
  return (
    <div className="px-4 py-3 hover:bg-[#0f0f0f] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
              style={{color: style.color, background: style.bg, border: `1px solid ${style.border}`}}>
              {signal.urgency}
            </span>
            <span className="text-[10px] text-[#333] font-medium">{SIGNAL_TYPE_LABELS[signal.type]}</span>
            <span className="text-[10px] text-[#282828] font-mono truncate">{signal.categoryName}</span>
          </div>
          <p className="text-[12.5px] font-semibold text-[#bbb] mb-1 leading-snug">{signal.title}</p>
          <p className="text-[11px] text-[#444] leading-relaxed mb-1">{signal.detail}</p>
          <p className="text-[11px] text-[#e65200]/70 leading-relaxed italic">{signal.implication}</p>
        </div>
        {signal.source && (
          <span className="text-[9px] text-[#282828] font-mono shrink-0 mt-1">{signal.source}</span>
        )}
      </div>
    </div>
  );
}

function KpiCell({ icon, label, value, highlight, mono, sub, delay = 0 }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  sub?: string;
  delay?: number;
}) {
  return (
    <div
      className="px-5 py-4 flex flex-col justify-center"
      style={{ animation: `slideUp 0.3s cubic-bezier(0.16,1,0.3,1) ${delay}ms both` }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[#2a2a2a]">{icon}</span>
        <p className="text-[9.5px] uppercase tracking-[0.16em] text-[#2a2a2a] font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold leading-none mb-1.5 ${mono ? 'metric-value' : ''} ${highlight ? 'gradient-text-green' : 'text-[#efefef]'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[#282828] leading-snug">{sub}</p>}
    </div>
  );
}

function MetricTile({ label, value, color, highlight }: {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${highlight ? 'border-[#4ade80]/12' : 'border-[#181818]'}`}
      style={{ background: highlight ? 'rgba(74,222,128,0.04)' : '#0f0f0f' }}>
      <p className="text-[9px] uppercase tracking-[0.14em] font-bold text-[#2a2a2a] mb-1">{label}</p>
      <p className="text-sm font-mono font-bold leading-none" style={{ color }}>{value}</p>
    </div>
  );
}

