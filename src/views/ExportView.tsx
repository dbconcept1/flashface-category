import { useState } from 'react';
import { DownloadCloud, Copy, FileJson, CheckCircle2, FileText, FileSpreadsheet, Globe, Zap } from 'lucide-react';
import { Category } from '../types';
import { calculateDecisionScore, calculateLtvCac } from '../utils';

interface Props {
  categories: Category[];
}

const API_URL = `${window.location.origin}/api/categories`;

export function ExportView({ categories }: Props) {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  /** Rich structured AI context — all fields, scores, market funnels, agent summaries */
  const handleCopyAiContext = () => {
    const maxClv = Math.max(1, ...categories.filter(c => c.status !== 'Killed').map(c => c.estimatedCLV));
    const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    const header = [
      `# FlashFace OS — Full Category Context`,
      `Generated: ${now}`,
      `Total: ${categories.length} | Active: ${categories.filter(c => c.status !== 'Killed').length} | Winners: ${categories.filter(c => c.status === 'Winner').length} | Shortlisted: ${categories.filter(c => c.status === 'Shortlisted').length} | Killed: ${categories.filter(c => c.status === 'Killed').length}`,
      ``,
      `---`,
    ].join('\n');

    const rows = [...categories]
      .sort((a, b) => calculateDecisionScore(b, { clv: 30, retention: 25, acquisition: 20, marketSize: 10, loyalty: 10, storyDepth: 3, microNiche: 2 }, maxClv)
                    - calculateDecisionScore(a, { clv: 30, retention: 25, acquisition: 20, marketSize: 10, loyalty: 10, storyDepth: 3, microNiche: 2 }, maxClv))
      .map(c => {
        const score = calculateDecisionScore(c, { clv: 30, retention: 25, acquisition: 20, marketSize: 10, loyalty: 10, storyDepth: 3, microNiche: 2 }, maxClv);
        const ltvCac = calculateLtvCac(c.estimatedCLV, c.estimatedCAC);
        const lines: string[] = [
          `## ${c.name} [${c.status.toUpperCase()}] — Score: ${score}/100`,
          `**Target:** ${c.targetAudience}${c.industry ? ` | **Sector:** ${c.industry}` : ''}`,
          `**Financials:** CLV €${c.estimatedCLV} | CAC €${c.estimatedCAC} | LTV:CAC ${ltvCac}x | Churn ${c.monthlyChurnPercent}%/mo${c.cagr ? ` | CAGR ${c.cagr}` : ''}`,
          `**Scoring:** Market ${c.marketSizeScore}/100 | Story ${c.storyDepth}/10 | Micro-niche ${c.microNichePotential}/10 | Acq. ${c.acquisitionDifficulty} | Loyalty ${c.emotionalLoyalty}`,
          `**Positioning:** ${c.brandType} | Awareness ${c.awarenessLevel} | Real monthly consumption: ${c.realMonthlyConsumption ? `Yes — ${c.monthlyConsumptionReason}` : 'No'}`,
        ];
        if (c.tamNL || c.samNL || c.somNL) {
          lines.push(`**NL Funnel:** TAM ${c.tamNL?.toLocaleString() ?? '?'} → SAM ${c.samNL?.toLocaleString() ?? '?'} → SOM ${c.somNL?.toLocaleString() ?? '?'}`);
        }
        if (c.funnelBreakdownNL) lines.push(`**Funnel Logic:** ${c.funnelBreakdownNL}`);
        if (c.marketSizeNL) lines.push(`**NL Market:** ${c.marketSizeNL}`);
        if (c.marketSizeGlobal) lines.push(`**Global:** ${c.marketSizeGlobal}`);
        if (c.marketSizeEU) lines.push(`**EU:** ${c.marketSizeEU}`);
        if (c.regulatoryRiskNL) lines.push(`**Regulatory Risk NL:** ${c.regulatoryRiskNL}`);
        if (c.legalAndAdRestrictions) lines.push(`**Legal/Ad:** ${c.legalAndAdRestrictions}`);
        if (c.notes) lines.push(`**Notes:** ${c.notes}`);
        if (c.notionIdea) lines.push(`**Original Idea:** ${c.notionIdea}`);
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
          if (val && !val.startsWith('Error:')) lines.push(`**${label}:**\n${val}`);
        }
        return lines.join('\n');
      });

    const text = header + '\n\n' + rows.join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
    setCopiedType('aiContext');
    setTimeout(() => setCopiedType(null), 3000);
  };

  const handleCopyText = () => {
    const maxClv = Math.max(1, ...categories.filter(c => c.status !== 'Killed').map(c => c.estimatedCLV));
    const textData = categories.map(c => {
      const ltvCac = calculateLtvCac(c.estimatedCLV, c.estimatedCAC);
      const lines = [
        `- **${c.name}** [${c.status}] (Score: ${calculateDecisionScore(c, { clv: 30, retention: 25, acquisition: 20, marketSize: 10, loyalty: 10, storyDepth: 3, microNiche: 2 }, maxClv)}/100)`,
        `  Target: ${c.targetAudience} | CLV €${c.estimatedCLV} | CAC €${c.estimatedCAC} | LTV:CAC ${ltvCac}x | Churn ${c.monthlyChurnPercent}%/mo`,
        `  ${c.brandType} | Loyalty ${c.emotionalLoyalty} | Acq. ${c.acquisitionDifficulty}`,
      ];
      if (c.tamNL || c.somNL) lines.push(`  NL Funnel: TAM ${c.tamNL?.toLocaleString() ?? '?'} → SOM ${c.somNL?.toLocaleString() ?? '?'}`);
      if (c.notes) lines.push(`  Notes: ${c.notes.substring(0, 200)}${c.notes.length > 200 ? '…' : ''}`);
      return lines.join('\n');
    }).join('\n\n');

    const promptText = `Here is my current FlashFace category portfolio (Dutch DTC subscription business):\n\n${textData}\n\nBased on this portfolio, can you suggest new, unique, or complementary categories that I haven't found yet? Focus on categories with high CLV (€500+), low churn (<7%), and strong Dutch market entry potential.`;

    navigator.clipboard.writeText(promptText);
    setCopiedType('text');
    setTimeout(() => setCopiedType(null), 3000);
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categories, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "flashface_categories_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    setCopiedType('json');
    setTimeout(() => setCopiedType(null), 3000);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Target Audience', 'Status', 'Estimated CLV', 'Estimated CAC', 'Monthly Churn %', 'CAGR', 'Market Size Global', 'Market Size EU', 'Market Size NL', 'Audience Size NL', 'TAM NL', 'SAM NL', 'SOM NL', 'Funnel Breakdown NL', 'Regulatory Risk NL', 'Brand Type', 'Story Depth', 'Micro-niche Potential', 'Acquisition Difficulty', 'Emotional Loyalty'];
    const rows = categories.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.targetAudience.replace(/"/g, '""')}"`,
      `"${c.status}"`,
      c.estimatedCLV,
      c.estimatedCAC,
      c.monthlyChurnPercent,
      `"${(c.cagr || '').replace(/"/g, '""')}"`,
      `"${(c.marketSizeGlobal || '').replace(/"/g, '""')}"`,
      `"${(c.marketSizeEU || '').replace(/"/g, '""')}"`,
      `"${(c.marketSizeNL || '').replace(/"/g, '""')}"`,
      `"${(c.audienceSizeNL || '').replace(/"/g, '""')}"`,
      c.tamNL ?? '',
      c.samNL ?? '',
      c.somNL ?? '',
      `"${(c.funnelBreakdownNL || '').replace(/"/g, '""')}"`,
      `"${c.regulatoryRiskNL || ''}"`,
      `"${c.brandType || ''}"`,
      c.storyDepth,
      c.microNichePotential,
      `"${c.acquisitionDifficulty}"`,
      `"${c.emotionalLoyalty}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(',') + '\n' 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "flashface_categories.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    setCopiedType('csv');
    setTimeout(() => setCopiedType(null), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold text-white capitalize tracking-tight flex items-center">
          <DownloadCloud className="w-6 h-6 mr-3 text-orange-500" />
          Export Data
        </h2>
        <p className="text-gray-400">
          Export your categories for backups, analysis, or to brainstorm new ideas with AI.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Full AI Context Package — new primary card */}
        <div className="bg-[#111111] border border-orange-500/20 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Full AI Context Package</h3>
          <p className="text-sm text-gray-500">
            Rich structured markdown with every field — CLV, CAC, LTV:CAC, TAM→SOM funnels, all 9 agent research reports, scores — ready to paste into ChatGPT, Claude, or Gemini for deep analysis.
          </p>
          <div className="pt-4">
            <button
              onClick={handleCopyAiContext}
              className="w-full flex items-center justify-center px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium transition-colors"
            >
              {copiedType === 'aiContext' ? (
                <><CheckCircle2 className="w-5 h-5 mr-2" /> Copied Full Context</>
              ) : (
                <><Copy className="w-5 h-5 mr-2" /> Copy Full AI Context ({categories.length} categories)</>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-600">Includes all agent reports untruncated. Use in ChatGPT → Export &amp; Analyse.</p>
        </div>

        {/* Export for AI Brainstorming */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Quick Brainstorm Prompt</h3>
          <p className="text-sm text-gray-500">
            Compact summary of all categories with key metrics — paste into any AI to ask for new niche ideas you haven't researched yet.
          </p>
          <div className="pt-4">
            <button
              onClick={handleCopyText}
              className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
            >
              {copiedType === 'text' ? (
                <><CheckCircle2 className="w-5 h-5 mr-2" /> Copied Prompt</>
              ) : (
                <><Copy className="w-5 h-5 mr-2" /> Copy AI Prompt</>
              )}
            </button>
          </div>
        </div>

        {/* REST API card */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4">
            <Globe className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Live REST API</h3>
          <p className="text-sm text-gray-500">
            Your data is available as a live JSON endpoint — any external tool, script, Zapier/Make.com automation, or AI can pull the full category database at any time.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 font-mono text-xs text-emerald-400 break-all">
            GET {API_URL}
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            <p>• GET returns all categories as structured JSON</p>
            <p>• POST replaces the full dataset (used internally for sync)</p>
            <p>• Runs only while the dev server is active</p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(API_URL); setCopiedType('api'); setTimeout(() => setCopiedType(null), 3000); }}
            className="w-full flex items-center justify-center px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors border border-gray-700 text-sm"
          >
            {copiedType === 'api' ? (
              <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" /> URL Copied</>
            ) : (
              <><Copy className="w-4 h-4 mr-2" /> Copy API URL</>
            )}
          </button>
        </div>

        {/* Export JSON */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mb-4">
            <FileJson className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Full JSON Backup</h3>
          <p className="text-sm text-gray-500">
            Download a complete raw JSON file containing all your data, metrics, notes, and research. Ideal for backups or importing back later.
          </p>
          <div className="pt-4">
            <button
              onClick={handleExportJSON}
              className="w-full flex items-center justify-center px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors border border-gray-700"
            >
              {copiedType === 'json' ? (
                <><CheckCircle2 className="w-5 h-5 mr-2" /> Downloaded</>
              ) : (
                <><FileJson className="w-5 h-5 mr-2" /> Download JSON</>
              )}
            </button>
          </div>
        </div>

        {/* Export CSV */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4 md:col-span-2">
          <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-6 h-6 text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Export as CSV</h3>
          <p className="text-sm text-gray-500">
            Download a basic spreadsheet of your categories and unit economics. Useful for financial modeling or sharing with stakeholders.
          </p>
          <div className="pt-4 flex justify-end">
             <button
              onClick={handleExportCSV}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors border border-gray-700 flex items-center"
            >
              {copiedType === 'csv' ? (
                <><CheckCircle2 className="w-5 h-5 mr-2" /> Downloaded</>
              ) : (
                <><FileSpreadsheet className="w-5 h-5 mr-2" /> Download CSV</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
