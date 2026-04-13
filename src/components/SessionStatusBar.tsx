import React, { useEffect, useState, useRef } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { TooltipSimple } from "@/components/ui/tooltip-modern";

interface SessionStatusBarProps {
  sessionId: string | null;
  className?: string;
}

function getModelShort(modelId: string): string {
  if (modelId.includes("opus")) return "Opus";
  if (modelId.includes("sonnet")) return "Sonnet";
  if (modelId.includes("haiku")) return "Haiku";
  return modelId.split("-").pop() ?? modelId;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}


function getCtxBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 75) return "bg-orange-400";
  if (pct >= 50) return "bg-yellow-400";
  return "bg-green-400";
}

function getCtxTextColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 75) return "text-orange-400";
  if (pct >= 50) return "text-yellow-400";
  return "text-green-400";
}

function getRateLimitColor(pct: number): string {
  if (pct >= 85) return "text-red-400";
  if (pct >= 65) return "text-yellow-400";
  return "text-green-400";
}

function isCguardActive(settings: any): boolean {
  const hooks = settings?.hooks?.PreToolUse;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h: any) =>
    typeof h === "string"
      ? h.includes("hook-dispatcher")
      : h?.command?.includes("hook-dispatcher") ||
        h?.hooks?.some?.((inner: any) => inner?.command?.includes("hook-dispatcher"))
  );
}

export const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
  sessionId,
  className,
}) => {
  const [statusData, setStatusData] = useState<Record<string, any> | null>(null);
  const [cguardActive, setCguardActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getGlobalSettings()
      .then((s) => setCguardActive(isCguardActive(s)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setStatusData(null);
      return;
    }

    const poll = async () => {
      const data = await api.readSessionStatus(sessionId);
      setStatusData(data && Object.keys(data).length > 0 ? data : null);
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId]);

  if (!statusData) return null;

  const model = statusData.model;
  const cost = statusData.cost;
  const ctx = statusData.context_window;
  const rateLimits = statusData.rate_limits;
  const agentName: string = statusData.agent?.name ?? "main";

  const modelShort = model?.id
    ? getModelShort(model.id)
    : (model?.display_name ?? "—");
  const costStr = typeof cost?.total_cost_usd === "number"
    ? formatCost(cost.total_cost_usd)
    : null;
  const durStr = typeof cost?.total_duration_ms === "number"
    ? formatDuration(cost.total_duration_ms)
    : null;
  const linesAdded: number = cost?.total_lines_added ?? 0;
  const linesRemoved: number = cost?.total_lines_removed ?? 0;
  const ctxPct: number = Math.round(ctx?.used_percentage ?? 0);
  const fiveHrPct: number | null = rateLimits?.five_hour?.used_percentage != null ? Math.round(rateLimits.five_hour.used_percentage) : null;
  const sevenDayPct: number | null = rateLimits?.seven_day?.used_percentage != null ? Math.round(rateLimits.seven_day.used_percentage) : null;
  const hasRateLimits = fiveHrPct !== null || sevenDayPct !== null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1 text-xs",
        "bg-background/95 backdrop-blur-sm select-none",
        className
      )}
    >
      {/* Agent(Model) */}
      <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
        <span className="font-medium text-foreground capitalize">{agentName}</span>
        <span className="opacity-40 mx-0.5">/</span>
        <span className="font-medium text-foreground">{modelShort}</span>
      </span>

      <span className="text-border shrink-0">·</span>

      {/* Cost / duration / diff */}
      <span className="flex items-center gap-2 shrink-0">
        {costStr && <span className="text-amber-400">{costStr}</span>}
        {durStr && <span className="text-muted-foreground">{durStr}</span>}
        {(linesAdded > 0 || linesRemoved > 0) && (
          <span>
            <span className="text-green-400">+{linesAdded}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-red-400">-{linesRemoved}</span>
          </span>
        )}
      </span>

      <span className="text-border shrink-0">·</span>

      {/* Context progress bar */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-muted-foreground/60">ctx</span>
        <span className="relative h-1.5 w-20 rounded-full bg-muted overflow-hidden">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all duration-1000",
              getCtxBarColor(ctxPct)
            )}
            style={{ width: `${ctxPct}%` }}
          />
        </span>
        <span className={getCtxTextColor(ctxPct)}>{ctxPct}%</span>
      </span>

      {/* Spacer */}
      <span className="flex-1" />

      {/* Rate limits */}
      {hasRateLimits && (
        <>
          <span className="flex items-center gap-3 shrink-0">
            {fiveHrPct !== null && (
              <span>
                <span className="text-muted-foreground/60">5h </span>
                <span className={getRateLimitColor(fiveHrPct)}>{fiveHrPct}%</span>
              </span>
            )}
            {sevenDayPct !== null && (
              <span>
                <span className="text-muted-foreground/60">7d </span>
                <span className={getRateLimitColor(sevenDayPct)}>{sevenDayPct}%</span>
              </span>
            )}
          </span>
          <span className="text-border shrink-0">·</span>
        </>
      )}

      {/* c-guard indicator */}
      <TooltipSimple content={cguardActive ? "c-guard active" : "c-guard inactive"} side="top">
        <span className="flex items-center">
          {cguardActive ? (
            <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5 opacity-30" />
          )}
        </span>
      </TooltipSimple>
    </div>
  );
};
