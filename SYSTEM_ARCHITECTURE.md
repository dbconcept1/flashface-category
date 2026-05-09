# System Architecture & Application Design Document

## 1. High-Level Overview
The application is a **Category Evaluation & Intelligence Hub** designed for private equity, venture builders, or e-commerce founders. It allows users to track, evaluate, and intensely research business categories or specific companies. It uses a heavily quantitative, math-backed scoring algorithm combined with a multi-agent AI swarm (using Google Gemini 3.1 Pro) that conducts autonomous market research using real-time search data.

### Tech Stack
*   **Frontend Framework:** React 18 with TypeScript.
*   **Build Tool:** Vite.
*   **Styling:** Tailwind CSS (utility-first, responsive, dark-mode native design).
*   **Icons:** Lucide React.
*   **Markdown Parsing:** `react-markdown` with `remark-gfm`.
*   **AI Integration:** `@google/genai` (Gemini API with Structured JSON output and Google Search Grounding).
*   **Utility:** `string-similarity` (for algorithmic automated deduplication).

---

## 2. Mathematical Scoring Engine (`src/utils.ts`)
The core of the application's decision-making relies on the `calculateDecisionScore` algorithm. The algorithm produces an "Expected Value Index" (or Decision Score) by combining exact financial constraints with qualitative multipliers.

### Base Metrics and Multipliers
1.  **LTV:CAC Ratio (Unit Economics Core):**
    *   *Formula:* `CLV / CAC`.
    *   If CAC is 0, ratio defaults to 0. Capped at a maximum of `10x` to prevent extreme outliers from breaking the scoring model.
2.  **Relative CLV Strength:**
    *   *Formula:* `Estimated CLV / Max CLV in Dataset`.
    *   Scales the value of the category against the highest value category being tracked, preventing small-ticket items with good ratios from outscoring massive-ticket items falsely.
3.  **Churn Penalty:**
    *   *Formula:* `(100 - Monthly Churn Percent) / 100`.
    *   Acts as a decaying multiplier. High churn severely punishes the final score.
4.  **Market Size & Retention:**
    *   *Market Size Base:* `Market Size Score (1-10) / 10`.
    *   *Real Monthly Consumption Boost:* If true, adds a `0.1` flat multiplier boost to represent recurring organic purchasing behavior.
5.  **Qualitative Mechanics (Multipliers):**
    *   **Acquisition Difficulty:** Easy = `1.2`, Medium = `1.0`, Hard = `0.8`.
    *   **Emotional Loyalty:** High = `1.2`, Medium = `1.0`, Low = `0.8`.
    *   **Awareness Level:** Problem Aware = `1.1`, Solution Aware = `1.0`, Unaware = `0.8` (harder to convert, requires education).
    *   **Story Depth:** Scale of `1-10` normalized by dividing by 10. `1 + (Score / 10)`.
    *   **Micro-Niche Potential:** Scale of `1-10` normalized by dividing by 10. `1 + (Score / 10)`.

### The Master Equation
```javascript
let score = 0;
// Base Structural Score based on weights (default weights provided, adjustable via UI)
score += (ltvCac / 10) * weights.clv; 
score += clvStrength * weights.clv;
score += retentionMult * weights.churn;
score += (marketSizeBase + monthlyConsumptionBoost) * weights.marketSize;

// Multipliers Applied to Base
score *= acqMult;
score *= loyaltyMult;
score *= awarenessMult;
score *= storyMult;
score *= nicheMult;

return Number(score.toFixed(2));
```

---

## 3. Autonomous AI Swarm Architecture (`src/services/aiService.ts`)
The application utilizes an advanced "Swarm" of specialized AI Agents. Instead of asking the AI one massive prompt, the system spins up 7 distinct, highly-prompted agents sequentially. Each agent enforces `responseSchema` (Structured JSON) and uses `tools: [{ googleSearch: {} }]`.

### The 7 Intelligence Agents
1.  **Unit Economics Agent:** Extracts exact CAC and CLV figures. Instructed specifically to use advanced search parameters (e.g., specific subreddits, PDFs) to pull real scientific or leaked street-level data, separating CLV and CAC logically.
2.  **Market Dynamics Agent:** Extracts Monthly Churn, CAGR (percentage over 5 years), and exact market sizes for Global, EU, and NL (Netherlands) levels, producing a markdown report.
3.  **Local Competitors Agent (NL/EU):** A competitive intelligence operative that uses "intitle:review" footprints to isolate actual local competitors, their pricing models, and specific positioning.
4.  **Global Competitors Agent (US/Global):** Scans for pioneer companies globally. Instructed to pull transcripts and Reddit/LinkedIn breakdowns to discover the "secret sauce" and tech stacks of massive players.
5.  **Founders & Team Agent:** An investigative agent designed to use Dorks (`site:linkedin.com/in/`) to find the exact names, backgrounds, prior exits, and podcast interviews of top founders in the space.
6.  **Legal & Logistics Agent:** Investigates EU/NL exact compliance risks (Low/Medium/High). Identifies required licenses and Meta/Google ad restrictions.
7.  **Suppliers & Budget Agent:** Scraps Alibaba footprints and dropship subreddits to report if the MVP can be realistically sourced, what the budget is, and lists actual supplier hubs.

