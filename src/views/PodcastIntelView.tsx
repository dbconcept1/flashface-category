import { useState } from 'react';
import {
  Headphones, Plus, Search, Trash2, RefreshCw, Play, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, Lightbulb, TrendingUp, Mic,
  BarChart2, BookOpen, Brain, ExternalLink, Zap, UserCircle2, Link2
} from 'lucide-react';
import type { FounderPodcast, PodcastEpisode, FounderProfile } from '../types';
import { cn } from '../utils';

interface Props {
  founders: FounderPodcast[];
  episodes: PodcastEpisode[];
  scanningFounderId: string | null;
  extractingEpisodeIds: string[];
  founderProfiles: FounderProfile[];
  /** Per-founder error messages shown inline under the founder card. */
  scanErrors?: Record<string, string>;
  onAddFounder: (data: { founderName: string; channelQuery: string; description?: string }) => void;
  onDeleteFounder: (id: string) => void;
  onScanFounder: (founder: FounderPodcast) => void;
  onExtractEpisode: (episode: PodcastEpisode) => void;
  onDeleteEpisode: (id: string) => void;
  onSendToIntelBrain: (episode: PodcastEpisode) => void;
  /** Create or navigate to the linked FounderProfile for this podcast founder. */
  onLinkToFounderProfile: (founder: FounderPodcast) => void;
}

