import React, { useState } from "react";
import { ChevronRight, ChevronDown, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { StreamMessage } from "./StreamMessage";
import type { ClaudeStreamMessage } from "./AgentExecution";

interface WorkBlockProps {
  items: ClaudeStreamMessage[];
  streamMessages: ClaudeStreamMessage[];
  isComplete: boolean;
  onLinkDetected?: (url: string) => void;
  className?: string;
}

function isDenyResult(msg: ClaudeStreamMessage): boolean {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block: any) => {
    if (block.type === 'tool_result') {
      const text = typeof block.content === 'string'
        ? block.content
        : block.content?.map?.((c: any) => c.text).join('') ?? '';
      return /\[DENY\]|BLOCKED/i.test(text);
    }
    return false;
  });
}

export const WorkBlock: React.FC<WorkBlockProps> = ({
  items,
  streamMessages,
  isComplete,
  onLinkDetected,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (items.length === 0 && isComplete) return null;

  // Count distinct tool_use calls as the step count
  const toolUseCount = items.reduce((count, msg) => {
    if (msg.type === "assistant" && msg.message?.content && Array.isArray(msg.message.content)) {
      return count + msg.message.content.filter((c: any) => c.type === "tool_use").length;
    }
    return count;
  }, 0);

  const stepCount = toolUseCount > 0 ? toolUseCount : items.length;
  const stepLabel = stepCount === 1 ? "1 step" : `${stepCount} steps`;

  return (
    <div className={cn("my-1", className)}>
      {/* Toggle row */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-2 py-1 pl-2 pr-3 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors w-auto text-xs"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}

        {!isComplete ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span>Working...</span>
          </span>
        ) : (
          <span>{stepLabel}</span>
        )}
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="work-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-1 border-l-2 border-border/50 pl-3 space-y-1">
              {items.map((item, idx) =>
                isDenyResult(item) ? (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-amber-500 border border-amber-500/30 rounded-md bg-amber-500/5"
                  >
                    <ShieldAlert size={14} className="flex-shrink-0" />
                    <span>Blocked by policy</span>
                  </div>
                ) : (
                  <StreamMessage
                    key={idx}
                    message={item}
                    streamMessages={streamMessages}
                    onLinkDetected={onLinkDetected}
                  />
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
