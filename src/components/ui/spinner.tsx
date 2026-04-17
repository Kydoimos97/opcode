import { cn } from "@/lib/utils";

interface BreathingDotsProps {
  className?: string;
}

/**
 * Three staggered breathing dots. Drop-in replacement for <Loader2 className="... animate-spin" />.
 * Pass size via className — the dots scale relative to the container font size.
 * Color inherits via bg-current.
 */
export function BreathingDots({ className }: BreathingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-center justify-center gap-[0.2em]", className)}
      aria-label="Loading"
      role="status"
    >
      <span className="dot-breathe-1 h-[0.3em] w-[0.3em] rounded-full bg-current" />
      <span className="dot-breathe-2 h-[0.3em] w-[0.3em] rounded-full bg-current" />
      <span className="dot-breathe-3 h-[0.3em] w-[0.3em] rounded-full bg-current" />
    </span>
  );
}
