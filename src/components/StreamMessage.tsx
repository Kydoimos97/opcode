import React, { useState, useEffect } from "react";
import { Terminal, User, Bot, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/hooks";
import type { ClaudeStreamMessage } from "./AgentExecution";
import {
  TodoWidget,
  TodoReadWidget,
  LSWidget,
  ReadWidget,
  ReadResultWidget,
  GlobWidget,
  BashWidget,
  WriteWidget,
  GrepWidget,
  EditWidget,
  EditResultWidget,
  MCPWidget,
  CommandWidget,
  CommandOutputWidget,
  SummaryWidget,
  MultiEditWidget,
  MultiEditResultWidget,
  SystemReminderWidget,
  SystemInitializedWidget,
  TaskWidget,
  LSResultWidget,
  ThinkingWidget,
  WebSearchWidget,
  WebFetchWidget,
} from "./ToolWidgets";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StreamMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  streamMessages: ClaudeStreamMessage[];
  onLinkDetected?: (url: string) => void;
  variant?: 'default' | 'final';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOOLS_WITH_DEDICATED_WIDGETS = new Set([
  "task", "edit", "multiedit", "todowrite", "todoread",
  "ls", "read", "glob", "bash", "write", "grep", "websearch", "webfetch",
]);

function useToolResults(streamMessages: ClaudeStreamMessage[]): Map<string, any> {
  const [toolResults, setToolResults] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const results = new Map<string, any>();
    streamMessages.forEach(msg => {
      if (msg.type === "user" && Array.isArray(msg.message?.content)) {
        msg.message.content.forEach((block: any) => {
          if (block.type === "tool_result" && block.tool_use_id) {
            results.set(block.tool_use_id, block);
          }
        });
      }
    });
    setToolResults(results);
  }, [streamMessages]);

  return toolResults;
}

function findToolUseById(streamMessages: ClaudeStreamMessage[], toolUseId: string): any | null {
  for (let i = streamMessages.length - 1; i >= 0; i--) {
    const msg = streamMessages[i];
    if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
      const found = msg.message.content.find(
        (c: any) => c.type === "tool_use" && c.id === toolUseId
      );
      if (found) return found;
    }
  }
  return null;
}

function extractToolResultText(content: any): string {
  if (typeof content.content === "string") return content.content;
  if (content.content && typeof content.content === "object") {
    if (content.content.text) return content.content.text;
    if (Array.isArray(content.content)) {
      return content.content
        .map((c: any) => (typeof c === "string" ? c : c.text ?? JSON.stringify(c)))
        .join("\n");
    }
    return JSON.stringify(content.content, null, 2);
  }
  return "";
}

function hasDedicatedWidget(toolUse: any): boolean {
  if (!toolUse) return false;
  const name = toolUse.name?.toLowerCase();
  return TOOLS_WITH_DEDICATED_WIDGETS.has(name) || toolUse.name?.startsWith("mcp__");
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

interface MarkdownContentProps {
  content: string;
  syntaxTheme: any;
  className?: string;
}

async function openExternalLink(href: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(href);
  } catch {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

// Matches Windows paths (C:\...) and Unix paths starting with common roots or ~/
// Only outside of markdown code fences and inline code.
const FILE_PATH_RE = /(?<![`([])(?:([A-Za-z]):\\(?:[^\s"'`\]<>\r\n\\][^\s"'`\]<>\r\n]*)?|(?:~|\/(?:home|Users|var|usr|opt|tmp|etc|mnt|srv|c|d|e))(?:\/[^\s"'`\]<>\r\n]*)+)/g;

function linkifyFilePaths(content: string): string {
  // Split on fenced and inline code blocks so we don't touch code
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // inside code — leave as-is
    return part.replace(FILE_PATH_RE, (match) => {
      const encoded = encodeURIComponent(match);
      return `[${match}](file-path://${encoded})`;
    });
  }).join('');
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, syntaxTheme, className }) => (
  <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className: codeClass, children, ...props }: any) {
          const match = /language-(\w+)/.exec(codeClass || "");
          return !inline && match ? (
            <SyntaxHighlighter style={syntaxTheme} language={match[1]} PreTag="div" {...props}>
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={codeClass} {...props}>{children}</code>
          );
        },
        a({ href, children, ...props }: any) {
          const isFilePath = href?.startsWith('file-path://');
          const target = isFilePath
            ? decodeURIComponent(href.slice('file-path://'.length))
            : href;
          return (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (target) openExternalLink(target);
              }}
              className={cn(
                "cursor-pointer underline transition-colors",
                isFilePath
                  ? "decoration-amber-500/50 hover:decoration-amber-500 text-amber-600 dark:text-amber-400"
                  : "decoration-primary/50 hover:decoration-primary"
              )}
              title={target}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {linkifyFilePaths(content)}
    </ReactMarkdown>
  </div>
);