All raw Markdown reports and sources are merged into `agentResults` under the Category object.

---

## 4. The Data Ingestion Engine & Queue (`src/views/ImportView.tsx`)
The extraction module handles large unstructured data, PDFs, and images (screenshots), and transforms them into strictly typed `Category` objects.

### Document Queue & Chunking
*   Users can upload multiple files at once.
*   The system creates a `DocumentTask` for each file and places it in an asynchronous queue.
*   **Text/CSV/MD:** Split into `40,000` character chunks. The queue processes chunks sequentially to prevent context-limit exhaustion, appending new items.
*   **PDF:** Converted to Base64 and sent to the multimodal Gemini 3.1 Pro model. Continues querying iteratively until the model reports no more categories found.
*   **Screenshots (Image/Vision):** Uses `extractCompanyFromImage`. Acts as a Private Equity analyst looking at a screenshot of a website/feed. Extracts exact company figures, funding, tech stack, and places the resulting extracted business model into the correct category (or generates a new one).

### Algorithmic Deduplication (`string-similarity`)
When importing data, the system evaluates all newly extracted category names against the existing tracked database using the Dice's Coefficient (`string-similarity.findBestMatch()`).
*   If similarity is `> 0.85`, it intercepts the creation.
*   It logs: "Merging duplicate: X into Y".
*   It merges the unstructured research `notes` of the new entity into the matched existing entity instead of creating a duplicate.

---

## 5. UI/UX & Views Design
The application features a sleek, purely dark mode interface (`bg-[#111111]` backdrop) using Tailwind CSS and Lucide icons.

### Views Directory
1.  **Dashboard (`DashboardView`):**
    *   Metric cards (Active Categories, Shortlisted).
    *   Top 3 Highlight Matrix (rendering best categories with detailed data spans).
    *   Interactive Range Sliders to adjust the mathematical `weights` affecting the final score in real-time.
2.  **Categories Sandbox (`CategoriesView`):**
    *   Dual layout toggle (Grid with cards vs. Table with dense rows).
    *   Real-time keyword search and categorical filtering based on Status (`Researching`, `Shortlisted`, `Winner`, `Killed`, `Passed`).
    *   Action hub to trigger "Deep Search All New" (triggers AI on items without unit econ data) or "Refresh Researched".
3.  **Executive Decision Matrix (`ComparisonView`):**
    *   The ultimate density view. Displays categories in a spreadsheet-like structure with sticky headers and columns.
    *   *Heatmap Engine:* Uses a `getHeatmapClass` helper to calculate the array of all visible values for a metric. Applies bold emerald highlighting to the absolute best value in a row, and crimson highlighting to the worst (e.g., highlights the highest LTV:CAC, but the lowest Churn).
4.  **Edit Category (`EditCategoryView`):**
    *   A massive, structured form view.
    *   Contains the **AI Agent Raw Reports** section. This area dynamically renders tabs for `Unit Economics`, `Market Dynamics`, `Founders & Team`, etc.
    *   The content inside the tabs is rendered natively using `react-markdown`.
5.  **Export (`ExportView`):** Allows exporting the entire JSON database to file for backup.

### Theming & Typography
*   **Typography:** Strict `font-sans` for layout elements, and `font-mono` exclusively reserved for specific data points (Scores, Percentages, Currency), giving it a financial-terminal aesthetic.
*   **Color Theory:**
    *   Base: `gray-900` to `black (#111111)`.
    *   Borders: `gray-800` to give precise separation.
    *   Action Primary: `orange-600` containing inset shadow bounds.
    *   Success/Best: `emerald-400` with `emerald-500/10` background shading.
    *   Warning/Error: `rose-400`.

---

## 6. State Management & Persistence (`src/App.tsx`)
*   The application does not use external databases.
*   State is entirely localized in React (`useState`) and persisted deeply via `useEffect` hooks writing seamlessly to standard `localStorage` under `flashface_categories`.
*   Includes a master startup `useEffect` that runs an initial hard deduplication sweep on boot to clean any corrupted datasets.
*   Tasks queues, research progress overlays, and modal views are heavily component-driven, ensuring no UI blocking occurs while massive background API calls happen.

---

### Conclusion
This application is essentially an automated, mathematically constrained Private Equity / E-commerce analyst operating in a browser. It ingests infinite unstructured data, classifies it, runs 7-agent deep searches utilizing state-of-the-art Dorking/Scraping prompts, and organizes it into a visual, executive-level comparison matrix.
