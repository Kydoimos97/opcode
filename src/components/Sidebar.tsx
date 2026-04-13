import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  Plus,
  GitBranch,
  FolderOpen,
  Bot,
  BarChart3,
  Server,
  FileText,
  FolderSearch,
  Settings,
  X,
} from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useTabContext, type Tab } from '@/contexts/TabContext';
import { useTabState } from '@/hooks/useTabState';
import { api, type GitInfo, type WorktreeInfo, type SessionFileStatus } from '@/lib/api';
import { ccodeSettings } from '@/lib/ccodeSettings';
import { cn } from '@/lib/utils';
import { TooltipSimple } from '@/components/ui/tooltip-modern';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface GroupedTabs {
  repoName: string;
  worktrees: Map<string, Tab[]>;
  ungroupedTabs: Tab[];
}

const UTILITY_ITEMS = [
  { icon: FolderOpen, label: 'Projects', type: 'projects' as const },
  { icon: Bot, label: 'Agents', type: 'agents' as const },
  { icon: BarChart3, label: 'Usage', type: 'usage' as const },
  { icon: Server, label: 'MCP Servers', type: 'mcp' as const },
  { icon: FileText, label: 'CLAUDE.md', type: 'claude-md' as const },
  { icon: FolderSearch, label: '.claude Explorer', type: 'claude-explorer' as const },
  { icon: Settings, label: 'Settings', type: 'settings' as const },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { tabs, activeTabId, setActiveTab, updateTab } = useTabContext();
  const {
    createChatTab,
    createProjectsTab,
    createAgentsTab,
    createUsageTab,
    createMCPTab,
    createClaudeMdTab,
    createExplorerTab,
    createLogsTab,
    createSettingsTab,
    closeTab,
  } = useTabState();

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [gitInfoVersion, setGitInfoVersion] = useState(0);
  const [worktreeVersion, setWorktreeVersion] = useState(0);
  const [displayNameVersion, setDisplayNameVersion] = useState(0);
  const gitInfoCache = useRef<Map<string, GitInfo>>(new Map());
  const worktreeCache = useRef<Map<string, WorktreeInfo[]>>(new Map());
  const displayNameCache = useRef<Map<string, string | null>>(new Map());
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [lastMessageVersion, setLastMessageVersion] = useState(0);
  const lastMessageCache = useRef<Map<string, string>>(new Map());

  const chatTabs = useMemo(
    () => tabs.filter((tab) => tab.type === 'chat'),
    [tabs]
  );

  const groupedTabs = useMemo(() => {
    const groups = new Map<string, GroupedTabs>();

    chatTabs.forEach((tab) => {
      const path = tab.initialProjectPath;
      if (!path) return;

      const cached = gitInfoCache.current.get(path);
      const customName = displayNameCache.current.get(path);
      const repoName = customName ?? cached?.repo_name ?? path.split(/[\\/]/).pop() ?? 'Unknown';

      if (!groups.has(repoName)) {
        groups.set(repoName, { repoName, worktrees: new Map(), ungroupedTabs: [] });
      }

      const group = groups.get(repoName)!;
      const worktrees = worktreeCache.current.get(path);

      if (worktrees && worktrees.length > 0) {
        const matchedWorktree = worktrees.find(w => w.path === path);
        const branchKey = matchedWorktree?.branch || cached?.branch || 'Unknown';
        if (!group.worktrees.has(branchKey)) {
          group.worktrees.set(branchKey, []);
        }
        group.worktrees.get(branchKey)!.push(tab);
      } else {
        group.ungroupedTabs.push(tab);
      }
    });

    return Array.from(groups.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTabs, gitInfoVersion, worktreeVersion, displayNameVersion]);

  useEffect(() => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      groupedTabs.forEach((g) => next.add(g.repoName));
      return next;
    });
  }, [groupedTabs]);

  const loadDisplayName = async (path: string) => {
    if (displayNameCache.current.has(path)) return;
    try {
      const meta = await ccodeSettings.getProject(path);
      displayNameCache.current.set(path, meta.name ?? null);
      setDisplayNameVersion((v) => v + 1);
    } catch {
      displayNameCache.current.set(path, null);
    }
  };

  const loadGitInfo = async (path: string) => {
    if (gitInfoCache.current.has(path)) return;
    try {
      const info = await api.getGitInfo(path);
      gitInfoCache.current.set(path, info);
      setGitInfoVersion((v) => v + 1);
    } catch (e) {
      console.error(`Failed to get git info for ${path}:`, e);
    }
  };

  const loadWorktrees = async (path: string) => {
    if (worktreeCache.current.has(path)) return;
    try {
      const worktrees = await api.getWorktrees(path);
      worktreeCache.current.set(path, worktrees);
      setWorktreeVersion((v) => v + 1);
    } catch (e) {
      console.error(`Failed to get worktrees for ${path}:`, e);
    }
  };

  // Poll session file status every 5s for all chat tabs that have session IDs stored
  useEffect(() => {
    const interval = setInterval(async () => {
      const pollTargets = tabs.filter(
        t => t.type === 'chat' && t.claudeSessionId && t.claudeProjectId
      );
      for (const tab of pollTargets) {
        try {
          const status: SessionFileStatus = await api.getSessionFileStatus(
            tab.claudeSessionId!,
            tab.claudeProjectId!,
          );
          let newStatus: Tab['status'];
          if (status.last_type === 'result') {
            newStatus = status.is_error ? 'error' : 'complete';
          } else if (status.awaiting_approval) {
            newStatus = 'idle'; // no 'waiting' status in the Tab type — idle is the fallback
          } else if (status.modified_secs_ago < 30) {
            newStatus = 'running';
          } else {
            newStatus = 'idle';
          }
          if (status.last_user_message) {
            const prev = lastMessageCache.current.get(tab.id);
            if (prev !== status.last_user_message) {
              lastMessageCache.current.set(tab.id, status.last_user_message);
              setLastMessageVersion((v) => v + 1);
            }
          }
          // Only update if changed to avoid unnecessary re-renders
          if (tab.status !== newStatus) {
            updateTab(tab.id, { status: newStatus });
          }
        } catch {
          // Silently ignore
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [tabs, updateTab]);

  useEffect(() => {
    chatTabs.forEach((tab) => {
      if (tab.initialProjectPath) {
        loadGitInfo(tab.initialProjectPath);
        loadWorktrees(tab.initialProjectPath);
        loadDisplayName(tab.initialProjectPath);
      }
    });
  }, [chatTabs]);

  const toggleRepoExpanded = (repoName: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) next.delete(repoName);
      else next.add(repoName);
      return next;
    });
  };

  const getStatusDotColor = (status: Tab['status']): string => {
    switch (status) {
      case 'running': return 'bg-blue-500 animate-pulse';
      case 'error': return 'bg-red-500';
      case 'complete': return 'bg-green-500';
      default: return 'bg-muted-foreground/40';
    }
  };

  const handleUtilityClick = (type: Tab['type']) => {
    const creators: Record<Tab['type'], () => string | null> = {
      'projects': createProjectsTab,
      'agents': createAgentsTab,
      'usage': createUsageTab,
      'mcp': createMCPTab,
      'claude-md': createClaudeMdTab,
      'claude-explorer': createExplorerTab,
      'session-logs': createLogsTab,
      'settings': createSettingsTab,
      'chat': () => null,
      'agent': () => null,
      'agent-execution': () => null,
      'claude-file': () => null,
      'create-agent': () => null,
      'import-agent': () => null,
    };
    creators[type]?.();
  };

  const isUtilityActive = (type: Tab['type']): boolean =>
    activeTabId ? tabs.find(t => t.id === activeTabId)?.type === type : false;

  return (
    <motion.div
      className="flex flex-col border-r border-border/50 bg-background overflow-hidden flex-shrink-0"
      initial={false}
      animate={{ width: isOpen ? 240 : 48 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-border/50 flex-shrink-0">
        {isOpen ? (
          <>
            <div className="flex items-center gap-2">
              <img src={appLogo} alt="C-Code" className="w-5 h-5 object-contain flex-shrink-0" />
              <span className="text-sm font-semibold text-foreground whitespace-nowrap">C-Code</span>
            </div>
            <TooltipSimple content="Collapse sidebar" side="right">
              <button
                onClick={onToggle}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors tauri-no-drag"
              >
                <PanelLeftClose size={14} />
              </button>
            </TooltipSimple>
          </>
        ) : (
          <TooltipSimple content="Expand sidebar" side="right">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center p-2 rounded hover:bg-muted hover:text-foreground transition-colors tauri-no-drag"
            >
              <PanelLeft size={14} />
            </button>
          </TooltipSimple>
        )}
      </div>

      {/* New Session Button */}
      <div className="px-2 py-2 flex-shrink-0">
        {isOpen ? (
          <button
            onClick={() => createChatTab()}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm font-medium tauri-no-drag"
          >
            <Plus size={16} />
            <span>New Session</span>
          </button>
        ) : (
          <TooltipSimple content="New Session" side="right">
            <button
              onClick={() => createChatTab()}
              className="w-full flex items-center justify-center p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors tauri-no-drag"
            >
              <Plus size={16} />
            </button>
          </TooltipSimple>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isOpen && chatTabs.length > 0 && (
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions
          </div>
        )}

        {chatTabs.length === 0 ? (
          isOpen && (
            <div className="p-4 text-xs text-muted-foreground text-center">
              No chat sessions
            </div>
          )
        ) : (
          groupedTabs.map((group) => (
            <div key={group.repoName} className="border-b border-border/30 last:border-b-0">
              {isOpen ? (
                <>
                  <button
                    onClick={() => toggleRepoExpanded(group.repoName)}
                    className="w-full px-4 py-2 text-left hover:bg-muted/80 transition-colors flex items-center gap-2 group"
                  >
                    {expandedRepos.has(group.repoName)
                      ? <ChevronDown size={14} className="flex-shrink-0" />
                      : <ChevronRight size={14} className="flex-shrink-0" />}
                    <span className="text-xs font-semibold truncate text-foreground group-hover:text-accent-foreground">
                      {group.repoName}
                    </span>
                  </button>

                  <AnimatePresence>
                    {expandedRepos.has(group.repoName) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {group.worktrees.size > 0 ? (
                          Array.from(group.worktrees.entries()).map(([branch, tabs_]) => (
                            <div key={branch}>
                              <div className="px-4 py-1 pl-8 flex items-center gap-1 text-xs text-muted-foreground">
                                <GitBranch size={12} className="flex-shrink-0" />
                                <span className="truncate">{branch}</span>
                              </div>
                              {tabs_.map((tab) => (
                                <div
                                  key={tab.id}
                                  className="group/tab"
                                  onMouseEnter={() => setHoveredSessionId(tab.id)}
                                  onMouseLeave={() => setHoveredSessionId(null)}
                                >
                                  <button
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                      'w-full px-4 py-2 text-left text-xs flex items-center gap-2 overflow-hidden transition-colors pl-12 hover:bg-muted/80',
                                      activeTabId === tab.id ? 'bg-muted text-foreground' : 'text-foreground/70'
                                    )}
                                  >
                                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusDotColor(tab.status))} />
                                    <div className="flex-1 min-w-0">
                                      <div className="truncate">{tab.title}</div>
                                      {lastMessageCache.current.get(tab.id) && (
                                        <div className="truncate text-muted-foreground/60 mt-0.5" style={{ fontSize: '10px' }}>
                                          {lastMessageCache.current.get(tab.id)}
                                        </div>
                                      )}
                                    </div>
                                    {hoveredSessionId === tab.id && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                        className="p-1 rounded hover:bg-muted/80 flex-shrink-0"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ))
                        ) : (
                          group.ungroupedTabs.map((tab) => (
                            <div
                              key={tab.id}
                              className="group/tab"
                              onMouseEnter={() => setHoveredSessionId(tab.id)}
                              onMouseLeave={() => setHoveredSessionId(null)}
                            >
                              <button
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                  'w-full px-4 py-2 text-left text-xs flex items-center gap-2 overflow-hidden transition-colors pl-8 hover:bg-muted/80',
                                  activeTabId === tab.id ? 'bg-muted text-foreground' : 'text-foreground/70'
                                )}
                              >
                                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusDotColor(tab.status))} />
                                <div className="flex-1 min-w-0">
                                  <div className="truncate">{tab.title}</div>
                                  {lastMessageCache.current.get(tab.id) && (
                                    <div className="truncate text-muted-foreground/60 mt-0.5" style={{ fontSize: '10px' }}>
                                      {lastMessageCache.current.get(tab.id)}
                                    </div>
                                  )}
                                </div>
                                {hoveredSessionId === tab.id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                    className="p-1 rounded hover:bg-muted/80 flex-shrink-0"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </button>
                            </div>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="flex items-center justify-center py-1">
                  <div className={cn('w-2 h-2 rounded-full', getStatusDotColor(
                    group.ungroupedTabs[0]?.status ?? Array.from(group.worktrees.values()).flat()[0]?.status
                  ))} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border/30 flex-shrink-0" />

      {/* Utility Navigation Items */}
      <div className="flex flex-col flex-shrink-0">
        {UTILITY_ITEMS.map(({ icon: Icon, label, type }) => (
          <div key={type}>
            {isOpen ? (
              <button
                onClick={() => handleUtilityClick(type)}
                className={cn(
                  'w-full px-4 py-2 text-left text-xs flex items-center gap-2 transition-colors tauri-no-drag hover:bg-muted/80',
                  isUtilityActive(type) ? 'bg-muted text-foreground' : 'text-foreground/70'
                )}
              >
                <Icon size={14} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ) : (
              <TooltipSimple content={label} side="right">
                <button
                  onClick={() => handleUtilityClick(type)}
                  className={cn(
                    'w-full flex items-center justify-center p-2 transition-colors tauri-no-drag hover:bg-muted/80',
                    isUtilityActive(type) ? 'bg-muted text-foreground' : 'text-foreground/70'
                  )}
                >
                  <Icon size={14} />
                </button>
              </TooltipSimple>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
