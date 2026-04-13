import { useMemo } from 'react';
import type { ClaudeStreamMessage } from '../components/AgentExecution';

export interface Turn {
  id: string;
  userMessage: ClaudeStreamMessage | null;
  workItems: ClaudeStreamMessage[];
  result: ClaudeStreamMessage | null;
  isComplete: boolean;
}

/**
 * Groups messages into logical "turns" where each turn represents:
 * - A user message (real user input, not just tool results)
 * - Work items (assistant messages, tool results, thinking)
 * - A result message (completion or error)
 */
export function groupMessagesIntoTurns(messages: ClaudeStreamMessage[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;
  let turnIndex = 0;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // Handle system init messages as a standalone turn
    if (message.type === 'system' && message.subtype === 'init') {
      if (currentTurn) {
        turns.push(currentTurn);
        currentTurn = null;
      }
      turns.push({
        id: `turn-sys-init-${turnIndex}`,
        userMessage: null,
        workItems: [message],
        result: null,
        isComplete: true,
      });
      turnIndex++;
      continue;
    }

    // Check if this is a real user message (has non-tool_result content)
    if (message.type === 'user') {
      const hasRealContent = hasUserContent(message);

      if (hasRealContent) {
        // Push previous turn if exists
        if (currentTurn) {
          turns.push(currentTurn);
        }
        // Start new turn with this user message
        currentTurn = {
          id: `turn-${turnIndex}`,
          userMessage: message,
          workItems: [],
          result: null,
          isComplete: false,
        };
        turnIndex++;
        continue;
      }
    }

    // Result message completes the current turn
    if (message.type === 'result') {
      if (!currentTurn) {
        // Orphaned result, create a turn for it
        currentTurn = {
          id: `turn-${turnIndex}`,
          userMessage: null,
          workItems: [],
          result: message,
          isComplete: true,
        };
        turnIndex++;
      } else {
        currentTurn.result = message;
        currentTurn.isComplete = true;
        turns.push(currentTurn);
        currentTurn = null;
      }
      continue;
    }

    // All other messages (assistant, tool-result user, system non-init) are workItems
    if (!currentTurn) {
      // Create a pre-turn for orphaned work items (shouldn't happen in normal flow)
      currentTurn = {
        id: `turn-${turnIndex}`,
        userMessage: null,
        workItems: [message],
        result: null,
        isComplete: false,
      };
      turnIndex++;
    } else {
      currentTurn.workItems.push(message);
    }
  }

  // Push final turn if exists
  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Check if a user message has real content (not just tool results)
 */
function hasUserContent(message: ClaudeStreamMessage): boolean {
  const msg = message.message || message;

  // Handle simple string content
  if (typeof msg.content === 'string') {
    return msg.content.trim().length > 0;
  }

  // Handle array of content blocks
  if (Array.isArray(msg.content)) {
    for (const content of msg.content) {
      if (content.type !== 'tool_result') {
        return true;
      }
    }
    return false;
  }

  // No content or non-array, non-string content
  return false;
}

export function useGroupedMessages(messages: ClaudeStreamMessage[]): Turn[] {
  return useMemo(() => groupMessagesIntoTurns(messages), [messages]);
}
