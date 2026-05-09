import { useState } from 'react';
import { Terminal, Copy, CheckCircle2 } from 'lucide-react';

export function PromptsView() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const prompts = [
    {
      id: "resume-prompt",
      title: "RESUME PROMPT – Elite Category OS (Pure Search Methodology)",
      description: "Use this prompt to restart conversations with AI, maintaining all your rules and criteria.",
      content: `You are my strategic partner in finding the single best first-win consumer product category for a high-growth DTC subscription business starting in the Netherlands.
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
Market Size & Growth | 10% | Big or fast-growing, not hyper-competitive on price | Room to scale without immediate price wars
Emotional Loyalty + Story Depth | 10% | High – people get attached and stay long-term | Strong storytelling potential and brand building
Brand Type | — | Solution-based preferred | Solution-based beats pure aesthetic/pleasure for retention
Micro-niche Potential | — | 1–10 score | How specific can we get without killing market size?
Audience Awareness Level | — | Match our angle to current customer awareness | Avoid wasting money on wrong messaging

Overall Decision Score = Weighted calculation using the factors above. Higher score = better.

Core Philosophy & Theory (Always Apply This)
CLV:CAC ratio is more important than raw CLV in the early stage.
Real monthly consumption is non-negotiable. People must genuinely run out and feel pain when they do.
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

Important Rule
At the end of every message I send you, I will paste the current list of categories we have already analyzed in detail.
Your job is to find fresh, new categories we haven’t talked about yet that fit the criteria above. Never suggest anything from the list I paste.`
    }
  ];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold text-white capitalize tracking-tight flex items-center">
          <Terminal className="w-6 h-6 mr-3 text-orange-500" />
          AI Prompts Library
        </h2>
        <p className="text-gray-400">
          Store and manage specific prompts to use in your other AI conversations to maintain your OS parameters.
        </p>
      </div>

      <div className="space-y-6">
        {prompts.map(prompt => (
          <div key={prompt.id} className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-200">{prompt.title}</h3>
                <p className="text-sm text-gray-400 mt-1">{prompt.description}</p>
              </div>
              <button
                onClick={() => handleCopy(prompt.id, prompt.content)}
                className="shrink-0 flex items-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors border border-gray-700"
              >
                {copiedId === prompt.id ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" /> Copy Prompt</>
                )}
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto max-h-96">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                {prompt.content}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
