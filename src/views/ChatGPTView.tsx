import { useState, useEffect, useRef, useCallback } from 'react';
import { Category, Weights, BrainEntry, BrainConversation } from '../types';
import { calculateDecisionScore, calculateLtvCac, getMacroSector, cn } from '../utils';
import {
  MessageSquare, Send, Square, Plus, Settings2, Loader2,
  User, Bot, ChevronDown, ChevronUp, Copy, CheckCircle2, Brain,
  BookmarkPlus, History, X,
} from 'lucide-react';
import { getOpenAiApiKey } from '../lib/settings';
import { compileBrain, estimateBrainTokens } from '../lib/brainCompiler';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
  brainEntries?: BrainEntry[];
  conversations?: BrainConversation[];
  onGoToSettings?: () => void;
  onGoToBrain?: () => void;
  onSaveConversation?: (c: BrainConversation) => void;
  onSaveToBrain?: (content: string) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — paste this into your Custom GPT's Instructions field on
// chatgpt.com once. Every field, formula, and behaviour is documented here
// so ChatGPT understands the full FlashFace OS data model.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `# FlashFace OS — Strategic Advisor

You are a strategic advisor embedded in FlashFace OS, a Dutch DTC (Direct-to-Consumer) category scouting and decision platform. Your job is to help the operator evaluate, compare, and improve their portfolio of business categories.

## What FlashFace OS is

FlashFace OS is used to research, score, and rank potential DTC subscription-first business categories — primarily aimed at the Dutch (NL) market but with global benchmarks. Every category goes through 10 AI research agents and human review before being promoted along the pipeline:

  Researching → Shortlisted → Winner (or Killed)

IMPORTANT: "Researching" is a pipeline STATUS LABEL, not an indication that research is currently running. A category can sit in "Researching" for days while the operator thinks about it.

## Data Structure: How Session Data Is Formatted

When the operator pastes their session data, it follows this format:

  ## [Category Name] [STATUS] Score:[X]/100
  Sector: [macro sector] ([industry])
  CLV €[X] | CAC €[X] | LTV:CAC [X]x | Churn [X]% | CAGR [X]
  Market Score:[X]/100 | Acq:[difficulty] | Loyalty:[level] | Brand:[type] | Story:[X]/10 | Niche:[X]/10 | Awareness:[level]
  NL Funnel: TAM [X] | SAM [X] | SOM [X]
  Audience: [target audience description]
  NL Market: [market size narrative]
  Global Market: [global market narrative]
  EU Market: [EU market narrative]
  Legal/Regulatory Risk NL: [Low/Medium/High] — [details]
  Monthly Consumption: Yes/No — [reason]
  Idea Context: [original idea note]
  Notes: [operator notes]
  Unit Econ: [AI research summary]
  Market Dyn: [AI research summary]
  Local Comp: [AI research summary]
  Global Comp: [AI research summary]
  Legal: [AI research summary]
  Suppliers: [AI research summary]
  Founders: [AI research summary]
  Ads: [AI research summary]
  Retention: [AI research summary]
  Search Trends: [AI research summary]

## Decision Score Formula (0–100)

Each category is scored by combining 7 weighted factors:

  1. CLV Score     = (estimatedCLV / max CLV in portfolio) × 100
                     — relative lifetime value; the best CLV always scores 100
  2. Retention     = 100 − monthlyChurnPercent
                     — 0% churn → 100 pts; 10% churn → 90 pts
  3. Acquisition   = Easy 100pts / Medium 60pts / Hard 30pts
  4. Market Size   = Manual 0–100 rating (see scale below)
  5. Loyalty       = High 100pts / Medium 60pts / Low 30pts
  6. Story Depth   = storyDepth (0–10) × 10
  7. Micro-Niche   = microNichePotential (0–10) × 10

  Final = weighted_average(above 7) × brandMultiplier
  brandMultiplier = 1.05 if brandType is "Solution-based", 1.00 if "Aesthetic-Pleasure"

  Weights are shown in each session data header (operator-adjustable).

