import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

export interface HookEventEntry {
  ts: string;
  hook_type: string;
  payload: Record<string, unknown>;
}

export interface HookState {
  currentTool: { name: string; input: Record<string, unknown> } | null;
  isWaitingForHuman: boolean;
  sessionTitle: string | null;
  subagentActive: boolean;
  subagentType: string | null;
  lastEventCount: number;
  toolError: { name: string; error: string; isInterrupt: boolean } | null;
  isCompacting: boolean;
  lastCompactSummary: string | null;
  instructionsLoaded: Array<{ filePath: string; memoryType: string }>;
  permissionRequest: {
    toolName: string;
    toolInput: Record<string, unknown>;
    suggestions: Array<{ type: string; mode: string; destination: string }>;
  } | null;
  activePlanPath: string | null;
}

const INITIAL_STATE: HookState = {
  currentTool: null,
  isWaitingForHuman: false,
  sessionTitle: null,
  subagentActive: false,
  subagentType: null,
  lastEventCount: 0,
  toolError: null,
  isCompacting: false,
  lastCompactSummary: null,
  instructionsLoaded: [],
  permissionRequest: null,
  activePlanPath: null,
};

/**
 * Derives HookState from a list of raw JSONL event lines.
 * Processes events in order, applying state transitions.
 */
export function deriveHookState(lines: string[]): HookState {
  const state: HookState = { ...INITIAL_STATE, lastEventCount: lines.length };

  for (const line of lines) {
    try {
      const entry: HookEventEntry = JSON.parse(line);
      const { hook_type, payload } = entry;

      if (typeof payload.planFilePath === "string" && payload.planFilePath) {
        state.activePlanPath = payload.planFilePath;
      }

      switch (hook_type) {
        case 'PreToolUse':
          state.currentTool = {
            name: (payload.tool_name as string) ?? 'unknown',
            input: (payload.tool_input as Record<string, unknown>) ?? {},
          };
          state.toolError = null;
          break;

        case 'PostToolUse':
          if (
            state.currentTool?.name === payload.tool_name ||
            !state.currentTool
          ) {
            state.currentTool = null;
          }
          break;

        case 'PostToolUseFailure':
          state.currentTool = null;
          state.toolError = {
            name: (payload.tool_name as string) ?? 'unknown',
            error: (payload.error as string) ?? 'Unknown error',
            isInterrupt: (payload.is_interrupt as boolean) ?? false,
          };
          break;

        case 'UserPromptSubmit':
          state.isWaitingForHuman = false;
          state.currentTool = null;
          state.permissionRequest = null;
          state.toolError = null;
          if (payload.session_title) {
            state.sessionTitle = payload.session_title as string;
          }
          break;

        case 'Notification':
          if (payload.notification_type === 'idle_prompt') {
            state.isWaitingForHuman = true;
          }
          break;

        case 'PreCompact':
          state.isCompacting = true;
          break;

        case 'PostCompact':
          state.isCompacting = false;
          state.lastCompactSummary = (payload.compact_summary as string) ?? null;
          break;

        case 'InstructionsLoaded':
          {
            const filePath = (payload.file_path as string) ?? '';
            const memoryType = (payload.memory_type as string) ?? '';
            if (filePath && !state.instructionsLoaded.some(item => item.filePath === filePath)) {
              state.instructionsLoaded.push({ filePath, memoryType });
            }
          }
          break;

        case 'PermissionRequest':
          state.permissionRequest = {
            toolName: (payload.tool_name as string) ?? 'unknown',
            toolInput: (payload.tool_input as Record<string, unknown>) ?? {},
            suggestions: (payload.permission_suggestions as Array<{ type: string; mode: string; destination: string }>) ?? [],
          };
          break;

        case 'Stop':
          state.currentTool = null;
          state.isWaitingForHuman = false;
          state.subagentActive = false;
          state.subagentType = null;
          state.permissionRequest = null;
          state.toolError = null;
          state.isCompacting = false;
          break;

        case 'SubagentStart':
          state.subagentActive = true;
          state.subagentType = (payload.agent_type as string) ?? null;
          break;

        case 'SubagentStop':
          state.subagentActive = false;
          state.subagentType = null;
          break;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return state;
}

/**
 * Subscribes to hook events for a session and provides derived real-time state.
 * Polls every 2s while a sessionId is provided.
 * Stops polling when hookState.currentTool is null and Stop event was received.
 */
export function useHookEvents(sessionId: string | null): HookState {
  const [hookState, setHookState] = useState<HookState>(INITIAL_STATE);
  const lastCountRef = useRef(0);
  const linesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setHookState(INITIAL_STATE);
      lastCountRef.current = 0;
      linesRef.current = [];
      return;
    }

    // Reset when session changes
    lastCountRef.current = 0;
    linesRef.current = [];
    setHookState(INITIAL_STATE);

    const poll = async () => {
      try {
        const lines = await api.getHookEvents(sessionId);
        if (lines.length !== lastCountRef.current) {
          lastCountRef.current = lines.length;
          linesRef.current = lines;
          setHookState(deriveHookState(lines));
        }
      } catch {
        // Ignore read errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return hookState;
}