export function PodcastIntelView({
  founders, episodes, scanningFounderId, extractingEpisodeIds,
  founderProfiles, scanErrors,
  onAddFounder, onDeleteFounder, onScanFounder, onExtractEpisode, onDeleteEpisode, onSendToIntelBrain,
  onLinkToFounderProfile,
}: Props) {
  const [selectedFounderId, setSelectedFounderId] = useState<string | null>(founders[0]?.id ?? null);
  const [showAddForm, setShowAddForm] = useState(founders.length === 0);
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  const selectedFounder = founders.find(f => f.id === selectedFounderId) ?? null;
  const founderEpisodes = selectedFounder
    ? episodes.filter(e => e.founderId === selectedFounder.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const selectedEpisode = episodes.find(e => e.id === selectedEpisodeId) ?? null;

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddFounder({
      founderName: newName.trim(),
      channelQuery: newQuery.trim() || newName.trim(),
      description: newDesc.trim() || undefined
    });
    setNewName(''); setNewQuery(''); setNewDesc('');
    setShowAddForm(false);
  };

  const StatusIcon = ({ ep }: { ep: PodcastEpisode }) => {
    if (extractingEpisodeIds.includes(ep.id)) return <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />;
    if (ep.processingStatus === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (ep.processingStatus === 'error') return <span title={ep.errorMessage}><AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" /></span>;
    return <div className="w-3.5 h-3.5 rounded-full border border-gray-700 shrink-0" />;
  };

  const totalExtracted = episodes.filter(e => e.processingStatus === 'complete').length;
  const pendingInFounder = founderEpisodes.filter(e => e.processingStatus === 'pending');

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-purple-400" />
            Podcast Intel
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Track DTC founders → scan their latest YouTube podcasts → Gemini watches the video and extracts tactics, metrics, and insights directly into your knowledge base.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {totalExtracted > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-mono">
              <CheckCircle2 className="w-3 h-3" />
              {totalExtracted} extracted
            </div>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Founder
          </button>
        </div>
      </div>

      {/* How it works — shown when empty */}
      {founders.length === 0 && !showAddForm && (
        <div className="bg-[#111] border border-gray-800 rounded-2xl p-8 text-center space-y-5">
          <Headphones className="w-12 h-12 mx-auto text-purple-400 opacity-60" />
          <div>
            <p className="text-white font-bold text-lg">Your DTC Founder Intelligence Engine</p>
            <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
              Add any DTC founder who does podcasts. The agent scans their YouTube channel for new episodes, then Gemini watches each video and extracts every tactic, metric, and insight into a searchable knowledge base.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto text-left">
            {[
              { icon: <Search className="w-4 h-4 text-blue-400" />, title: '1. Scan', desc: 'Finds latest YouTube episodes via Google Search' },
              { icon: <Zap className="w-4 h-4 text-orange-400" />, title: '2. Extract', desc: 'Gemini watches each video and transcribes it' },
              { icon: <Brain className="w-4 h-4 text-purple-400" />, title: '3. Index', desc: 'Tactics, metrics & insights saved to Intel Brain' },
            ].map(step => (
              <div key={step.title} className="bg-gray-900 rounded-xl p-4 space-y-1.5">
                {step.icon}
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="text-xs text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Add your first founder
          </button>
        </div>
      )}

      {/* Add founder form */}
      {showAddForm && (
        <div className="bg-[#111] border border-purple-500/30 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Track a new founder</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Founder name *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="e.g. Steven Bartlett"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">YouTube channel / search phrase</label>
              <input
                value={newQuery}
                onChange={e => setNewQuery(e.target.value)}
                placeholder="@TheDiaryOfACEO or 'DOAC podcast'"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Why tracking (optional)</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="e.g. DTC brand building, retention"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors"
            >
              Add & Track
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <span className="text-xs text-gray-600 ml-1">
              Tip: @channelhandle = more accurate scanning. Full name + podcast name also works.
            </span>
          </div>
        </div>
      )}

      {/* Main two-column layout */}
      {founders.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 min-h-[500px]">

          {/* ── Left: Founder list ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest px-1 pb-1">
              Founders ({founders.length})
            </p>
            {founders.map(founder => {
              const epCount = episodes.filter(e => e.founderId === founder.id).length;
              const doneCount = episodes.filter(e => e.founderId === founder.id && e.processingStatus === 'complete').length;
              const isScanning = scanningFounderId === founder.id;
              const isSelected = selectedFounderId === founder.id;

              return (
                <div
                  key={founder.id}
                  onClick={() => { setSelectedFounderId(founder.id); setSelectedEpisodeId(null); }}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all",
                    isSelected
                      ? "bg-purple-500/10 border-purple-500/40"
                      : "bg-[#111] border-gray-800 hover:border-gray-700"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold text-sm truncate", isSelected ? "text-white" : "text-gray-300")}>
                        {founder.founderName}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 truncate">{founder.channelQuery}</p>
                      {founder.description && (
                        <p className="text-xs text-gray-600 mt-1 italic truncate">{founder.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {epCount > 0 && (
                        <span className="text-[10px] font-mono text-gray-600">{doneCount}/{epCount}</span>
                      )}
                      <ChevronRight className={cn("w-3.5 h-3.5", isSelected ? "text-purple-400" : "text-gray-700")} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                      onClick={e => { e.stopPropagation(); onScanFounder(founder); }}
                      disabled={isScanning || !!scanningFounderId}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {isScanning
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Scanning...</>
                        : <><Search className="w-3 h-3" />Scan for new</>
                      }
                    </button>
                    {/* Create / view linked FounderProfile */}
                    {founder.linkedFounderProfileId ? (
                      <button
                        onClick={e => { e.stopPropagation(); onLinkToFounderProfile(founder); }}
                        title="Go to Founder Profile"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium transition-colors hover:bg-emerald-600/20"
                      >
                        <Link2 className="w-3 h-3" />Profile
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); onLinkToFounderProfile(founder); }}
                        title="Create a Founder Profile from this podcast entry"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#111] text-gray-500 border border-gray-800 rounded-lg text-xs font-medium transition-colors hover:text-gray-300 hover:border-gray-700"
                      >
                        <UserCircle2 className="w-3 h-3" />Create Profile
                      </button>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Remove ${founder.founderName} and all their episodes?`)) {
                          if (selectedFounderId === founder.id) setSelectedFounderId(null);
                          onDeleteFounder(founder.id);
                        }
                      }}
                      className="p-1.5 text-gray-700 hover:text-rose-400 transition-colors rounded ml-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Inline scan error */}
                  {scanErrors?.[founder.id] && (
                    <div className="mt-2 px-2.5 py-1.5 bg-rose-900/20 border border-rose-500/25 rounded-lg flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                      <span className="text-[10px] text-rose-400 leading-relaxed">{scanErrors[founder.id]}</span>
                    </div>
                  )}

                  {founder.lastScanned && !scanErrors?.[founder.id] && (
                    <p className="text-[10px] text-gray-700 mt-2">
                      Scanned {new Date(founder.lastScanned).toLocaleDateString('nl-NL')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Right: Episodes panel ───────────────────────────────────────── */}
          <div className="space-y-3">

            {/* No founder selected */}
            {!selectedFounder && (
              <div className="flex items-center justify-center h-64 text-gray-700 bg-[#111] rounded-2xl border border-gray-800">
                <div className="text-center">
                  <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a founder to view their episodes</p>
                </div>
              </div>
            )}

            {/* Founder selected */}
            {selectedFounder && (
              <>
                {/* Episode list header */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest">
                    {selectedFounder.founderName} — {founderEpisodes.length} episode{founderEpisodes.length !== 1 ? 's' : ''}
                  </p>
                  {pendingInFounder.length > 0 && (
                    <button
                      onClick={() => pendingInFounder.forEach(e => onExtractEpisode(e))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/15 hover:bg-orange-600/25 text-orange-400 border border-orange-500/20 rounded-lg text-xs font-medium transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Extract all ({pendingInFounder.length})
                    </button>
                  )}
                </div>

                {/* No episodes yet */}
                {founderEpisodes.length === 0 && (
                  <div className="text-center py-16 bg-[#111] rounded-2xl border border-gray-800 space-y-2">
                    <Search className="w-8 h-8 mx-auto text-gray-700" />
                    <p className="text-sm font-medium text-gray-500">No episodes found yet</p>
                    <p className="text-xs text-gray-600">Click "Scan for new" on the founder card</p>
                  </div>
                )}

                {/* Episode detail view */}
                {selectedEpisode && selectedEpisode.founderId === selectedFounder.id && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setSelectedEpisodeId(null)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      ← Back to episode list
                    </button>

                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-5 space-y-5">
                      {/* Episode header */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-white leading-snug">{selectedEpisode.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedEpisode.founderName}
                            {selectedEpisode.publishDate && ` · ${selectedEpisode.publishDate}`}
                            {selectedEpisode.extractedAt && ` · Extracted ${new Date(selectedEpisode.extractedAt).toLocaleDateString('nl-NL')}`}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <a
                            href={selectedEpisode.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Watch
                          </a>
                          <button
                            onClick={() => onSendToIntelBrain(selectedEpisode)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Brain className="w-3 h-3" />
                            Save to Intel Brain
                          </button>
                        </div>
                      </div>

                      {/* Summary */}
                      {selectedEpisode.summary && (
                        <div className="bg-gray-900 rounded-xl p-4">
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Summary</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{selectedEpisode.summary}</p>
                        </div>
                      )}

                      {/* Three columns: tactics / metrics / insights */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(selectedEpisode.keyTactics?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                              <Lightbulb className="w-3 h-3" />Key Tactics
                            </p>
                            <ul className="space-y-2">
                              {selectedEpisode.keyTactics!.map((t, i) => (
                                <li key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-orange-500/30 leading-relaxed">
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(selectedEpisode.keyMetrics?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                              <BarChart2 className="w-3 h-3" />Key Metrics
                            </p>
                            <ul className="space-y-2">
                              {selectedEpisode.keyMetrics!.map((m, i) => (
                                <li key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-emerald-500/30 font-mono leading-relaxed">
                                  {m}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(selectedEpisode.businessInsights?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />Business Insights
                            </p>
                            <ul className="space-y-2">
                              {selectedEpisode.businessInsights!.map((b, i) => (
                                <li key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-blue-500/30 leading-relaxed">
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Relevant categories */}
                      {(selectedEpisode.relevantCategories?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Relevant to your categories</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedEpisode.relevantCategories!.map(c => (
                              <span key={c} className="px-2 py-1 text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full report */}
                      {selectedEpisode.fullReport && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />Full Intelligence Report
                          </p>
                          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {selectedEpisode.fullReport}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Episode list (when no episode detail is shown) */}
                {(!selectedEpisode || selectedEpisode.founderId !== selectedFounder.id) && founderEpisodes.length > 0 && (
                  <div className="space-y-2">
                    {founderEpisodes.map(ep => (
                      <div
                        key={ep.id}
                        className="bg-[#111] border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <StatusIcon ep={ep} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-200 leading-snug">{ep.title}</p>
                            {ep.publishDate && (
                              <p className="text-xs text-gray-600 mt-0.5">{ep.publishDate}</p>
                            )}
                            {ep.summary && (
                              <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ep.summary}</p>
                            )}
                            {(ep.relevantCategories?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {ep.relevantCategories!.slice(0, 3).map(c => (
                                  <span key={c} className="px-1.5 py-0.5 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/15 rounded">
                                    {c}
                                  </span>
                                ))}
                                {ep.relevantCategories!.length > 3 && (
                                  <span className="text-[10px] text-gray-600">+{ep.relevantCategories!.length - 3}</span>
                                )}
                              </div>
                            )}
                            {ep.processingStatus === 'error' && ep.errorMessage && (
                              <p className="text-xs text-rose-400 mt-1.5 bg-rose-500/10 rounded px-2 py-1">
                                {ep.errorMessage}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-1.5 items-end shrink-0">
                            {ep.processingStatus === 'complete' ? (
                              <button
                                onClick={() => setSelectedEpisodeId(ep.id)}
                                className="px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                              >
                                View Intel
                              </button>
                            ) : (
                              <button
                                onClick={() => onExtractEpisode(ep)}
                                disabled={extractingEpisodeIds.includes(ep.id)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-orange-600/15 hover:bg-orange-600/25 text-orange-400 border border-orange-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {extractingEpisodeIds.includes(ep.id)
                                  ? <><Loader2 className="w-3 h-3 animate-spin" />Extracting</>
                                  : <><Play className="w-3 h-3" />Extract</>
                                }
                              </button>
                            )}
                            <a
                              href={ep.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700 rounded text-xs transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              YouTube
                            </a>
                            <button
                              onClick={() => onDeleteEpisode(ep.id)}
                              className="p-1 text-gray-700 hover:text-rose-400 transition-colors rounded"
                              title="Remove episode"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
