import { useState, useEffect, useRef, useCallback } from 'react';
import { Category, Weights } from '../types';
import { calculateDecisionScore, calculateLtvCac, getMacroSector, cn } from '../utils';
import { MessageSquare, Send, Square, Plus, Settings2, Loader2, User, Bot, ChevronDown } from 'lucide-react';
import { getOpenAiApiKey } from '../lib/settings';

interface Props {
  categories: Category[];
  weights: Weights;
  maxClv: number;
  onGoToSettings?: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const SYSTEM_PROMPT = `You are a strategic advisor for FlashFace OS, a Dutch DTC (Direct-to-Consumer) category scouting and decision platform. Your job is to help the operator evaluate, compare, and improve their portfolio of business categories.

## What FlashFace OS does
FlashFace OS researches, scores, and ranks potential DTC subscription-first categories — primarily aimed at the Dutch (NL) market but with global benchmarks. Every category goes through AI research (9 specialist agents) and human review before being promoted from "Researching" → "Shortlisted" → "Winner" (or "Killed").

## Scoring Formula
Each category receives a Decision Score (0–100) based on a weighted combination of 7 factors:
1. CLV Score = (estimatedCLV / highest CLV in portfolio) × 100
2. Retention Score = 100 − monthlyChurnPercent
3. Acquisition Score: Easy=100, Medium=60, Hard=30
4. Market Size Score = manual 0–100 rating
5. Loyalty Score: High=100, Medium=60, Low=30
6. Story Depth = storyDepth (0–10) × 10
7. Micro-Niche = microNichePotential (0–10) × 10
Final score ×1.05 if brandType is "Solution-based".

## Key Fields
- estimatedCLV: Lifetime revenue per customer (€)
- estimatedCAC: Cost to acquire one customer (€)
- monthlyChurnPercent: % who cancel per month
- LTV:CAC = CLV ÷ CAC. Below 2× is risky, above 3× is healthy
- CAGR: Market compound annual growth rate
- tamNL/samNL/somNL: Total/Serviceable/Obtainable market count in Netherlands
- marketSizeScore: Manual 0–100 rating of NL + EU + growth opportunity
- acquisitionDifficulty: Easy / Medium / Hard
- emotionalLoyalty: Low / Medium / High
- brandType: Solution-based (pain-solving) or Aesthetic-Pleasure (desire-driven)
- awarenessLevel: Unaware → Problem-aware → Solution-aware → Product-aware
- storyDepth (0–10): Brand narrative richness and differentiation
- microNichePotential (0–10): Specificity and defensibility of niche
- status: Researching → Shortlisted → Winner (or Killed)
- realMonthlyConsumption: Whether product is genuinely consumed monthly (key for subscriptions)
- CLV=€0 means AI research not yet completed — treat as unscored

## NL Market Context
Operator is based in Netherlands (17.9M population, ~8M households). Dutch regulatory environment (ACM, NVWA, GDPR). All local competitor analysis is NL-focused.

## Category Status Logic
- Killed: consciously rejected — do not recommend reviving unless asked
- Winner: committed — focus on execution
- Shortlisted: prime candidates for comparison
- Researching: needs gap analysis

## How to help
When you receive live portfolio data, immediately:
1. Summarise top 3 opportunities by Decision Score with a one-line verdict
2. Flag categories with LTV:CAC < 2× as financial risk
3. Note any categories with missing CLV (€0) needing research
4. Then wait for specific questions

You excel at: ranking & comparison, gap analysis, financial modelling, ad creative strategy, retention tactics, challenge mode (steelmanning why a winner could fail), adjacent niche discovery, and go/no-go decisions.`;

function buildSessionData(categories: Category[], weights: Weights, maxClv: number): string {
  const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
  const header = `# FlashFace OS — Live Portfolio Data\nGenerated: ${now}\nActive: ${categories.filter(c => c.status !== 'Killed').length} | Total: ${categories.length} | Winners: ${categories.filter(c => c.status === 'Winner').length} | Shortlisted: ${categories.filter(c => c.status === 'Shortlisted').length} | Killed: ${categories.filter(c => c.status === 'Killed').length}\n\nScore Weights: CLV ${weights.clv} | Retention ${weights.retention} | Acquisition ${weights.acquisition} | Market Size ${weights.marketSize} | Loyalty ${weights.loyalty} | Story Depth ${weights.storyDepth} | Micro-Niche ${weights.microNiche}\n\n---\n`;

  const rows = [...categories]
    .sort((a, b) => calculateDecisionScore(b, weights, maxClv) - calculateDecisionScore(a, weights, maxClv))
    .map(c => {
      const score = calculateDecisionScore(c, weights, maxClv);
      const ltvCac = calculateLtvCac(c.estimatedCLV, c.estimatedCAC);
      const sector = getMacroSector(c.industry);
      const lines = [
        `## ${c.name} [${c.status.toUpperCase()}] Score:${score}/100`,
        `Sector: ${sector}${c.industry ? ` (${c.industry})` : ''} | CLV €${c.estimatedCLV} | CAC €${c.estimatedCAC} | LTV:CAC ${ltvCac}x | Churn ${c.monthlyChurnPercent}%${c.cagr ? ` | CAGR ${c.cagr}` : ''}`,
        `Market Score:${c.marketSizeScore}/100 | Acq:${c.acquisitionDifficulty} | Loyalty:${c.emotionalLoyalty} | Brand:${c.brandType} | Story:${c.storyDepth}/10 | Niche:${c.microNichePotential}/10 | Awareness:${c.awarenessLevel}`,
      ];
      if (c.tamNL || c.samNL || c.somNL) lines.push(`NL Funnel: TAM ${c.tamNL?.toLocaleString() ?? '?'} | SAM ${c.samNL?.toLocaleString() ?? '?'} | SOM ${c.somNL?.toLocaleString() ?? '?'}`);
      if (c.targetAudience) lines.push(`Audience: ${c.targetAudience}`);
      if (c.marketSizeNL) lines.push(`NL Market: ${c.marketSizeNL}`);
      if (c.notes) lines.push(`Notes: ${c.notes.slice(0, 200)}`);
      const agents = c.agentResults ?? {};
      const agentKeys: Array<[keyof typeof agents, string]> = [
        ['unitEconomics', 'Unit Econ'], ['marketDynamics', 'Market Dyn'], ['localCompetitors', 'Local Comp'],
        ['globalCompetitors', 'Global Comp'], ['legalLogistics', 'Legal'], ['suppliersBudget', 'Suppliers'],
        ['foundersAndTeam', 'Founders'], ['adIntelligence', 'Ads'], ['retentionEngineering', 'Retention'],
      ];
      for (const [key, label] of agentKeys) {
        const val = agents[key];
        if (val) lines.push(`${label}: ${val.slice(0, 350)}${val.length > 350 ? '…' : ''}`);
      }
      return lines.join('\n');
    });

  return header + rows.join('\n\n---\n\n');
}

const STARTERS = [
  'What are my top 3 opportunities right now?',
  'Which categories have LTV:CAC below 2× (financial risk)?',
  'Compare my Shortlisted categories and recommend one.',
  'Challenge my highest-scoring category — why might it fail?',
  'What adjacent niches should I explore given my winning criteria?',
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5',
        isUser ? 'bg-orange-600/30 border border-orange-500/40' : 'bg-gray-800 border border-gray-700'
      )}>
        {isUser ? <User className="w-3.5 h-3.5 text-orange-400" /> : <Bot className="w-3.5 h-3.5 text-gray-400" />}
      </div>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser
          ? 'bg-orange-600/15 border border-orange-500/20 text-orange-50 rounded-tr-sm'
          : 'bg-gray-900 border border-gray-800 text-gray-200 rounded-tl-sm'
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
    </div>
  );
}

