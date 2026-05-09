import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Loader2, Sparkles, CheckCircle2, AlertCircle, Play, Pause, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Category } from '../types';
import { extractCategoriesFromText, extractCompanyFromImage } from '../services/aiService';

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

const CHUNK_SIZE = 40000; // characters

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

            const result = await extractCompanyFromImage({
              imageData: task.imageData.data,
              mimeType: task.imageData.mimeType,
              existingCategoryNames: existingCategories.map(c => c.name)
            });

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
            // Text chunking
            let extractedTotal = 0;
            const totalChunks = Math.ceil(task.text.length / CHUNK_SIZE);
            let combinedNewCats: Partial<Category>[] = [];
            
            for (let i = 0; i < totalChunks; i++) {
              // Check if status changed (paused/error)
              if (taskStatusRef.current[task.id] !== 'extracting') return; // abort if paused

              setState(s => {
                const next = [...s.tasks];
                const idx = next.findIndex(t => t.id === task.id);
                if (idx !== -1) {
                  next[idx] = { ...next[idx], progressText: `Scanning part ${i + 1} of ${totalChunks}...` };
                }
                return { ...s, tasks: next };
              });

              const chunk = task.text.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
              
              const newItems = await extractCategoriesFromText({
                text: chunk,
                existingCategoryNames: existingCategories.map(c => c.name).concat(combinedNewCats.map(c => c.name as string))
              });

              extractedTotal += newItems.length;
              combinedNewCats = [...combinedNewCats, ...newItems];

              if (newItems.length > 0) {
                onImport(newItems);
              }

              setState(s => {
                const next = [...s.tasks];
                const idx = next.findIndex(t => t.id === task.id);
                if (idx !== -1) {
                  next[idx] = { ...next[idx], categoriesFound: next[idx].categoriesFound + newItems.length };
                }
                return { ...s, tasks: next };
              });
            }

            setState(s => {
              const next = [...s.tasks];
              const idx = next.findIndex(t => t.id === task.id);
              if (idx !== -1) {
                next[idx] = { ...next[idx], status: 'completed', progressText: `Completed! Scanned ${totalChunks} parts.` };
              }
              return { ...s, tasks: next };
            });

          } else if (task.pdfData) {
            // Iterative PDF extraction (since we can't chunk easily)
            let keepExtracting = true;
            let iteration = 1;
            let combinedNewCats: Partial<Category>[] = [];

            while (keepExtracting) {
              if (taskStatusRef.current[task.id] !== 'extracting') return;

               setState(s => {
                const next = [...s.tasks];
                const idx = next.findIndex(t => t.id === task.id);
                if (idx !== -1) {
                  next[idx] = { ...next[idx], progressText: `Scanning iteration ${iteration}...` };
                }
                return { ...s, tasks: next };
              });

              const newItems = await extractCategoriesFromText({
                fileData: task.pdfData ? { data: task.pdfData.data, mimeType: task.pdfData.mimeType } : undefined,
                existingCategoryNames: existingCategories.map(c => c.name).concat(combinedNewCats.map(c => c.name as string))
              });

              if (newItems.length > 0) {
                combinedNewCats = [...combinedNewCats, ...newItems];
                onImport(newItems);
                setState(s => {
                  const next = [...s.tasks];
                  const idx = next.findIndex(t => t.id === task.id);
                  if (idx !== -1) {
                    next[idx] = { ...next[idx], categoriesFound: next[idx].categoriesFound + newItems.length };
                  }
                  return { ...s, tasks: next };
                });
                iteration++;
              } else {
                keepExtracting = false; // No more found
              }
            }

            setState(s => {
              const next = [...s.tasks];
              const idx = next.findIndex(t => t.id === task.id);
              if (idx !== -1) {
                next[idx] = { ...next[idx], status: 'completed', progressText: `Completed after ${iteration} iterations.` };
              }
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
        <h2 className="text-3xl font-bold text-white capitalize tracking-tight flex items-center">
          <Sparkles className="w-6 h-6 mr-3 text-orange-500" />
          AI Document Queue
        </h2>
        <p className="text-gray-400">
          Upload documents or paste messy notes. Our AI processes them in chunks, keeping track of exactly how much has been scanned and extracting all categories automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Upload Area */}
        <div className="space-y-6">
          <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div 
              className={`border-2 border-dashed ${isDragging ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:bg-gray-900/50 hover:border-orange-500/50'} rounded-xl p-8 transition-colors flex flex-col items-center justify-center cursor-pointer relative`}
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
              <UploadCloud className={`w-12 h-12 mb-4 ${isDragging ? 'text-orange-500' : 'text-gray-500'}`} />
              <h3 className="text-lg font-bold text-gray-300">Drop files or screenshots here</h3>
              <p className="text-sm text-gray-500 mt-1 text-center">
                Supports .txt, .md, .pdf, and images/screenshots.<br />It will be added to the queue automatically.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-800"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 bg-[#111111] text-xs text-gray-500 uppercase tracking-widest font-bold">OR PASTE TEXT</span>
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Paste your chaotic list of ideas, research notes, or unstructured data..."
                className="w-full h-40 bg-gray-900 border border-gray-800 text-white rounded-xl p-4 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors resize-none text-sm placeholder-gray-600"
              ></textarea>
              
              <div className="flex justify-end">
                <button 
                    onClick={handleManualExtract}
                    disabled={!manualText.trim()}
                    className="flex items-center px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)]"
                  >
                    <FileText className="w-5 h-5 mr-3" />
                    Queue Extraction
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Queue */}
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6 flex flex-col max-h-[700px]">
          <h3 className="text-xl font-bold text-gray-300 border-b border-gray-800 pb-4">Document Queue</h3>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No documents in queue.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-white font-bold max-w-[200px] xl:max-w-xs truncate" title={task.filename}>{task.filename}</h4>
                      <p className="text-xs text-orange-400 mt-1 uppercase tracking-wider font-mono">Status: {task.status}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-mono text-emerald-400 font-bold">{task.categoriesFound}</span>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest">Cat. Found</p>
                    </div>
                  </div>

                  <div className="text-sm text-gray-400 font-medium">
                    {task.progressText}
                  </div>

                  {task.error && (
                    <div className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">
                      {task.error}
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-gray-800">
                     <button
                        onClick={() => toggleTaskStatus(task.id)}
                        className="flex items-center text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700"
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

