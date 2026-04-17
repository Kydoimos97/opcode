import type { MCPServer, Project } from '@/lib/api';

export interface PluginListCache {
  installed: unknown[];
  available: unknown[];
}

export interface StartupCache {
  mcpServers: MCPServer[] | null;
  plugins: PluginListCache | null;
  projects: Project[] | null;
  lastUpdated: Date | null;
}

export const startupCache: StartupCache = {
  mcpServers: null,
  plugins: null,
  projects: null,
  lastUpdated: null,
};