export function ChatGPTView({ categories, weights, maxClv, onGoToSettings }: Props) {
  const apiKey = getOpenAiApiKey();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

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
    return `${SYSTEM_PROMPT}\n\n---\n\n${buildSessionData(categories, weights, maxClv)}`;
  }, [categories, weights, maxClv]);

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

  if (!apiKey) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-gray-950 border border-gray-800 rounded-2xl p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6 text-blue-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-white font-bold text-lg">Add your OpenAI key to start chatting</h2>
            <p className="text-gray-400 text-sm">
              FlashFace connects directly to GPT-4o so you can chat about your portfolio in real time — no copy-pasting.
            </p>
          </div>
          <button
            onClick={onGoToSettings}
            className="flex items-center gap-2 mx-auto px-5 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Add OpenAI Key in Settings
          </button>
          <p className="text-xs text-gray-600">
            Get a key at <span className="text-gray-400 font-mono">platform.openai.com/api-keys</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-900 bg-[#050505]/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-white font-semibold text-sm">FlashFace × GPT-4o</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
            {categories.filter(c => c.status !== 'Killed').length} active categories in context
          </span>
        </div>
        <button
          onClick={handleNewConversation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-2 relative"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 space-y-6">
            <p className="text-gray-500 text-sm">Your full portfolio is loaded. Ask anything.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl text-xs text-gray-300 hover:text-white transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}

        {/* Scroll to bottom */}
        {!atBottom && messages.length > 0 && (
          <div className="sticky bottom-4 flex justify-center">
            <button
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full text-gray-400 hover:text-white shadow-lg transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <span className="text-rose-400">⚠</span>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-500 hover:text-rose-300">✕</button>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-gray-900 bg-[#050505]/80 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <div className="flex-1 bg-gray-900 border border-gray-800 focus-within:border-orange-500/50 rounded-2xl px-4 py-3 transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio… (Enter to send, Shift+Enter for newline)"
              disabled={isStreaming}
              className="w-full bg-transparent text-white text-sm resize-none focus:outline-none placeholder-gray-600 leading-relaxed disabled:opacity-50"
              style={{ minHeight: '24px', maxHeight: '160px' }}
            />
          </div>
          {isStreaming ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl text-rose-400 hover:text-rose-300 transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-orange-600 hover:bg-orange-500 disabled:bg-gray-800 disabled:text-gray-600 border border-orange-500 disabled:border-gray-700 rounded-xl text-white transition-colors shadow-[0_0_15px_-5px_rgba(234,88,12,0.5)] disabled:shadow-none"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-2">
          GPT-4o · Your data is sent to OpenAI when you message · Conversations are not stored
        </p>
      </div>
    </div>
  );
}
