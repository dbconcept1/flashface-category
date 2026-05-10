import { useState } from 'react';
import { Category, Weights } from '../types';
import { calculateDecisionScore, calculateLtvCac, getMacroSector } from '../utils';
import { cn } from '../utils';
import { Copy, CheckCircle2, MessageSquare, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
}

/** Markdown snapshot of all categories for pasting into a ChatGPT session. */
function buildSessionData(categories: Category[], weights: Weights, maxClv: number): string {
  const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

  const header = `# FlashFace OS — Session Data Export
Generated: ${now}
Active categories: ${categories.filter(c => c.status !== 'Killed').length} | Total: ${categories.length}
Winner count: ${categories.filter(c => c.status === 'Winner').length} | Shortlisted: ${categories.filter(c => c.status === 'Shortlisted').length} | Researching: ${categories.filter(c => c.status === 'Researching').length} | Killed: ${categories.filter(c => c.status === 'Killed').length}

## Score Weights (current session)
CLV ${weights.clv} | Retention ${weights.retention} | Acquisition ${weights.acquisition} | Market Size ${weights.marketSize} | Loyalty ${weights.loyalty} | Story Depth ${weights.storyDepth} | Micro-Niche ${weights.microNiche}

---
`;

  const rows = [...categories]
    .sort((a, b) => calculateDecisionScore(b, weights, maxClv) - calculateDecisionScore(a, weights, maxClv))
    .map(c => {
      const score = calculateDecisionScore(c, weights, maxClv);
      const ltvCac = calculateLtvCac(c.estimatedCLV, c.estimatedCAC);
      const sector = getMacroSector(c.industry);

      const lines: string[] = [
        `## ${c.name} [${c.status.toUpperCase()}] — Score: ${score}/100`,
        `**Sector:** ${sector}${c.industry ? ` (${c.industry})` : ''}`,
        `**Key Metrics:** CLV €${c.estimatedCLV} | CAC €${c.estimatedCAC} | LTV:CAC ${ltvCac}x | Monthly Churn ${c.monthlyChurnPercent}%${c.cagr ? ` | CAGR ${c.cagr}` : ''}`,
        `**Market:** Size Score ${c.marketSizeScore}/100 | Acq. Difficulty ${c.acquisitionDifficulty} | Emotional Loyalty ${c.emotionalLoyalty}`,
        `**Positioning:** Brand ${c.brandType} | Story Depth ${c.storyDepth}/10 | Micro-Niche ${c.microNichePotential}/10 | Awareness ${c.awarenessLevel}`,
      ];

      if (c.tamNL || c.samNL || c.somNL) {
        lines.push(`**NL Funnel:** TAM ${c.tamNL?.toLocaleString() ?? '?'} | SAM ${c.samNL?.toLocaleString() ?? '?'} | SOM ${c.somNL?.toLocaleString() ?? '?'}`);
      }
      if (c.funnelBreakdownNL) {
        lines.push(`**Funnel Logic:** ${c.funnelBreakdownNL.slice(0, 300)}${c.funnelBreakdownNL.length > 300 ? '…' : ''}`);
      }
      if (c.targetAudience) lines.push(`**Target Audience:** ${c.targetAudience}`);
      if (c.marketSizeNL) lines.push(`**NL Market:** ${c.marketSizeNL}`);
      if (c.marketSizeGlobal) lines.push(`**Global Market:** ${c.marketSizeGlobal}`);
      if (c.legalAndAdRestrictions) lines.push(`**Legal/Ad Restrictions:** ${c.legalAndAdRestrictions}`);
      if (c.regulatoryRiskNL) lines.push(`**Regulatory Risk NL:** ${c.regulatoryRiskNL}`);
      if (c.realMonthlyConsumption) lines.push(`**Monthly Consumption:** Yes — ${c.monthlyConsumptionReason}`);
      if (c.notionIdea) lines.push(`**Idea Context:** ${c.notionIdea.slice(0, 200)}${c.notionIdea.length > 200 ? '…' : ''}`);
      if (c.notes) lines.push(`**Notes:** ${c.notes.slice(0, 300)}${c.notes.length > 300 ? '…' : ''}`);

      // AI research summaries (first 400 chars of each)
      const agents = c.agentResults ?? {};
      const agentLabels: Array<[keyof typeof agents, string]> = [
        ['unitEconomics', 'Unit Economics'],
        ['marketDynamics', 'Market Dynamics'],
        ['localCompetitors', 'Local Competitors (NL)'],
        ['globalCompetitors', 'Global Competitors'],
        ['legalLogistics', 'Legal & Logistics'],
        ['suppliersBudget', 'Suppliers & Budget'],
        ['foundersAndTeam', 'Founders & Team'],
        ['adIntelligence', 'Ad Intelligence'],
        ['retentionEngineering', 'Retention Engineering'],
      ];
      for (const [key, label] of agentLabels) {
        const val = agents[key];
        if (val) {
          lines.push(`**${label}:** ${val.slice(0, 400)}${val.length > 400 ? '…' : ''}`);
        }
      }

      return lines.join('\n');
    });

  return header + rows.join('\n\n---\n\n');
}

