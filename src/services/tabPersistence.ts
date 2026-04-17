/**
 * Tab Persistence Service
 * Handles saving and restoring tab state to/from ~/.ccode/states/cache/tabs.json
 */

import { api } from '@/lib/api';
import type { Tab } from '@/contexts/TabContext';

interface SerializedTab {
  id: string;
  type: Tab['type'];
  title: string;
  sessionId?: string;
  agentRunId?: string;
  claudeFileId?: string;
  initialProjectPath?: string;
  projectPath?: string;
  claudeSessionId?: string;
  claudeProjectId?: string;
  status: Tab['status'];
  hasUnsavedChanges: boolean;
  order: number;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

interface TabsCacheData {
  tabs: SerializedTab[];
  activeTabId: string | null;
}

export class TabPersistenceService {
  /**
   * Check if tab persistence is enabled (default: true)
   */
  static async isEnabled(): Promise<boolean> {
    try {
      const settings = await api.readCcodeSettings();
      const enabled = settings?.tabPersistence?.enabled;
      return enabled !== false;
    } catch {
      return true;
    }
  }

  /**
   * Enable or disable tab persistence
   */
  static async setEnabled(enabled: boolean): Promise<void> {
    try {
      const settings = await api.readCcodeSettings();
      const updated = {
        ...settings,
        tabPersistence: {
          ...(settings?.tabPersistence || {}),
          enabled
        }
      };
      await api.writeCcodeSettings(updated);
      if (!enabled) {
        await this.clearTabs();
      }
    } catch (err) {
      console.error('Failed to set tab persistence enabled:', err);
    }
  }
  /**
   * Save tabs to file
   */
  static async saveTabs(tabs: Tab[], activeTabId: string | null): Promise<void> {
    try {
      if (!await this.isEnabled()) return;

      const persistableTabs = tabs.filter(tab => {
        if (tab.type === 'create-agent' || tab.type === 'import-agent') return false;
        return true;
      });

      const serializedTabs: SerializedTab[] = persistableTabs.map(tab => ({
        id: tab.id,
        type: tab.type,
        title: tab.title,
        sessionId: tab.sessionId,
        agentRunId: tab.agentRunId,
        claudeFileId: tab.claudeFileId,
        initialProjectPath: tab.initialProjectPath,
        projectPath: tab.projectPath,
        claudeSessionId: tab.claudeSessionId,
        claudeProjectId: tab.claudeProjectId,
        status: (tab.status === 'running' || tab.status === 'waiting') ? 'idle' : tab.status,
        hasUnsavedChanges: false,
        order: tab.order,
        icon: tab.icon,
        createdAt: tab.createdAt instanceof Date ? tab.createdAt.toISOString() : tab.createdAt,
        updatedAt: tab.updatedAt instanceof Date ? tab.updatedAt.toISOString() : tab.updatedAt
      }));

      const validActiveTabId = activeTabId && persistableTabs.some(tab => tab.id === activeTabId)
        ? activeTabId
        : null;

      const cacheData: TabsCacheData = {
        tabs: serializedTabs,
        activeTabId: validActiveTabId
      };

      await api.writeTabsCache(JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save tabs:', error);
    }
  }

  /**
   * Load tabs from file
   */
  static async loadTabs(): Promise<{ tabs: Tab[], activeTabId: string | null }> {
    try {
      if (!await this.isEnabled()) {
        return { tabs: [], activeTabId: null };
      }

      const json = await api.readTabsCache();
      if (!json) {
        return { tabs: [], activeTabId: null };
      }

      const cacheData: TabsCacheData = JSON.parse(json);

      const tabs: Tab[] = cacheData.tabs.map(serialized => ({
        ...serialized,
        createdAt: new Date(serialized.createdAt),
        updatedAt: new Date(serialized.updatedAt),
        sessionData: undefined,
        agentData: undefined,
        status: (serialized.status === 'running' || serialized.status === 'waiting') ? 'idle' : serialized.status
      }));

      const validTabs = tabs.filter(tab => {
        if (!tab.id || !tab.type || !tab.title) return false;

        switch (tab.type) {
          case 'chat':
            return true;
          case 'agent':
            return !!tab.agentRunId;
          case 'agent-execution':
            return false;
          case 'claude-file':
            return !!tab.claudeFileId;
          default:
            return true;
        }
      });

      const orderedTabs = validTabs
        .sort((a, b) => a.order - b.order)
        .map((tab, index) => ({ ...tab, order: index }));

      const activeTabId = cacheData.activeTabId && orderedTabs.some(tab => tab.id === cacheData.activeTabId)
        ? cacheData.activeTabId
        : orderedTabs.length > 0 ? orderedTabs[0].id : null;

      return { tabs: orderedTabs, activeTabId };
    } catch (error) {
      console.error('Failed to load tabs:', error);
      return { tabs: [], activeTabId: null };
    }
  }

  /**
   * Clear saved tabs
   */
  static async clearTabs(): Promise<void> {
    try {
      const emptyData: TabsCacheData = {
        tabs: [],
        activeTabId: null
      };
      await api.writeTabsCache(JSON.stringify(emptyData));
    } catch (error) {
      console.error('Failed to clear tabs:', error);
    }
  }
}
