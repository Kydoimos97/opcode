import { api } from './api';

export interface CCodeSettings {
  projects: Record<string, ProjectMeta>;
  sessions: Record<string, SessionMeta>;
}

export interface ProjectMeta {
  name?: string;
  color?: string;
}

export interface SessionMeta {
  name?: string;
}

const DEFAULTS: CCodeSettings = { projects: {}, sessions: {} };

let cache: CCodeSettings | null = null;
let loadPromise: Promise<CCodeSettings> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<CCodeSettings> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = api.readCcodeSettings().then(raw => {
    cache = {
      projects: raw.projects ?? {},
      sessions: raw.sessions ?? {},
    };
    return cache;
  }).catch(() => {
    cache = structuredClone(DEFAULTS);
    return cache;
  });
  return loadPromise;
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (cache) api.writeCcodeSettings(cache).catch(console.error);
  }, 300);
}

export const ccodeSettings = {
  async getProject(projectId: string): Promise<ProjectMeta> {
    const s = await load();
    return s.projects[projectId] ?? {};
  },

  async setProject(projectId: string, patch: Partial<ProjectMeta>): Promise<void> {
    const s = await load();
    s.projects[projectId] = { ...s.projects[projectId], ...patch };
    scheduleWrite();
  },

  async getSession(sessionId: string): Promise<SessionMeta> {
    const s = await load();
    return s.sessions[sessionId] ?? {};
  },

  async setSession(sessionId: string, patch: Partial<SessionMeta>): Promise<void> {
    const s = await load();
    s.sessions[sessionId] = { ...s.sessions[sessionId], ...patch };
    scheduleWrite();
  },

  /** Flush any pending write immediately. */
  async flush(): Promise<void> {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (cache) await api.writeCcodeSettings(cache);
  },

  /** Pre-warm the cache (call on app start). */
  warmup(): void { load(); },
};
