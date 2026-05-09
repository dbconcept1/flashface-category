import { useState } from 'react';
import { DownloadCloud, Copy, FileJson, CheckCircle2, FileText, FileSpreadsheet } from 'lucide-react';
import { Category } from '../types';

interface Props {
  categories: Category[];
}

export function ExportView({ categories }: Props) {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleCopyText = () => {
    const textData = categories.map(c => {
      let output = `- ${c.name} (Target: ${c.targetAudience})`;
      if (c.notes) {
        output += `\n  Notes: ${c.notes.substring(0, 150)}${c.notes.length > 150 ? '...' : ''}`;
      }
      return output;
    }).join('\n\n');

    const promptText = `Here is my current list of e-commerce/niche business categories:\n\n${textData}\n\nBased on this list, can you suggest new, unique, or complementary categories that I haven't found yet?`;

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
    const headers = ['Name', 'Target Audience', 'Status', 'Estimated CLV', 'Estimated CAC', 'Market Size Global', 'Market Size EU', 'Market Size NL', 'Audience Size NL', 'Regulatory Risk NL'];
    const rows = categories.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.targetAudience.replace(/"/g, '""')}"`,
      `"${c.status}"`,
      c.estimatedCLV,
      c.estimatedCAC,
      `"${(c.marketSizeGlobal || '').replace(/"/g, '""')}"`,
      `"${(c.marketSizeEU || '').replace(/"/g, '""')}"`,
      `"${(c.marketSizeNL || '').replace(/"/g, '""')}"`,
      `"${(c.audienceSizeNL || '').replace(/"/g, '""')}"`,
      `"${c.regulatoryRiskNL || ''}"`
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
        {/* Export for AI */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Export for AI Brainstorming</h3>
          <p className="text-sm text-gray-500">
            Copies a formatted text list of all your categories (with notes) tailored for an AI prompt. You can paste this directly into ChatGPT or Claude to ask for new ideas.
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