/** The one-time system prompt explaining FlashFace OS to ChatGPT. */
const SYSTEM_PROMPT = `You are a strategic advisor for FlashFace OS, a Dutch DTC (Direct-to-Consumer) category scouting and decision platform. Your job is to help the operator evaluate, compare, and improve their portfolio of business categories.

## What FlashFace OS does
FlashFace OS researches, scores, and ranks potential DTC subscription-first categories — primarily aimed at the Dutch (NL) market but with global benchmarks. Every category goes through AI research (9 specialist agents) and human review before being promoted from "Researching" → "Shortlisted" → "Winner" (or "Killed").

## Scoring Formula
Each category receives a Decision Score (0–100) based on a weighted combination of 7 factors:

1. **CLV Score** = (estimatedCLV / highest CLV in portfolio) × 100 — relative value of lifetime revenue
2. **Retention Score** = 100 − monthlyChurnPercent — lower churn = higher score
3. **Acquisition Score**: Easy=100, Medium=60, Hard=30 — how hard it is to get customers
4. **Market Size Score** = manual 0–100 rating of addressable NL + EU opportunity
5. **Loyalty Score**: High=100, Medium=60, Low=30 — emotional/repeat connection
6. **Story Depth** = storyDepth (0–10) × 10 — brand narrative richness
7. **Micro-Niche** = microNichePotential (0–10) × 10 — specificity of the niche

Each factor is multiplied by its weight (shown per session). Final score is further multiplied by 1.05 if the brand type is "Solution-based" (vs "Aesthetic-Pleasure").

## Key Fields Explained
- **estimatedCLV**: Predicted lifetime revenue per customer in €
- **estimatedCAC**: Cost to acquire one customer in €
- **monthlyChurnPercent**: % of customers who cancel/leave per month
- **LTV:CAC**: CLV ÷ CAC — a ratio above 3× is healthy; below 1× is unsustainable
- **CAGR**: Compound Annual Growth Rate of the category market
- **tamNL / samNL / somNL**: Total Addressable / Serviceable Addressable / Serviceable Obtainable Market in the Netherlands (number of target entities)
- **funnelBreakdownNL**: Step-by-step logic explaining how TAM → SAM → SOM was calculated
- **marketSizeScore**: Manual 0–100 rating combining NL size, EU size, and growth trajectory
- **acquisitionDifficulty**: How hard it is to acquire customers (Easy / Medium / Hard)
- **emotionalLoyalty**: How emotionally attached customers are (Low / Medium / High)
- **brandType**: "Solution-based" (solves a real pain) vs "Aesthetic-Pleasure" (desire-driven)
- **awarenessLevel**: Where the target audience is on the awareness spectrum (Unaware → Problem-aware → Solution-aware → Product-aware)
- **storyDepth (0–10)**: How rich, differentiated, and communicable the brand story is
- **microNichePotential (0–10)**: How specifically targeted and defensible the niche is
- **status**: Researching = early stage | Shortlisted = strong candidate | Winner = selected to build | Killed = rejected
- **realMonthlyConsumption**: Whether the product is genuinely consumed monthly (critical for subscription model)
- **notionIdea**: The original idea note from the operator
- **agentResults**: AI-generated research from 9 specialist agents (unitEconomics, marketDynamics, localCompetitors, globalCompetitors, legalLogistics, suppliersBudget, foundersAndTeam, adIntelligence, retentionEngineering)
- **CLV = €0**: Means AI research hasn't been completed yet — treat as unscored

## NL Market Context
The operator is based in the Netherlands. All "local" competitor analysis is Dutch-market focused. SAM/SOM calculations use Dutch population (17.9M), household count (~8M), e-commerce penetration rates, and Dutch consumer behaviour research. Dutch regulatory environment (ACM, NVWA, GDPR) applies to legal risk.

## Category Status Logic
- **Killed** categories were consciously rejected — do not recommend reviving them unless asked
- **Winner** categories are committed — focus suggestions on execution, not re-evaluation
- **Shortlisted** categories are the prime candidates for comparison and decision-making
- **Researching** categories need the most gap analysis and benchmarking

## How to help the operator
When you receive FlashFace session data, immediately:
1. Summarise the top 3 opportunities by Decision Score with a one-line verdict for each
2. Flag any categories with LTV:CAC < 2× as financial risk
3. Note any categories with missing CLV (€0) that need AI research
4. Then wait for specific questions

You excel at:
- **Ranking & comparison**: "Which category should I prioritise and why?"
- **Gap analysis**: "What's missing from my research on [category]?"
- **Financial modelling**: "What CLV do I need to hit a 3× LTV:CAC with this CAC?"
- **Ad creative strategy**: Leveraging adIntelligence research to suggest angles
- **Retention tactics**: Using retentionEngineering data for subscription economics
- **Challenge mode**: Steelmanning why a high-scoring category might still fail
- **New ideas**: Suggesting adjacent niches given the operator's winning criteria
- **Go/No-Go decisions**: Summarising evidence for promoting to Winner or Killing`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200',
        copied
          ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-400'
          : 'bg-orange-600 hover:bg-orange-500 border border-orange-500 text-white shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)]'
      )}
    >
      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function Step({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-sm shrink-0">
          {number}
        </div>
        <div>
          <h3 className="text-white font-semibold text-base">{title}</h3>
          <p className="text-gray-400 text-sm mt-1">{description}</p>
        </div>
      </div>
      <div className="pl-13">{children}</div>
    </div>
  );
}

