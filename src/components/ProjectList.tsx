import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  ArrowRight,
  FolderInput,
  GitBranch,
  Pencil,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Project, type Session } from "@/lib/api";
import { ccodeSettings } from "@/lib/ccodeSettings";
import { cn } from "@/lib/utils";

const MAX_SESSIONS_SHOWN = 5;
const RECENT_DAYS = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#06b6d4", "#6366f1", "#f43f5e",
  "#84cc16", "#f59e0b",
];

function defaultColor(key: string): string {
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface ConsolidatedProject {
  /** Key used for ccodeSettings lookups (git_root or path) */
  settingsKey: string;
  /** Display name source (git root basename or path basename) */
  repoName: string;
  /** All underlying claude projects (one per worktree) */
  projects: Project[];
  mostRecentSession: number;
  totalSessions: number;
}

interface DayGroup {
  label: string;
  projects: ConsolidatedProject[];
}

function consolidate(projects: Project[]): ConsolidatedProject[] {
  const groups = new Map<string, ConsolidatedProject>();

  for (const p of projects) {
    const key = p.git_root ?? p.path;
    const repoName = p.git_root ? basename(p.git_root) : basename(p.path);

    if (!groups.has(key)) {
      groups.set(key, { settingsKey: key, repoName, projects: [], mostRecentSession: 0, totalSessions: 0 });
    }
    const g = groups.get(key)!;
    g.projects.push(p);
    g.totalSessions += p.sessions.length;
    if (p.most_recent_session && p.most_recent_session > g.mostRecentSession) {
      g.mostRecentSession = p.most_recent_session;
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.mostRecentSession - a.mostRecentSession);
}

function groupByDay(consolidated: ConsolidatedProject[]): DayGroup[] {
  const now = Date.now() / 1000;
  const todayStart = now - (now % 86400);
  const yesterdayStart = todayStart - 86400;
  const weekStart = todayStart - 7 * 86400;

  const result: DayGroup[] = [];
  let currentLabel = "";

  for (const cp of consolidated) {
    const ts = cp.mostRecentSession;
    let label: string;

    if (!ts) {
      label = "No sessions";
    } else if (ts >= todayStart) {
      label = "Today";
    } else if (ts >= yesterdayStart) {
      label = "Yesterday";
    } else if (ts >= weekStart) {
      label = "This week";
    } else {
      label = new Date(ts * 1000).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }

    if (label !== currentLabel) {
      result.push({ label, projects: [] });
      currentLabel = label;
    }
    result[result.length - 1].projects.push(cp);
  }

  return result;
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: Session;
  onSessionClick: (session: Session) => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, onSessionClick }) => {
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    ccodeSettings.getSession(session.id).then(meta => {
      setName(meta.name ?? null);
    });
  }, [session.id]);

  const commitName = (val: string) => {
    const trimmed = val.trim();
    const stored = trimmed || null;
    setName(stored);
    ccodeSettings.setSession(session.id, { name: stored ?? undefined });
    setEditing(false);
  };

  const displayLabel = name
    ?? (session.first_message ? session.first_message.slice(0, 80) : `Session ${session.id.slice(0, 8)}`);

  return (
    <div className="flex items-start gap-2 pl-7 pr-3 py-1.5 group/session hover:bg-accent/40 transition-colors">
      <Clock size={12} className="flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div className="min-w-0 flex-1" onClick={() => !editing && onSessionClick(session)}>
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commitName(editValue);
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={() => commitName(editValue)}
            onClick={e => e.stopPropagation()}
            className="w-full bg-transparent border-b border-primary outline-none text-xs"
          />
        ) : (
          <div className="cursor-pointer">
            <div className={cn("text-xs truncate leading-snug", name ? "text-foreground" : "text-foreground/70")}>
              {displayLabel}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{relativeTime(session.modified_at ?? session.created_at)}</span>
              <span className="font-mono opacity-40">{session.id.slice(0, 8)}</span>
            </div>
          </div>
        )}
      </div>
      {!editing && (
        <button
          onClick={e => { e.stopPropagation(); setEditValue(name ?? ""); setEditing(true); }}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/session:opacity-100 text-muted-foreground hover:text-foreground transition-all"
          title="Rename session"
        >
          <Pencil size={10} />
        </button>
      )}
    </div>
  );
};

// ─── ConsolidatedProjectRow ───────────────────────────────────────────────────

interface ConsolidatedProjectRowProps {
  consolidated: ConsolidatedProject;
  onProjectClick: (project: Project) => void;
  onSessionClick: (session: Session) => void;
  onNewSession: (project: Project) => void;
}

