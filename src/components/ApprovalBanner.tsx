import React, { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BannerType = "approval" | "elicitation";

interface ApprovalBannerProps {
  type: BannerType;
  message: string;
  onAllow?: () => void;
  onDeny?: () => void;
  onRespond?: (response: string) => void;
  onDismiss?: () => void;
  className?: string;
}

export const ApprovalBanner: React.FC<ApprovalBannerProps> = ({
  type,
  message,
  onAllow,
  onDeny,
  onRespond,
  onDismiss,
  className,
}) => {
  const [inputValue, setInputValue] = useState("");

  return (
    <div
      className={cn(
        "w-full border-t-2 px-4 py-3 flex items-start gap-3",
        type === "approval"
          ? "bg-amber-500/10 border-amber-500/50"
          : "bg-blue-500/10 border-blue-500/50",
        className
      )}
      style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
    >
      <ShieldAlert
        className={cn(
          "h-5 w-5 mt-0.5 shrink-0",
          type === "approval" ? "text-amber-500" : "text-blue-500"
        )}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {type === "approval" ? "Approval Required" : "Input Required"}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 break-words">{message}</p>

        {type === "elicitation" && onRespond && (
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim()) {
                  onRespond(inputValue.trim());
                }
              }}
              placeholder="Type your response..."
              autoFocus
            />
            <Button
              size="sm"
              onClick={() => inputValue.trim() && onRespond(inputValue.trim())}
            >
              Send
            </Button>
          </div>
        )}

        {type === "approval" && (
          <div className="mt-2 flex gap-2">
            {onAllow && (
              <Button size="sm" variant="default" onClick={onAllow}>
                Allow
              </Button>
            )}
            {onDeny && (
              <Button size="sm" variant="destructive" onClick={onDeny}>
                Deny
              </Button>
            )}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
