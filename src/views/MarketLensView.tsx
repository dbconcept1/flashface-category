/**
 * Market Opportunity Lens
 * ─────────────────────────────────────────────────────────────────────────────
 * Tile area = estimated revenue potential at the chosen win rate.
 * Goal: instantly see that "1% of this big category > 12 small ones combined".
 *
 * Estimation tier (in order of accuracy):
 *   1. somNL × CLV         — AI-researched SOM (deep research required)
 *   2. tamNL × CLV × 0.01  — AI-researched TAM with 1% realistic capture
 *   3. marketSizeScore × 25 000 × CLV — proxy from score (1-10) + CLV
 *
 * All figures are NL-market estimates. Use for relative comparison.
 */

import { useState, useMemo } from 'react';
import { Category } from '../types';
import { cn } from '../utils';
import { Info, X, MousePointerClick } from 'lucide-react';

const WIN_PRESETS = [0.5, 1, 2, 5, 10, 20] as const;
const MAX_TILE_PX = 210;
const MIN_TILE_PX = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PotentialSource = 'som' | 'tam' | 'score';

function basePotential(cat: Category): { value: number; src: PotentialSource } {
  const clv = cat.estimatedCLV || 50;
  if (cat.somNL && cat.somNL > 0)
    return { value: cat.somNL * clv,             src: 'som'   };
  if (cat.tamNL && cat.tamNL > 0)
    return { value: cat.tamNL * clv * 0.01,      src: 'tam'   };
  return   { value: cat.marketSizeScore * 25_000 * clv, src: 'score' };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `€${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `€${Math.round(n)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarketLensView({ categories }: { categories: Category[] }) {
  const [winRate,      setWinRate]      = useState<number>(1);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [showKilled,   setShowKilled]   = useState(false);
  const [showInfo,     setShowInfo]     = useState(false);

  // ── Derived tile data ──────────────────────────────────────────────────────
  const tiles = useMemo(() => {
    return categories
      .filter(c => showKilled || c.status !== 'Killed')
      .filter(c => c.estimatedCLV > 0 || c.marketSizeScore > 0)
      .map(c => {
        const { value, src } = basePotential(c);
        return {
          id:      c.id,
          name:    c.name,
          status:  c.status,
          revenue: value * winRate / 100,
          src,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [categories, winRate, showKilled]);

  const maxRev   = Math.max(...tiles.map(t => t.revenue), 1);
  const totalRev = tiles.reduce((s, t) => s + t.revenue, 0);
  const avgRev   = totalRev / (tiles.length || 1);
  const top1     = tiles[0];
  const top3pct  = tiles.slice(0, 3).reduce((s, t) => s + t.revenue, 0) / (totalRev || 1);
  const estCount = tiles.filter(t => t.src === 'score').length;

  // ── Selection state ────────────────────────────────────────────────────────
  const toggle = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selected  = tiles.filter(t => selectedIds.has(t.id));
  const unselected = tiles.filter(t => !selectedIds.has(t.id));
  const selTotal  = selected.reduce((s, t) => s + t.revenue, 0);
  const topOther  = unselected[0];

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Market Opportunity Lens</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Tile area = revenue potential at your chosen win rate.
            Click tiles to group and compare — instantly see if one big category beats ten small ones combined.
          </p>
        </div>

        {/* Win rate toggle */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 mr-1">Win rate</span>
          {WIN_PRESETS.map(r => (
            <button
              key={r}
              onClick={() => setWinRate(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
                winRate === r
                  ? 'bg-[#e05000] border-[#e05000] text-white shadow-[0_0_12px_-3px_rgba(224,80,0,0.6)]'
                  : 'bg-[#111] border-[#1e1e1e] text-[#555] hover:text-[#aaa] hover:border-[#2e2e2e]'
              )}
            >
              {r}%
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary bar ── */}
      {tiles.length >= 2 && (
        <div className="flex flex-wrap items-stretch gap-0 bg-[#0b0b0b] border border-[#1e1e1e] rounded-xl overflow-hidden">
          {[
            {
              label: `Best category at ${winRate}%`,
              value: top1?.name ?? '—',
              sub:   top1 ? fmt(top1.revenue) + '/yr' : '',
            },
            {
              label: 'Top 3 share of total',
              value: `${Math.round(top3pct * 100)}%`,
              sub:   'of combined opportunity',
            },
            {
              label: 'Top vs average',
              value: top1 ? `${(top1.revenue / avgRev).toFixed(1)}×` : '—',
              sub:   'bigger than avg category',
            },
            {
              label: 'Total at ' + winRate + '% win',
              value: fmt(totalRev),
              sub:   `across ${tiles.length} categories`,
            },
          ].map((s, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 px-5 py-4 min-w-[140px]',
                i > 0 && 'border-l border-[#1e1e1e]'
              )}
            >
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{s.label}</p>
              <p className="text-white font-black text-xl leading-tight truncate">{s.value}</p>
              <p className="text-gray-600 text-xs mt-0.5">{s.sub}</p>
            </div>
          ))}
          <div className="border-l border-[#1e1e1e] flex items-center px-4 gap-3">
            <button
              onClick={() => setShowKilled(v => !v)}
              className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors whitespace-nowrap"
            >
              {showKilled ? 'Hide killed' : 'Show killed'}
            </button>
            <button
              onClick={() => setShowInfo(v => !v)}
              className={cn(
                'flex items-center gap-1.5 text-[11px] transition-colors whitespace-nowrap',
                showInfo ? 'text-gray-400' : 'text-gray-700 hover:text-gray-400'
              )}
            >
              <Info className="w-3.5 h-3.5" />
              How it works
            </button>
          </div>
        </div>
      )}

      {/* ── Info panel ── */}
      {showInfo && (
        <div className="bg-[#0b0b0b] border border-[#1e1e1e] rounded-xl p-4 text-xs text-gray-500 space-y-2 leading-relaxed">
          <p className="font-bold text-gray-300 mb-3">How revenue estimates work</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { tier: '1 · Most accurate', title: 'SOM × CLV', body: 'Uses the AI-researched Serviceable Obtainable Market from deep research. Requires running the research agents on a category.' },
              { tier: '2 · Estimated',     title: 'TAM × CLV × 1%', body: 'Uses AI-researched TAM with a 1% realistic capture rate applied. Still based on real grounded research.' },
              { tier: '3 · Proxy (est)',   title: 'Score × 25K × CLV', body: 'Uses the market size score (1-10) as a customer-count proxy. Good for relative comparison but not absolute numbers.' },
            ].map(({ tier, title, body }) => (
              <div key={tier} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-3 space-y-1">
                <p className="text-[9px] uppercase tracking-widest text-gray-700">{tier}</p>
                <p className="font-bold text-gray-300 text-xs">{title}</p>
                <p className="text-gray-600 text-[11px] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-gray-700 pt-1">
            Run <span className="text-gray-400">Deep Research</span> on categories to unlock SOM/TAM figures.
            {estCount > 0 && ` ${estCount} categor${estCount === 1 ? 'y uses' : 'ies use'} the score proxy today.`}
          </p>
        </div>
      )}

      {/* ── Comparison banner (shown when tiles are selected) ── */}
      {selectedIds.size > 0 && (
        <div className="bg-[#0b0b0b] border border-[#e05000]/35 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="flex flex-wrap items-end gap-5">

              {/* Selected group */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">
                  {selectedIds.size} selected {selectedIds.size === 1 ? 'category' : 'categories'}
                </p>
                <span className="text-[28px] font-black text-[#e05000] leading-none">{fmt(selTotal)}</span>
                <span className="text-sm text-gray-500 ml-1">/yr</span>
              </div>

              {topOther && (
                <>
                  <span className="text-2xl font-black text-[#222] pb-1">vs</span>

                  {/* Best non-selected */}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5 truncate max-w-[160px]">
                      {topOther.name} alone
                    </p>
                    <span className="text-[28px] font-black text-white leading-none">{fmt(topOther.revenue)}</span>
                    <span className="text-sm text-gray-500 ml-1">/yr</span>
                  </div>

                  {/* Verdict pill */}
                  {selTotal > 0 && topOther.revenue > 0 && (
                    <div className={cn(
                      'self-end px-4 py-2 rounded-xl text-sm font-bold border mb-0.5',
                      selTotal < topOther.revenue
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                    )}>
                      {selTotal < topOther.revenue
                        ? `${topOther.name} alone = ${(topOther.revenue / selTotal).toFixed(1)}× your group`
                        : `Your group = ${(selTotal / topOther.revenue).toFixed(1)}× best alternative`
                      }
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors self-start"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Instruction hint ── */}
      {selectedIds.size === 0 && tiles.length > 0 && (
        <p className="text-[11px] text-gray-700 flex items-center gap-1.5 px-0.5">
          <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
          Click tiles to group and compare · sorted by estimated revenue potential
          {estCount > 0 && ` · ${estCount} use score-based estimates (~est)`}
        </p>
      )}

      {/* ── Tile grid ── */}
      <div className="flex flex-wrap gap-3 items-end content-start">
        {tiles.map(tile => {
          const side       = Math.max(MIN_TILE_PX, Math.sqrt(tile.revenue / maxRev) * MAX_TILE_PX);
          const isSelected = selectedIds.has(tile.id);
          const isLarge    = side >= 112;
          const isMedium   = side >= 74 && side < 112;

          const borderCls = isSelected
            ? 'border-[#e05000]/60'
            : tile.status === 'Winner'      ? 'border-emerald-500/30'
            : tile.status === 'Shortlisted' ? 'border-blue-500/25'
            : tile.status === 'Killed'      ? 'border-gray-800/50'
            : 'border-[#1e1e1e]';

          const bgCls = isSelected
            ? 'bg-[#e05000]/15'
            : tile.status === 'Winner'      ? 'bg-emerald-950/25'
            : tile.status === 'Shortlisted' ? 'bg-blue-950/15'
            : tile.status === 'Killed'      ? 'bg-[#0a0a0a]'
            : 'bg-[#111]';

          return (
            <div
              key={tile.id}
              onClick={() => toggle(tile.id)}
              style={{ width: side, height: side }}
              title={`${tile.name} · ${fmt(tile.revenue)}/yr at ${winRate}% win · ${tile.src === 'som' ? 'AI SOM data' : tile.src === 'tam' ? 'TAM × 1%' : 'score estimate'}`}
              className={cn(
                'relative rounded-xl border cursor-pointer transition-all duration-150',
                'flex flex-col items-center justify-center overflow-hidden select-none',
                bgCls, borderCls,
                isSelected
                  ? 'ring-1 ring-[#e05000]/25 scale-[1.025]'
                  : 'hover:border-gray-600 hover:scale-[1.015]'
              )}
            >
              <div className="px-2 w-full flex flex-col items-center justify-center gap-0.5">
                {isLarge && (
                  <>
                    <p className="text-[11px] font-bold text-white leading-snug text-center w-full overflow-hidden"
                       style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tile.name}
                    </p>
                    <p className="text-[16px] font-black text-[#e05000] leading-none mt-1.5">{fmt(tile.revenue)}</p>
                    <p className="text-[9px] text-gray-600 mt-0.5">/yr at {winRate}%</p>
                  </>
                )}
                {isMedium && (
                  <>
                    <p className="text-[10px] font-bold text-white leading-snug text-center w-full overflow-hidden"
                       style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tile.name}
                    </p>
                    <p className="text-[13px] font-black text-[#e05000] mt-1 leading-none">{fmt(tile.revenue)}</p>
                  </>
                )}
                {!isLarge && !isMedium && (
                  <>
                    <p className="text-[8px] font-bold text-gray-500 leading-snug text-center w-full overflow-hidden"
                       style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tile.name}
                    </p>
                    <p className="text-[10px] font-bold text-orange-600 mt-0.5 leading-none">{fmt(tile.revenue)}</p>
                  </>
                )}
              </div>

              {/* Selected checkmark */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#e05000] rounded-full flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
                    <polyline points="2,5.5 4.5,8 8,2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Estimate indicator */}
              {tile.src === 'score' && !isSelected && side >= 60 && (
                <span className="absolute bottom-1 right-1.5 text-[7px] text-gray-700">~est</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {tiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <p className="text-gray-500 font-medium">No categories with sizing data yet.</p>
          <p className="text-gray-700 text-sm">
            Add categories and run Deep Research to populate CLV and market size scores.
          </p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-gray-800 pb-2 leading-relaxed">
        Revenue = estimated NL-market customers × CLV × win rate.
        Figures are indicative — use for relative prioritisation, not financial forecasting.
      </p>
    </div>
  );
}
