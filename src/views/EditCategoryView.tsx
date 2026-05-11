import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Category, CategoryStatus, AcquisitionDifficulty, EmotionalLoyalty, BrandType, AwarenessLevel } from '../types';
import { calculateLtvCac, cn } from '../utils';
import { Save, ArrowLeft, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { agenticDeepResearchCategory, ResearchProgress } from '../services/aiService';

interface Props {
  category: Category | null;
  onSave: (cat: Category) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  onPartialUpdate?: (update: Partial<Category>) => void;
  onSpendingChange?: () => void;
}

const defaultCategory: Omit<Category, 'id' | 'lastUpdated'> = {
  name: '',
  industry: '',
  targetAudience: '',
  realMonthlyConsumption: true,
  monthlyConsumptionReason: '',
  estimatedCLV: 0,
  estimatedCAC: 0,
  monthlyChurnPercent: 0,
  marketSizeNL: '',
  marketSizeGlobal: '',
  marketSizeEU: '',
  audienceSizeNL: '',
  tamNL: 0,
  samNL: 0,
  somNL: 0,
  funnelBreakdownNL: '',
  cagr: '',
  regulatoryRiskNL: 'Medium',
  legalAndAdRestrictions: '',
  researchSources: [],
  marketSizeScore: 50,
  acquisitionDifficulty: 'Medium',
  emotionalLoyalty: 'Medium',
  storyDepth: 5,
  brandType: 'Solution-based',
  microNichePotential: 5,
  awarenessLevel: 'Problem-aware',
  status: 'Researching',
  notes: '',
};

export function EditCategoryView({ category, onSave, onCancel, onDelete, onPartialUpdate, onSpendingChange }: Props) {
  const [formData, setFormData] = useState<Partial<Category>>(category || defaultCategory);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancingStatus, setEnhancingStatus] = useState<ResearchProgress | null>(null);
  const [activeTab, setActiveTab] = useState<'unitEconomics' | 'marketDynamics' | 'localCompetitors' | 'globalCompetitors' | 'foundersAndTeam' | 'legalLogistics' | 'suppliersBudget' | 'adIntelligence' | 'retentionEngineering' | 'searchTrends'>(() => {
    if (!category || !category.agentResults) return 'unitEconomics';
    const keys: Array<'unitEconomics' | 'marketDynamics' | 'localCompetitors' | 'globalCompetitors' | 'foundersAndTeam' | 'legalLogistics' | 'suppliersBudget' | 'adIntelligence' | 'retentionEngineering' | 'searchTrends'> = [
      'unitEconomics', 'marketDynamics', 'localCompetitors', 'globalCompetitors', 
      'foundersAndTeam', 'legalLogistics', 'suppliersBudget', 'adIntelligence', 'retentionEngineering', 'searchTrends'
    ];
    for (const k of keys) {
      if (category.agentResults[k]) return k;
    }
    return 'unitEconomics';
  });

  useEffect(() => {
    if (category) {
      setFormData(category);
    } else {
      setFormData(defaultCategory);
    }
  }, [category]);

  const handleChange = (field: keyof Category, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      alert('Category name is required.');
      return;
    }
    if (!formData.targetAudience?.trim()) {
      alert('Target audience is required — it is used in every AI research prompt.');
      return;
    }

    const newCat: Category = {
      ...defaultCategory,
      ...formData,
      id: formData.id || crypto.randomUUID(),
      lastUpdated: new Date().toISOString()
    } as Category;

    onSave(newCat);
  };

  const handleDeepSearch = async () => {
    if (!formData.name) {
      alert("Please enter a category name first.");
      return;
    }
    try {
      setIsEnhancing(true);
      const enriched = await agenticDeepResearchCategory(
        formData as Category, 
        (progress) => setEnhancingStatus(progress),
        (partialUpdate) => {
          setFormData(prev => ({
            ...prev,
            ...partialUpdate,
            agentResults: {
              ...(prev.agentResults || {}),
              ...(partialUpdate.agentResults || {})
            }
          }));
          onPartialUpdate?.(partialUpdate);
        }
      );
      const merged = {
        ...enriched,
        agentResults: {
          ...(formData.agentResults || {}),
          ...(enriched.agentResults || {})
        }
      };
      setFormData(prev => ({ ...prev, ...merged }));
      onPartialUpdate?.(merged);
    } catch (e: any) {
      alert("Deep Search API Error: " + e.message);
    } finally {
      setIsEnhancing(false);
      setEnhancingStatus(null);
      onSpendingChange?.();
    }
  };

  const ltvCac = calculateLtvCac(formData.estimatedCLV || 0, formData.estimatedCAC || 0);

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onCancel}
          className="flex items-center text-[#666] hover:text-[#f0f0f0] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to List
        </button>
        <div className="flex gap-3">
          {category && onDelete && (
            <button 
              onClick={() => onDelete(category.id)}
              className="flex items-center px-4 py-2 bg-[#f87171]/08 text-rose-500 hover:bg-[#f87171]/12 rounded-lg font-medium transition-colors border border-[#f87171]/15"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </button>
          )}
          <button 
            type="button"
            onClick={handleDeepSearch}
            disabled={!formData.name || isEnhancing}
            className="flex items-center px-4 py-2 bg-[#e05000]/10 text-[#e05000] hover:bg-[#e05000]/20 hover:text-orange-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all border border-[#e05000]/15 shadow-[0_0_15px_-3px_rgba(234,88,12,0.3)] hover:shadow-[0_0_20px_-3px_rgba(234,88,12,0.5)]"
          >
            {isEnhancing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isEnhancing ? enhancingStatus?.overall || 'Searching...' : 'Deep Research AI'}
          </button>
          <button 
            onClick={handleSave}
            disabled={!formData.name}
            className="flex items-center px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#f0f0f0] rounded-lg font-bold transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Category
          </button>
        </div>
      </div>

      <div className="bg-[#080808] p-2 space-y-6">
        
        {isEnhancing && enhancingStatus && (
          <div className="p-4 bg-orange-900/20 border border-[#e05000]/20 rounded-xl mb-6">
            <h4 className="text-[#e05000] font-bold mb-3 flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Agentic Swarm Protocol: {enhancingStatus.overall}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
              {Object.entries(enhancingStatus.agents).map(([agentName, data]) => (
                <div key={agentName} className="flex flex-col bg-[#0A0C10] p-3 rounded-lg border border-[#1e1e1e]">
                  <span className="font-bold text-[#aaa] capitalize">{agentName.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className={cn(
                    "text-xs mt-1 font-mono tracking-tight", 
                    data.status === 'running' ? 'text-orange-300' : 
                    data.status === 'completed' ? 'text-[#4ade80]' : 
                    data.status === 'error' ? 'text-[#f87171]' : 'text-[#484848]'
                  )}>
                    {data.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Identity Card */}
          <div className="xl:col-span-3 bg-[#090909] border border-[#141414] rounded-xl p-6 shadow-xl flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-bold text-[#3a3a3a] uppercase tracking-[0.1em]">Category Name <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                value={formData.name || ''}
                onChange={e => handleChange('name', e.target.value)}
                autoFocus
                placeholder="e.g. Functional Mushroom Coffee"
                className="w-full bg-transparent border-b-2 border-transparent hover:border-[#1e1e1e] focus:border-emerald-500 text-[#f0f0f0] px-0 py-2 focus:outline-none text-3xl font-black tracking-tight placeholder-gray-800 transition-colors"
              />
            </div>
            <div className="w-full md:w-64 space-y-2 shrink-0">
              <label className="text-xs font-bold text-[#3a3a3a] uppercase tracking-[0.1em]">Industry / Niche</label>
              <input 
                type="text" 
                value={formData.industry || ''}
                onChange={e => handleChange('industry', e.target.value)}
                placeholder="e.g. Pets, Supplements..."
                className="w-full bg-[#0d0d0d] border border-[#1e1e1e] text-[#aaa] rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm font-medium transition-colors"
              />
            </div>
            <div className="w-full md:w-48 space-y-2 shrink-0">
              <label className="text-xs font-bold text-[#3a3a3a] uppercase tracking-[0.1em]">Pipeline Status</label>
              <select 
                value={formData.status || 'Researching'}
                onChange={e => handleChange('status', e.target.value)}
                className={cn(
                  "w-full bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm font-bold uppercase tracking-[0.1em] appearance-none",
                  formData.status === 'Winner' ? 'text-[#4ade80]' :
                  formData.status === 'Killed' ? 'text-[#f87171]' :
                  formData.status === 'Shortlisted' ? 'text-[#e05000]' : 'text-[#666]'
                )}
              >
                <option value="Researching">Researching</option>
                <option value="Shortlisted">Shortlisted</option>
                <option value="Killed">Killed</option>
                <option value="Winner">Winner</option>
              </select>
            </div>
          </div>

          {/* Target Audience & Hook */}
          <div className="xl:col-span-1 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-6">
            <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em] flex items-center border-b border-[#1e1e1e] pb-3">The Audience</h3>
            <div className="space-y-1">
              <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Target Demographic</label>
              <input 
                type="text" 
                value={formData.targetAudience || ''}
                onChange={e => handleChange('targetAudience', e.target.value)}
                placeholder="Health-conscious Women 25-45"
                className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] hover:border-emerald-500 focus:border-emerald-500 text-[#aaa] px-0 py-1.5 focus:outline-none text-sm transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Monthly Consumption Reason</label>
              <textarea 
                value={formData.monthlyConsumptionReason || ''}
                onChange={e => handleChange('monthlyConsumptionReason', e.target.value)}
                placeholder="Why do they buy this every month?"
                rows={2}
                className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] hover:border-emerald-500 focus:border-emerald-500 text-[#aaa] px-0 py-1.5 focus:outline-none text-sm transition-colors resize-none"
              />
            </div>
            <div className="pt-2">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={formData.realMonthlyConsumption || false}
                  onChange={e => handleChange('realMonthlyConsumption', e.target.checked)}
                  className="w-5 h-5 bg-[#111] border border-[#252525] rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-[#666] font-medium group-hover:text-[#aaa] transition-colors">Has Real Monthly Consumption Hook</span>
              </label>
            </div>
          </div>

          {/* Unit Economics Box */}
          <div className="xl:col-span-1 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-[#1e1e1e] pb-3">
              <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em]">Unit Economics</h3>
              <div className="text-right flex items-center gap-2">
                <span className="text-[10px] text-[#3a3a3a] uppercase font-bold tracking-[0.1em]">LTV:CAC</span>
                <span className={`font-mono font-semibold text-lg ${ltvCac >= 3 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{ltvCac}x</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 bg-[#090909] p-3 rounded-lg border border-[#141414]">
                <label className="text-[10px] text-[#484848] uppercase tracking-[0.1em] font-bold">Est. CLV (€)</label>
                <input 
                  type="number" 
                  value={formData.estimatedCLV || 0}
                  onChange={e => handleChange('estimatedCLV', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent text-[#4ade80] px-0 py-1 focus:outline-none font-mono text-xl font-bold"
                />
              </div>
              <div className="space-y-1 bg-[#090909] p-3 rounded-lg border border-[#141414]">
                <label className="text-[10px] text-[#484848] uppercase tracking-[0.1em] font-bold">Est. CAC (€)</label>
                <input 
                  type="number" 
                  value={formData.estimatedCAC || 0}
                  onChange={e => handleChange('estimatedCAC', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent text-[#f87171] px-0 py-1 focus:outline-none font-mono text-xl font-bold"
                />
              </div>
              <div className="space-y-1 col-span-2 bg-[#090909] p-3 rounded-lg border border-[#141414] flex justify-between items-center">
                <label className="text-[10px] text-[#484848] uppercase tracking-[0.1em] font-bold">Mo. Churn (%)</label>
                <div className="flex items-center w-24">
                  <input 
                    type="number" 
                    value={formData.monthlyChurnPercent || 0}
                    onChange={e => handleChange('monthlyChurnPercent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-right text-[#aaa] px-0 py-1 focus:outline-none font-mono text-lg font-bold"
                  />
                  <span className="text-[#484848] ml-1">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Market Size & Metrics Box */}
          <div className="xl:col-span-1 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-[#1e1e1e] pb-3">
              <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em]">Market Size (NL/EU)</h3>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] text-[#3a3a3a] uppercase font-bold tracking-[0.1em]">Score</span>
                <span className="font-mono font-semibold text-lg text-[#e05000]">{formData.marketSizeScore}/100</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                  <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">NL Market Cap</label>
                  <input 
                    type="text" 
                    value={formData.marketSizeNL || ''}
                    onChange={e => handleChange('marketSizeNL', e.target.value)}
                    placeholder="€200M"
                    className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#aaa] px-0 py-1 focus:outline-none font-mono text-sm"
                  />
                </div>
                 <div className="space-y-1">
                  <label className="text-[10px] text-[#e05000]/80 uppercase tracking-[0.1em] font-bold">True Audience NL (SOM label)</label>
                  <input 
                    type="text" 
                    value={formData.audienceSizeNL || ''}
                    onChange={e => handleChange('audienceSizeNL', e.target.value)}
                    placeholder="~12,400 reachable targets"
                    className="w-full bg-transparent border-b border-dashed border-orange-900/50 text-[#e05000] px-0 py-1 focus:outline-none font-mono text-sm"
                  />
                </div>
              </div>
              {/* TAM / SAM / SOM numeric funnel */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">TAM (count)</label>
                  <input 
                    type="number"
                    value={formData.tamNL || 0}
                    onChange={e => handleChange('tamNL', parseInt(e.target.value) || 0)}
                    placeholder="100000"
                    className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#666] px-0 py-1 focus:outline-none font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">SAM (count)</label>
                  <input 
                    type="number"
                    value={formData.samNL || 0}
                    onChange={e => handleChange('samNL', parseInt(e.target.value) || 0)}
                    placeholder="50000"
                    className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#666] px-0 py-1 focus:outline-none font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#e05000]/80 uppercase tracking-[0.1em] font-bold">SOM (count)</label>
                  <input 
                    type="number"
                    value={formData.somNL || 0}
                    onChange={e => handleChange('somNL', parseInt(e.target.value) || 0)}
                    placeholder="15000"
                    className="w-full bg-transparent border-b border-dashed border-orange-900/50 text-[#e05000] px-0 py-1 focus:outline-none font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Funnel Breakdown</label>
                <textarea 
                  value={formData.funnelBreakdownNL || ''}
                  onChange={e => handleChange('funnelBreakdownNL', e.target.value)}
                  placeholder="1. 100,000 restaurants in NL (CBS 2024) [TAM] → 2. 52,000 with social media (52%) → 3. 15,000 with budget... [SOM]"
                  rows={3}
                  className="w-full bg-transparent border border-dashed border-[#1e1e1e] text-[#666] px-2 py-1 focus:outline-none font-mono text-xs rounded resize-none"
                />
              </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                  <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">EU Market</label>
                  <input 
                    type="text" 
                    value={formData.marketSizeEU || ''}
                    onChange={e => handleChange('marketSizeEU', e.target.value)}
                    placeholder="€1.2B"
                    className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#666] px-0 py-1 focus:outline-none font-mono text-xs"
                  />
                </div>
                 <div className="space-y-1">
                  <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Global</label>
                  <input 
                    type="text" 
                    value={formData.marketSizeGlobal || ''}
                    onChange={e => handleChange('marketSizeGlobal', e.target.value)}
                    placeholder="$4.5B"
                    className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#666] px-0 py-1 focus:outline-none font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">CAGR</label>
                <input 
                  type="text" 
                  value={formData.cagr || ''}
                  onChange={e => handleChange('cagr', e.target.value)}
                  placeholder="e.g. 12.5% or 10–15%"
                  className="w-full bg-transparent border-b border-dashed border-[#1e1e1e] text-[#666] px-0 py-1 focus:outline-none font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <input 
                type="range" 
                min="1" max="100"
                value={formData.marketSizeScore || 50}
                onChange={e => handleChange('marketSizeScore', parseInt(e.target.value))}
                className="w-full accent-[#e05000]"
              />
            </div>
          </div>

          {/* Qualitative Dynamics */}
          <div className="xl:col-span-2 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-6">
            <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em] border-b border-[#1e1e1e] pb-3">Qualitative Dynamics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Acquisition Diff.</label>
                <select 
                  value={formData.acquisitionDifficulty || 'Medium'}
                  onChange={e => handleChange('acquisitionDifficulty', e.target.value)}
                  className={cn("w-full bg-[#090909] border border-[#1e1e1e] text-sm rounded px-2 py-1.5 focus:outline-none", formData.acquisitionDifficulty === 'Easy' ? 'text-[#4ade80]' : formData.acquisitionDifficulty === 'Hard' ? 'text-[#f87171]' : 'text-[#aaa]')}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Emotional Loyalty</label>
                <select 
                  value={formData.emotionalLoyalty || 'Medium'}
                  onChange={e => handleChange('emotionalLoyalty', e.target.value)}
                  className={cn("w-full bg-[#090909] border border-[#1e1e1e] text-sm rounded px-2 py-1.5 focus:outline-none", formData.emotionalLoyalty === 'High' ? 'text-[#4ade80]' : formData.emotionalLoyalty === 'Low' ? 'text-[#f87171]' : 'text-[#aaa]')}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Brand Paradigm</label>
                <select 
                  value={formData.brandType || 'Solution-based'}
                  onChange={e => handleChange('brandType', e.target.value)}
                  className="w-full bg-[#090909] border border-[#1e1e1e] text-[#aaa] text-sm rounded px-2 py-1.5 focus:outline-none"
                >
                  <option value="Solution-based">Solution-based</option>
                  <option value="Aesthetic-Pleasure">Aesthetic-Pleasure</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Awareness Level</label>
                <select 
                  value={formData.awarenessLevel || 'Problem-aware'}
                  onChange={e => handleChange('awarenessLevel', e.target.value)}
                  className="w-full bg-[#090909] border border-[#1e1e1e] text-[#aaa] text-sm rounded px-2 py-1.5 focus:outline-none"
                >
                  <option value="Unaware">Unaware</option>
                  <option value="Problem-aware">Problem-aware</option>
                  <option value="Solution-aware">Solution-aware</option>
                  <option value="Product-aware">Product-aware</option>
                </select>
              </div>
              
              <div className="space-y-2 col-span-2">
                <label className="flex justify-between text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">
                  <span>Story Depth & Moat</span>
                  <span className="text-[#aaa]">{formData.storyDepth}/10</span>
                </label>
                <input 
                  type="range" 
                  min="1" max="10"
                  value={formData.storyDepth || 5}
                  onChange={e => handleChange('storyDepth', parseInt(e.target.value))}
                  className="w-full accent-gray-500"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="flex justify-between text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">
                  <span>Micro-niche Potential</span>
                  <span className="text-[#aaa]">{formData.microNichePotential}/10</span>
                </label>
                <input 
                  type="range" 
                  min="1" max="10"
                  value={formData.microNichePotential || 5}
                  onChange={e => handleChange('microNichePotential', parseInt(e.target.value))}
                  className="w-full accent-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Legal / Notes */}
          <div className="xl:col-span-1 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-6">
            <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em] border-b border-[#1e1e1e] pb-3">Legal & Risk</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Regulatory Risk (NL)</label>
                <select 
                  value={formData.regulatoryRiskNL || 'Medium'}
                  onChange={e => handleChange('regulatoryRiskNL', e.target.value)}
                  className="w-full bg-[#090909] border border-[#1e1e1e] text-[#aaa] text-sm rounded px-2 py-1.5 focus:outline-none"
                >
                  <option value="Low">Low - Standard e-com</option>
                  <option value="Medium">Medium - Mild restrictions</option>
                  <option value="High">High - Bans/Licenses</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.1em] font-bold">Restrictions/Ads Detail</label>
                <textarea 
                  value={formData.legalAndAdRestrictions || ''}
                  onChange={e => handleChange('legalAndAdRestrictions', e.target.value)}
                  placeholder="Meta ad bans? Medical claims?"
                  rows={3}
                  className="w-full bg-transparent border border-dashed border-[#1e1e1e] rounded text-[#666] p-2 focus:outline-none focus:border-gray-600 text-xs resize-none"
                />
              </div>
            </div>
          </div>

          <div className="xl:col-span-3 bg-[#0d0d0d] border border-[#141414] rounded-xl p-6 shadow-xl space-y-4">
             <h3 className="text-xs font-bold text-[#484848] uppercase tracking-[0.1em] border-b border-[#1e1e1e] pb-3">Freeform Notes & Thesis</h3>
             <textarea 
                value={formData.notes || ''}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Write your raw thesis, current players, drop-shipping viability, formulation ideas..."
                rows={4}
                className="w-full bg-[#090909] border border-[#1e1e1e] text-[#aaa] rounded-lg p-4 focus:outline-none focus:border-emerald-500 leading-relaxed font-mono text-sm resize-y"
              />
          </div>
        </div>

        {/* Sources */}
        {(formData.researchSources && formData.researchSources.length > 0) && (
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-[#484848] uppercase tracking-[0.1em] border-b border-[#1e1e1e] pb-2">Verified Sources</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-[#666]">
              {formData.researchSources.map((source, idx) => (
                <li key={idx} className="break-words">
                  {source.startsWith('http') ? (
                    <a href={source} target="_blank" rel="noopener noreferrer" className="text-[#e05000] hover:underline">{source}</a>
                  ) : (
                    source
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* AI Agent Raw Reports */}
        {formData.agentResults && Object.values(formData.agentResults).some(v => v) && (
          <section className="space-y-4">
             <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-[0.1em] border-b border-emerald-900 pb-2 flex items-center">
              <Sparkles className="w-4 h-4 mr-2" />
              Raw AI Agent Reports
            </h3>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { id: 'unitEconomics', label: 'Unit Economics' },
                { id: 'marketDynamics', label: 'Market Dynamics' },
                { id: 'adIntelligence', label: '📣 Ad Intelligence' },
                { id: 'retentionEngineering', label: '🔄 Retention Engineering' },
                { id: 'localCompetitors', label: 'Local Competitors' },
                { id: 'globalCompetitors', label: 'Global Competitors' },
                { id: 'foundersAndTeam', label: 'Founders & Team' },
                { id: 'legalLogistics', label: 'Legal & Logistics' },
                { id: 'suppliersBudget', label: 'Suppliers & Budget' },
                { id: 'searchTrends', label: '📈 Search Trends' }
              ].map(tab => {
                const hasData = !!(formData.agentResults && formData.agentResults[tab.id as keyof typeof formData.agentResults]);
                return (
                  <button
                    key={tab.id}
                    onClick={() => hasData && setActiveTab(tab.id as any)}
                    disabled={!hasData}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-full transition-colors border",
                      activeTab === tab.id 
                        ? "bg-emerald-500/20 text-[#4ade80] border-emerald-500/50" 
                        : hasData 
                          ? "bg-[#1a1a1a] text-[#666] border-[#252525] hover:bg-[#222]" 
                          : "bg-[#111] border-[#1e1e1e] text-[#3a3a3a] cursor-not-allowed"
                    )}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <div className="bg-[#080808] border border-[#141414] rounded-xl p-6 lg:p-10 overflow-hidden min-h-[400px]">
               {formData.agentResults && formData.agentResults[activeTab] ? (
                 <div className="prose prose-invert lg:prose-lg max-w-none prose-orange prose-headings:text-[#4ade80] prose-headings:mb-4 prose-p:text-[#aaa] prose-p:leading-relaxed prose-li:text-[#aaa] prose-li:leading-relaxed">
                   <ReactMarkdown 
                     remarkPlugins={[remarkGfm]}
                     components={{
                       a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#4ade80] hover:text-emerald-300 underline underline-offset-2" />,
                       table: ({node, ...props}) => <div className="overflow-x-auto my-8"><table className="w-full text-left border-collapse" {...props} /></div>,
                       th: ({node, ...props}) => <th className="border-b-2 border-[#1e1e1e] py-3 px-4 font-bold text-[#d0d0d0]" {...props} />,
                       td: ({node, ...props}) => <td className="border-b border-[#1e1e1e]/50 py-3 px-4 text-[#666]" {...props} />
                     }}
                   >
                     {formData.agentResults[activeTab] || "*No data generated for this agent yet.*"}
                   </ReactMarkdown>
                 </div>
               ) : (
                 <p className="text-center text-[#484848] text-sm italic py-8">
                   Run a Deep Research to populate this report.
                 </p>
               )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
