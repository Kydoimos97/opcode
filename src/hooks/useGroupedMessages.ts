import { useMemo } from 'react';
import type { ClaudeStreamMessage } from '../components/AgentExecution';

export interface Turn {
  id: string;
  userMessage: ClaudeStreamMessage;
  workItems: ClaudeStreamMessage[];
  assistantResponse?: ClaudeStreamMessage;
  isComplete: boolean;
}

function isPureToolResult(message: ClaudeStreamMessage): boolean {
  const content = message.message?.content ?? (message as any).content;
  if (!Array.isArray(content)) return false;
  return content.length > 0 && content.every((c: any) => c.type === 'tool_result');
}

function hasPureTextContent(message: ClaudeStreamMessage): boolean {
  const content = message.message?.content ?? (message as any).content;
  if (!Array.isArray(content)) return false;
  const hasText = content.some((c: any) => c.type === 'text');
  const hasToolUse = content.some((c: any) => c.type === 'tool_use');
  return hasText && !hasToolUse;
}

function isTurnStartingUserMessage(message: ClaudeStreamMessage): boolean {
  if (message.type !== 'user') return false;
  if ((message as any).isMeta === true) return false;
  if (isPureToolResult(message)) return false;
  return true;
}

export function groupMessagesIntoTurns(
  messages: ClaudeStreamMessage[]
): { turns: Turn[]; standaloneMessages: ClaudeStreamMessage[] } {
  const turns: Turn[] = [];
  const standaloneMessages: ClaudeStreamMessage[] = [];
  let currentTurn: Omit<Turn, 'id'> | null = null;
  let userMessageIndex = -1;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.type === 'system' || (message as any).isMeta === true) {
      standaloneMessages.push(message);
      continue;
    }

    if (message.type === 'result') {
      standaloneMessages.push(message);
      if (currentTurn) {
        currentTurn.isComplete = true;
      }
      continue;
    }

    if (isTurnStartingUserMessage(message)) {
      if (currentTurn) {
        turns.push({
          id: String(userMessageIndex),
          ...currentTurn,
        });
      }
      userMessageIndex = i;
      currentTurn = {
        userMessage: message,
        workItems: [],
        isComplete: false,
      };
      continue;
    }

    if (currentTurn === null) {
      standaloneMessages.push(message);
      continue;
    }

    if (message.type === 'user') {
      if (isPureToolResult(message)) {
        currentTurn.workItems.push(message);
      } else {
        standaloneMessages.push(message);
      }
      continue;
    }

    if (message.type === 'assistant') {
      if (hasPureTextContent(message)) {
        currentTurn.assistantResponse = message;
      } else {
        currentTurn.workItems.push(message);
      }
      continue;
    }

    currentTurn.workItems.push(message);
  }

  if (currentTurn) {
    turns.push({
      id: String(userMessageIndex),
      ...currentTurn,
    });
  }

  return { turns, standaloneMessages };
}

export function useGroupedMessages(
  messages: ClaudeStreamMessage[]
): { turns: Turn[]; standaloneMessages: ClaudeStreamMessage[] } {
  return useMemo(() => groupMessagesIntoTurns(messages), [messages]);
}
