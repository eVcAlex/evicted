'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearMe, readMe, writeMe, type StoredIdentity } from '@/lib/meStorage';

interface MeContextValue {
  me: StoredIdentity | null;
  /** True once the localStorage read has happened — guards against a flash
   * of "not me" highlighting during the first client render. */
  ready: boolean;
  setMe: (identity: StoredIdentity) => void;
  clear: () => void;
}

const MeContext = createContext<MeContextValue | null>(null);

/**
 * Reads localStorage in an effect rather than in `useState`'s initializer, an
 * "unknown until mounted" pattern, so server and first-client-render markup
 * match and highlighting simply flashes in a beat later instead of causing a
 * hydration mismatch.
 */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMeState] = useState<StoredIdentity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMeState(readMe());
    setReady(true);
  }, []);

  const setMe = useCallback((identity: StoredIdentity) => {
    writeMe(identity);
    setMeState(identity);
  }, []);

  const clear = useCallback(() => {
    clearMe();
    setMeState(null);
  }, []);

  return <MeContext.Provider value={{ me, ready, setMe, clear }}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const context = useContext(MeContext);
  if (!context) throw new Error('useMe must be used within a MeProvider');
  return context;
}
