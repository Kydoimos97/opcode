import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StreamMessage } from '../StreamMessage';
import { WorkBlock } from '../WorkBlock';
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGroupedMessages } from '@/hooks/useGroupedMessages';
import type { ClaudeStreamMessage } from '../AgentExecution';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface MessageListProps {
  messages: ClaudeStreamMessage[];
  projectPath: string;
  isStreaming: boolean;
  onLinkDetected?: (url: string) => void;
  className?: string;
}

type RenderItem =
  | { kind: "user"; message: ClaudeStreamMessage; turnId: string }
  | { kind: "work"; items: ClaudeStreamMessage[]; isComplete: boolean; turnId: string }
  | { kind: "response"; message: ClaudeStreamMessage; turnId: string }
  | { kind: "standalone"; message: ClaudeStreamMessage; index: number };

function extractTextContent(message: ClaudeStreamMessage): string {
  const content = message.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => typeof c.text === 'string' ? c.text : c.text?.text ?? '')
    .join('\n\n');
}

export const MessageList: React.FC<MessageListProps> = React.memo(({
  messages,
  projectPath,
  isStreaming,
  onLinkDetected,
  className
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const userHasScrolledRef = useRef(false);

  const turns = useGroupedMessages(messages);

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    for (const turn of turns) {
      if (turn.userMessage) {
        items.push({ kind: "user", message: turn.userMessage, turnId: turn.id });
      }
      if (turn.workItems.length > 0) {
        items.push({ kind: "work", items: turn.workItems, isComplete: turn.isComplete, turnId: turn.id });
      }
      if (turn.result) {
        items.push({ kind: "response", message: turn.result, turnId: turn.id });
      }
    }
    return items;
  }, [turns]);

  // Virtual scrolling setup
  const virtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100, // Estimated height of each message
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive
  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current && scrollContainerRef.current) {
      const scrollElement = scrollContainerRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const scrollElement = scrollContainerRef.current;
    const isAtBottom = 
      Math.abs(scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight) < 50;
    
    if (!isAtBottom) {
      userHasScrolledRef.current = true;
      shouldAutoScrollRef.current = false;
    } else if (userHasScrolledRef.current) {
      shouldAutoScrollRef.current = true;
      userHasScrolledRef.current = false;
    }
  };

  // Reset auto-scroll when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      shouldAutoScrollRef.current = true;
      userHasScrolledRef.current = false;
    }
  }, [isStreaming]);

  if (renderItems.length === 0) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4 max-w-md"
        >
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Terminal className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Ready to start coding</h3>
            <p className="text-sm text-muted-foreground">
              {projectPath
                ? "Enter a prompt below to begin your Claude Code session"
                : "Select a project folder to begin"}
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={cn("flex-1 overflow-y-auto scroll-smooth", className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="popLayout">
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = renderItems[virtualItem.index];
            const key = `${item.kind}-${item.kind === "standalone" ? item.index : (item.kind === "user" || item.kind === "response" || item.kind === "work" ? item.turnId : "")}`;

            const handleCopyText = (message: ClaudeStreamMessage) => {
              const text = extractTextContent(message);
              if (text) {
                navigator.clipboard.writeText(text);
              }
            };

            const handleCopyAsMarkdown = (message: ClaudeStreamMessage, kind: string) => {
              const text = extractTextContent(message);
              let markdown = text;
              if (kind === "user") {
                markdown = `**User:**\n${text}`;
              } else if (kind === "response") {
                markdown = `**Claude:**\n${text}`;
              } else {
                markdown = `\`\`\`\n${text}\n\`\`\``;
              }
              navigator.clipboard.writeText(markdown);
            };

            return (
              <ContextMenu key={key}>
                <ContextMenuTrigger asChild>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div className="px-4 py-2">
                      {item.kind === "user" && (
                        <div className="border-l-2 border-primary/30 pl-2">
                          <StreamMessage
                            message={item.message}
                            streamMessages={messages}
                            onLinkDetected={onLinkDetected}
                          />
                        </div>
                      )}
                  {item.kind === "work" && (
                    <WorkBlock
                      items={item.items}
                      streamMessages={messages}
                      isComplete={item.isComplete}
                      onLinkDetected={onLinkDetected}
                    />
                  )}
                  {item.kind === "response" && (() => {
                    const textContent = (() => {
                      const msg = item.message;
                      const content = msg.message?.content;
                      if (!Array.isArray(content)) return "";
                      return content
                        .filter((c: any) => c.type === "text")
                        .map((c: any) => (typeof c.text === "string" ? c.text : c.text?.text ?? ""))
                        .join("\n\n");
                    })();

                    return textContent ? (
                      <div className="px-1 py-2 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                      </div>
                    ) : null;
                  })()}
                  {item.kind === "standalone" && (
                    <StreamMessage
                      message={item.message}
                      streamMessages={messages}
                      onLinkDetected={onLinkDetected}
                    />
                  )}
                </div>
                  </motion.div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {(item.kind === "user" || item.kind === "response" || item.kind === "standalone") && (
                    <>
                      <ContextMenuItem onClick={() => handleCopyText(item.message)}>
                        Copy text
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => handleCopyAsMarkdown(item.message, item.kind)}>
                        Copy as Markdown
                      </ContextMenuItem>
                    </>
                  )}
                  {item.kind === "work" && (
                    <ContextMenuItem onClick={() => {
                      const allText = item.items
                        .map(msg => extractTextContent(msg))
                        .filter(text => text.length > 0)
                        .join('\n\n');
                      if (allText) {
                        navigator.clipboard.writeText(allText);
                      }
                    }}>
                      Copy text
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="sticky bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-background to-transparent"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
            <span>Claude is thinking...</span>
          </div>
        </motion.div>
      )}
    </div>
  );
});