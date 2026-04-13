import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { TabPersistenceService } from '@/services/tabPersistence';
import { SessionPersistenceService } from '@/services/sessionPersistence';
import { api } from '@/lib/api';

export interface Tab {
  id: string;
  type: 'chat' | 'agent' | 'agents' | 'projects' | 'usage' | 'mcp' | 'settings' | 'claude-md' | 'claude-file' | 'agent-execution' | 'create-agent' | 'import-agent' | 'claude-explorer' | 'session-logs' | 'skills' | 'plugins' | 'terminal';
  title: string;
  sessionId?: string;  // for chat tabs
  sessionData?: any; // for chat tabs - stores full session object
  agentRunId?: string; // for agent tabs
  agentData?: any; // for agent-execution tabs
  claudeFileId?: string; // for claude-file tabs
  initialProjectPath?: string; // for chat tabs
  projectPath?: string; // for agent-execution and terminal tabs
  claudeSessionId?: string; // JSONL session UUID for file polling
  claudeProjectId?: string; // ~/.claude/projects/<id> folder name for file polling
  status: 'active' | 'idle' | 'running' | 'complete' | 'error' | 'waiting';
  hasUnsavedChanges: boolean;
  order: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (tab: Omit<Tab, 'id' | 'order' | 'createdAt' | 'updatedAt'>) => string;
  removeTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  getTabById: (id: string) => Tab | undefined;
  closeAllTabs: () => void;
  getTabsByType: (type: 'chat' | 'agent') => Tab[];
}

const TabContext = createContext<TabContextType | undefined>(undefined);

// const STORAGE_KEY = 'opcode_tabs'; // No longer needed - persistence disabled
const MAX_TABS = 20;

export const TabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Load tabs from storage on mount
  useEffect(() => {
    const loadTabs = async () => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Migrate from old format if needed
    TabPersistenceService.migrateFromOldFormat();

    // Try to load saved tabs
    const { tabs: savedTabs, activeTabId: savedActiveTabId } = TabPersistenceService.loadTabs();
    
    if (savedTabs.length > 0) {
      // For chat tabs, restore session data
      let restoredTabs = await Promise.all(savedTabs.map(async (tab) => {
        if (tab.type === 'chat' && tab.sessionId) {
          // Check if session can be restored
          const sessionData = SessionPersistenceService.loadSession(tab.sessionId);
          if (sessionData) {
            // Create a Session object for the tab
            const session = SessionPersistenceService.createSessionFromRestoreData(sessionData);
            return {
              ...tab,
              sessionData: session,
              initialProjectPath: sessionData.projectPath
            };
          }
        }
        return tab;
      }));

      // Merge sessions from sidebar_state.json that weren't in localStorage
      // (e.g. sessions that were running when app closed before fix #1 was deployed)
      try {
        const sidebarState = await api.loadSidebarState();
        if (sidebarState?.sessions) {
          for (const s of sidebarState.sessions) {
            if (!s.session_id || !s.project_id) continue;
            const alreadyPresent = restoredTabs.some(t =>
              t.claudeSessionId === s.session_id || t.sessionId === s.session_id
            );
            if (!alreadyPresent) {
              restoredTabs.push({
                id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'chat',
                title: s.title || 'Session',
                sessionId: s.session_id,
                claudeSessionId: s.session_id,
                claudeProjectId: s.project_id,
                initialProjectPath: s.project_path || '',
                status: 'idle',
                hasUnsavedChanges: false,
                order: restoredTabs.length,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as any);
            }
          }
        }
      } catch { /* ignore — sidebar_state.json is optional */ }

      setTabs(restoredTabs);
      setActiveTabId(savedActiveTabId);
    } else {
      // Create default projects tab if no saved tabs
      const defaultTab: Tab = {
        id: generateTabId(),
        type: 'projects',
        title: 'Projects',
        status: 'idle',
        hasUnsavedChanges: false,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
    };
    
    loadTabs();
  }, []);

  // Save tabs to localStorage with debounce
  useEffect(() => {
    // Don't save if not initialized
    if (!isInitialized.current) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saving to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      TabPersistenceService.saveTabs(tabs, activeTabId);

      // Also persist to sidebar_state.json for cross-restart session recovery
      const chatSessions = tabs
        .filter(t => t.type === 'chat' && (t.claudeSessionId || t.sessionId))
        .map(t => ({
          session_id: t.claudeSessionId || t.sessionId!,
          project_id: t.claudeProjectId || (t.sessionData as any)?.project_id || '',
          project_path: t.initialProjectPath || '',
          title: t.title,
        }))
        .filter(s => s.project_id);
      api.saveSidebarState({ sessions: chatSessions }).catch(() => {});
    }, 500); // Wait 500ms after last change before saving

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tabs, activeTabId]);

  // Save tabs immediately when window is about to close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isInitialized.current && tabs.length > 0) {
        TabPersistenceService.saveTabs(tabs, activeTabId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Save one final time when component unmounts
      if (isInitialized.current && tabs.length > 0) {
        TabPersistenceService.saveTabs(tabs, activeTabId);
      }
    };
  }, [tabs, activeTabId]);

  const generateTabId = () => {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const addTab = useCallback((tabData: Omit<Tab, 'id' | 'order' | 'createdAt' | 'updatedAt'>): string => {
    if (tabs.length >= MAX_TABS) {
      throw new Error(`Maximum number of tabs (${MAX_TABS}) reached`);
    }

    const newTab: Tab = {
      ...tabData,
      id: generateTabId(),
      order: tabs.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, [tabs.length]);

  const removeTab = useCallback((id: string) => {
    setTabs(prevTabs => {
      const filteredTabs = prevTabs.filter(tab => tab.id !== id);
      
      // Reorder remaining tabs
      const reorderedTabs = filteredTabs.map((tab, index) => ({
        ...tab,
        order: index
      }));

      // Update active tab if necessary
      if (activeTabId === id && reorderedTabs.length > 0) {
        const removedTabIndex = prevTabs.findIndex(tab => tab.id === id);
        const newActiveIndex = Math.min(removedTabIndex, reorderedTabs.length - 1);
        setActiveTabId(reorderedTabs[newActiveIndex].id);
      } else if (reorderedTabs.length === 0) {
        setActiveTabId(null);
      }

      return reorderedTabs;
    });
  }, [activeTabId]);

  const updateTab = useCallback((id: string, updates: Partial<Tab>) => {
    setTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.id === id 
          ? { ...tab, ...updates, updatedAt: new Date() }
          : tab
      )
    );
  }, []);

  const setActiveTab = useCallback((id: string) => {
    if (tabs.find(tab => tab.id === id)) {
      setActiveTabId(id);
    }
  }, [tabs]);

  const reorderTabs = useCallback((startIndex: number, endIndex: number) => {
    setTabs(prevTabs => {
      const newTabs = [...prevTabs];
      const [removed] = newTabs.splice(startIndex, 1);
      newTabs.splice(endIndex, 0, removed);
      
      // Update order property
      return newTabs.map((tab, index) => ({
        ...tab,
        order: index
      }));
    });
  }, []);

  const getTabById = useCallback((id: string): Tab | undefined => {
    return tabs.find(tab => tab.id === id);
  }, [tabs]);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    TabPersistenceService.clearTabs();
  }, []);

  const getTabsByType = useCallback((type: 'chat' | 'agent'): Tab[] => {
    return tabs.filter(tab => tab.type === type);
  }, [tabs]);

  const value: TabContextType = {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    updateTab,
    setActiveTab,
    reorderTabs,
    getTabById,
    closeAllTabs,
    getTabsByType
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
};

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};
