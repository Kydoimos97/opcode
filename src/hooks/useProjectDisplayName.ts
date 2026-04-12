import { useState, useEffect } from 'react';

export function useProjectDisplayName(projectPath: string | null | undefined): {
  displayName: string | null;
  setDisplayName: (name: string | null) => void;
} {
  const [displayName, setDisplayNameState] = useState<string | null>(null);

  if (!projectPath) {
    return {
      displayName: null,
      setDisplayName: () => {}
    };
  }

  const storageKey = `display_name:${projectPath}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setDisplayNameState(stored);
    } catch (e) {
      console.error('Failed to load display name from localStorage:', e);
    }
  }, [projectPath, storageKey]);

  const setDisplayName = (name: string | null) => {
    try {
      if (name === null) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, name);
      }
      setDisplayNameState(name);
    } catch (e) {
      console.error('Failed to save display name to localStorage:', e);
    }
  };

  return { displayName, setDisplayName };
}
