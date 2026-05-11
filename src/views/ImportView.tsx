import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Loader2, Sparkles, CheckCircle2, AlertCircle, Play, Pause, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Category } from '../types';
import { extractCategoriesFromText, extractCompanyFromImage } from '../services/aiService';
import stringSimilarity from 'string-similarity';

export interface DocumentTask {
  id: string;
  filename: string;
  status: 'idle' | 'extracting' | 'completed' | 'error';
  categoriesFound: number;
  error?: string;
  text?: string;
  pdfData?: {name: string, data: string, mimeType: string};
  imageData?: {name: string, data: string, mimeType: string};
  progressText: string;
  /** 0–100 while extracting, drives the progress bar */
  scanPercent?: number;
}

interface ImportState {
  tasks: DocumentTask[];
}

interface Props {
  onImport: (categories: Partial<Category>[]) => void;
  state: ImportState;
  setState: React.Dispatch<React.SetStateAction<ImportState>>;
  existingCategories: Category[];
}

const CHUNK_SIZE    = 35_000; // chars per text batch
const TEXT_OVERLAP  = 800;    // char overlap between adjacent text batches to avoid boundary misses
const PDF_BATCH_PGS = 100;    // pages per PDF batch
const DEDUP_THRESH  = 0.78;   // string-similarity threshold — above this = duplicate

