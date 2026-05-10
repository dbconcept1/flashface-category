import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { CategoryResearchState } from '../services/aiService';

type EnhancingIds = Record<string, CategoryResearchState>;
type SetEnhancingIds = (updater: EnhancingIds | ((prev: EnhancingIds) => EnhancingIds)) => void;

/**
 * Split into two contexts so components that only WRITE (App.tsx) don't re-render
 * when research progress updates, while components that READ (CategoriesView) do.
 */
const ResearchStateContext = createContext<EnhancingIds>({});
const ResearchSetterContext = createContext<SetEnhancingIds>(() => {});

export function ResearchProvider({ children }: { children: ReactNode }) {
  const [enhancingIds, setEnhancingIds] = useState<EnhancingIds>({});

  // Stable setter — its reference never changes, so callers don't re-render just
  // because they hold a reference to it.
  const setterRef = useRef<SetEnhancingIds>(setEnhancingIds);
  setterRef.current = setEnhancingIds;
  const stableSet = useCallback<SetEnhancingIds>((updater) => {
    setterRef.current(updater as any);
  }, []);

  return (
    <ResearchSetterContext.Provider value={stableSet}>
      <ResearchStateContext.Provider value={enhancingIds}>
        {children}
      </ResearchStateContext.Provider>
    </ResearchSetterContext.Provider>
  );
}

/**
 * Returns only the setter. Subscribing to this does NOT cause re-renders when
 * research state changes (the setter reference is stable). Use in App.tsx.
 */
export const useResearchSetter = () => useContext(ResearchSetterContext);

/**
 * Returns the full enhancingIds map. Components using this WILL re-render on
 * every progress update. Use in CategoriesView and nowhere else.
 */
export const useResearchState = () => useContext(ResearchStateContext);