function ExampleQuestions() {
  const [open, setOpen] = useState(false);
  const examples = [
    'Here is my FlashFace data. What are my top 3 opportunities right now?',
    'Which categories have the best LTV:CAC ratio and why are they strong?',
    'Challenge me on my highest-scoring category — why might it still fail?',
    'What\'s missing from my research on [category name]?',
    'Which of my Shortlisted categories should I kill and why?',
    'Given my winning criteria, what adjacent niches should I explore?',
    'For [category], what ad channels and creative angles would work in the Netherlands?',
    'Model the unit economics for [category] if CAC rises to €150 — still viable?',
    'Compare [category A] vs [category B] and recommend one.',
    'Summarise the retention risk across my portfolio.',
    'What would it take for [Killed category] to be worth revisiting?',
  ];

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-orange-400 shrink-0" />
          <span className="text-white font-semibold text-sm">Example questions to ask ChatGPT</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && (
        <div className="border-t border-gray-800 px-5 pb-5 pt-4 space-y-2">
          {examples.map((q, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-gray-300">
              <span className="text-orange-500 font-mono shrink-0 mt-px">→</span>
              <span>{q}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatGPTView({ categories, weights, maxClv }: Props) {
  const sessionData = buildSessionData(categories, weights, maxClv);
  const activeCount = categories.filter(c => c.status !== 'Killed').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">ChatGPT Integration</h1>
              <p className="text-gray-400 text-sm">Link your personal ChatGPT to your FlashFace data</p>
            </div>
          </div>
          <p className="text-gray-500 text-sm pt-1">
            Two-step setup: teach ChatGPT about FlashFace once, then paste your live data at the start of each session.
          </p>
        </div>

        {/* Step 1 */}
        <Step
          number="1"
          title="One-time setup — Configure your GPT"
          description="Copy the system prompt below and paste it into your ChatGPT custom instructions or a GPT you own. You only do this once."
        >
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-h-48 overflow-y-auto">
              <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                {SYSTEM_PROMPT.slice(0, 600)}…
              </pre>
            </div>
            <div className="space-y-2">
              <CopyButton text={SYSTEM_PROMPT} label="Copy System Prompt" />
              <p className="text-xs text-gray-600">
                Paste into: <span className="text-gray-400">ChatGPT → Settings → Personalisation → Custom Instructions</span>
                , or into a custom GPT's Instructions field.
              </p>
            </div>
          </div>
        </Step>

        {/* Step 2 */}
        <Step
          number="2"
          title="Each session — Paste your live data"
          description={`Copy your current portfolio snapshot (${activeCount} active categories, ${categories.length} total) and paste it at the start of your ChatGPT conversation.`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{categories.filter(c => c.status === 'Winner').length}</p>
                <p className="text-xs text-gray-500 mt-1">Winners</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{categories.filter(c => c.status === 'Shortlisted').length}</p>
                <p className="text-xs text-gray-500 mt-1">Shortlisted</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-400">{categories.filter(c => c.status === 'Killed').length}</p>
                <p className="text-xs text-gray-500 mt-1">Killed</p>
              </div>
            </div>
            <div className="space-y-2">
              <CopyButton text={sessionData} label={`Copy Session Data (${categories.length} categories)`} />
              <p className="text-xs text-gray-600">
                Includes all fields: scores, CLV, CAC, churn, LTV:CAC, market data, AI research summaries — everything ChatGPT needs to reason about your portfolio.
              </p>
            </div>
          </div>
        </Step>

        {/* Step 3 — Examples */}
        <div className="space-y-3">
          <h3 className="text-gray-300 font-semibold text-sm px-1">What to ask</h3>
          <ExampleQuestions />
        </div>

        {/* Tips */}
        <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 space-y-2">
          <p className="text-blue-300 font-semibold text-sm">Pro tips</p>
          <ul className="text-xs text-blue-200/70 space-y-1.5">
            <li>• Paste session data fresh each time — your scores and research evolve</li>
            <li>• ChatGPT with the system prompt will immediately summarise your top opportunities when you paste data</li>
            <li>• Use GPT-4o for best results — it handles the full context window (100K+ tokens)</li>
            <li>• Ask it to "challenge" a category for the most honest strategic feedback</li>
            <li>• For deep dives, paste the full AI research tab content for a single category</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
