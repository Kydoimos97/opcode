import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import appLogo from "@/assets/logo.png";

/**
 * StartupIntro - a lightweight startup overlay shown on app launch.
 * - Non-interactive; auto-fades after parent hides it via the `visible` prop.
 * - Uses existing shimmer/rotating-symbol styles from shimmer.css.
 * - `progress` (0-100): drives the thin loading bar at the bottom.
 * - `stepLabel`: displays the current startup step below the brand text.
 */
export function StartupIntro({ visible, progress = 0, stepLabel }: { visible: boolean; progress?: number; stepLabel?: string }) {
  // Simple entrance animations only
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background"
          aria-hidden="true"
        >
          {/* Ambient radial glow */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{
              background:
                "radial-gradient(800px circle at 50% 55%, var(--color-primary)/8, transparent 65%)",
              pointerEvents: "none",
            } as CSSProperties}
          />

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px circle at 50% 40%, transparent 60%, rgba(0,0,0,0.25))",
            }}
          />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="relative flex flex-col items-center justify-center gap-1"
          >

            {/* Icon + brand text row */}
            <div className="relative flex items-center justify-center gap-4">
              {/* App logo */}
              <motion.img
                src={appLogo}
                alt="C-Code"
                className="relative z-10 h-20 w-20 object-contain flex-shrink-0"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />

              {/* Brand text */}
              <motion.div
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: 0.15 }}
              >
                <BrandText />
              </motion.div>
            </div>

            {stepLabel && (
              <motion.p
                key={stepLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="mt-4 text-xs text-muted-foreground tracking-wide"
              >
                {stepLabel}
              </motion.p>
            )}

          </motion.div>

          {/* Progress bar — thin bar at the very bottom of the overlay */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/30">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default StartupIntro;

function BrandText() {
  return (
    <div className="text-5xl font-extrabold tracking-tight brand-text">
      <span className="brand-text-solid">C-Code</span>
      <span aria-hidden="true" className="brand-text-shimmer">C-Code</span>
    </div>
  );
}
