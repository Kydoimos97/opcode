import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { SessionState } from "./ClaudeCodeSession";

interface SessionStatusBarProps {
  model: string | null;
  sessionDurationMs: number;
  totalTokens: number;
  gitRepoName: string | null;
  gitBranch: string | null;
  diffAdditions: number;
  diffDeletions: number;
  sessionState: SessionState;
  className?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function getModelShort(model: string | null): string {
  if (!model) return "—";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-").slice(-1)[0] ?? model;
}

function isCguardActive(settings: any): boolean {
  const hooks = settings?.hooks?.PreToolUse;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h: any) =>
    typeof h === 'string'
      ? h.includes('hook-dispatcher')
      : h?.command?.includes('hook-dispatcher') || h?.hooks?.some?.((inner: any) => inner?.command?.includes('hook-dispatcher'))
  );
}

// Approximate context % — sonnet/opus both 200k limit
const CONTEXT_LIMIT = 200_000;

export const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
  model,
  sessionDurationMs,
  totalTokens,
  gitRepoName,
  gitBranch,
  diffAdditions,
  diffDeletions,
  sessionState,
  className,
}) => {
  const [cguardActive, setCguardActive] = useState(false);

  useEffect(() => {
    const loadCguardStatus = async () => {
      try {
        const settings = await api.getGlobalSettings();
        setCguardActive(isCguardActive(settings));
      } catch (e) {
        console.error('Failed to load c-guard status:', e);
      }
    };
    loadCguardStatus();
  }, []);

  const ctxPct = Math.min(100, Math.round((totalTokens / CONTEXT_LIMIT) * 100));
  const modelShort = getModelShort(model);
  const duration = formatDuration(sessionDurationMs);
  const tokensStr = formatTokens(totalTokens);

  const stateColor: Record<SessionState, string> = {
    idle: "text-muted-foreground",
    running: "text-blue-400",
    waiting_input: "text-muted-foreground",
    waiting_approval: "text-amber-400",
    waiting_elicitation: "text-amber-400",
    done: "text-green-400",
    error: "text-red-400",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-1 text-xs text-muted-foreground",
        "border-t border-border/50 bg-background/80 backdrop-blur-sm select-none",
        "font-mono",
        className
      )}
    >
      {/* Tokens / context */}
      <span className={stateColor[sessionState]}>
        {tokensStr}/{ctxPct}%
      </span>

      <span className="text-border/70">|</span>

      {/* Model */}
      <span>
        {modelShort}
      </span>

      {/* Git info */}
      {gitRepoName && (
        <>
          <span className="text-border/70">@</span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {gitRepoName}
            {gitBranch && <span className="text-primary/70">({gitBranch})</span>}
          </span>
        </>
      )}

      <span className="text-border/70">|</span>

      {/* Diff stat */}
      {(diffAdditions > 0 || diffDeletions > 0) && (
        <>
          <span>
            <span className="text-green-400">+{diffAdditions}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-400">-{diffDeletions}</span>
          </span>
          <span className="text-border/70">|</span>
        </>
      )}

      {/* Duration */}
      <span>Dur:{duration}</span>

      {/* Spacer */}
      <span className="flex-1" />

      {/* c-guard indicator */}
      {cguardActive ? (
        <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <ShieldOff className="h-3.5 w-3.5 opacity-30" />
      )}
    </div>
  );
};
