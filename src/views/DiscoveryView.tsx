import React, { useState } from 'react';
import { Sparkles, StopCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { discoverDtcCategories, DiscoveryProgress } from '../services/aiService';
import { Category } from '../types';

interface Props {
  isDiscovering: boolean;
  progress: DiscoveryProgress | null;
  error: string | null;
  onStart: (prompt: string) => void;
  onStop: () => void;
  onClose: () => void;
}

const DEFAULT_PROMPT = `You are my strategic partner in finding the single best first-win consumer product category for a high-growth DTC subscription business starting in the Netherlands.

Our Core Vision
We want to build something big and profitable from a completely white canvas. Our goal is to find categories that can realistically deliver:

High Customer Lifetime Value (€500–€850+)
Strong built-in retention through real monthly or daily consumption (not placebo or gimmick)
Excellent subscription economics from day one
Low-to-medium risk to start, with serious long-term upside
Easy and realistic entry from the Netherlands (low MOQ, white-label friendly, no custom formulation needed)

Non-Negotiable Criteria (Use These to Score Every Category)
Every category must be evaluated against these weighted factors:

Factor | Weight | Target / Ideal | Why It Matters
--- | --- | --- | ---
CLV Potential | 30% | €500 – €850+ | The most important number for long-term profitability and scaling
Retention / Monthly Churn | 25% | < 7–9% (ideally < 6%) | Real monthly/daily run-out, not placebo. High emotional attachment
Acquisition Ease (CAC) | 20% | Realistic CAC €25–€60 in Netherlands | Must be profitable to acquire customers from day one
LTV:CAC Ratio | — | Minimum 4x, ideally 5–8x+ | The real health metric of the business
Market Size & Growth | 10% | Harshly calculated SOM | Room to scale without immediate price wars, but MUST be realistic.
Emotional Loyalty + Story Depth | 10% | High – people get attached and stay long-term | Strong storytelling potential and brand building
Brand Type | — | Solution-based preferred | Solution-based beats pure aesthetic/pleasure for retention
Micro-niche Potential | — | 1–10 score | How specific can we get without killing market size?
Audience Awareness Level | — | Match our angle to current customer awareness | Avoid wasting money on wrong messaging

Core Philosophy & Theory (Always Apply This)
CLV:CAC ratio is more important than raw CLV in the early stage.
Real monthly consumption is non-negotiable. People must genuinely run out and feel pain when they do.
Strict TAM/SAM/SOM market sizing is MANDATORY. Never overestimate. If a niche targets older men for a tech product, you must filter out non-tech literate people. If it targets a specific minority group, you must use their actual population size in the NL, filtered for their income bracket and age. Be brutal with audience sizing.
Solution-based categories > Aesthetic/Pleasure categories for retention and CLV.
Micro-niches win in 2025–2026 — being hyper-specific lowers CAC and increases retention.
Story > Product — the same product with a stronger emotional story wins.
Subscription-first from day one — we are not building one-time purchase businesses.
Low risk at the beginning + serious long-term upside — we want a strong first win we can actually execute.
Netherlands reality: Low MOQ, white-label friendly, no custom formulation needed, realistic ad costs, consumer behavior, and regulations.

How to Search for New Categories
When I ask you to search for or evaluate new categories, you must:

Look super wide across stable big markets and fast-emerging 2025–2026 trends (US + Europe + global).
Focus only on categories with real monthly/daily run-out and emotional attachment.
Prioritize categories where people feel real pain when they run out.
Look for strong subscription potential and high emotional loyalty.
Check for easy Netherlands entry (sourcing, regulations, competition, ad costs).
Always compare against the general benchmarks of high-CLV (€500+), low-churn (<7–9%), solution-based categories.
Be brutally honest — if a category doesn’t meet the criteria, say so clearly with reasoning.
Highlight any new angles, micro-niche opportunities, or fresh 2025–2026 trends I might have missed.
Data Integrity — Absolute Rules (Never Violate)
1. Every statistic you return (CLV, CAC, churn %, market size, audience size) MUST come from a real source you find via web search in this session. If no real source is found, return 0 for that numeric field — never fabricate or extrapolate.
2. Every category you suggest MUST have at least one real, named, currently operating business already serving it, confirmed by search. If no such business exists, the category does not yet exist as a real market — do not suggest it.
3. Never copy financial metrics from training-data memory without live search re-verification. Training data is stale and unreliable for specific market metrics.
4. For NL audience sizes: always show your full TAM→SAM→SOM funnel with each filter step and its source URL (CBS.nl, government data, or credible research). Never output an audience number without the funnel.
5. LinkedIn URLs: only include a URL if you actually retrieved it via Google Search in this session. Never construct or guess a URL from a person's name — invented URLs destroy credibility.
6. If a category cannot be validated with at least one live search result proving real demand, omit it entirely. One real sourced category is worth more than ten invented ones.
Important Rule
At the end of every message I send you, I will paste the current list of categories we have already analyzed in detail.
Your job is to find fresh, new categories we haven’t talked about yet that fit the criteria above. Never suggest anything from the list I paste.`;

export function DiscoveryView({ isDiscovering, progress, error, onStart, onStop, onClose }: Props) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const handleLaunchSwarm = () => {
    onStart(prompt);
  };

  const handleStopSwarm = () => {
    onStop();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#f0f0f0] tracking-tight">Autonomous Category Discovery Swarm</h2>
          <p className="text-sm text-[#666]">Deploy agents across every consumer vertical to discover untracked niches.</p>
        </div>
        <button 
          onClick={onClose}
          className="text-sm text-[#484848] hover:text-[#f0f0f0]"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[#666] mb-4">Discovery Constraints & Prompt</h3>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={isDiscovering}
            className="w-full h-80 bg-[#111] border border-[#1e1e1e] text-sm text-[#aaa] rounded-lg p-4 font-mono focus:outline-none focus:border-[#e05000] resize-none"
            placeholder="Enter the rules for the swarm..."
          />
          <div className="mt-4 flex justify-end">
            {!isDiscovering ? (
              <button
                onClick={handleLaunchSwarm}
                className="flex items-center px-4 py-2 bg-emerald-600/20 text-[#4ade80] border border-emerald-500/50 rounded-lg font-bold hover:bg-emerald-600/30 transition-colors"
                title="Launch the AI Swarm to endlessly hunt for new categories"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Launch Endless Swarm
              </button>
            ) : (
              <button
                onClick={handleStopSwarm}
                className="flex items-center px-4 py-2 bg-rose-500/20 text-[#f87171] border border-rose-500/50 rounded-lg font-bold hover:bg-rose-500/30 transition-colors shadow-[0_0_15px_-3px_rgba(244,63,94,0.5)]"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Abort Swarm
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-6 flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[#666] mb-4">Live Swarm Feed</h3>
          
          <div className="flex-1 bg-[#111] rounded-lg border border-[#1e1e1e] p-4 font-mono text-xs overflow-y-auto space-y-2 h-80">
            {!isDiscovering && !progress && !error && (
              <p className="text-[#3a3a3a]">Awaiting swarm launch...</p>
            )}
            
            {error && (
              <div className="text-[#f87171] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p>SYSTEM FAILURE: {error}</p>
              </div>
            )}

            {progress && (
              <div className="space-y-4">
                <div className="text-[#e05000] font-bold border-b border-[#e05000]/15 pb-2">
                  [MASTER CONTROL] {progress.status}
                </div>
                
                {progress.industriesTrawled > 0 && (
                  <p className="text-[#666]">
                    Industries Scheduled: <span className="text-[#4ade80]">{progress.totalIndustries}</span> <br/>
                    Successfully Trawled: <span className="text-[#4ade80]">{progress.industriesTrawled}</span>
                  </p>
                )}

                {progress.logs.map((log, i) => (
                  <div key={i} className="text-[#aaa]">
                    {log}
                  </div>
                ))}

                {isDiscovering && (
                  <div className="flex gap-1 items-center mt-4 text-[#4ade80]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse delay-75" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse delay-150" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
