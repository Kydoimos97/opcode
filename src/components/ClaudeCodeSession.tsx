import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { api, type Session, type GitInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SessionHeader } from "./claude-code-session/SessionHeader";
import { SessionStatusBar } from "./SessionStatusBar";

// Conditional imports for Tauri APIs
let tauriListen: any;
type UnlistenFn = () => void;

try {
  tauriListen = require("@tauri-apps/api/event").listen;
} catch (e) {
  // Tauri APIs not available, web mode
}

// Web-compatible replacements
const listen = tauriListen || ((eventName: string, callback: (event: any) => void) => {
  const domEventHandler = (event: any) => {
    callback({ payload: event.detail });
  };
  window.addEventListener(eventName, domEventHandler);
  return Promise.resolve(() => {
    window.removeEventListener(eventName, domEventHandler);
  });
});
import { FloatingPromptInput, type FloatingPromptInputRef } from "./FloatingPromptInput";
import { ErrorBoundary } from "./ErrorBoundary";
import { TimelineNavigator } from "./TimelineNavigator";
import { CheckpointSettings } from "./CheckpointSettings";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { ApprovalBanner } from "./ApprovalBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TooltipProvider, TooltipSimple } from "@/components/ui/tooltip-modern";
import { SplitPane } from "@/components/ui/split-pane";
import { WebviewPreview } from "./WebviewPreview";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTabState } from "@/hooks/useTabState";
import { SessionPersistenceService } from "@/services/sessionPersistence";
import { useGroupedMessages } from "@/hooks/useGroupedMessages";
import { useMessagePartition } from "@/hooks/useMessagePartition";
import { useHookEvents } from "@/hooks/useHookEvents";
import { TurnBlock } from "./TurnBlock";

export type SessionState =
  | "idle"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "waiting_elicitation"
  | "done"
  | "error";

interface ClaudeCodeSessionProps {
  /**
   * Optional session to resume (when clicking from SessionList)
   */
  session?: Session;
  /**
   * Initial project path (for new sessions)
   */
  initialProjectPath?: string;
  /**
   * Callback to go back
   */
  onBack: () => void;
  /**
   * Callback to open hooks configuration
   */
  onProjectSettings?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when streaming state changes
   */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
  /**
   * Callback when project path changes
   */
  onProjectPathChange?: (path: string) => void;
}

/**
 * ClaudeCodeSession component for interactive Claude Code sessions
 * 
 * @example
 * <ClaudeCodeSession onBack={() => setView('projects')} />
 */
