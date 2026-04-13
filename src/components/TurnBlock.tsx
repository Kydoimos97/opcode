import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Loader2, OctagonX } from 'lucide-react';
import { StreamMessage } from './StreamMessage';
import type { Turn } from '@/hooks/useGroupedMessages';
import type { ClaudeStreamMessage } from './AgentExecution';

const INTERRUPT_TEXT = '[Request interrupted by user]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUserText(message: ClaudeStreamMessage): string {
  const msg = message.message || message;

  if (typeof msg.content === 'string') return msg.content;

  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text as string)
      .join('\n');
  }

  return '';
}

function findLastTextWorkItem(workItems: ClaudeStreamMessage[]): ClaudeStreamMessage | null {
  for (let i = workItems.length - 1; i >= 0; i--) {
    const item = workItems[i];
    if (item.type === 'assistant' && Array.isArray(item.message?.content)) {
      const hasText = item.message.content.some((c: any) => c.type === 'text');
      if (hasText) return item;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// InterruptedBubble
// ---------------------------------------------------------------------------

const InterruptedBubble: React.FC = () => (
  <div className="flex justify-end mb-2">
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl rounded-br-sm border text-sm"
      style={{
        borderColor: 'var(--chat-interrupt-border)',
        backgroundColor: 'var(--chat-interrupt-bg)',
        color: 'var(--chat-interrupt-fg)',
      }}
    >
      <OctagonX className="h-3.5 w-3.5 flex-shrink-0" />
      <span>Request interrupted by user</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// UserBubble
// ---------------------------------------------------------------------------

interface UserBubbleProps {
  message: ClaudeStreamMessage;
}

const UserBubble: React.FC<UserBubbleProps> = ({ message }) => {
  const text = useMemo(() => extractUserText(message), [message]);

  if (text.trim() === INTERRUPT_TEXT) {
    return <InterruptedBubble />;
  }

  return (
    <div className="flex justify-end mb-2">
      <div
        className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm border text-sm"
        style={{
          borderColor: 'var(--chat-user-border)',
          backgroundColor: 'var(--chat-user-bg)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// WorkBlockHeader
// ---------------------------------------------------------------------------

interface WorkBlockHeaderProps {
  isWorking: boolean;
  isExpanded: boolean;
  stepCount: number;
  onToggle: () => void;
}

const WorkBlockHeader: React.FC<WorkBlockHeaderProps> = ({
  isWorking,
  isExpanded,
  stepCount,
  onToggle,
}) => {
  if (isWorking) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Working...</span>
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer mb-1 select-none transition-colors"
    >
      {isExpanded ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{stepCount} steps</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// WorkItemList
// ---------------------------------------------------------------------------

interface WorkItemListProps {
  turnId: string;
  items: ClaudeStreamMessage[];
  streamMessages: ClaudeStreamMessage[];
}

const WorkItemList: React.FC<WorkItemListProps> = ({ turnId, items, streamMessages }) => (
  <div className="space-y-1">
    {items.map((item, idx) => (
      <div key={`${turnId}-work-${idx}`} className="mb-1 opacity-90 scale-[0.99]">
        <StreamMessage message={item} streamMessages={streamMessages} />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// WorkBlock
// ---------------------------------------------------------------------------

interface WorkBlockProps {
  turnId: string;
  workItems: ClaudeStreamMessage[];
  streamMessages: ClaudeStreamMessage[];
  isStreaming: boolean;
  isComplete: boolean;
  collapseSignal?: number;
  expandSignal?: number;
}

const WorkBlock: React.FC<WorkBlockProps> = ({
  turnId,
  workItems,
  streamMessages,
  isStreaming,
  isComplete,
  collapseSignal,
  expandSignal,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if ((collapseSignal ?? 0) > 0) setIsExpanded(false);
  }, [collapseSignal]);

  useEffect(() => {
    if ((expandSignal ?? 0) > 0) setIsExpanded(true);
  }, [expandSignal]);

  const isWorking = !isComplete && isStreaming && workItems.length === 0;

  if (workItems.length === 0 && !isWorking) {
    return null;
  }

  return (
    <div
      className="relative pl-6 border-l-2 mb-3 ml-4"
      style={{ borderColor: 'var(--chat-work-border)' }}
    >
      <WorkBlockHeader
        isWorking={isWorking}
        isExpanded={isExpanded}
        stepCount={workItems.length}
        onToggle={() => setIsExpanded((prev) => !prev)}
      />
      {isExpanded && (
        <WorkItemList
          turnId={turnId}
          items={workItems}
          streamMessages={streamMessages}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// TurnBlock
// ---------------------------------------------------------------------------

interface TurnBlockProps {
  turn: Turn;
  streamMessages: ClaudeStreamMessage[];
  isStreaming: boolean;
  collapseSignal?: number;
  expandSignal?: number;
}

const TurnBlockComponent: React.FC<TurnBlockProps> = ({ turn, streamMessages, isStreaming, collapseSignal, expandSignal }) => {
  // When not streaming and there is no explicit result message, promote the last
  // text-bearing assistant work item to an implicit final response rendered
  // outside (and after) the collapsible work block.
  const implicitFinalResponse = useMemo(() => {
    // Only promote to "final" (green) when the turn is fully complete.
    // External sessions that are still running have isComplete=false (no result
    // message yet), so we must not green-highlight mid-session assistant messages.
    if (isStreaming || turn.result || !turn.isComplete) return null;
    return findLastTextWorkItem(turn.workItems);
  }, [isStreaming, turn.result, turn.workItems, turn.isComplete]);

  const bodyWorkItems = useMemo(
    () =>
      implicitFinalResponse
        ? turn.workItems.filter((item) => item !== implicitFinalResponse)
        : turn.workItems,
    [implicitFinalResponse, turn.workItems],
  );

  return (
    <div className="space-y-3 max-w-3xl mx-auto w-full">
      {turn.userMessage && <UserBubble message={turn.userMessage} />}

      <WorkBlock
        turnId={turn.id}
        workItems={bodyWorkItems}
        streamMessages={streamMessages}
        isStreaming={isStreaming}
        isComplete={turn.isComplete}
        collapseSignal={collapseSignal}
        expandSignal={expandSignal}
      />

      {implicitFinalResponse && (
        <StreamMessage
          message={implicitFinalResponse}
          streamMessages={streamMessages}
          variant="final"
        />
      )}

      {turn.result && (
        <StreamMessage message={turn.result} streamMessages={streamMessages} />
      )}
    </div>
  );
};

export const TurnBlock = React.memo(TurnBlockComponent);
