import { useState, useMemo } from 'react';
import { FinanceScenario } from '../types';
import { TrendingUp, Plus, Trash2, Calculator, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../utils';

interface Props {
  scenarios: FinanceScenario[];
  onAdd: (s: FinanceScenario) => void;
  onDelete: (id: string) => void;
}

type LiveModel = Omit<FinanceScenario, 'id' | 'name' | 'createdAt'>;

function calcMetrics(m: LiveModel) {
  const mrr = m.pricePerUnit * m.unitsPerMonth;
  const arr = mrr * 12;
  const cogsAbs = mrr * (m.cogsPct / 100);
  const grossMarginAbs = mrr - cogsAbs;
  const grossMarginPct = mrr > 0 ? (grossMarginAbs / mrr) * 100 : 0;
  const arpu = m.pricePerUnit;
  const churnDecimal = m.monthlyChurnPct / 100;
  const ltv = churnDecimal > 0 ? arpu / churnDecimal : 0;
  const ltvCac = m.cacEur > 0 ? ltv / m.cacEur : 0;
  const unitContrib = arpu * (1 - m.cogsPct / 100);
  const paybackMonths = m.cacEur > 0 && unitContrib > 0 ? m.cacEur / unitContrib : 0;
  const contributionMargin = mrr - cogsAbs - m.fixedMonthlyCosts;
  const breakEvenUnits = m.fixedMonthlyCosts > 0 && unitContrib > 0
    ? Math.ceil(m.fixedMonthlyCosts / unitContrib)
    : null;

  return { mrr, arr, grossMarginAbs, grossMarginPct, ltv, ltvCac, paybackMonths, contributionMargin, breakEvenUnits };
}

const DEFAULT_LIVE: LiveModel = {
  pricePerUnit: 49,
  unitsPerMonth: 100,
  cogsPct: 30,
  cacEur: 25,
  monthlyChurnPct: 5,
  fixedMonthlyCosts: 2000,
};

const LIVE_FIELDS: { key: keyof LiveModel; label: string; suffix?: string; min: number; step: number }[] = [
  { key: 'pricePerUnit',     label: 'Price / Unit',      suffix: '€',  min: 0.01, step: 1 },
  { key: 'unitsPerMonth',    label: 'Units / Month',                    min: 1,    step: 1 },
  { key: 'cogsPct',          label: 'COGS',              suffix: '%',  min: 0,    step: 1 },
  { key: 'cacEur',           label: 'CAC',               suffix: '€',  min: 0,    step: 1 },
  { key: 'monthlyChurnPct',  label: 'Monthly Churn',     suffix: '%',  min: 0,    step: 0.5 },
  { key: 'fixedMonthlyCosts',label: 'Fixed / Month',     suffix: '€',  min: 0,    step: 100 },
];

function fmtEur(n: number) {
  return `€${n.toLocaleString('en-NL', { maximumFractionDigits: 0 })}`;
}
function fmtX(n: number) { return `${n.toFixed(1)}x`; }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function MetricCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-[#111]/60 border border-[#1e1e1e] rounded-lg p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[#3a3a3a] mb-1">{label}</p>
      <p className={cn('font-mono font-semibold text-base', highlight ? 'text-[#4ade80]' : 'text-[#f0f0f0]')}>{value}</p>
    </div>
  );
}

