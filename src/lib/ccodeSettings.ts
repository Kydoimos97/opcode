import { api } from './api';

export const CURRENT_SCHEMA_VERSION = 1;

export interface CCodeSettings {
  schema_version: number;
  projects: Record<string, ProjectMeta>;
  sessions: Record<string, SessionMeta>;
  startup_intro_enabled: boolean;
  show_system_footer: boolean;
  font_sans: string;
  font_mono: string;
  font_size: number;
}

export interface ProjectMeta {
  name?: string;
  color?: string;
}

export interface SessionMeta {
  name?: string;
}

const DEFAULTS: CCodeSettings = {
  schema_version: CURRENT_SCHEMA_VERSION,
  projects: {},
  sessions: {},
  startup_intro_enabled: true,
  show_system_footer: true,
  font_sans: '',
  font_mono: '',
  font_size: 14,
};

let cache: CCodeSettings | null = null;
let loadPromise: Promise<CCodeSettings> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function persistCache(): Promise<void> {
  if (!cache) return;
  const current = await api.readCcodeSettings().catch(() => ({} as Record<string, any>));
  await api.writeCcodeSettings({ ...current, ...cache });
}

async function load(): Promise<CCodeSettings> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = api.readCcodeSettings().then(raw => {
    const prevVersion = typeof raw.schema_version === 'number' ? raw.schema_version : 0;

    let startupIntro = DEFAULTS.startup_intro_enabled;
    if (typeof raw.startup_intro_enabled === 'boolean') {
      startupIntro = raw.startup_intro_enabled;
    } else if (raw.startup_intro_enabled === 'false') {
      startupIntro = false;
    } else if (raw.startup_intro_enabled === 'true') {
      startupIntro = true;
    }

    cache = {
      schema_version: CURRENT_SCHEMA_VERSION,
      projects: raw.projects ?? {},
      sessions: raw.sessions ?? {},
      startup_intro_enabled: startupIntro,
      show_system_footer: raw.show_system_footer ?? DEFAULTS.show_system_footer,
      font_sans: raw.font_sans ?? DEFAULTS.font_sans,
      font_mono: raw.font_mono ?? DEFAULTS.font_mono,
      font_size: raw.font_size ?? DEFAULTS.font_size,
    };

    if (prevVersion < CURRENT_SCHEMA_VERSION) {
      scheduleWrite();
    }
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
    persistCache().catch(console.error);
    writeTimer = null;
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

  async getPreference<K extends keyof Omit<CCodeSettings, 'projects' | 'sessions'>>(
    key: K
  ): Promise<CCodeSettings[K]> {
    const s = await load();
    return s[key];
  },

  async setPreference<K extends keyof Omit<CCodeSettings, 'projects' | 'sessions'>>(
    key: K,
    value: CCodeSettings[K]
  ): Promise<void> {
    const s = await load();
    s[key] = value;
    scheduleWrite();
  },

  /** Flush any pending write immediately. */
  async flush(): Promise<void> {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    await persistCache();
  },

  /** Pre-warm the cache (call on app start). */
  warmup(): void { load(); },
};