const ConsolidatedProjectRow: React.FC<ConsolidatedProjectRowProps> = ({
  consolidated,
  onProjectClick,
  onSessionClick,
  onNewSession,
}) => {
  const { settingsKey, repoName, projects, totalSessions } = consolidated;

  const [displayName, setDisplayName] = useState(repoName);
  const [color, setColor] = useState(() => defaultColor(settingsKey));
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const colorPickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ccodeSettings.getProject(settingsKey).then(meta => {
      if (meta.name) setDisplayName(meta.name);
      if (meta.color) setColor(meta.color);
    });
  }, [settingsKey]);

  const loadSessions = useCallback(async () => {
    if (sessions !== null || loadingSessions) return;
    setLoadingSessions(true);
    try {
      const all = await Promise.all(
        projects.map(p => api.getProjectSessions(p.id).catch(() => [] as Session[]))
      );
      const merged = all
        .flat()
        .sort((a, b) => (b.modified_at ?? b.created_at) - (a.modified_at ?? a.created_at));
      setSessions(merged);
    } finally {
      setLoadingSessions(false);
    }
  }, [projects, sessions, loadingSessions]);

  const handleToggle = () => {
    if (!expanded) loadSessions();
    setExpanded(e => !e);
  };

  const cutoff = Date.now() / 1000 - RECENT_DAYS * 86400;
  const recentSessions = sessions
    ? sessions.filter(s => (s.modified_at ?? s.created_at) > cutoff).slice(0, MAX_SESSIONS_SHOWN)
    : [];
  const hiddenCount = totalSessions - recentSessions.length;

  const commitName = (val: string) => {
    const trimmed = val.trim();
    const stored = trimmed || repoName;
    setDisplayName(stored);
    ccodeSettings.setProject(settingsKey, { name: trimmed || undefined });
    setEditing(false);
  };

  const handleColorChange = (hex: string) => {
    setColor(hex);
    ccodeSettings.setProject(settingsKey, { color: hex });
  };

  const primaryProject = projects[0];
  const branches = [...new Set(projects.map(p => p.git_branch).filter(Boolean) as string[])];

  const openFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(primaryProject.path);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  };

  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* Row header */}
      <div className="flex items-center gap-1.5 px-3 py-2 hover:bg-accent/30 transition-colors group">
        {/* Color swatch — click to pick */}
        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); colorPickerRef.current?.click(); }}
            className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0 hover:scale-125 transition-transform"
            style={{ backgroundColor: color }}
            title="Pick project color"
          />
          <input
            ref={colorPickerRef}
            type="color"
            value={color}
            onChange={e => handleColorChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-0 h-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>

        {/* Toggle — chevron + name/path */}
        <button onClick={handleToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <span className="flex-shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {editing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitName(editValue);
                    if (e.key === "Escape") setEditing(false);
                  }}
                  onBlur={() => commitName(editValue)}
                  onClick={e => e.stopPropagation()}
                  className="bg-transparent border-b border-primary outline-none text-sm font-medium w-48"
                />
              ) : (
                <span className="font-medium text-sm truncate">{displayName}</span>
              )}
              <span className="text-xs text-muted-foreground flex-shrink-0">({totalSessions})</span>
              {branches.map(b => (
                <span key={b} className="flex items-center gap-0.5 text-xs flex-shrink-0 bg-foreground/10 text-foreground px-1.5 py-0.5 rounded">
                  <GitBranch size={10} />
                  {b}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate mt-0.5 opacity-60">
              {primaryProject.path}
            </div>
          </div>
        </button>

        {/* Always-visible actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!editing && (
            <button
              onClick={e => { e.stopPropagation(); setEditValue(displayName); setEditing(true); }}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
              title="Rename project"
            >
              <Pencil size={13} />
            </button>
          )}
          {editing && (
            <button
              onClick={e => { e.stopPropagation(); commitName(editValue); }}
              className="p-1.5 rounded hover:bg-accent text-green-500 transition-colors"
              title="Save name"
            >
              <Check size={13} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onNewSession(primaryProject); }}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="New session"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={openFolder}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Open in explorer"
          >
            <FolderInput size={14} />
          </button>
        </div>
      </div>

      {/* Expanded sessions */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="sessions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {/* Left accent bar using project color */}
            <div className="ml-7 border-l-2 border-border/30" style={{ borderColor: color + "40" }}>
              {loadingSessions && (
                <div className="pl-4 py-1.5 text-xs text-muted-foreground">Loading sessions...</div>
              )}

              {recentSessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onSessionClick={onSessionClick}
                />
              ))}

              {sessions !== null && totalSessions === 0 && (
                <div className="pl-4 py-1.5 text-xs text-muted-foreground">No sessions yet</div>
              )}
            </div>

            {/* Footer */}
            <div className="pl-7 pr-3 py-2 flex items-center justify-between">
              {hiddenCount > 0 ? (
                <span className="text-xs text-muted-foreground">+{hiddenCount} older</span>
              ) : <span />}
              <button
                onClick={() => onProjectClick(primaryProject)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Open project
                <ArrowRight size={11} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── ProjectList (main export) ────────────────────────────────────────────────

interface ProjectListProps {
  projects: Project[];
  onProjectClick: (project: Project) => void;
  onSessionClick?: (project: Project, session: Session) => void;
  onNewSession?: (project: Project) => void;
  onOpenProject?: () => void | Promise<void>;
  loading?: boolean;
  className?: string;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onProjectClick,
  onSessionClick,
  onNewSession,
  onOpenProject,
  loading,
  className,
}) => {
  const consolidated = consolidate(projects);
  const dayGroups = groupByDay(consolidated);

  return (
    <div className={cn("h-full overflow-y-auto", className)}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Projects</h1>
              <p className="mt-1 text-body-small text-muted-foreground">
                Select a project or session to start working with Claude Code
              </p>
            </div>
            <Button onClick={onOpenProject} size="default" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Open Project
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Loading projects...
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <FolderOpen className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-heading-3 mb-2">No recent projects</h3>
              <p className="text-body-small text-muted-foreground mb-6">
                Open a project to get started with Claude Code
              </p>
              <Button onClick={onOpenProject} size="default" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Open Your First Project
              </Button>
            </div>
          )}

          {!loading && dayGroups.length > 0 && (
            <div className="space-y-6">
              {dayGroups.map(group => (
                <div key={group.label}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    {group.label}
                  </div>
                  <div className="rounded-md border border-border overflow-hidden">
                    {group.projects.map(cp => (
                      <ConsolidatedProjectRow
                        key={cp.settingsKey}
                        consolidated={cp}
                        onProjectClick={onProjectClick}
                        onSessionClick={(session) => onSessionClick?.(cp.projects[0], session)}
                        onNewSession={onNewSession ?? (() => {})}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
