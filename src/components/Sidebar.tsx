import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, PanelLeftClose, GitBranch } from 'lucide-react';
import { useTabContext, type Tab } from '@/contexts/TabContext';
import { api, type GitInfo, type WorktreeInfo } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TooltipSimple } from '@/components/ui/tooltip-modern';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GroupedTabs {
  repoName: string;
  worktrees: Map<string, Tab[]>;
  ungroupedTabs: Tab[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { tabs, activeTabId, setActiveTab } = useTabContext();
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [gitInfoVersion, setGitInfoVersion] = useState(0);
  const [worktreeVersion, setWorktreeVersion] = useState(0);
  const gitInfoCache = useRef<Map<string, GitInfo>>(new Map());
  const worktreeCache = useRef<Map<string, WorktreeInfo[]>>(new Map());

  const chatTabs = useMemo(
    () => tabs.filter((tab) => tab.type === 'chat'),
    [tabs]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupedTabs = useMemo(() => {
    const groups = new Map<string, GroupedTabs>();

    chatTabs.forEach((tab) => {
      const path = tab.initialProjectPath;
      if (!path) return;

      const cached = gitInfoCache.current.get(path);
      const repoName = cached?.repo_name || path.split(/[\\/]/).pop() || 'Unknown';

      if (!groups.has(repoName)) {
        groups.set(repoName, {
          repoName,
          worktrees: new Map(),
          ungroupedTabs: []
        });
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
  // gitInfoVersion and worktreeVersion trigger re-group when caches are populated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTabs, gitInfoVersion, worktreeVersion]);

  // Auto-expand new repos when they appear
  useEffect(() => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      groupedTabs.forEach((g) => next.add(g.repoName));
      return next;
    });
  }, [groupedTabs]);

  const loadGitInfo = async (path: string) => {
    if (gitInfoCache.current.has(path)) {
      return;
    }

    try {
      const info = await api.getGitInfo(path);
      gitInfoCache.current.set(path, info);
      setGitInfoVersion((v) => v + 1);
    } catch (e) {
      console.error(`Failed to get git info for ${path}:`, e);
    }
  };

  const loadWorktrees = async (path: string) => {
    if (worktreeCache.current.has(path)) {
      return;
    }

    try {
      const worktrees = await api.getWorktrees(path);
      worktreeCache.current.set(path, worktrees);
      setWorktreeVersion((v) => v + 1);
    } catch (e) {
      console.error(`Failed to get worktrees for ${path}:`, e);
    }
  };

  useEffect(() => {
    chatTabs.forEach((tab) => {
      if (tab.initialProjectPath) {
        loadGitInfo(tab.initialProjectPath);
        loadWorktrees(tab.initialProjectPath);
      }
    });
  }, [chatTabs]);

  const toggleRepoExpanded = (repoName: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
      }
      return next;
    });
  };

  const getStatusDotColor = (status: Tab['status']): string => {
    switch (status) {
      case 'running':
        return 'bg-blue-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      case 'complete':
        return 'bg-green-500';
      default:
        return 'bg-muted-foreground/40';
    }
  };

  return (
    <motion.div
      className={cn(
        'flex flex-col border-r border-border/50 bg-background overflow-hidden',
        'w-60'
      )}
      animate={{ width: isOpen ? 240 : 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      style={{ flexShrink: 0 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Projects
        </span>
        <TooltipSimple content="Close sidebar" side="right">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PanelLeftClose size={14} />
          </button>
        </TooltipSimple>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groupedTabs.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            No open chat sessions
          </div>
        ) : (
          groupedTabs.map((group) => (
            <div key={group.repoName} className="border-b border-border/30 last:border-b-0">
              <button
                onClick={() => toggleRepoExpanded(group.repoName)}
                className="w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors flex items-center gap-2 group"
              >
                {expandedRepos.has(group.repoName) ? (
                  <ChevronDown size={14} className="flex-shrink-0" />
                ) : (
                  <ChevronRight size={14} className="flex-shrink-0" />
                )}
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
                      Array.from(group.worktrees.entries()).map(([branch, tabs]) => (
                        <div key={branch}>
                          <div className="px-4 py-1 pl-8 flex items-center gap-1 text-xs text-muted-foreground">
                            <GitBranch size={12} className="flex-shrink-0" />
                            <span className="truncate">{branch}</span>
                          </div>
                          {tabs.map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                'w-full px-4 py-2 text-left text-xs flex items-center gap-2 truncate transition-colors',
                                'pl-12 hover:bg-accent/50',
                                activeTabId === tab.id
                                  ? 'bg-accent text-accent-foreground'
                                  : 'text-foreground/70'
                              )}
                            >
                              <div
                                className={cn(
                                  'w-2 h-2 rounded-full flex-shrink-0',
                                  getStatusDotColor(tab.status)
                                )}
                              />
                              <span className="truncate">{tab.title}</span>
                            </button>
                          ))}
                        </div>
                      ))
                    ) : (
                      group.ungroupedTabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            'w-full px-4 py-2 text-left text-xs flex items-center gap-2 truncate transition-colors',
                            'pl-8 hover:bg-accent/50',
                            activeTabId === tab.id
                              ? 'bg-accent text-accent-foreground'
                              : 'text-foreground/70'
                          )}
                        >
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full flex-shrink-0',
                              getStatusDotColor(tab.status)
                            )}
                          />
                          <span className="truncate">{tab.title}</span>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