function normalizeForDedup(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Remove categories from `incoming` that are too similar to anything already in `existingNames`.
 * Also deduplicates within the incoming batch itself.
 */
function deduplicateIncoming(
  incoming: Partial<Category>[],
  existingNames: string[]
): Partial<Category>[] {
  const known = existingNames.map(normalizeForDedup).filter(Boolean);
  const accepted: Partial<Category>[] = [];
  for (const cat of incoming) {
    if (!cat.name?.trim()) continue;
    const norm = normalizeForDedup(cat.name);
    if (!norm) continue;
    if (known.includes(norm)) continue;
    if (known.length > 0 && stringSimilarity.findBestMatch(norm, known).bestMatch.rating >= DEDUP_THRESH) continue;
    const acceptedNorms = accepted.map(c => normalizeForDedup(c.name!)).filter(Boolean);
    if (acceptedNorms.length > 0 && stringSimilarity.findBestMatch(norm, acceptedNorms).bestMatch.rating >= DEDUP_THRESH) continue;
    accepted.push(cat);
    known.push(norm); // update rolling known list
  }
  return accepted;
}

/**
 * Estimate PDF page count from base64 data.
 * Tries to read /Count from the PDF page tree; falls back to size-based estimation.
 */
function estimatePdfPageCount(base64Data: string): number {
  try {
    // Sample the beginning of the file where the page tree catalog usually lives
    const decoded = atob(base64Data.substring(0, 40_000));
    const matches = [...decoded.matchAll(/\/Count\s+(\d+)/g)];
    if (matches.length > 0) return Math.max(...matches.map(m => parseInt(m[1])));
  } catch { /* atob can throw on binary data — ignore */ }
  // Fallback: base64 is ~133% of binary size; assume ~50 KB per page on average
  return Math.max(1, Math.ceil((base64Data.length * 0.75) / 50_000));
}

export function ImportView({ onImport, state, setState, existingCategories }: Props) {
  const { tasks } = state;
  const [isDragging, setIsDragging] = useState(false);
  const [manualText, setManualText] = useState('');

  const processingRef = useRef<boolean>(false);
  const taskStatusRef = useRef<Record<string, string>>({});

  // Keep a ref of status up to date to bypass stale closures
  useEffect(() => {
    const newStatuses: Record<string, string> = {};
    tasks.forEach(t => { newStatuses[t.id] = t.status; });
    taskStatusRef.current = newStatuses;
  }, [tasks]);

  // Auto-process queue
  useEffect(() => {
    const processQueue = async () => {
      // Prevent concurrent runs
      if (processingRef.current) return;
      
      const activeTaskIndex = tasks.findIndex(t => t.status === 'extracting');
      if (activeTaskIndex !== -1) {
        processingRef.current = true;
        // Continue processing
        const task = tasks[activeTaskIndex];
        
        try {
          if (task.imageData) {
            setState(s => {
              const next = [...s.tasks];
              const idx = next.findIndex(t => t.id === task.id);
              if (idx !== -1) next[idx] = { ...next[idx], progressText: 'Analyzing screenshot...' };
              return { ...s, tasks: next };
            });

            const result = await extractCompanyFromImage(
              {
                imageData: task.imageData.data,
                mimeType: task.imageData.mimeType,
                existingCategoryNames: existingCategories.map(c => c.name)
              },
              (status) => {
                setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) next[idx] = { ...next[idx], progressText: status };
                  return { ...s, tasks: next };
                });
              }
            );

            if (result && result.categoryParams && result.categoryParams.name && result.categoryParams.name !== 'Unknown Category') {
               onImport([result.categoryParams]);
               setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) {
                    next[idx] = { ...next[idx], categoriesFound: 1, status: 'completed', progressText: 'Extracted company details successfully.' };
                  }
                  return { ...s, tasks: next };
               });
            } else {
               setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) {
                    next[idx] = { ...next[idx], status: 'completed', progressText: 'No viable company extracted.' };
                  }
                  return { ...s, tasks: next };
               });
            }

          } else if (task.text) {
            // ── Text: sequential character-range batches with overlap + dedup ──
            const totalLen    = task.text.length;
            const totalBatches = Math.ceil(totalLen / CHUNK_SIZE);
            let combinedNewCats: Partial<Category>[] = [];
            const runningNames: string[] = [...existingCategories.map(c => c.name)];
            const fmt = (n: number) => n.toLocaleString();

            for (let i = 0; i < totalBatches; i++) {
              if (taskStatusRef.current[task.id] !== 'extracting') return;

              const chunkStart = i === 0 ? 0 : i * CHUNK_SIZE - TEXT_OVERLAP;
              const chunkEnd   = Math.min(totalLen, (i + 1) * CHUNK_SIZE);
              const pct        = Math.round(i / totalBatches * 100);

              setState(s => {
                const next = [...s.tasks];
                const idx = next.findIndex(t => t.id === task.id);
                if (idx !== -1) next[idx] = {
                  ...next[idx],
                  progressText: `Batch ${i + 1}/${totalBatches} — chars ${fmt(i * CHUNK_SIZE)}–${fmt(chunkEnd)} of ${fmt(totalLen)} (${pct}%)`,
                  scanPercent: pct,
                };
                return { ...s, tasks: next };
              });

              const chunk = task.text.substring(chunkStart, chunkEnd);
              const rawItems = await extractCategoriesFromText({
                text: chunk,
                existingCategoryNames: runningNames,
              });

              const uniqueItems = deduplicateIncoming(rawItems, runningNames);
              uniqueItems.forEach(c => c.name && runningNames.push(c.name));
              combinedNewCats = [...combinedNewCats, ...uniqueItems];

              if (uniqueItems.length > 0) {
                onImport(uniqueItems);
                setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) next[idx] = { ...next[idx], categoriesFound: next[idx].categoriesFound + uniqueItems.length };
                  return { ...s, tasks: next };
                });
              }
            }

            setState(s => {
              const next = [...s.tasks];
              const idx = next.findIndex(t => t.id === task.id);
              if (idx !== -1) next[idx] = {
                ...next[idx],
                status: 'completed',
                progressText: `✓ All ${totalBatches} batches complete — ${combinedNewCats.length} unique categories extracted from ${fmt(totalLen)} chars.`,
                scanPercent: 100,
              };
              return { ...s, tasks: next };
            });

          } else if (task.pdfData) {
            // ── PDF: page-range batches — deterministic full coverage + dedup ──
            const estimatedPages = estimatePdfPageCount(task.pdfData.data);
            const totalBatches   = Math.ceil(estimatedPages / PDF_BATCH_PGS);
            let combinedNewCats: Partial<Category>[] = [];
            const runningNames: string[] = [...existingCategories.map(c => c.name)];
            let consecutiveEmpty = 0;

            for (let batch = 0; batch < totalBatches; batch++) {
              if (taskStatusRef.current[task.id] !== 'extracting') return;
              // Safety valve: 3 consecutive empty batches means document is exhausted
              if (consecutiveEmpty >= 3) break;

              const pageStart = batch * PDF_BATCH_PGS + 1;
              const pageEnd   = Math.min(estimatedPages, (batch + 1) * PDF_BATCH_PGS);
              const pct       = Math.round((batch / totalBatches) * 100);

              setState(s => {
                const next = [...s.tasks];
                const idx = next.findIndex(t => t.id === task.id);
                if (idx !== -1) next[idx] = {
                  ...next[idx],
                  progressText: `Batch ${batch + 1}/${totalBatches} — pages ${pageStart}–${pageEnd} of ~${estimatedPages} (${pct}%)`,
                  scanPercent: pct,
                };
                return { ...s, tasks: next };
              });

              const rawItems = await extractCategoriesFromText({
                fileData: { data: task.pdfData.data, mimeType: task.pdfData.mimeType },
                existingCategoryNames: runningNames,
                range: { currentPage: pageStart, endPage: pageEnd, totalPages: estimatedPages },
              });

              const uniqueItems = deduplicateIncoming(rawItems, runningNames);
              uniqueItems.forEach(c => c.name && runningNames.push(c.name));

              if (uniqueItems.length > 0) {
                consecutiveEmpty = 0;
                combinedNewCats = [...combinedNewCats, ...uniqueItems];
                onImport(uniqueItems);
                setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) next[idx] = { ...next[idx], categoriesFound: next[idx].categoriesFound + uniqueItems.length };
                  return { ...s, tasks: next };
                });
              } else {
                consecutiveEmpty++;
              }
            }

            setState(s => {
              const next = [...s.tasks];
              const idx = next.findIndex(t => t.id === task.id);
              if (idx !== -1) next[idx] = {
                ...next[idx],
                status: 'completed',
                progressText: `✓ ~${estimatedPages} pages scanned in ${totalBatches} batches — ${combinedNewCats.length} unique categories extracted.`,
                scanPercent: 100,
              };
              return { ...s, tasks: next };
            });
          }

        } catch (err: any) {
          setState(s => {
            const next = [...s.tasks];
            const idx = next.findIndex(t => t.id === task.id);
            if (idx !== -1) {
              next[idx] = { ...next[idx], status: 'error', error: err.message || 'Error extracting', progressText: 'Error occurred.' };
            }
            return { ...s, tasks: next };
          });
        } finally {
          processingRef.current = false;
        }
      } else {
        // If no active task, check for idle tasks and start the first one
        const nextIdleIndex = tasks.findIndex(t => t.status === 'idle');
        if (nextIdleIndex !== -1) {
          setState(s => {
            const next = [...s.tasks];
            next[nextIdleIndex] = { ...next[nextIdleIndex], status: 'extracting', progressText: 'Starting...' };
            return { ...s, tasks: next };
          });
        }
      }
    };

    processQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const processFile = (file: File) => {
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Url = event.target?.result as string;
          const base64Data = base64Url.split(',')[1];
          const newTask: DocumentTask = {
            id: crypto.randomUUID(),
            filename: file.name,
            status: 'idle',
            categoriesFound: 0,
            pdfData: { name: file.name, data: base64Data, mimeType: 'application/pdf' },
            progressText: 'In queue...'
          };
          setState(s => ({ ...s, tasks: [...s.tasks, newTask] }));
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Url = event.target?.result as string;
          const base64Data = base64Url.split(',')[1];
          const newTask: DocumentTask = {
            id: crypto.randomUUID(),
            filename: file.name,
            status: 'idle',
            categoriesFound: 0,
            imageData: { name: file.name, data: base64Data, mimeType: file.type },
            progressText: 'In queue...'
          };
          setState(s => ({ ...s, tasks: [...s.tasks, newTask] }));
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const newTask: DocumentTask = {
            id: crypto.randomUUID(),
            filename: file.name,
            status: 'idle',
            categoriesFound: 0,
            text: content,
            progressText: 'In queue...'
          };
          setState(s => ({ ...s, tasks: [...s.tasks, newTask] }));
        };
        reader.readAsText(file);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => processFile(file));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => processFile(file));
    }
  };

  const handleManualExtract = () => {
    if (!manualText.trim()) return;
    const newTask: DocumentTask = {
      id: crypto.randomUUID(),
      filename: 'Pasted Text',
      status: 'idle',
      categoriesFound: 0,
      text: manualText,
      progressText: 'In queue...'
    };
    setState(s => ({ ...s, tasks: [...s.tasks, newTask] }));
    setManualText('');
  };

  const toggleTaskStatus = (id: string) => {
    setState(s => {
      const next = [...s.tasks];
      const idx = next.findIndex(t => t.id === id);
      if (idx !== -1) {
        if (next[idx].status === 'extracting') {
          next[idx].status = 'idle';
          next[idx].progressText = 'Paused.';
        } else if (next[idx].status === 'idle' || next[idx].status === 'error') {
          next[idx].status = 'extracting';
          next[idx].progressText = 'Resuming...';
        } else if (next[idx].status === 'completed') {
           next[idx].status = 'extracting';
           next[idx].progressText = 'Relaunching...';
        }
      }
      return { ...s, tasks: next };
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold text-[#f0f0f0] capitalize tracking-tight flex items-center">
          <Sparkles className="w-6 h-6 mr-3 text-[#e05000]" />
          AI Document Queue
        </h2>
        <p className="text-[#666]">
          Upload documents or paste messy notes. Our AI processes them in chunks, keeping track of exactly how much has been scanned and extracting all categories automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Upload Area */}
        <div className="space-y-6">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-6 shadow-xl space-y-6">
            <div 
              className={`border-2 border-dashed ${isDragging ? 'border-[#e05000] bg-[#e05000]/08' : 'border-[#252525] hover:bg-[#111]/50 hover:border-[#e05000]/25'} rounded-xl p-8 transition-colors flex flex-col items-center justify-center cursor-pointer relative`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                multiple
                accept=".txt,.csv,.json,.md,.pdf,application/pdf,image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud className={`w-12 h-12 mb-4 ${isDragging ? 'text-[#e05000]' : 'text-[#484848]'}`} />
              <h3 className="text-lg font-bold text-[#aaa]">Drop files or screenshots here</h3>
              <p className="text-sm text-[#484848] mt-1 text-center">
                Supports .txt, .md, .pdf, and images/screenshots.<br />It will be added to the queue automatically.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-[#1e1e1e]"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 bg-[#0d0d0d] text-xs text-[#484848] uppercase tracking-[0.1em] font-bold">OR PASTE TEXT</span>
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Paste your chaotic list of ideas, research notes, or unstructured data..."
                className="w-full h-40 bg-[#111] border border-[#1e1e1e] text-[#f0f0f0] rounded-xl p-4 focus:outline-none focus:border-[#e05000] focus:ring-1 focus:ring-[#e05000] transition-colors resize-none text-sm placeholder-gray-600"
              ></textarea>
              
              <div className="flex justify-end">
                <button 
                    onClick={handleManualExtract}
                    disabled={!manualText.trim()}
                    className="flex items-center px-6 py-3 bg-[#e05000] hover:bg-[#e05000] disabled:opacity-50 disabled:cursor-not-allowed text-[#f0f0f0] rounded-xl font-bold transition-all shadow-none"
                  >
                    <FileText className="w-5 h-5 mr-3" />
                    Queue Extraction
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Queue */}
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-6 shadow-xl space-y-6 flex flex-col max-h-[700px]">
          <h3 className="text-xl font-bold text-[#aaa] border-b border-[#1e1e1e] pb-4">Document Queue</h3>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-[#484848]">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No documents in queue.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-[#f0f0f0] font-bold max-w-[200px] xl:max-w-xs truncate" title={task.filename}>{task.filename}</h4>
                      <p className="text-xs text-[#e05000] mt-1 uppercase tracking-wider font-mono">Status: {task.status}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-mono text-[#4ade80] font-bold">{task.categoriesFound}</span>
                      <p className="text-[10px] text-[#484848] uppercase tracking-[0.1em]">Cat. Found</p>
                    </div>
                  </div>

                  <div className="text-sm text-[#666] font-medium font-mono">
                    {task.progressText}
                  </div>

                  {/* Progress bar — visible while extracting and on completion */}
                  {task.scanPercent !== undefined && (
                    <div className="space-y-1">
                      <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${task.status === 'completed' ? 'bg-emerald-500' : 'bg-[#e05000]'}`}
                          style={{ width: `${task.scanPercent}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#3a3a3a] font-mono text-right">{task.scanPercent}% scanned</p>
                    </div>
                  )}

                  {task.error && (
                    <div className="text-xs text-[#f87171] bg-[#f87171]/08 p-2 rounded border border-[#f87171]/15">
                      {task.error}
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-[#1e1e1e]">
                     <button
                        onClick={() => toggleTaskStatus(task.id)}
                        className="flex items-center text-xs px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] text-[#aaa] rounded-lg transition-colors border border-[#252525]"
                      >
                       {task.status === 'extracting' ? (
                         <><Pause className="w-3 h-3 mr-2" /> Pause</>
                       ) : task.status === 'completed' ? (
                         <><RefreshCw className="w-3 h-3 mr-2" /> Relaunch</>
                       ) : (
                         <><Play className="w-3 h-3 mr-2" /> {task.status === 'error' ? 'Retry' : 'Resume'}</>
                       )}
                     </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

