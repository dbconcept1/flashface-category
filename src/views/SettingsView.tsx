import { useState, useCallback } from 'react';
import { Key, Eye, EyeOff, Euro, AlertTriangle, CheckCircle2, Info, RotateCcw, ExternalLink } from 'lucide-react';
import { getSettings, saveSettings, resetSpending, AppSettings, PRICING_EUR, calcBudgetPercent } from '../lib/settings';
import { cn } from '../utils';

function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const refresh = useCallback(() => setSettings(getSettings()), []);
  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    return next;
  }, []);
  return { settings, refresh, update };
}

export function SettingsView({ onRefreshSpending }: { onRefreshSpending?: () => void }) {
  const { settings, update } = useSettings();

  // OpenAI key section
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [isEditingOpenaiKey, setIsEditingOpenaiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [openaiKeySaved, setOpenaiKeySaved] = useState(false);

  const hasOpenaiKey = !!settings.openaiApiKey;

  const handleStartEditOpenaiKey = () => {
    setIsEditingOpenaiKey(true);
    setOpenaiKeyInput('');
    setShowOpenaiKey(false);
  };

  const handleSaveOpenaiKey = () => {
    const trimmed = openaiKeyInput.trim();
    if (!trimmed) return;
    update({ openaiApiKey: trimmed });
    setIsEditingOpenaiKey(false);
    setOpenaiKeyInput('');
    setOpenaiKeySaved(true);
    setTimeout(() => setOpenaiKeySaved(false), 3000);
  };

  const handleRemoveOpenaiKey = () => {
    if (!confirm('Remove the saved OpenAI key?')) return;
    update({ openaiApiKey: '' });
    setIsEditingOpenaiKey(false);
    setOpenaiKeyInput('');
  };

  // Gemini key section
  const [keyInput, setKeyInput] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Budget section
  const [budgetInput, setBudgetInput] = useState<string>(
    settings.budgetLimitEur !== null ? String(settings.budgetLimitEur) : ''
  );

  const hasEnvKey = !!(process.env.GEMINI_API_KEY);
  const hasDashboardKey = !!settings.geminiApiKey;
  const hasAnyKey = hasDashboardKey || hasEnvKey;
  const keySource: 'dashboard' | 'env' | 'none' = hasDashboardKey ? 'dashboard' : hasEnvKey ? 'env' : 'none';

  const handleStartEditKey = () => {
    setIsEditingKey(true);
    setKeyInput('');
    setShowKey(false);
  };

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    update({ geminiApiKey: trimmed });
    setIsEditingKey(false);
    setKeyInput('');
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 3000);
  };

  const handleRemoveKey = () => {
    if (!confirm('Remove the saved API key? The app will fall back to the .env key if one exists.')) return;
    update({ geminiApiKey: '' });
    setIsEditingKey(false);
    setKeyInput('');
  };

  const handleSaveBudget = () => {
    const val = parseFloat(budgetInput);
    const limit = budgetInput === '' || isNaN(val) ? null : Math.max(0, val);
    update({ budgetLimitEur: limit });
  };

  const handleResetSpending = () => {
    if (!confirm('Reset spending counter to €0.00?')) return;
    resetSpending();
    update({ spendingEur: 0, totalTokensIn: 0, totalTokensOut: 0, totalGroundingCalls: 0, spendingResetAt: new Date().toISOString() });
    onRefreshSpending?.();
  };

  const pct = calcBudgetPercent(settings);
  const isOverBudget = settings.budgetLimitEur !== null && settings.spendingEur >= settings.budgetLimitEur;
  const isNearBudget = !isOverBudget && pct >= 80;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure your API keys and spending cap.</p>
      </div>

      {/* ─── API Key ─────────────────────────────────── */}
      <section className="bg-[#111111] border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Key className="w-4 h-4 text-orange-400 shrink-0" />
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Gemini API Key</h3>
          <span className={cn(
            "ml-auto text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider",
            keySource === 'dashboard' ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
            keySource === 'env'       ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                                        "text-rose-400 bg-rose-500/10 border-rose-500/20"
          )}>
            {keySource === 'dashboard' ? '✓ Dashboard key active' :
             keySource === 'env'       ? '⚠ .env fallback' :
                                         '✗ No key configured'}
          </span>
        </div>

        {!isEditingKey ? (
          <div className="flex gap-2">
            <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-500 flex items-center">
              {hasDashboardKey ? '••••••••••••••••••••••••' : hasEnvKey ? 'Using key from .env file' : 'No key set'}
            </div>
            <button
              onClick={handleStartEditKey}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {hasDashboardKey ? 'Change' : 'Add Key'}
            </button>
            {hasDashboardKey && (
              <button
                onClick={handleRemoveKey}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-rose-400 rounded-lg text-sm transition-colors"
                title="Remove saved key"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                  placeholder="AIza..."
                  className="w-full bg-gray-900 border border-orange-500/50 text-white rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 pr-10"
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setIsEditingKey(false); setKeyInput(''); }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {keySaved && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Key saved in browser localStorage
          </div>
        )}

        {!hasAnyKey && (
          <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-xs text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            No API key found. All AI features are disabled until you add a key.
          </div>
        )}

        <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-3 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <span>
            Get a free key at{' '}
            <span className="text-blue-400 font-mono">aistudio.google.com/apikey</span>.
            The dashboard key is stored only in your browser's localStorage — never sent anywhere except directly to Google's servers for API calls.
          </span>
        </div>
      </section>
      {/* ─── OpenAI API Key ─────────────────────────────── */}
      <section className="bg-[#111111] border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Key className="w-4 h-4 text-blue-400 shrink-0" />
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">OpenAI API Key</h3>
          <span className={cn(
            'ml-auto text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider',
            hasOpenaiKey
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-gray-500 bg-gray-800/50 border-gray-700'
          )}>
            {hasOpenaiKey ? '✓ Key active' : '✕ Not configured'}
          </span>
        </div>

        {!isEditingOpenaiKey ? (
          <div className="flex gap-2">
            <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-500 flex items-center">
              {hasOpenaiKey ? '••••••••••••••••••••••••' : 'No key set'}
            </div>
            <button
              onClick={handleStartEditOpenaiKey}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {hasOpenaiKey ? 'Change' : 'Add Key'}
            </button>
            {hasOpenaiKey && (
              <button
                onClick={handleRemoveOpenaiKey}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-rose-400 rounded-lg text-sm transition-colors"
                title="Remove saved key"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiKeyInput}
                  onChange={e => setOpenaiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveOpenaiKey()}
                  placeholder="sk-..."
                  className="w-full bg-gray-900 border border-blue-500/50 text-white rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-10"
                />
                <button
                  onClick={() => setShowOpenaiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleSaveOpenaiKey}
                disabled={!openaiKeyInput.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setIsEditingOpenaiKey(false); setOpenaiKeyInput(''); }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {openaiKeySaved && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Key saved in browser localStorage
          </div>
        )}

        <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-3 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <span>
            Powers the live chat in the ChatGPT view (GPT-4o). Get a key at{' '}
            <span className="text-blue-400 font-mono">platform.openai.com/api-keys</span>.
            Stored only in your browser’s localStorage.
          </span>
        </div>
      </section>
      {/* ─── Budget / Spending ───────────────────────── */}
      <section className="bg-[#111111] border border-gray-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Euro className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Spending Cap</h3>
        </div>

        {/* Progress + stats */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Estimated spend (this session)</span>
            <span className={cn(
              'font-mono font-bold',
              isOverBudget ? 'text-rose-400' : isNearBudget ? 'text-orange-400' : 'text-emerald-400'
            )}>
              €{settings.spendingEur.toFixed(3)}
              {settings.budgetLimitEur !== null ? ` / €${settings.budgetLimitEur.toFixed(0)}` : ''}
            </span>
          </div>

          {settings.budgetLimitEur !== null && (
            <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isOverBudget ? 'bg-rose-500' : isNearBudget ? 'bg-orange-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Input tokens', value: `${(settings.totalTokensIn / 1000).toFixed(1)}K` },
              { label: 'Output tokens', value: `${(settings.totalTokensOut / 1000).toFixed(1)}K` },
              { label: 'Search calls', value: String(settings.totalGroundingCalls) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-900 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
                <p className="text-xs font-mono text-gray-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-600">
            <span>Tracking since {new Date(settings.spendingResetAt).toLocaleDateString('nl-NL')}</span>
            <button
              onClick={handleResetSpending}
              className="flex items-center gap-1 text-gray-600 hover:text-rose-400 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset counter
            </button>
          </div>
        </div>

        {/* Cap control */}
        <div className="border-t border-gray-800 pt-5 space-y-3">
          <p className="text-xs text-gray-400">
            All API calls are blocked once estimated spend reaches this limit. Leave blank for no limit.
          </p>
          <div className="flex gap-3 items-center">
            <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex-1">
              <span className="px-3 text-gray-500 font-mono text-sm border-r border-gray-700">€</span>
              <input
                type="number"
                min="0"
                step="5"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                onBlur={handleSaveBudget}
                onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
                placeholder="No limit"
                className="flex-1 bg-transparent text-white text-sm px-3 py-2.5 focus:outline-none font-mono"
              />
            </div>
            <button
              onClick={handleSaveBudget}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-bold transition-colors"
            >
              Set
            </button>
            {settings.budgetLimitEur !== null && (
              <button
                onClick={() => { setBudgetInput(''); const next = saveSettings({ budgetLimitEur: null }); update(next); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap"
              >
                No limit
              </button>
            )}
          </div>

          {isNearBudget && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Approaching budget cap — {(100 - pct).toFixed(0)}% remaining
            </div>
          )}
          {isOverBudget && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Budget cap reached. All API calls are blocked. Reset the counter above or raise the limit.
            </div>
          )}
        </div>
      </section>

      {/* ─── Pricing reference ───────────────────────── */}
      <section className="bg-[#111111] border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pricing Reference</h3>
          <a
            href="https://ai.google.dev/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-blue-400 transition-colors"
          >
            Verify at ai.google.dev/pricing
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { label: 'Input ≤128k tokens', value: `€${PRICING_EUR.inputPerMToken_short}/1M`, note: '~$0.15/1M' },
            { label: 'Output ≤128k tokens', value: `€${PRICING_EUR.outputPerMToken_short}/1M`, note: '~$0.60/1M' },
            { label: 'Google Search grounding', value: `€${PRICING_EUR.groundingPerCall}/call`, note: '~$35/1000' },
          ].map(({ label, value, note }) => (
            <div key={label} className="bg-gray-900 rounded-lg p-3 space-y-1">
              <p className="text-gray-500">{label}</p>
              <p className="text-white font-mono font-bold">{value}</p>
              <p className="text-gray-600 text-[10px]">{note}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-[10px] text-gray-600">
          <p>Model: Gemini 2.5 Flash. EUR estimated at $1 = €0.92. Prices subject to change.</p>
          <p><span className="text-gray-400">⚠️ Long-context tier</span> (&gt;128k tokens): Input €{PRICING_EUR.inputPerMToken_long}/1M, Output €{PRICING_EUR.outputPerMToken_long}/1M — ~4–6× higher. Large PDF batches often cross this threshold.</p>
          <p>Typical deep research run (9 agents + search): <span className="text-gray-400">~€0.05–0.30</span></p>
          <p>€50 cap ≈ roughly 165–1000 full category research runs.</p>
        </div>
      </section>
    </div>
  );
}
