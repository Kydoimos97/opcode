import { useMemo } from 'react';
import type { ClaudeStreamMessage } from '../components/AgentExecution';

export interface NarrationGroup {
  id: string;
  textBlocks: Array<{ type: 'text'; text: string }>;
  thinkingBlocks: Array<{ type: 'thinking'; thinking: string; signature?: string }>;
  toolCalls: Array<{
    id: string;
    toolUseBlock: any;
    toolResult: any | null;
  }>;
}

export function buildNarrationGroups(workItems: ClaudeStreamMessage[]): NarrationGroup[] {
  const toolResultMap = new Map<string, any>();

  for (const item of workItems) {
    if (item.type === 'user') {
      const content: any[] | undefined = item.message?.content ?? (item as any).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            toolResultMap.set(block.tool_use_id, block);
          }
        }
      }
    }
  }

  const groups: NarrationGroup[] = [];
  let groupIndex = 0;

  for (const item of workItems) {
    const assistantContent: any[] | undefined = item.message?.content ?? (item as any).content;
    if (item.type === 'assistant' && Array.isArray(assistantContent)) {
      const textBlocks: Array<{ type: 'text'; text: string }> = [];
      const thinkingBlocks: Array<{ type: 'thinking'; thinking: string; signature?: string }> = [];
      const toolCalls: Array<{
        id: string;
        toolUseBlock: any;
        toolResult: any | null;
      }> = [];

      for (const block of assistantContent) {
        if (block.type === 'text') {
          textBlocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'thinking') {
          const thinkingBlock: { type: 'thinking'; thinking: string; signature?: string } = {
            type: 'thinking',
            thinking: block.thinking,
          };
          if (block.signature) {
            thinkingBlock.signature = block.signature;
          }
          thinkingBlocks.push(thinkingBlock);
        } else if (block.type === 'tool_use') {
          const toolResult = toolResultMap.get(block.id) || null;
          toolCalls.push({
            id: block.id,
            toolUseBlock: block,
            toolResult,
          });
        }
      }

      if (textBlocks.length > 0 || thinkingBlocks.length > 0 || toolCalls.length > 0) {
        groups.push({
          id: `narration-group-${groupIndex}`,
          textBlocks,
          thinkingBlocks,
          toolCalls,
        });
        groupIndex += 1;
      }
    }
  }

  return groups;
}

export function useNarrationGroups(workItems: ClaudeStreamMessage[]): NarrationGroup[] {
  return useMemo(() => buildNarrationGroups(workItems), [workItems]);
}
