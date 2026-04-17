import { useState, useEffect } from 'react';
import { isDebugMode, setDebugMode } from '@/lib/debugMode';

export function useDebugMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const mode = await isDebugMode();
      setEnabled(mode);
    })();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail);
    window.addEventListener('ccode-debug-mode-changed', handler);
    return () => window.removeEventListener('ccode-debug-mode-changed', handler);
  }, []);

  return { debugMode: enabled, setDebugMode };
}