interface ResultHeaderProps {
  isError?: boolean;
  label: string;
}

const ResultHeader: React.FC<ResultHeaderProps> = ({ isError, label }) => (
  <div className="flex items-center gap-2">
    {isError
      ? <AlertCircle className="h-4 w-4 text-destructive" />
      : <CheckCircle2 className="h-4 w-4 text-green-500" />
    }
    <span className="text-sm font-medium">{label}</span>
  </div>
);

// ─── ToolUseBlock — dispatches assistant tool_use content to widgets ──────────

interface ToolUseBlockProps {
  content: any;
  toolResult: any;
}

const ToolUseBlock: React.FC<ToolUseBlockProps> = ({ content, toolResult }) => {
  const toolName = content.name?.toLowerCase();
  const input = content.input;

  if (toolName === "task" && input)
    return <TaskWidget description={input.description} prompt={input.prompt} result={toolResult} />;
  if (toolName === "edit" && input?.file_path)
    return <EditWidget {...input} result={toolResult} />;
  if (toolName === "multiedit" && input?.file_path && input?.edits)
    return <MultiEditWidget {...input} result={toolResult} />;
  if (content.name?.startsWith("mcp__"))
    return <MCPWidget toolName={content.name} input={input} result={toolResult} />;
  if (toolName === "todowrite" && input?.todos)
    return <TodoWidget todos={input.todos} result={toolResult} />;
  if (toolName === "todoread")
    return <TodoReadWidget todos={input?.todos} result={toolResult} />;
  if (toolName === "ls" && input?.path)
    return <LSWidget path={input.path} result={toolResult} />;
  if (toolName === "read" && input?.file_path)
    return <ReadWidget filePath={input.file_path} result={toolResult} />;
  if (toolName === "glob" && input?.pattern)
    return <GlobWidget pattern={input.pattern} result={toolResult} />;
  if (toolName === "bash" && input?.command)
    return <BashWidget command={input.command} description={input.description} result={toolResult} />;
  if (toolName === "write" && input?.file_path && input?.content)
    return <WriteWidget filePath={input.file_path} content={input.content} result={toolResult} />;
  if (toolName === "grep" && input?.pattern)
    return <GrepWidget pattern={input.pattern} include={input.include} path={input.path} exclude={input.exclude} result={toolResult} />;
  if (toolName === "websearch" && input?.query)
    return <WebSearchWidget query={input.query} result={toolResult} />;
  if (toolName === "webfetch" && input?.url)
    return <WebFetchWidget url={input.url} prompt={input.prompt} result={toolResult} />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          Using tool: <code className="font-mono">{content.name}</code>
        </span>
      </div>
      {input && (
        <div className="ml-6 p-2 bg-background rounded-md border">
          <pre className="text-xs font-mono overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

// ─── ToolResultBlock — dispatches user tool_result content to renderers ───────

interface ToolResultBlockProps {
  content: any;
  streamMessages: ClaudeStreamMessage[];
}

const ToolResultBlock: React.FC<ToolResultBlockProps> = ({ content, streamMessages }) => {
  const originatingTool = content.tool_use_id
    ? findToolUseById(streamMessages, content.tool_use_id)
    : null;

  // Skip — the assistant-side widget already shows this result inline
  if (hasDedicatedWidget(originatingTool)) return null;

  const contentText = extractToolResultText(content);

  // System reminder embedded in result
  const reminderMatch = contentText.match(/<system-reminder>(.*?)<\/system-reminder>/s);
  if (reminderMatch) {
    const before = contentText.substring(0, reminderMatch.index ?? 0).trim();
    const after = contentText.substring((reminderMatch.index ?? 0) + reminderMatch[0].length).trim();
    return (
      <div className="space-y-2">
        <ResultHeader label="Tool Result" />
        {before && (
          <div className="ml-6 p-2 bg-background rounded-md border">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{before}</pre>
          </div>
        )}
        <div className="ml-6">
          <SystemReminderWidget message={reminderMatch[1].trim()} />
        </div>
        {after && (
          <div className="ml-6 p-2 bg-background rounded-md border">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{after}</pre>
          </div>
        )}
      </div>
    );
  }

  // Edit result
  if (contentText.includes("has been updated. Here's the result of running `cat -n`")) {
    return (
      <div className="space-y-2">
        <ResultHeader label="Edit Result" />
        <EditResultWidget content={contentText} />
      </div>
    );
  }

  // MultiEdit result
  if (
    contentText.includes("has been updated with multiple edits") ||
    contentText.includes("MultiEdit completed successfully") ||
    contentText.includes("Applied multiple edits to")
  ) {
    return (
      <div className="space-y-2">
        <ResultHeader label="MultiEdit Result" />
        <MultiEditResultWidget content={contentText} />
      </div>
    );
  }

  // LS result — only if originating tool was ls and content looks like a tree
  if (originatingTool?.name?.toLowerCase() === "ls") {
    const lines = contentText.split("\n");
    const looksLikeTree =
      lines.some(l => /^\s*-\s+/.test(l)) ||
      lines.some(l => l.trim().startsWith("NOTE: do any of the files"));
    if (looksLikeTree) {
      return (
        <div className="space-y-2">
          <ResultHeader label="Directory Contents" />
          <LSResultWidget content={contentText} />
        </div>
      );
    }
  }

  // Read result — only if originating tool was read and content has line numbers
  if (
    originatingTool?.name?.toLowerCase() === "read" &&
    /^\s*\d+→/.test(contentText)
  ) {
    return (
      <div className="space-y-2">
        <ResultHeader label="Read Result" />
        <ReadResultWidget content={contentText} filePath={originatingTool?.input?.file_path} />
      </div>
    );
  }

  // Empty result
  if (!contentText || contentText.trim() === "") {
    return (
      <div className="space-y-2">
        <ResultHeader label="Tool Result" />
        <div className="ml-6 p-3 bg-muted/50 rounded-md border text-sm text-muted-foreground italic">
          Tool did not return any output
        </div>
      </div>
    );
  }

  // Generic result
  return (
    <div className="space-y-2">
      <ResultHeader isError={content.is_error} label="Tool Result" />
      <div className="ml-6 p-2 bg-background rounded-md border">
        <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{contentText}</pre>
      </div>
    </div>
  );
};

// ─── AssistantMessage ─────────────────────────────────────────────────────────

interface AssistantMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  getToolResult: (toolId: string | undefined) => any;
  syntaxTheme: any;
  variant?: 'default' | 'final';
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message, className, getToolResult, syntaxTheme, variant = 'default',
}) => {
  const msg = message.message!;
  const blocks: any[] = Array.isArray(msg.content) ? msg.content : [];

  const renderableBlocks = blocks.filter(
    b => b.type === "text" || b.type === "thinking" || b.type === "tool_use"
  );
  if (renderableBlocks.length === 0) return null;

  const hasTextOrThinking = renderableBlocks.some(b => b.type === "text" || b.type === "thinking");
  const isToolOnly = !hasTextOrThinking;

  const getCardStyle = () => {
    if (variant === 'final') {
      return {
        borderColor: 'var(--chat-final-border)',
        backgroundColor: 'var(--chat-final-bg)',
      };
    } else if (isToolOnly) {
      return {
        borderColor: 'var(--chat-tool-border)',
        backgroundColor: 'var(--chat-tool-bg)',
      };
    } else {
      return {
        borderColor: 'var(--chat-agent-border)',
        backgroundColor: 'var(--chat-agent-bg)',
      };
    }
  };

  return (
    <Card className={cn("border", className)} style={getCardStyle()}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Bot className={cn("h-5 w-5 mt-0.5", isToolOnly ? "text-muted-foreground" : "text-accent")} />
          <div className="flex-1 space-y-2 min-w-0">
            {renderableBlocks.map((block: any, idx: number) => {
              if (block.type === "text") {
                const text = typeof block.text === "string"
                  ? block.text
                  : block.text?.text ?? JSON.stringify(block.text ?? block);
                return <MarkdownContent key={idx} content={text} syntaxTheme={syntaxTheme} />;
              }
              if (block.type === "thinking") {
                return <ThinkingWidget key={idx} thinking={block.thinking ?? ""} signature={block.signature} />;
              }
              if (block.type === "tool_use") {
                return <ToolUseBlock key={idx} content={block} toolResult={getToolResult(block.id)} />;
              }
              return null;
            })}
            {msg.usage && (
              <div className="text-xs text-muted-foreground mt-2">
                Tokens: {msg.usage.input_tokens} in, {msg.usage.output_tokens} out
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── UserMessage ──────────────────────────────────────────────────────────────

interface UserStringContentProps {
  content: string;
  onLinkDetected?: (url: string) => void;
}

const UserStringContent: React.FC<UserStringContentProps> = ({ content, onLinkDetected }) => {
  if (content.trim() === "") return null;

  const commandMatch = content.match(
    /<command-name>(.+?)<\/command-name>[\s\S]*?<command-message>(.+?)<\/command-message>[\s\S]*?<command-args>(.*?)<\/command-args>/
  );
  if (commandMatch) {
    const [, commandName, commandMessage, commandArgs] = commandMatch;
    return (
      <CommandWidget
        commandName={commandName.trim()}
        commandMessage={commandMessage.trim()}
        commandArgs={commandArgs?.trim()}
      />
    );
  }

  const stdoutMatch = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  if (stdoutMatch) {
    return <CommandOutputWidget output={stdoutMatch[1]} onLinkDetected={onLinkDetected} />;
  }

  return <div className="text-sm">{content}</div>;
};

interface UserMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  streamMessages: ClaudeStreamMessage[];
  onLinkDetected?: (url: string) => void;
}

const UserMessage: React.FC<UserMessageProps> = ({
  message, className, streamMessages, onLinkDetected,
}) => {
  if (message.isMeta) return null;

  const msg = message.message || message;
  const isStringContent =
    typeof msg.content === "string" || (msg.content && !Array.isArray(msg.content));
  const arrayBlocks: any[] = Array.isArray(msg.content) ? msg.content : [];
  const contentStr = isStringContent ? String(msg.content ?? "") : "";

  // Determine whether anything will actually render before mounting the card
  const hasRenderableString = isStringContent && contentStr.trim() !== "";
  const hasRenderableArrayBlock = arrayBlocks.some(block => {
    if (block.type === "text") return true;
    if (block.type === "tool_result") {
      const originatingTool = block.tool_use_id
        ? findToolUseById(streamMessages, block.tool_use_id)
        : null;
      return !hasDedicatedWidget(originatingTool);
    }
    return false;
  });

  if (!hasRenderableString && !hasRenderableArrayBlock) return null;

  return (
    <Card className={cn("border-muted-foreground/20 bg-muted/20", className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1 space-y-2 min-w-0">
            {isStringContent && (
              <UserStringContent content={contentStr} onLinkDetected={onLinkDetected} />
            )}
            {arrayBlocks.map((block: any, idx: number) => {
              if (block.type === "tool_result") {
                return <ToolResultBlock key={idx} content={block} streamMessages={streamMessages} />;
              }
              if (block.type === "text") {
                const text = typeof block.text === "string"
                  ? block.text
                  : JSON.stringify(block.text);
                return <div key={idx} className="text-sm">{text}</div>;
              }
              return null;
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── ResultMessage ────────────────────────────────────────────────────────────

interface ResultMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  syntaxTheme: any;
}

const ResultMessage: React.FC<ResultMessageProps> = ({ message, className, syntaxTheme }) => {
  const isError = message.is_error || message.subtype?.includes("error");

  const cardStyle = isError
    ? {
        borderColor: 'var(--chat-result-err-border)',
        backgroundColor: 'var(--chat-result-err-bg)',
      }
    : {
        borderColor: 'var(--chat-result-ok-border)',
        backgroundColor: 'var(--chat-result-ok-bg)',
      };

  return (
    <Card className={cn("border", className)} style={cardStyle}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {isError
            ? <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            : <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
          }
          <div className="flex-1 space-y-2">
            <h4 className="font-semibold text-sm">
              {isError ? "Execution Failed" : "Execution Complete"}
            </h4>
            {message.result && (
              <MarkdownContent content={message.result} syntaxTheme={syntaxTheme} />
            )}
            {message.error && (
              <div className="text-sm text-destructive">{message.error}</div>
            )}
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
              {(message.cost_usd !== undefined || message.total_cost_usd !== undefined) && (
                <div>Cost: ${((message.cost_usd || message.total_cost_usd)!).toFixed(4)} USD</div>
              )}
              {message.duration_ms !== undefined && (
                <div>Duration: {(message.duration_ms / 1000).toFixed(2)}s</div>
              )}
              {message.num_turns !== undefined && (
                <div>Turns: {message.num_turns}</div>
              )}
              {message.usage && (
                <div>
                  Total tokens: {message.usage.input_tokens + message.usage.output_tokens}
                  {" "}({message.usage.input_tokens} in, {message.usage.output_tokens} out)
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── RenderError ──────────────────────────────────────────────────────────────

interface RenderErrorProps {
  error: unknown;
  className?: string;
}

const RenderError: React.FC<RenderErrorProps> = ({ error, className }) => (
  <Card
    className={cn("border", className)}
    style={{
      borderColor: 'var(--chat-result-err-border)',
      backgroundColor: 'var(--chat-result-err-bg)',
    }}
  >
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium">Error rendering message</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
);

// ─── StreamMessage (dispatcher) ───────────────────────────────────────────────

const StreamMessageComponent: React.FC<StreamMessageProps> = ({
  message, className, streamMessages, onLinkDetected, variant = 'default',
}) => {
  const toolResults = useToolResults(streamMessages);
  const { theme } = useTheme();
  const syntaxTheme = getClaudeSyntaxTheme(theme);

  const getToolResult = (toolId: string | undefined): any =>
    toolId ? toolResults.get(toolId) ?? null : null;

  try {
    if (message.isMeta && !message.leafUuid && !message.summary) return null;

    if (message.leafUuid && message.summary && (message as any).type === "summary") {
      return <SummaryWidget summary={message.summary} leafUuid={message.leafUuid} />;
    }

    if (message.type === "system" && message.subtype === "init") {
      return (
        <SystemInitializedWidget
          sessionId={message.session_id}
          model={message.model}
          cwd={message.cwd}
          tools={message.tools}
        />
      );
    }

    if (message.type === "assistant" && message.message) {
      return (
        <AssistantMessage
          message={message}
          className={className}
          getToolResult={getToolResult}
          syntaxTheme={syntaxTheme}
          variant={variant}
        />
      );
    }

    if (message.type === "user") {
      return (
        <UserMessage
          message={message}
          className={className}
          streamMessages={streamMessages}
          onLinkDetected={onLinkDetected}
        />
      );
    }

    if (message.type === "result") {
      return (
        <ResultMessage
          message={message}
          className={className}
          syntaxTheme={syntaxTheme}
        />
      );
    }

    return null;
  } catch (error) {
    console.error("Error rendering stream message:", error, message);
    return <RenderError error={error} className={className} />;
  }
};

export const StreamMessage = React.memo(StreamMessageComponent);