export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = "",
  className,
  onBack,
  onStreamingChange,
  onProjectPathChange,
}) => {
  const [projectPath] = useState(initialProjectPath || session?.project_path || "");
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);
  const [isFirstPrompt, setIsFirstPrompt] = useState(!session);
  const [selectedModel, setSelectedModel] = useState<"sonnet" | "opus" | "haiku">("sonnet");
  const [selectedPermissionMode, setSelectedPermissionMode] = useState<"default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions">("bypassPermissions");
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{ sessionId: string; projectId: string } | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);

  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<Array<{ id: string; prompt: string; model: "sonnet" | "opus" | "haiku" }>>([]);
  
  // New state for preview feature
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [splitPosition, setSplitPosition] = useState(50);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  
  // Add collapsed state for queued prompts
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);

  // Collapse / expand all signal for work blocks
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);
  const [allCollapsed, setAllCollapsed] = useState(false);

  // Session state tracking
  const [sessionState, setSessionState] = useState<SessionState>("idle");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showLoadHistory, setShowLoadHistory] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const fileLineCountRef = useRef<number>(0);
  const byteOffsetRef = useRef<number>(0);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const queuedPromptsRef = useRef<Array<{ id: string; prompt: string; model: "sonnet" | "opus" | "haiku" }>>([]);
  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const isIMEComposingRef = useRef(false);

  // Tab state management
  const { activeTab, updateTabTitle, updateTab } = useTabState();

  // Call onProjectPathChange when component mounts with initial path
  useEffect(() => {
    if (onProjectPathChange && projectPath) {
      onProjectPathChange(projectPath);
    }
  }, []); // Only run on mount
  
  // Keep ref in sync with state
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  // Fetch git info whenever project path changes
  useEffect(() => {
    if (projectPath) {
      api.getGitInfo(projectPath)
        .then(info => {
          if (isMountedRef.current) {
            setGitInfo(info);
          }
        })
        .catch(err => {
          console.error('[ClaudeCodeSession] Failed to fetch git info:', err);
          if (isMountedRef.current) {
            setGitInfo(null);
          }
        });
    } else {
      setGitInfo(null);
    }
  }, [projectPath]);

  // Update tab title based on git info
  useEffect(() => {
    if (activeTab && activeTab.id && gitInfo) {
      const tabTitle = gitInfo.is_git_repo
        ? `${gitInfo.repo_name}(${gitInfo.branch})`
        : projectPath;
      updateTabTitle(activeTab.id, tabTitle);
    }
  }, [gitInfo, activeTab, updateTabTitle, projectPath]);

  // Get effective session info (from prop or extracted) - use useMemo to ensure it updates
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return {
        id: extractedSessionInfo.sessionId,
        project_id: extractedSessionInfo.projectId,
        project_path: projectPath,
        created_at: Date.now(),
      } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);

  // Filter out messages that shouldn't be displayed
  const displayableMessages = useMemo(() => {
    return messages.filter((message, index) => {
      // Skip meta messages that don't have meaningful content
      if (message.isMeta && !message.leafUuid && !message.summary) {
        return false;
      }

      // Skip user messages that only contain tool results that are already displayed
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
          return false;
        }

        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") {
              hasVisibleContent = true;
              break;
            }
            if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                // Look for the matching tool_use in previous assistant messages
                for (let i = index - 1; i >= 0; i--) {
                  const prevMsg = messages[i];
                  if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                    const toolUse = prevMsg.message.content.find((c: any) => 
                      c.type === 'tool_use' && c.id === content.tool_use_id
                    );
                    if (toolUse) {
                      const toolName = toolUse.name?.toLowerCase();
                      const toolsWithWidgets = [
                        'task', 'edit', 'multiedit', 'todowrite', 'ls', 'read', 
                        'glob', 'bash', 'write', 'grep'
                      ];
                      if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) {
                        willBeSkipped = true;
                      }
                      break;
                    }
                  }
                }
              }
              if (!willBeSkipped) {
                hasVisibleContent = true;
                break;
              }
            }
          }
          if (!hasVisibleContent) {
            return false;
          }
        }
      }
      return true;
    });
  }, [messages]);

  // Group messages into turns
  const allTurns = useGroupedMessages(displayableMessages);
  const { visible: partitionedTurns, hiddenCount } = useMessagePartition(allTurns, 10, historyExpanded);
  const turns = partitionedTurns;

  const hookState = useHookEvents(claudeSessionId);

  // Auto-update tab title from hook session_title
  useEffect(() => {
    if (hookState.sessionTitle && activeTab) {
      updateTabTitle(activeTab.id, hookState.sessionTitle);
    }
  }, [hookState.sessionTitle, activeTab?.id, updateTabTitle]);

  const searchMatchTurnIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const indices: number[] = [];
    allTurns.forEach((turn, i) => {
      const text = [
        turn.userMessage ? JSON.stringify(turn.userMessage) : '',
        ...turn.workItems.map(m => JSON.stringify(m)),
        turn.result ? JSON.stringify(turn.result) : '',
      ].join(' ').toLowerCase();
      if (text.includes(q)) indices.push(i);
    });
    return indices;
  }, [allTurns, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250,
    overscan: 3,
  });

  // Load session history if resuming
  useEffect(() => {
    if (session) {
      // Set the claudeSessionId immediately when we have a session
      setClaudeSessionId(session.id);
      
      // Load session history first, then check for active session
      const initializeSession = async () => {
        await loadSessionHistory();
        // After loading history, check if the session is still active
        if (isMountedRef.current) {
          await checkForActiveSession();
        }
      };
      
      initializeSession();
    }
  }, [session]); // Remove hasLoadedSession dependency to ensure it runs on mount

  // Report streaming state changes
  useEffect(() => {
    onStreamingChange?.(isLoading, claudeSessionId);
  }, [isLoading, claudeSessionId, onStreamingChange]);

  // Reset historyExpanded when new messages arrive
  useEffect(() => {
    if (displayableMessages.length > 0) {
      setHistoryExpanded(false);
    }
  }, [displayableMessages.length]);

  // Reset searchMatchIndex when query changes
  useEffect(() => {
    setSearchMatchIndex(0);
  }, [searchQuery]);

  // Scroll to search match
  useEffect(() => {
    if (searchMatchTurnIndices.length === 0) return;
    const absoluteTurnIndex = searchMatchTurnIndices[searchMatchIndex] ?? searchMatchTurnIndices[0];
    // Find the index within visible partitionedTurns
    const visibleIndex = partitionedTurns.findIndex((_, i) => hiddenCount + i === absoluteTurnIndex);
    if (visibleIndex >= 0) {
      rowVirtualizer.scrollToIndex(visibleIndex, { align: 'start', behavior: 'smooth' });
    }
  }, [searchMatchIndex, searchMatchTurnIndices]);

  // Auto-scroll to bottom when new messages arrive
  useLayoutEffect(() => {
    if (displayableMessages.length > 0 && !searchQuery) {
      const scrollElement = parentRef.current;
      if (scrollElement) {
        rowVirtualizer.scrollToIndex(turns.length - 1, { align: 'end', behavior: 'auto' });
        requestAnimationFrame(() => {
          if (parentRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
          }
        });
      }
    }
  }, [displayableMessages.length]);

  // Add scroll handler for "show load history"
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowLoadHistory(el.scrollTop < 200 && !historyExpanded && hiddenCount > 0);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [historyExpanded, hiddenCount]);

  // Store session IDs on the tab so the sidebar can poll status for non-active tabs
  useEffect(() => {
    if (!activeTab) return;
    const sessionId = claudeSessionId || session?.id;
    const projectId = effectiveSession?.project_id;
    if (sessionId && projectId) {
      updateTab(activeTab.id, {
        claudeSessionId: sessionId,
        claudeProjectId: projectId,
      });
    }
  }, [claudeSessionId, session?.id, effectiveSession?.project_id, activeTab?.id]);

  // Poll the JSONL session file for external changes (e.g., session driven from a terminal)
  // Only runs when not actively streaming via Tauri events
  useEffect(() => {
    const sessionId = claudeSessionId || session?.id;
    const projectId = effectiveSession?.project_id;
    if (!sessionId || !projectId || isLoading) return;

    const interval = setInterval(async () => {
      if (!isMountedRef.current || isLoading) return;
      try {
        const tailResult = await api.readSessionTail(sessionId, projectId, byteOffsetRef.current);
        if (!isMountedRef.current) return;

        // new_offset === 0 means file was truncated — fall back to full reload
        if (tailResult.newOffset === 0 && byteOffsetRef.current > 0) {
          byteOffsetRef.current = 0;
          fileLineCountRef.current = 0;
          await loadSessionHistory();
          return;
        }

        if (tailResult.lines.length === 0) return;

        byteOffsetRef.current = tailResult.newOffset;
        fileLineCountRef.current += tailResult.lines.length;

        const newMessages: ClaudeStreamMessage[] = tailResult.lines
          .map((line: string) => {
            try {
              const entry = JSON.parse(line);
              return { ...entry, type: entry.type || 'assistant' } as ClaudeStreamMessage;
            } catch {
              return null;
            }
          })
          .filter((m): m is ClaudeStreamMessage => m !== null);

        if (newMessages.length > 0) {
          setMessages(prev => [...prev, ...newMessages]);

          // Derive tab status from the last meaningful entry
          const lastEntry = newMessages[newMessages.length - 1] as any;
          if (lastEntry && activeTab) {
            if (lastEntry.type === 'result') {
              updateTab(activeTab.id, { status: lastEntry.is_error ? 'error' : 'complete' });
            } else if (lastEntry.type === 'assistant' || lastEntry.type === 'tool_use') {
              updateTab(activeTab.id, { status: 'running' });
            }
          }
        }
      } catch {
        // Silently ignore polling errors (file may not exist yet)
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [claudeSessionId, session?.id, effectiveSession?.project_id, isLoading, activeTab?.id]);

  const handleRefresh = async () => {
    if (!session || isLoading) return;
    setMessages([]);
    fileLineCountRef.current = 0;
    byteOffsetRef.current = 0;
    await loadSessionHistory();
  };

  const loadSessionHistory = async () => {
    if (!session) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const history = await api.loadSessionHistory(session.id, session.project_id);
      
      // Save session data for restoration
      if (history && history.length > 0) {
        SessionPersistenceService.saveSession(
          session.id,
          session.project_id,
          session.project_path,
          history.length
        );
      }
      
      // Convert history to messages format
      const loadedMessages: ClaudeStreamMessage[] = history.map(entry => ({
        ...entry,
        type: entry.type || "assistant"
      }));

      // Sync permission mode from the last permission-mode entry in the session
      const validModes = new Set(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]);
      const lastPermEntry = [...history].reverse().find((e: any) => e.type === "permission-mode");
      if (lastPermEntry && validModes.has(lastPermEntry.permissionMode)) {
        setSelectedPermissionMode(lastPermEntry.permissionMode);
      }

      setMessages(loadedMessages);
      setRawJsonlOutput(history.map(h => JSON.stringify(h)));
      fileLineCountRef.current = history.length;
      byteOffsetRef.current = 0;

      // After loading history, we're continuing a conversation
      setIsFirstPrompt(false);
      
      // Scroll to bottom after loading history
      setTimeout(() => {
        if (loadedMessages.length > 0) {
          const scrollElement = parentRef.current;
          if (scrollElement) {
            // Use the same improved scrolling method
            rowVirtualizer.scrollToIndex(loadedMessages.length - 1, { align: 'end', behavior: 'auto' });
            requestAnimationFrame(() => {
              scrollElement.scrollTo({
                top: scrollElement.scrollHeight,
                behavior: 'auto'
              });
            });
          }
        }
      }, 100);
    } catch (err) {
      console.error("Failed to load session history:", err);
      setError("Failed to load session history");
    } finally {
      setIsLoading(false);
    }
  };

  const checkForActiveSession = async () => {
    // If we have a session prop, check if it's still active
    if (session) {
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: any) => {
          if ('process_type' in s && s.process_type && 'ClaudeSession' in s.process_type) {
            return (s.process_type as any).ClaudeSession.session_id === session.id;
          }
          return false;
        });
        
        if (activeSession) {
          setClaudeSessionId(session.id);
          
          // Don't add buffered messages here - they've already been loaded by loadSessionHistory
          // Just set up listeners for new messages
          
          // Set up listeners for the active session
          reconnectToSession(session.id);
        }
      } catch (err) {
        console.error('Failed to check for active sessions:', err);
      }
    }
  };

  const reconnectToSession = async (sessionId: string) => {
    if (isListeningRef.current) return;

    unlistenRefs.current.forEach(unlisten => unlisten());
    unlistenRefs.current = [];

    setClaudeSessionId(sessionId);
    isListeningRef.current = true;

    const outputUnlisten = await listen(`claude-output:${sessionId}`, async (event: any) => {
      try {
        if (!isMountedRef.current) return;
        
        // Store raw JSONL
        setRawJsonlOutput(prev => [...prev, event.payload]);
        
        // Parse and display
        const message = JSON.parse(event.payload) as ClaudeStreamMessage;
        setMessages(prev => [...prev, message]);
      } catch (err) {
        console.error("Failed to parse message:", err, event.payload);
      }
    });

    const errorUnlisten = await listen(`claude-error:${sessionId}`, (event: any) => {
      console.error("Claude error:", event.payload);
      if (isMountedRef.current) {
        setError(event.payload);
      }
    });

    const completeUnlisten = await listen(`claude-complete:${sessionId}`, async () => {
      if (isMountedRef.current) {
        setIsLoading(false);
        hasActiveSessionRef.current = false;
      }
    });

    unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];
    
    // Mark as loading to show the session is active
    if (isMountedRef.current) {
      setIsLoading(true);
      hasActiveSessionRef.current = true;
    }
  };

  // Project path selection handled by parent tab controls

  const handleSendPrompt = async (prompt: string, model: "sonnet" | "opus" | "haiku", permissionMode?: "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions") => {
    if (!projectPath) {
      setError("Please select a project directory first");
      return;
    }

    const effectivePermissionMode = permissionMode ?? selectedPermissionMode;

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt,
        model
      };
      setQueuedPrompts(prev => [...prev, newPrompt]);
      return;
    }

    try {
      setIsLoading(true);
      setSessionState("running");
      setError(null);
      hasActiveSessionRef.current = true;
      
      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }
      
      // Only clean up and set up new listeners if not already listening
      if (!isListeningRef.current) {
        // Clean up previous listeners
        unlistenRefs.current.forEach(unlisten => unlisten());
        unlistenRefs.current = [];
        
        // Mark as setting up listeners
        isListeningRef.current = true;
        
        // --------------------------------------------------------------------
        // 1️⃣  Event Listener Setup Strategy
        // --------------------------------------------------------------------
        // Claude Code may emit a *new* session_id even when we pass --resume. If
        // we listen only on the old session-scoped channel we will miss the
        // stream until the user navigates away & back. To avoid this we:
        //   • Always start with GENERIC listeners (no suffix) so we catch the
        //     very first "system:init" message regardless of the session id.
        //   • Once that init message provides the *actual* session_id, we
        //     dynamically switch to session-scoped listeners and stop the
        //     generic ones to prevent duplicate handling.
        // --------------------------------------------------------------------

        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        // Helper to attach session-specific listeners **once we are sure**
        const attachSessionSpecificListeners = async (sid: string) => {
          const specificOutputUnlisten = await listen(`claude-output:${sid}`, (evt: any) => {
            handleStreamMessage(evt.payload);
          });

          const specificErrorUnlisten = await listen(`claude-error:${sid}`, (evt: any) => {
            console.error('Claude error (scoped):', evt.payload);
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen(`claude-complete:${sid}`, (evt: any) => {
            processComplete(evt.payload);
          });

          // Replace existing unlisten refs with these new ones (after cleaning up)
          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [specificOutputUnlisten, specificErrorUnlisten, specificCompleteUnlisten];
        };

        // Generic listeners (catch-all)
        const genericOutputUnlisten = await listen('claude-output', async (event: any) => {
          handleStreamMessage(event.payload);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });
                  
                  // Save session data for restoration
                  SessionPersistenceService.saveSession(
                    msg.session_id,
                    projectId,
                    projectPath,
                    messages.length
                  );
                }

                // Switch to session-specific listeners
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        // Helper to process any JSONL stream message string or object
        function handleStreamMessage(payload: string | ClaudeStreamMessage) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;
            
            let message: ClaudeStreamMessage;
            let rawPayload: string;
            
            if (typeof payload === 'string') {
              // Tauri mode: payload is a JSON string
              rawPayload = payload;
              message = JSON.parse(payload) as ClaudeStreamMessage;
            } else {
              // Web mode: payload is already parsed object
              message = payload;
              rawPayload = JSON.stringify(payload);
            }

            // Store raw JSONL
            setRawJsonlOutput((prev) => [...prev, rawPayload]);

            setMessages((prev) => [...prev, message]);

            // Drive session state from stream events
            if (message.type === 'system') {
              if (message.subtype === 'permission_request') {
                setSessionState('waiting_approval');
              } else if (message.subtype === 'elicitation') {
                setSessionState('waiting_elicitation');
              }
            }
          } catch (err) {
            console.error('Failed to parse message:', err, payload);
          }
        }

        // Helper to handle completion events (both generic and scoped)
        const processComplete = async (success: boolean) => {
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false; // Reset listening state

          // Determine session state based on the last message
          setMessages((prevMessages) => {
            if (!success) {
              setSessionState("error");
            } else {
              // Look for the last message to determine state
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage && lastMessage.type === "result") {
                const isError = (lastMessage as any).is_error || false;
                setSessionState(isError ? "error" : "done");
              } else {
                // No result message, Claude is waiting for input
                setSessionState("waiting_input");
              }
            }
            return prevMessages;
          });


          if (effectiveSession && success) {
            try {
              const settings = await api.getCheckpointSettings(
                effectiveSession.id,
                effectiveSession.project_id,
                projectPath
              );

              if (settings.auto_checkpoint_enabled) {
                await api.checkAutoCheckpoint(
                  effectiveSession.id,
                  effectiveSession.project_id,
                  projectPath,
                  prompt
                );
                // Reload timeline to show new checkpoint
                setTimelineVersion((v) => v + 1);
              }
            } catch (err) {
              console.error('Failed to check auto checkpoint:', err);
            }
          }

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);
            
            // Small delay to ensure UI updates
            setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
            }, 100);
          }
        };

        const genericErrorUnlisten = await listen('claude-error', (evt: any) => {
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen('claude-complete', (evt: any) => {
          processComplete(evt.payload);
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [genericOutputUnlisten, genericErrorUnlisten, genericCompleteUnlisten];

        // --------------------------------------------------------------------
        // 2️⃣  Auto-checkpoint logic moved after listener setup (unchanged)
        // --------------------------------------------------------------------

        // Add the user message immediately to the UI (after setting up listeners)
        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt
              }
            ]
          }
        };
        setMessages(prev => [...prev, userMessage]);

        // Execute the appropriate command
        if (effectiveSession && !isFirstPrompt) {
          await api.resumeClaudeCode(projectPath, effectiveSession.id, prompt, model, effectivePermissionMode);
        } else {
          setIsFirstPrompt(false);
          await api.executeClaudeCode(projectPath, prompt, model, effectivePermissionMode);
        }
      }
    } catch (err) {
      console.error("Failed to send prompt:", err);
      setError("Failed to send prompt");
      setIsLoading(false);
      hasActiveSessionRef.current = false;
    }
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join('\n');
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Claude Code Session\n\n`;
    markdown += `**Project:** ${projectPath}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`;
        markdown += `- Session ID: \`${msg.session_id || 'N/A'}\`\n`;
        markdown += `- Model: \`${msg.model || 'default'}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text || content));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`;
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
            let contentText = '';
            if (typeof content.content === 'string') {
              contentText = content.content;
            } else if (content.content && typeof content.content === 'object') {
              if (content.content.text) {
                contentText = content.content.text;
              } else if (Array.isArray(content.content)) {
                contentText = content.content
                  .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                  .join('\n');
              } else {
                contentText = JSON.stringify(content.content, null, 2);
              }
            }
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) {
          markdown += `${msg.result}\n\n`;
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  const handleCheckpointSelect = async () => {
    // Reload messages from the checkpoint
    await loadSessionHistory();
    // Ensure timeline reloads to highlight current checkpoint
    setTimelineVersion((v) => v + 1);
  };

  const handleCancelExecution = async () => {
    if (!claudeSessionId || !isLoading) return;
    
    try {
      await api.cancelClaudeExecution(claudeSessionId);

      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      
      // Clear queued prompts
      setQueuedPrompts([]);
      
      // Add a message indicating the session was cancelled
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, cancelMessage]);
    } catch (err) {
      console.error("Failed to cancel execution:", err);
      
      // Even if backend fails, we should update UI to reflect stopped state
      // Add error message but still stop the UI loading state
      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${err instanceof Error ? err.message : 'Unknown error'}. The process may still be running in the background.`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Clean up listeners anyway
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states to allow user to continue
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
    }
  };

  const handleFork = (checkpointId: string) => {
    setForkCheckpointId(checkpointId);
    setForkSessionName(`Fork-${new Date().toISOString().slice(0, 10)}`);
    setShowForkDialog(true);
  };

  const handleCompositionStart = () => {
    isIMEComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isIMEComposingRef.current = false;
    }, 0);
  };

  const handleConfirmFork = async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName
      );

      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      console.error("Failed to fork checkpoint:", err);
      setError("Failed to fork checkpoint");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setIsPreviewMaximized(false);
    // Keep the previewUrl so it can be restored when reopening
  };

  const handlePreviewUrlChange = (url: string) => {
    setPreviewUrl(url);
  };

  const handleTogglePreviewMaximize = () => {
    setIsPreviewMaximized(!isPreviewMaximized);
    // Reset split position when toggling maximize
    if (isPreviewMaximized) {
      setSplitPosition(50);
    }
  };

  // Cleanup event listeners and track mount state
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isListeningRef.current = false;

      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];

      // Clear checkpoint manager when session ends
      if (effectiveSession) {
        api.clearCheckpointManager(effectiveSession.id).catch(err => {
          console.error("Failed to clear checkpoint manager:", err);
        });
      }
    };
  }, [effectiveSession, projectPath]);

  const messagesList = (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto relative pb-4 scrollbar-hide"
      style={{
        contain: 'strict',
        scrollbarGutter: 'stable',
        scrollbarWidth: 'none',
      }}
    >
      <div
        className="relative w-full mx-auto px-4 pt-8 pb-4"
        style={{
          height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: '100px',
        }}
      >
        {showLoadHistory && !historyExpanded && hiddenCount > 0 && (
          <div className="sticky top-0 z-10 flex justify-center py-2">
            <button
              onClick={() => { setHistoryExpanded(true); setShowLoadHistory(false); }}
              className="px-4 py-1.5 text-xs bg-muted border border-border/50 rounded-full hover:bg-accent transition-colors"
            >
              Load full history ({hiddenCount} turns hidden)
            </button>
          </div>
        )}
        <AnimatePresence>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const turn = turns[virtualItem.index];
            const isSearchActive = searchQuery.trim().length > 0;
            const absoluteIndex = hiddenCount + virtualItem.index;
            const isMatch = isSearchActive ? searchMatchTurnIndices.includes(absoluteIndex) : true;
            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-4 pb-4"
                style={{
                  top: virtualItem.start,
                  opacity: isSearchActive && !isMatch ? 0.3 : 1,
                }}
              >
                <TurnBlock
                  turn={turn}
                  streamMessages={displayableMessages}
                  isStreaming={isLoading}
                  collapseSignal={collapseSignal}
                  expandSignal={expandSignal}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Loading indicator under the latest message */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center py-4 mb-20"
        >
          <div className="rotating-symbol text-primary" />
        </motion.div>
      )}

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-20 w-full mx-auto"
        >
          {error}
        </motion.div>
      )}
    </div>
  );

  // If preview is maximized, render only the WebviewPreview in full screen
  if (showPreview && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WebviewPreview
            initialUrl={previewUrl}
            onClose={handleClosePreview}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={handleTogglePreviewMaximize}
            onUrlChange={handlePreviewUrlChange}
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col h-full bg-background", className)}>
        <SessionHeader
          projectPath={projectPath}
          claudeSessionId={claudeSessionId}
          sessionId={session?.id ?? null}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          isStreaming={isLoading}
          hasMessages={messages.length > 0}
          allCollapsed={allCollapsed}
          copyPopoverOpen={copyPopoverOpen}
          gitInfo={gitInfo}
          onBack={onBack}
          onSelectPath={() => {}}
          onCopyAsJsonl={handleCopyAsJsonl}
          onCopyAsMarkdown={handleCopyAsMarkdown}
          onProjectSettings={effectiveSession ? () => setShowSettings(true) : undefined}
          onSlashCommandsSettings={projectPath ? () => setShowSlashCommandsSettings(true) : undefined}
          onOpenFolder={projectPath ? () => api.openPath(projectPath) : undefined}
          onRefresh={session ? handleRefresh : undefined}
          onCollapseAll={() => {
            if (allCollapsed) {
              setExpandSignal(s => s + 1);
            } else {
              setCollapseSignal(s => s + 1);
            }
            setAllCollapsed(v => !v);
          }}
          onOpenSessionFile={effectiveSession?.project_id ? async () => {
            const sid = claudeSessionId ?? effectiveSession.id;
            try {
              const filePath = await api.getSessionFilePath(sid, effectiveSession.project_id);
              await api.openPath(filePath);
            } catch (e) {
              console.error('Failed to open session file:', e);
            }
          } : undefined}
          onOpenSessionFolder={effectiveSession?.project_id ? async () => {
            const sid = claudeSessionId ?? effectiveSession.id;
            try {
              const filePath = await api.getSessionFilePath(sid, effectiveSession.project_id);
              const folderPath = filePath.replace(/[/\\][^/\\]+$/, '');
              await api.openPath(folderPath);
            } catch (e) {
              console.error('Failed to open session folder:', e);
            }
          } : undefined}
          onOpenTerminal={projectPath ? async () => {
            try {
              await api.openTerminalIn(projectPath);
            } catch (e) {
              setError(typeof e === 'string' ? e : 'No terminal emulator found. Install WezTerm or Windows Terminal.');
            }
          } : undefined}
          onShowTimeline={effectiveSession ? () => setShowTimeline(true) : undefined}
          setCopyPopoverOpen={setCopyPopoverOpen}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchMatchCount={searchMatchTurnIndices.length}
          searchMatchIndex={searchMatchIndex}
          onSearchToggle={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(''); }}
          onSearchQueryChange={setSearchQuery}
          onSearchNext={() => setSearchMatchIndex(i => (i + 1) % Math.max(searchMatchTurnIndices.length, 1))}
          onSearchPrev={() => setSearchMatchIndex(i => (i - 1 + Math.max(searchMatchTurnIndices.length, 1)) % Math.max(searchMatchTurnIndices.length, 1))}
        />
        <div className="flex-1 min-h-0 flex flex-col">

        {/* Main Content Area */}
        <div className={cn(
          "flex-1 min-h-0 overflow-hidden transition-all duration-300",
          showTimeline && "sm:mr-96"
        )}>
          {showPreview ? (
            // Split pane layout when preview is active
            <SplitPane
              left={
                <div className="h-full flex flex-col">
                  {messagesList}
                </div>
              }
              right={
                <WebviewPreview
                  initialUrl={previewUrl}
                  onClose={handleClosePreview}
                  isMaximized={isPreviewMaximized}
                  onToggleMaximize={handleTogglePreviewMaximize}
                  onUrlChange={handlePreviewUrlChange}
                />
              }
              initialSplit={splitPosition}
              onSplitChange={setSplitPosition}
              minLeftWidth={400}
              minRightWidth={400}
              className="h-full"
            />
          ) : (
            // Original layout when no preview
            <div className="h-full flex flex-col mx-auto px-6">
              {messagesList}
              
              {isLoading && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <div className="rotating-symbol text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {session ? "Loading session history..." : "Initializing Claude Code..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Prompt Input - Always visible */}
        {/* Queued Prompts Display */}
        <AnimatePresence>
          {queuedPrompts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="w-full px-4 pb-2"
            >
              <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Queued Prompts ({queuedPrompts.length})
                  </div>
                  <TooltipSimple content={queuedPromptsCollapsed ? "Expand queue" : "Collapse queue"} side="top">
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(prev => !prev)}>
                        {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </motion.div>
                  </TooltipSimple>
                </div>
                {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                  <motion.div
                    key={queuedPrompt.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                          {queuedPrompt.model === "opus" ? "Opus" : "Sonnet"}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                    </div>
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ErrorBoundary>
          {/* Navigation Arrows - positioned above prompt bar with spacing */}
          {displayableMessages.length > 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.5 }}
              className="fixed bottom-32 right-6 z-50"
            >
              <div className="flex items-center bg-background/95 backdrop-blur-md border rounded-full shadow-lg overflow-hidden">
                <TooltipSimple content="Scroll to top" side="top">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                      // Use virtualizer to scroll to the first item
                      if (displayableMessages.length > 0) {
                        // Scroll to top of the container
                        parentRef.current?.scrollTo({
                          top: 0,
                          behavior: 'smooth'
                        });
                        
                        // After smooth scroll completes, trigger a small scroll to ensure rendering
                        setTimeout(() => {
                          if (parentRef.current) {
                            // Scroll down 1px then back to 0 to trigger virtualizer update
                            parentRef.current.scrollTop = 1;
                            requestAnimationFrame(() => {
                              if (parentRef.current) {
                                parentRef.current.scrollTop = 0;
                              }
                            });
                          }
                        }, 500); // Wait for smooth scroll to complete
                      }
                    }}
                      className="px-3 py-2 hover:bg-accent rounded-none"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </TooltipSimple>
                <div className="w-px h-4 bg-border" />
                <TooltipSimple content="Scroll to bottom" side="top">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Use the improved scrolling method for manual scroll to bottom
                        if (displayableMessages.length > 0) {
                          const scrollElement = parentRef.current;
                          if (scrollElement) {
                            // First, scroll using virtualizer to get close to the bottom
                            rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });

                            // Then use direct scroll to ensure we reach the absolute bottom
                            requestAnimationFrame(() => {
                              scrollElement.scrollTo({
                                top: scrollElement.scrollHeight,
                                behavior: 'smooth'
                              });
                            });
                          }
                        }
                      }}
                      className="px-3 py-2 hover:bg-accent rounded-none"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </TooltipSimple>
              </div>
            </motion.div>
          )}

          {(sessionState === "waiting_approval" || sessionState === "waiting_elicitation") && (
            <ApprovalBanner
              type={sessionState === "waiting_approval" ? "approval" : "elicitation"}
              message={sessionState === "waiting_approval" ? "Approval needed" : "Input needed"}
              onDismiss={() => setSessionState("waiting_input")}
              className="fixed bottom-0 left-0 right-0 z-50"
            />
          )}

        </ErrorBoundary>

        {/* Bottom panel — status bar + prompt input as one visual unit */}
        <div className="flex-shrink-0 border-t border-border/50">
          <SessionStatusBar
            sessionId={claudeSessionId ?? session?.id ?? null}
          />
          <AnimatePresence>
            {hookState.subagentActive && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 px-4 py-0.5 text-xs text-amber-500 bg-amber-500/10 border-t border-amber-500/20"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>subagent {hookState.subagentType ?? 'working'}</span>
              </motion.div>
            )}
            {hookState.currentTool && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground bg-muted/40 border-t border-border/40"
              >
                <div className="rotating-symbol text-primary h-3 w-3" />
                <span className="font-medium">{hookState.currentTool.name}</span>
                {hookState.currentTool.input && Object.keys(hookState.currentTool.input).length > 0 && (
                  <span className="opacity-60 truncate max-w-xs">
                    {Object.values(hookState.currentTool.input)[0]?.toString().slice(0, 80) ?? ''}
                  </span>
                )}
              </motion.div>
            )}
            {hookState.toolError && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 px-4 py-1 text-xs text-red-500 bg-red-500/10 border-t border-red-500/20"
              >
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="font-medium">Tool failed: {hookState.toolError.name}</span>
                {hookState.toolError.error && (
                  <span className="opacity-60 truncate max-w-xs">{hookState.toolError.error.slice(0, 80)}</span>
                )}
              </motion.div>
            )}
            {hookState.isCompacting && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 px-4 py-0.5 text-xs text-amber-500 bg-amber-500/10 border-t border-amber-500/20"
              >
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Compacting context...</span>
              </motion.div>
            )}
            {hookState.permissionRequest && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 px-4 py-1 text-xs text-amber-600 bg-amber-500/10 border-t border-amber-500/20"
              >
                <ShieldAlert className="h-3 w-3 flex-shrink-0" />
                <span className="font-medium">Permission needed: {hookState.permissionRequest.toolName}</span>
                {hookState.permissionRequest.suggestions.length > 0 && (
                  <span className="opacity-60">{hookState.permissionRequest.suggestions[0].mode}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className={cn(
            "transition-all duration-300",
            showTimeline && "sm:mr-96"
          )}>
            <FloatingPromptInput
              className="border-t-0"
              ref={floatingPromptRef}
              onSend={handleSendPrompt}
              onCancel={handleCancelExecution}
              isLoading={isLoading}
              selectedModel={selectedModel}
              selectedPermissionMode={selectedPermissionMode}
              onPermissionModeChange={setSelectedPermissionMode}
              disabled={!projectPath}
              projectPath={projectPath}
              extraMenuItems={
                <>
                  {messages.length > 0 && (
                    <Popover
                      trigger={
                        <TooltipSimple content="Copy conversation" side="top">
                          <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </motion.div>
                        </TooltipSimple>
                      }
                      content={
                        <div className="w-44 p-1">
                          <Button variant="ghost" size="sm" onClick={handleCopyAsMarkdown} className="w-full justify-start text-xs">
                            Copy as Markdown
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCopyAsJsonl} className="w-full justify-start text-xs">
                            Copy as JSONL
                          </Button>
                        </div>
                      }
                      open={copyPopoverOpen}
                      onOpenChange={setCopyPopoverOpen}
                      side="top"
                      align="end"
                    />
                  )}
                </>
              }
            />
          </div>
        </div>

        {/* Timeline */}
        <AnimatePresence>
          {showTimeline && effectiveSession && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background border-l border-border shadow-xl z-30 overflow-hidden"
            >
              <div className="h-full flex flex-col">
                {/* Timeline Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold">Session Timeline</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTimeline(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <TimelineNavigator
                    sessionId={effectiveSession.id}
                    projectId={effectiveSession.project_id}
                    projectPath={projectPath}
                    currentMessageIndex={messages.length - 1}
                    onCheckpointSelect={handleCheckpointSelect}
                    onFork={handleFork}
                    refreshVersion={timelineVersion}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Session</DialogTitle>
            <DialogDescription>
              Create a new session branch from the selected checkpoint.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fork-name">New Session Name</Label>
              <Input
                id="fork-name"
                placeholder="e.g., Alternative approach"
                value={forkSessionName}
                onChange={(e) => setForkSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    if (e.nativeEvent.isComposing || isIMEComposingRef.current) {
                      return;
                    }
                    handleConfirmFork();
                  }
                }}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForkDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFork}
              disabled={isLoading || !forkSessionName.trim()}
            >
              Create Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      {showSettings && effectiveSession && (
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <CheckpointSettings
              sessionId={effectiveSession.id}
              projectId={effectiveSession.project_id}
              projectPath={projectPath}
              onClose={() => setShowSettings(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Slash Commands Settings Dialog */}
      {showSlashCommandsSettings && (
        <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Slash Commands</DialogTitle>
              <DialogDescription>
                Manage project-specific slash commands for {projectPath}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <SlashCommandsManager projectPath={projectPath} />
            </div>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </TooltipProvider>
  );
};