## All Fields Explained

### Financial Fields
- estimatedCLV (€): Predicted total revenue from one customer over their lifetime.
  CLV = €0 means AI research hasn't completed yet — treat as unscored.
- estimatedCAC (€): Estimated cost to acquire one customer (ads + commissions + tools).
- monthlyChurnPercent (%): % of subscribers who cancel each month.
  Lower is better. Below 3% is excellent for DTC subscription.
- LTV:CAC ratio = estimatedCLV ÷ estimatedCAC.
  Below 1× = burning money. Below 2× = risky. 3×+ = healthy. 5×+ = exceptional.
- CAGR: Compound Annual Growth Rate of the market (string, e.g. "18% CAGR 2024-2028").

### Market Fields
- marketSizeScore (0–100): Manual operator rating combining NL market size, EU potential, and growth rate.
  Scale: 90+ = massive global trend | 70–89 = strong NL/EU opportunity | 50–69 = viable niche |
         30–49 = small niche, high execution risk | below 30 = micro-niche.
- marketSizeNL: Narrative description of the Dutch addressable market.
- marketSizeEU: Narrative description of the EU addressable market.
- marketSizeGlobal: Narrative description of the global market.
- audienceSizeNL: Legacy string estimate of NL audience size (older categories).

### NL Funnel: TAM → SAM → SOM
- tamNL (number): Total Addressable Market — everyone in NL who could theoretically be a customer.
- samNL (number): Serviceable Addressable Market — reachable via digital/social channels and geography.
- somNL (number): Serviceable Obtainable Market — realistic buyers given budget, need, and awareness.
- funnelBreakdownNL: Step-by-step narrative showing how each filter reduces the funnel (with source citations).

### Qualitative Fields
- acquisitionDifficulty: How hard it is to get a customer.
  Easy = high search intent or virality | Medium = standard paid/social | Hard = education required first.
- emotionalLoyalty: How emotionally attached customers become.
  High = identity-driven or habitual | Medium = regular but replaceable | Low = price-sensitive commodity.
- brandType: "Solution-based" (solves a real daily problem = stronger retention) vs "Aesthetic-Pleasure" (desire-driven = look/feel/aspirational).
- awarenessLevel: Where the target audience sits on the awareness ladder:
  Unaware → Problem-aware → Solution-aware → Product-aware.
- storyDepth (0–10): How rich, differentiated, and communicable the brand narrative is. 8+ = outstanding.
- microNichePotential (0–10): How specifically targeted and defensible the niche is. 8+ = very tight niche.
- realMonthlyConsumption (true/false): Does the product have genuine monthly consumable demand?
  This is CRITICAL for subscription models — false = subscription is forced, higher churn risk.
- monthlyConsumptionReason: Explanation of why (or why not) monthly consumption is real.
- industry: Industry tag (e.g. "Sleep supplements", "Pet nutrition").
- Sector: Macro-sector derived from industry (e.g. "Health, Wellness & Biohacking").

### Legal & Regulatory
- regulatoryRiskNL: Low / Medium / High risk of Dutch regulatory issues (ACM, NVWA, GDPR, advertising rules).
- legalAndAdRestrictions: Summary of specific legal restrictions or ad platform limitations in the Netherlands.

### Pipeline & Meta
- status: Researching | Shortlisted | Winner | Killed
  Researching = early stage or needs more info
  Shortlisted = strong candidate, all research done, operator is deciding
  Winner = committed to building — focus suggestions on execution, not re-evaluation
  Killed = deliberately rejected — do NOT recommend reviving unless explicitly asked
- notionIdea: The original idea text when this category was first imported from Notion or pasted in.
- notes: Operator notes — these are the most current manual thoughts; weigh heavily.
- researchSources: List of URLs used by AI agents during research.

