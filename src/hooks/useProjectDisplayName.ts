import { useState, useEffect } from 'react';
import { ccodeSettings } from '@/lib/ccodeSettings';

export function useProjectDisplayName(projectPath: string | null | undefined): {
  displayName: string | null;
  setDisplayName: (name: string | null) => void;
} {
  const [displayName, setDisplayNameState] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath) { setDisplayNameState(null); return; }
    ccodeSettings.getProject(projectPath).then(meta => {
      setDisplayNameState(meta.name ?? null);
    });
  }, [projectPath]);

  const setDisplayName = (name: string | null) => {
    if (!projectPath) return;
    setDisplayNameState(name);
    ccodeSettings.setProject(projectPath, { name: name ?? undefined });
  };

  return { displayName, setDisplayName };
}
