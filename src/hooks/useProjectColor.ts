import { useState, useEffect } from 'react';
import { ccodeSettings } from '@/lib/ccodeSettings';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#3b82f6', '#a855f7',
];

function defaultColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function useProjectColor(projectPath: string | null | undefined): {
  color: string;
  setColor: (color: string) => void;
} {
  const [color, setColorState] = useState<string>(() =>
    projectPath ? defaultColor(projectPath) : PALETTE[0]
  );

  useEffect(() => {
    if (!projectPath) return;
    ccodeSettings.getProject(projectPath).then(meta => {
      setColorState(meta.color ?? defaultColor(projectPath));
    });
  }, [projectPath]);

  const setColor = (newColor: string) => {
    if (!projectPath) return;
    setColorState(newColor);
    ccodeSettings.setProject(projectPath, { color: newColor });
  };

  return { color, setColor };
}