### AI Agent Research Summaries
10 specialist AI agents run in parallel. Each produces a research report stored as text:
- Unit Econ: CLV/CAC benchmarks, pricing models, LTV research
- Market Dyn: Market sizes, CAGR, churn benchmarks, TAM→SAM→SOM funnel logic
- Local Comp: Dutch/EU competitor landscape, Trustpilot data, SimilarWeb estimates
- Global Comp: US/global DTC leaders, ProductHunt, ExplodingTopics, founder stories
- Legal: Dutch regulatory risk, NVWA/ACM/GDPR, ad platform restrictions
- Suppliers: Alibaba, 1688.com, Faire, Ankorstore, Dutch 3PL/fulfillment options, COGs
- Founders: Key people at top competitor companies, LinkedIn profiles, exits
- Ads: Meta/TikTok/Google Ads benchmarks, CPM/CAC, influencer strategy, UGC angles
- Retention: Cohort retention, churn drivers, win-back campaigns, dunning, LTV uplift
- Search Trends: Google Trends NL + global, seasonality, rising queries, launch timing

## NL Market Context

- Country: Netherlands (NL) — 17.9M population, ~8M households, ~70% e-commerce penetration
- Base currency: EUR (€)
- Regulatory bodies: ACM (consumer authority), NVWA (product safety), Autoriteit Persoonsgegevens (GDPR)
- All local competitor analysis is Netherlands-focused
- Dutch consumer research (CBS, KVK) used for market sizing

## How to Behave

When the operator shares session data (the portfolio paste), IMMEDIATELY:
1. Parse and acknowledge the number of categories received
2. Show the top 3 by Decision Score with a one-line verdict for each
3. Flag any categories with LTV:CAC < 2× as financial risk
4. Flag any categories showing CLV = €0 (research incomplete)
5. Then wait for their specific questions — do not overwhelm upfront

Excel at:
- Ranking: "Which 2 should I focus on first and why?"
- Gap analysis: "What's the weakest part of my research on [category]?"
- Financial modelling: "If CAC rises to €120, which categories are still viable?"
- Ad strategy: Using the Ads research summary to suggest channels and hooks
- Retention tactics: Using the Retention research to prioritise LTV levers
- Challenge mode: "Steelman why [highest-scoring category] could still fail"
- Go/No-Go: "Give me a final verdict on [category] — should I build it or kill it?"
- Competitive positioning: "How should I position vs [competitor]?"
- Adjacent discovery: "What similar niches should I explore given my winning criteria?"

