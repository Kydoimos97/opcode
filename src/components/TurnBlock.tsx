import React, { useMemo } from 'react';
import type { Turn } from '@/hooks/useGroupedMessages';
import type { ClaudeStreamMessage } from './AgentExecution';
import { useNarrationGroups } from '@/hooks/useNarrationGroups';
import { ThreadEntry } from './thread/ThreadEntry';
import { UserMessage } from './thread/messages/UserMessage';
import { AgentMessage } from './thread/messages/AgentMessage';
import { ProcessMessage } from './thread/messages/ProcessMessage';
import { ReadTool } from './thread/tools/ReadTool';
import { EditTool } from './thread/tools/EditTool';
import { BashTool } from './thread/tools/BashTool';
import { GrepTool } from './thread/tools/GrepTool';
import { GlobTool } from './thread/tools/GlobTool';
import { WriteTool } from './thread/tools/WriteTool';
import { ThinkingTool } from './thread/tools/ThinkingTool';
import { WebSearchTool } from './thread/tools/WebSearchTool';
import { WebFetchTool } from './thread/tools/WebFetchTool';
import { TodoTool } from './thread/tools/TodoTool';
import { LSTool } from './thread/tools/LSTool';
import { MCPTool } from './thread/tools/MCPTool';
import { TaskTool } from './thread/tools/TaskTool';

function extractFinalText(message: ClaudeStreamMessage): string {
  const content = message.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => (typeof b.text === 'string' ? b.text : b.text?.text ?? ''))
    .join('\n\n');
}

function extractUserContent(message: ClaudeStreamMessage): { text: string; images: Array<{ mediaType: string; data: string }> } {
  const msg = message.message || message;
  const content = typeof msg.content === 'string'
    ? [{ type: 'text', text: msg.content }]
    : Array.isArray(msg.content) ? msg.content : [];

  const text = content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text as string)
    .join('\n');

  const images = content
    .filter((c: any) => c.type === 'image' && c.source?.data)
    .map((c: any) => ({ mediaType: c.source.media_type ?? 'image/png', data: c.source.data as string }));

  return { text, images };
}

function renderToolCall(toolUseBlock: any, toolResult: any, key: string): React.ReactNode {
  const name = toolUseBlock.name?.toLowerCase() ?? '';
  const input = toolUseBlock.input ?? {};

  if (name === 'read') return <ReadTool key={key} filePath={input.file_path ?? ''} result={toolResult} />;
  if (name === 'edit') return <EditTool key={key} filePath={input.file_path ?? ''} oldString={input.old_string} newString={input.new_string} result={toolResult} />;
  if (name === 'multiedit') return <EditTool key={key} filePath={input.file_path ?? ''} result={toolResult} />;
  if (name === 'bash') return <BashTool key={key} command={input.command ?? ''} description={input.description} result={toolResult} />;
  if (name === 'grep') return <GrepTool key={key} pattern={input.pattern ?? ''} path={input.path} include={input.include} result={toolResult} />;
  if (name === 'glob') return <GlobTool key={key} pattern={input.pattern ?? ''} path={input.path} result={toolResult} />;
  if (name === 'write') return <WriteTool key={key} filePath={input.file_path ?? ''} content={input.content ?? ''} result={toolResult} />;
  if (name === 'websearch') return <WebSearchTool key={key} query={input.query ?? ''} result={toolResult} />;
  if (name === 'webfetch') return <WebFetchTool key={key} url={input.url ?? ''} prompt={input.prompt} result={toolResult} />;
  if (name === 'todowrite') return <TodoTool key={key} todos={input.todos ?? []} result={toolResult} />;
  if (name === 'todoread') return <TodoTool key={key} todos={input.todos ?? []} result={toolResult} />;
  if (name === 'ls') return <LSTool key={key} path={input.path ?? ''} result={toolResult} />;
  if (name === 'task') return <TaskTool key={key} description={input.description} prompt={input.prompt} result={toolResult} />;
  if (toolUseBlock.name?.startsWith('mcp__')) return <MCPTool key={key} toolName={toolUseBlock.name} input={input} result={toolResult} />;

  return (
    <MCPTool key={key} toolName={toolUseBlock.name ?? 'unknown'} input={input} result={toolResult} />
  );
}

interface TurnBlockProps {
  turn: Turn;
  streamMessages: ClaudeStreamMessage[];
  isStreaming: boolean;
  collapseSignal?: number;
  expandSignal?: number;
}

const TurnBlockComponent: React.FC<TurnBlockProps> = ({ turn, isStreaming }) => {
  const narrationGroups = useNarrationGroups(turn.workItems);

  const { displayGroups, implicitFinalText } = useMemo(() => {
    if (isStreaming || turn.result || narrationGroups.length === 0) {
      return { displayGroups: narrationGroups, implicitFinalText: null };
    }
    const lastGroup = narrationGroups[narrationGroups.length - 1];
    if (lastGroup.textBlocks.length > 0 && lastGroup.toolCalls.length === 0 && lastGroup.thinkingBlocks.length === 0) {
      const text = lastGroup.textBlocks.map(b => b.text).join('\n\n');
      return {
        displayGroups: narrationGroups.slice(0, -1),
        implicitFinalText: text,
      };
    }
    return { displayGroups: narrationGroups, implicitFinalText: null };
  }, [narrationGroups, isStreaming, turn.result]);

  const userContent = turn.userMessage ? extractUserContent(turn.userMessage) : null;

  return (
    <div className="space-y-2 w-full">
      {userContent && (
        <ThreadEntry depth={0}>
          <UserMessage text={userContent.text} images={userContent.images} />
        </ThreadEntry>
      )}

      {displayGroups.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.thinkingBlocks.map((tb, i) => (
            <ThreadEntry key={`${group.id}-think-${i}`} depth={2}>
              <ThinkingTool thinking={tb.thinking} signature={tb.signature} />
            </ThreadEntry>
          ))}

          {group.textBlocks.length > 0 && (
            <ThreadEntry depth={1}>
              <ProcessMessage text={group.textBlocks.map(b => b.text).join('\n\n')} />
            </ThreadEntry>
          )}

          {group.toolCalls.map((tc) => (
            <ThreadEntry key={tc.id} depth={2}>
              {renderToolCall(tc.toolUseBlock, tc.toolResult, tc.id)}
            </ThreadEntry>
          ))}
        </div>
      ))}

      {isStreaming && !turn.result && (
        <div className="flex items-center gap-1.5 px-2 py-1 ml-6">
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
        </div>
      )}

      {implicitFinalText && (
        <ThreadEntry depth={0}>
          <AgentMessage text={implicitFinalText} />
        </ThreadEntry>
      )}

      {turn.result && (() => {
        const text = extractFinalText(turn.result);
        return text ? (
          <ThreadEntry depth={0}>
            <AgentMessage text={text} />
          </ThreadEntry>
        ) : null;
      })()}
    </div>
  );
};

export const TurnBlock = React.memo(TurnBlockComponent);
