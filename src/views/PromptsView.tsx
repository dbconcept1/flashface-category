import { useState } from 'react';
import { Terminal, Copy, CheckCircle2 } from 'lucide-react';

export function PromptsView() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const prompts = [
    {
      id: "resume-prompt",
      title: "RESUME PROMPT — Elite Category OS (with Data Integrity Rules)",
      description: "Use this to restart any AI session. Includes anti-hallucination rules, TAM→SOM methodology, and full scoring framework.",
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
Be brutally honest — if a category doesn't meet the criteria, say so clearly with reasoning.
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
Your job is to find fresh, new categories we have not talked about yet that fit the criteria above. Never suggest anything from the list I paste.`
    },
    {
      id: "which-to-launch",
      title: "DECISION PROMPT — Which Category Should I Launch First?",
      description: "Paste this + your FlashFace session data (from the ChatGPT view) to get a clear go/no-go decision on your top candidates.",
      content: `I'm going to paste my full FlashFace portfolio data below. I need you to act as a ruthless venture advisor and give me a clear launch recommendation.

Your task:
1. Identify the top 3 categories by combined score + unit economics (LTV:CAC >= 3x required)
2. For each, give a one-paragraph "why this wins" and a one-paragraph "why this could fail"
3. Recommend ONE category to launch first and justify it in 3-5 bullet points
4. For the recommended category, give me 3 concrete first actions for the next 30 days

Hard constraints:
- The category must have real monthly consumption (people genuinely run out)
- LTV:CAC must be at least 3x at estimated metrics (ideally 5x+)
- Must be executable from the Netherlands with white-label or low-MOQ supply
- I need realistic TAM->SOM sizing — not inflated numbers

Be brutally honest. If none of my top candidates are ready to launch, tell me why and what's missing.

[PASTE YOUR FLASHFACE SESSION DATA HERE — copy from the ChatGPT view]`
    },
    {
      id: "investment-memo",
      title: "INVESTMENT MEMO — Generate a One-Page Memo for [Category]",
      description: "Turn your FlashFace research into a concise investor-style memo for any category.",
      content: `I'm going to paste the full research data for one of my FlashFace categories. Please write a one-page investment memo in the following structure:

FORMAT:

## [Category Name] — Investment Memo

**The Opportunity** (2-3 sentences: what pain it solves, who it's for, why now)

**Market Sizing (Netherlands)**
- TAM: [number] — [source/logic]
- SAM: [number] — [filter logic]
- SOM: [number] — [conservative capture % and why]

**Unit Economics**
- Customer Lifetime Value: EUR [X]
- Customer Acquisition Cost: EUR [X]
- LTV:CAC: [X]x
- Monthly Churn: [X]%
- Payback Period: [X] months

**Competitive Landscape** (3-5 bullet points on direct and indirect competitors, gaps)

**Why We Win** (3 bullet points: our specific edge — sourcing, story, niche, timing)

**Key Risks** (3 bullet points, honest)

**Verdict** (one sentence: Launch / Shortlist / Kill and why)

---

[PASTE THE FULL RESEARCH FOR ONE CATEGORY BELOW:]
(Copy from: FlashFace -> Edit Category -> all 9 agent research tabs + metrics panel)`
    },
    {
      id: "competitive-gaps",
      title: "PORTFOLIO AUDIT — Find the Gaps and Blind Spots",
      description: "Paste your full portfolio to identify what is missing, what is overlapping, and where you are exposed.",
      content: `I'm going to paste my full FlashFace portfolio. I need a strategic portfolio audit.

Your analysis must cover:

1. **Sector concentration risk** — Am I over-indexed in any one sector? What happens if that sector gets disrupted?

2. **Missing high-value niches** — Given my scoring criteria (CLV EUR 500+, churn <7%, solution-based, NL-friendly), what obvious high-potential categories are absent?

3. **Overlapping categories** — Which of my categories compete for the same audience or supply chain? Is this a risk or a moat?

4. **Weakest links** — Which categories have the worst LTV:CAC ratio or highest CAC? Should any be killed?

5. **Research gaps** — Which categories have missing or incomplete AI research (blank fields, no TAM/SOM, no agent reports)?

6. **Timing risk** — Which categories are trend-dependent and might close their window in 2025-2026?

7. **One hidden gem** — Is there a low-scoring category that is undervalued by my current weights?

Be specific, reference category names, and give me actionable recommendations.

[PASTE YOUR FLASHFACE SESSION DATA HERE — copy from the ChatGPT view]`
    },
    {
      id: "validate-category",
      title: "VALIDATION PROMPT — Stress-Test a Single Category",
      description: "Deep-dive validation on one category. Paste the category's full research + this prompt to get the hardest questions answered.",
      content: `I'm going to describe a DTC subscription category I'm seriously considering launching. I need you to stress-test it.

For each of these 8 areas, give me a RED / AMBER / GREEN rating + 2-3 sentences of reasoning:

1. **Monthly Consumption Reality** — Do customers genuinely run out monthly? What is the mechanism that forces repurchase?

2. **Unit Economics at Scale** — Is the LTV:CAC ratio realistic at 100 customers? At 1000? What breaks it?

3. **Netherlands Supply Chain** — Can this be sourced white-label in the EU with MOQ under 500 units? Where from?

4. **Dutch Market Size (SOM)** — Using realistic TAM->SAM->SOM logic, how many paying subscribers could exist in NL in year 2?

5. **CAC Reality Check** — What is the realistic cost to acquire one customer in NL through Meta / TikTok / Google ads? Provide benchmarks.

6. **Churn Drivers** — What are the top 3 reasons a customer would cancel? How do we retain them?

7. **Competitive Moat** — What stops a bigger brand from copying this in 6 months? What is the defensible edge?

8. **Regulatory Risk** — Any NVWA, ACM, or EU regulations that complicate launch? Age restrictions, health claims bans, etc.?

Final verdict: GO / NO-GO / NEEDS MORE RESEARCH — and be honest about the weakest element.

[PASTE THE CATEGORY NAME AND ALL AVAILABLE RESEARCH BELOW:]`
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
          Prompts engineered for your FlashFace workflow. Copy any prompt, add your data from the{' '}
          <span className="text-orange-400 font-medium">ChatGPT</span> or{' '}
          <span className="text-orange-400 font-medium">Export</span> views, and paste into any AI.
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