When the operator says "here's my data" or pastes a block starting with "# FlashFace OS", treat that as the portfolio upload and immediately analyse it.`;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION DATA BUILDER — all fields, all agents, clearly labeled
// ─────────────────────────────────────────────────────────────────────────────
function buildSessionData(categories: Category[], weights: Weights, maxClv: number): string {
  const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

  const header = [
    `# FlashFace OS — Portfolio Session Data`,
    `Generated: ${now} (Amsterdam time)`,
    ``,
    `## Portfolio Summary`,
    `Total categories: ${categories.length}`,
    `Active (not Killed): ${categories.filter(c => c.status !== 'Killed').length}`,
    `Winners: ${categories.filter(c => c.status === 'Winner').length}`,
    `Shortlisted: ${categories.filter(c => c.status === 'Shortlisted').length}`,
    `Researching: ${categories.filter(c => c.status === 'Researching').length}`,
    `Killed: ${categories.filter(c => c.status === 'Killed').length}`,
    ``,
    `## Score Weights (current session)`,
    `CLV: ${weights.clv} | Retention: ${weights.retention} | Acquisition: ${weights.acquisition} | Market Size: ${weights.marketSize} | Loyalty: ${weights.loyalty} | Story Depth: ${weights.storyDepth} | Micro-Niche: ${weights.microNiche}`,
    ``,
    `---`,
  ].join('\n');

  const rows = [...categories]
    .sort((a, b) => calculateDecisionScore(b, weights, maxClv) - calculateDecisionScore(a, weights, maxClv))
    .map(c => {
      const score = calculateDecisionScore(c, weights, maxClv);
      const ltvCac = calculateLtvCac(c.estimatedCLV, c.estimatedCAC);
      const sector = getMacroSector(c.industry);

      const lines: string[] = [
        `## ${c.name} [${c.status.toUpperCase()}] Score:${score}/100`,
        `Sector: ${sector}${c.industry ? ` (${c.industry})` : ''}`,
        `CLV €${c.estimatedCLV} | CAC €${c.estimatedCAC} | LTV:CAC ${ltvCac}x | Monthly Churn ${c.monthlyChurnPercent}%${c.cagr ? ` | CAGR ${c.cagr}` : ''}`,
        `Market Score: ${c.marketSizeScore}/100 | Acquisition Difficulty: ${c.acquisitionDifficulty} | Emotional Loyalty: ${c.emotionalLoyalty}`,
        `Brand Type: ${c.brandType} | Story Depth: ${c.storyDepth}/10 | Micro-Niche Potential: ${c.microNichePotential}/10 | Awareness Level: ${c.awarenessLevel}`,
        `Monthly Consumption: ${c.realMonthlyConsumption ? 'YES' : 'NO'}${c.monthlyConsumptionReason ? ` — ${c.monthlyConsumptionReason}` : ''}`,
      ];

      if (c.tamNL || c.samNL || c.somNL) {
        lines.push(`NL Funnel: TAM ${c.tamNL?.toLocaleString() ?? '?'} → SAM ${c.samNL?.toLocaleString() ?? '?'} → SOM ${c.somNL?.toLocaleString() ?? '?'}`);
      }
      if (c.funnelBreakdownNL) {
        lines.push(`Funnel Logic: ${c.funnelBreakdownNL.slice(0, 400)}${c.funnelBreakdownNL.length > 400 ? '…' : ''}`);
      }
      if (c.targetAudience) lines.push(`Target Audience: ${c.targetAudience}`);
      if (c.marketSizeNL) lines.push(`NL Market: ${c.marketSizeNL}`);
      if (c.marketSizeGlobal) lines.push(`Global Market: ${c.marketSizeGlobal}`);
      if (c.marketSizeEU) lines.push(`EU Market: ${c.marketSizeEU}`);
      if (c.regulatoryRiskNL) lines.push(`Regulatory Risk NL: ${c.regulatoryRiskNL}`);
      if (c.legalAndAdRestrictions) lines.push(`Legal/Ad Restrictions: ${c.legalAndAdRestrictions}`);
      if (c.notionIdea) lines.push(`Original Idea: ${c.notionIdea.slice(0, 300)}${c.notionIdea.length > 300 ? '…' : ''}`);
      if (c.notes) lines.push(`Operator Notes: ${c.notes.slice(0, 300)}${c.notes.length > 300 ? '…' : ''}`);

      const agents = c.agentResults ?? {};
      const agentKeys: Array<[keyof typeof agents, string]> = [
        ['unitEconomics',       'Unit Econ'],
        ['marketDynamics',      'Market Dyn'],
        ['localCompetitors',    'Local Comp (NL)'],
        ['globalCompetitors',   'Global Comp'],
        ['legalLogistics',      'Legal'],
        ['suppliersBudget',     'Suppliers & Budget'],
        ['foundersAndTeam',     'Founders'],
        ['adIntelligence',      'Ad Intelligence'],
        ['retentionEngineering','Retention Engineering'],
        ['searchTrends',        'Search Trends'],
      ];
      for (const [key, label] of agentKeys) {
        const val = agents[key];
        if (val && !val.startsWith('Error:')) {
          lines.push(`${label}: ${val.slice(0, 400)}${val.length > 400 ? '…' : ''}`);
        } else if (val?.startsWith('Error:')) {
          lines.push(`${label}: [Research failed — retry in app]`);
        }
      }

      return lines.join('\n');
    });

  return header + '\n\n' + rows.join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ text, label, small }: { text: string; label: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-2 rounded-xl font-semibold transition-all duration-200',
        small ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm',
        copied
          ? 'bg-emerald-600/20 border border-emerald-500/40 text-[#4ade80]'
          : 'bg-[#1a1a1a] hover:bg-[#222] border border-[#252525] text-[#aaa] hover:text-[#f0f0f0]'
      )}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function SetupPanel({ categories, weights, maxClv }: { categories: Category[]; weights: Weights; maxClv: number }) {
  const [open, setOpen] = useState(false);
  const sessionData = buildSessionData(categories, weights, maxClv);

  return (
    <div className="shrink-0 border-b border-[#141414] bg-[#080808]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#111]/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono text-[#484848] uppercase tracking-[0.1em]">Custom GPT Setup</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-[#484848] bg-[#111] border-[#1e1e1e]">
            chatgpt.com
          </span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#3a3a3a]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#3a3a3a]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <p className="text-xs text-[#484848]">
            If you use <span className="text-[#aaa]">chatgpt.com</span> Custom GPTs, do this once to configure it, then paste session data each conversation.
          </p>
          <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl px-4 py-3 text-[11px] text-[#666]">
            Want live pull instead of copy-paste? Use <span className="text-cyan-300 font-semibold">Settings → ChatGPT Actions API</span> to generate a bearer token and import the OpenAPI schema into your GPT.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#f0f0f0]">Step 1 — One time</p>
                <p className="text-[11px] text-[#484848] mt-0.5">Paste into your Custom GPT's <span className="text-[#666]">Instructions</span> field on chatgpt.com</p>
              </div>
              <CopyButton text={SYSTEM_PROMPT} label="Copy System Prompt" small />
            </div>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#f0f0f0]">Step 2 — Each session</p>
                <p className="text-[11px] text-[#484848] mt-0.5">Paste as your first message. ChatGPT instantly knows your full portfolio.</p>
              </div>
              <CopyButton text={sessionData} label={`Copy Session Data (${categories.length} categories)`} small />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const STARTERS = [
  'What are my top 3 opportunities right now?',
  'Which categories have LTV:CAC below 2× (financial risk)?',
  'Compare my Shortlisted categories and recommend one to build.',
  'Challenge my highest-scoring category — why might it still fail?',
  'What adjacent niches should I explore given my current winners?',
];

function MessageBubble({ msg, onSaveToBrain }: { msg: Message; onSaveToBrain?: (text: string) => void }) {
  const isUser = msg.role === 'user';
  const [saved, setSaved] = useState(false);

  const handleSaveToBrain = () => {
    if (!onSaveToBrain) return;
    onSaveToBrain(msg.content);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5',
        isUser ? 'bg-[#e05000]/30 border border-[#e05000]/40' : 'bg-[#1a1a1a] border border-[#252525]'
      )}>
        {isUser ? <User className="w-3.5 h-3.5 text-[#e05000]" /> : <Bot className="w-3.5 h-3.5 text-[#666]" />}
      </div>
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-[#e05000]/15 border border-[#e05000]/15 text-orange-50 rounded-tr-sm'
            : 'bg-[#111] border border-[#1e1e1e] text-[#d0d0d0] rounded-tl-sm'
        )}>
          {msg.streaming && !msg.content ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
          )}
        </div>
        {/* Save to Brain hover action — assistant messages only */}
        {!isUser && !msg.streaming && msg.content && onSaveToBrain && (
          <button
            onClick={handleSaveToBrain}
            title="Save this insight to your Brain"
            className={cn(
              'self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all opacity-0 group-hover:opacity-100',
              saved
                ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-400'
                : 'bg-[#111] border-[#1e1e1e] text-[#484848] hover:text-[#e05000] hover:border-[#e05000]/25',
            )}
          >
            {saved ? <CheckCircle2 className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
            {saved ? 'Saved to Brain' : 'Save to Brain'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ChatGPTView({
  categories, weights, maxClv, brainEntries = [],
  conversations = [], onGoToSettings, onGoToBrain, onSaveConversation, onSaveToBrain,
}: Props) {
  const apiKey = getOpenAiApiKey();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Track the ID of the current in-progress conversation (so we upsert, not append)
  const currentConvIdRef = useRef<string | null>(null);
  const convCreatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (atBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, atBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 40);
  };

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const buildSystemContent = useCallback(() => {
    const brain = compileBrain(brainEntries);
    const brainSection = brain ? `\n\n${brain}\n\n---` : '';
    return `${SYSTEM_PROMPT}${brainSection}\n\n---\n\n${buildSessionData(categories, weights, maxClv)}`;
  }, [categories, weights, maxClv, brainEntries]);

  /** Persist the current conversation to all layers. */
  const persistConversation = useCallback((msgs: Message[]) => {
    if (!onSaveConversation || msgs.length === 0) return;
    const firstUser = msgs.find(m => m.role === 'user');
    const title = firstUser
      ? firstUser.content.slice(0, 80).replace(/\n/g, ' ')
      : 'Untitled conversation';
    const now = new Date().toISOString();
    if (!currentConvIdRef.current) {
      currentConvIdRef.current = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      convCreatedAtRef.current = now;
    }
    const conv: BrainConversation = {
      id: currentConvIdRef.current,
      title,
      model: 'gpt-4o',
      messages: msgs.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content })),
      brainEntryCount: brainEntries.filter(e => e.priority !== 'archived').length,
      createdAt: convCreatedAtRef.current ?? now,
      updatedAt: now,
    };
    onSaveConversation(conv);
  }, [onSaveConversation, brainEntries]);

  const sendMessage = useCallback(async (userText: string) => {
    const text = userText.trim();
    if (!text || isStreaming || !apiKey) return;

    setError(null);
    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          stream: true,
          max_tokens: 2048,
          temperature: 0.7,
          messages: [
            { role: 'system', content: buildSystemContent() },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errData.error?.message ?? `OpenAI API error ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6)) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = json.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                fullContent += delta;
                setMessages(prev => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: fullContent };
                  return next;
                });
              }
            } catch { /* skip malformed SSE chunk */ }
          }
        }
      }

      setMessages(prev => {
        const next = [...prev];
        if (next[next.length - 1]?.role === 'assistant') {
          next[next.length - 1] = { role: 'assistant', content: fullContent };
        }
        // Persist the completed conversation
        persistConversation(next);
        return next;
      });

    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { role: 'assistant', content: last.content || '_(stopped)_' };
          }
          return next;
        });
      } else {
        setError(e.message);
        setMessages(prev => prev.filter(m => !m.streaming));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [messages, isStreaming, apiKey, buildSystemContent]);

  const handleNewConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput('');
    currentConvIdRef.current = null;
    convCreatedAtRef.current = null;
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  // ── No API key ─────────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="flex flex-col h-full">
        <SetupPanel categories={categories} weights={weights} maxClv={maxClv} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full bg-[#080808] border border-[#1e1e1e] rounded-xl p-8 space-y-5 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-[#f0f0f0] font-bold text-lg">Add your OpenAI key for live chat</h2>
              <p className="text-[#666] text-sm">
                Connects directly to GPT-4o with your full portfolio already in context — no copy-pasting.
                Or use the <span className="text-[#aaa]">Custom GPT Setup</span> above with chatgpt.com.
              </p>
            </div>
            <button
              onClick={onGoToSettings}
              className="flex items-center gap-2 mx-auto px-5 py-3 bg-[#e05000] hover:bg-[#e05000] text-[#f0f0f0] rounded-xl font-semibold text-sm transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              Add OpenAI Key in Settings
            </button>
            <p className="text-xs text-[#3a3a3a]">
              Get a key at <span className="text-[#666] font-mono">platform.openai.com/api-keys</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Custom GPT setup panel — always accessible */}
      <SetupPanel categories={categories} weights={weights} maxClv={maxClv} />

      {/* Live chat header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#141414] bg-[#080808]/80 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-[#f0f0f0] font-semibold text-sm">FlashFace × GPT-4o</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-[#4ade80] bg-[#4ade80]/08 border-[#4ade80]/15">
            {categories.filter(c => c.status !== 'Killed').length} categories in context
          </span>
          {brainEntries.filter(e => e.priority !== 'archived').length > 0 && (
            <button
              onClick={onGoToBrain}
              title="Brain entries injected into every message"
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border text-[#e05000] bg-[#e05000]/08 border-[#e05000]/15 hover:bg-[#e05000]/15 transition-colors"
            >
              <Brain className="w-3 h-3" />
              {brainEntries.filter(e => e.priority !== 'archived').length} brain entries
            </button>
          )}
        </div>
        <button
          onClick={handleNewConversation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] text-[#666] hover:text-[#f0f0f0] rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
        {conversations.length > 0 && (
          <button
            onClick={() => setShowHistory(v => !v)}
            title="View conversation history"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors',
              showHistory
                ? 'bg-[#e05000]/15 border-[#e05000]/25 text-[#e05000]'
                : 'bg-[#111] hover:bg-[#1a1a1a] border-[#1e1e1e] text-[#666] hover:text-[#f0f0f0]',
            )}
          >
            <History className="w-3.5 h-3.5" />
            {conversations.length}
          </button>
        )}
      </div>

      {/* Conversation history drawer */}
      {showHistory && (
        <div className="shrink-0 border-b border-[#1a1a1a] bg-[#090909] max-h-52 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#141414]">
            <span className="text-[10px] text-[#484848] uppercase tracking-wider font-semibold">Saved Conversations ({conversations.length})</span>
            <button onClick={() => setShowHistory(false)} className="text-[#333] hover:text-[#aaa]"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="divide-y divide-[#111]">
            {[...conversations].reverse().map(conv => (
              <button
                key={conv.id}
                onClick={() => {
                  setMessages(conv.messages.map(m => ({ role: m.role, content: m.content })));
                  currentConvIdRef.current = conv.id;
                  convCreatedAtRef.current = conv.createdAt;
                  setShowHistory(false);
                }}
                className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-[#111] transition-colors"
              >
                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#2a2a2a]" />
                <div className="min-w-0">
                  <p className="text-xs text-[#aaa] truncate">{conv.title}</p>
                  <p className="text-[10px] text-[#333]">
                    {new Date(conv.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{conv.messages.length} messages
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-2 relative"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 space-y-6">
            <p className="text-[#484848] text-sm">Your full portfolio is loaded. Ask anything.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#1e1e1e] hover:border-[#252525] rounded-xl text-xs text-[#aaa] hover:text-[#f0f0f0] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onSaveToBrain={onSaveToBrain} />
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}

        {!atBottom && messages.length > 0 && (
          <div className="sticky bottom-4 flex justify-center">
            <button
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="p-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#252525] rounded-full text-[#666] hover:text-[#f0f0f0] shadow-lg transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2.5 bg-[#f87171]/08 border border-[#f87171]/15 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <span className="text-[#f87171]">⚠</span>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-500 hover:text-rose-300">✕</button>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-[#141414] bg-[#080808]/80 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <div className="flex-1 bg-[#111] border border-[#1e1e1e] focus-within:border-[#e05000]/25 rounded-xl px-4 py-3 transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio… (Enter to send, Shift+Enter for newline)"
              disabled={isStreaming}
              className="w-full bg-transparent text-[#f0f0f0] text-sm resize-none focus:outline-none placeholder-gray-600 leading-relaxed disabled:opacity-50"
              style={{ minHeight: '24px', maxHeight: '160px' }}
            />
          </div>
          {isStreaming ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl text-[#f87171] hover:text-rose-300 transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#e05000] hover:bg-[#e05000] disabled:bg-[#1a1a1a] disabled:text-[#3a3a3a] border border-[#e05000] disabled:border-[#252525] rounded-xl text-[#f0f0f0] transition-colors shadow-[0_0_15px_-5px_rgba(234,88,12,0.5)] disabled:shadow-none"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-[#2a2a2a] mt-2">
          GPT-4o · Data sent to OpenAI per message · Conversations auto-saved to Brain OS
        </p>
      </div>
    </div>
  );
}