function ScenarioCard({ scenario, onDelete }: { scenario: FinanceScenario; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const m = calcMetrics(scenario);

  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#252525] rounded-xl transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-[#f0f0f0] font-bold">{scenario.name}</h4>
            <p className="text-[10px] text-[#3a3a3a] mt-0.5">
              {new Date(scenario.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[#3a3a3a] hover:text-[#aaa] transition-colors"
              title={expanded ? 'Collapse' : 'Expand assumptions'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={onDelete} className="text-[#2a2a2a] hover:text-[#f87171] transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 gap-x-6">
          {[
            { label: 'MRR',          value: fmtEur(m.mrr) },
            { label: 'ARR',          value: fmtEur(m.arr) },
            { label: 'LTV : CAC',    value: fmtX(m.ltvCac),   green: m.ltvCac >= 3 },
            { label: 'Gross Margin', value: fmtPct(m.grossMarginPct) },
            { label: 'LTV',          value: fmtEur(m.ltv) },
            { label: 'Payback',      value: m.paybackMonths > 0 ? `${m.paybackMonths.toFixed(1)} mo` : '—' },
          ].map(({ label, value, green }) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-[0.1em] text-[#3a3a3a]">{label}</p>
              <p className={cn('font-mono font-semibold text-sm', green ? 'text-[#4ade80]' : 'text-[#f0f0f0]')}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-[#1e1e1e]/60">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#3a3a3a] mt-3 mb-2">Assumptions</p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs">
            <span className="text-[#484848]">Price</span><span className="text-[#aaa] font-mono">{fmtEur(scenario.pricePerUnit)}</span>
            <span className="text-[#484848]">Units/mo</span><span className="text-[#aaa] font-mono">{scenario.unitsPerMonth.toLocaleString()}</span>
            <span className="text-[#484848]">COGS</span><span className="text-[#aaa] font-mono">{scenario.cogsPct}%</span>
            <span className="text-[#484848]">CAC</span><span className="text-[#aaa] font-mono">{fmtEur(scenario.cacEur)}</span>
            <span className="text-[#484848]">Churn</span><span className="text-[#aaa] font-mono">{scenario.monthlyChurnPct}%/mo</span>
            <span className="text-[#484848]">Fixed</span><span className="text-[#aaa] font-mono">{fmtEur(scenario.fixedMonthlyCosts)}/mo</span>
          </div>
          {m.breakEvenUnits !== null && (
            <p className="text-xs text-[#484848] mt-3">
              Break-even at <span className="text-[#f0f0f0] font-mono">{m.breakEvenUnits}</span> units/month.
              {m.breakEvenUnits <= scenario.unitsPerMonth
                ? <span className="text-[#4ade80] ml-1">Already above break-even.</span>
                : <span className="text-[#e05000] ml-1">{m.breakEvenUnits - scenario.unitsPerMonth} more units needed.</span>
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FinanceView({ scenarios, onAdd, onDelete }: Props) {
  const [live, setLive] = useState<LiveModel>(DEFAULT_LIVE);
  const [showModal, setShowModal] = useState(false);
  const [scenarioName, setScenarioName] = useState('');

  const liveMetrics = useMemo(() => calcMetrics(live), [live]);

  const handleSaveScenario = () => {
    if (!scenarioName.trim()) return;
    onAdd({
      ...live,
      id: crypto.randomUUID(),
      name: scenarioName.trim(),
      createdAt: new Date().toISOString(),
    });
    setScenarioName('');
    setShowModal(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#f0f0f0]">Financial Model</h2>
          <p className="text-sm text-[#484848] mt-0.5">
            Live unit economics calculator. Build and save named scenarios to compare strategies.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#e05000] hover:bg-[#e05000] text-[#f0f0f0] rounded-xl font-semibold text-sm transition-colors border border-[#e05000] shadow-none shrink-0"
        >
          <Plus className="w-4 h-4" />
          Save Scenario
        </button>
      </div>

      {/* Live Calculator */}
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-4 h-4 text-[#e05000]" />
          <h3 className="text-[#f0f0f0] font-bold">Live Calculator</h3>
          <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-[#3a3a3a] bg-[#111] px-2 py-0.5 rounded-full border border-[#1e1e1e]">
            Instant — no save needed
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {LIVE_FIELDS.map(({ key, label, suffix, min, step }) => (
            <div key={key}>
              <label className="block text-[10px] uppercase tracking-[0.1em] text-[#3a3a3a] mb-1.5">
                {label}{suffix ? ` (${suffix})` : ''}
              </label>
              <input
                type="number"
                min={min}
                step={step}
                value={live[key]}
                onChange={e => setLive(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-[#111] border border-[#1e1e1e] text-[#f0f0f0] rounded-lg text-sm focus:outline-none focus:border-gray-600 font-mono"
              />
            </div>
          ))}
        </div>

        {/* Output metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <MetricCell label="MRR"          value={fmtEur(liveMetrics.mrr)} />
          <MetricCell label="ARR"          value={fmtEur(liveMetrics.arr)} highlight />
          <MetricCell label="Gross Margin" value={fmtPct(liveMetrics.grossMarginPct)} />
          <MetricCell label="LTV"          value={fmtEur(liveMetrics.ltv)} />
          <MetricCell label="LTV : CAC"    value={fmtX(liveMetrics.ltvCac)} highlight={liveMetrics.ltvCac >= 3} />
          <MetricCell label="Payback (mo)" value={liveMetrics.paybackMonths > 0 ? `${liveMetrics.paybackMonths.toFixed(1)} mo` : '—'} />
          <MetricCell label="Contribution" value={fmtEur(liveMetrics.contributionMargin)} highlight={liveMetrics.contributionMargin > 0} />
          <MetricCell
            label="Break-even"
            value={liveMetrics.breakEvenUnits ? `${liveMetrics.breakEvenUnits} units` : '—'}
          />
        </div>

        {/* Contextual insight */}
        {liveMetrics.ltvCac > 0 && (
          <p className={cn(
            'mt-4 text-xs font-medium',
            liveMetrics.ltvCac >= 5 ? 'text-[#4ade80]' :
            liveMetrics.ltvCac >= 3 ? 'text-[#d4ac0d]' :
            'text-[#f87171]'
          )}>
            {liveMetrics.ltvCac >= 5
              ? `LTV:CAC of ${fmtX(liveMetrics.ltvCac)} is excellent — strong unit economics.`
              : liveMetrics.ltvCac >= 3
              ? `LTV:CAC of ${fmtX(liveMetrics.ltvCac)} is healthy. Industry benchmark is 3x+.`
              : `LTV:CAC of ${fmtX(liveMetrics.ltvCac)} is below 3x. Reduce CAC or improve retention.`}
          </p>
        )}
      </div>

      {/* Saved Scenarios */}
      {scenarios.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-[#3a3a3a] mb-4">
            Saved Scenarios ({scenarios.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map(s => (
              <ScenarioCard key={s.id} scenario={s} onDelete={() => onDelete(s.id)} />
            ))}
          </div>
        </div>
      )}

      {scenarios.length === 0 && (
        <div className="text-center py-10 text-[#2a2a2a]">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No saved scenarios yet. Tweak the calculator above and save a named scenario to compare.</p>
        </div>
      )}

      {/* Save Scenario Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-[#080808] border border-[#1e1e1e] rounded-xl w-full max-w-md p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[#f0f0f0] font-bold text-lg">Save Current Model as Scenario</h3>
              <button onClick={() => setShowModal(false)} className="text-[#484848] hover:text-[#d0d0d0] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#484848] mb-4">
              This saves the current live calculator values as a named snapshot.
            </p>

            <input
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveScenario(); if (e.key === 'Escape') setShowModal(false); }}
              placeholder="e.g. Conservative Q3 2026, Base Case, Optimistic"
              autoFocus
              className="w-full px-4 py-2.5 bg-[#090909] border border-[#1e1e1e] text-[#f0f0f0] placeholder-gray-600 rounded-xl text-sm focus:outline-none focus:border-gray-600"
            />

            <div className="mt-4 p-3 bg-[#111]/60 rounded-lg border border-[#1e1e1e] text-xs text-[#666] space-y-1">
              <div className="flex justify-between">
                <span>MRR</span><span className="font-mono text-[#f0f0f0]">{fmtEur(liveMetrics.mrr)}</span>
              </div>
              <div className="flex justify-between">
                <span>ARR</span><span className="font-mono text-[#f0f0f0]">{fmtEur(liveMetrics.arr)}</span>
              </div>
              <div className="flex justify-between">
                <span>LTV : CAC</span>
                <span className={cn('font-mono', liveMetrics.ltvCac >= 3 ? 'text-[#4ade80]' : 'text-[#e05000]')}>
                  {fmtX(liveMetrics.ltvCac)}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioName.trim()}
                className="flex-1 py-2.5 bg-[#e05000] hover:bg-[#e05000] disabled:opacity-40 disabled:cursor-not-allowed text-[#f0f0f0] rounded-xl font-semibold text-sm transition-colors"
              >
                Save Scenario
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 bg-[#111] hover:bg-[#1a1a1a] text-[#666] border border-[#1e1e1e] rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
