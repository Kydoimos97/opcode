import React, { useState } from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Copy,
  GitBranch,
  Settings,
  Hash,
  Command,
  Pencil,
  RefreshCw,
  ChevronsUpDown,
  FileText,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { TooltipSimple } from '@/components/ui/tooltip-modern';
import { cn } from '@/lib/utils';
import { useProjectDisplayName } from '@/hooks/useProjectDisplayName';
import { useProjectColor } from '@/hooks/useProjectColor';

interface SessionHeaderProps {
  projectPath: string;
  claudeSessionId: string | null;
  sessionId?: string | null;
  selectedModel: 'sonnet' | 'opus';
  isStreaming: boolean;
  hasMessages: boolean;
  allCollapsed?: boolean;
  copyPopoverOpen: boolean;
  gitInfo?: { repo_name: string; branch: string; is_git_repo: boolean; remote_url?: string } | null;
  onBack: () => void;
  onSelectPath: () => void;
  onCopyAsJsonl: () => void;
  onCopyAsMarkdown: () => void;
  onModelChange: (model: 'sonnet' | 'opus') => void;
  onProjectSettings?: () => void;
  onSlashCommandsSettings?: () => void;
  onOpenFolder?: () => void;
  onOpenSessionFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onOpenSessionFile?: () => void;
  onShowTimeline?: () => void;
  setCopyPopoverOpen: (open: boolean) => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = React.memo(({
  projectPath,
  claudeSessionId,
  sessionId,
  selectedModel,
  isStreaming,
  hasMessages,
  allCollapsed,
  copyPopoverOpen,
  gitInfo,
  onBack,
  onSelectPath,
  onCopyAsJsonl,
  onCopyAsMarkdown,
  onModelChange,
  onProjectSettings,
  onSlashCommandsSettings,
  onOpenFolder,
  onOpenSessionFolder,
  onRefresh,
  onCollapseAll,
  onOpenSessionFile,
  onShowTimeline,
  setCopyPopoverOpen,
}) => {
  const { displayName, setDisplayName } = useProjectDisplayName(projectPath);
  const { color: projectColor } = useProjectColor(projectPath);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [idCopied, setIdCopied] = useState(false);

  const displayedSessionId = claudeSessionId ?? sessionId ?? null;

  const copySessionId = () => {
    if (!displayedSessionId) return;
    navigator.clipboard.writeText(displayedSessionId).then(() => {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    });
  };

  const autoTitle = (() => {
    if (gitInfo?.is_git_repo) {
      return `${gitInfo.repo_name}(${gitInfo.branch})`;
    }
    if (projectPath) {
      return projectPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'Claude Code Session';
    }
    return 'Claude Code Session';
  })();

  const displayedTitle = displayName ?? autoTitle;

  return (
    <div className="bg-background border-b px-4 py-2.5 flex-shrink-0 z-10">
      <div className="flex items-center justify-between gap-2">

        {/* Left — back + project name */}
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="group flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: projectColor }}
            />
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setDisplayName(editValue.trim() || null); setIsEditing(false); }
                  if (e.key === 'Escape') { setIsEditing(false); }
                }}
                onBlur={() => { setDisplayName(editValue.trim() || null); setIsEditing(false); }}
                className="text-sm font-medium bg-transparent border-b border-primary outline-none w-40"
              />
            ) : (
              <span className="text-sm font-medium truncate">{displayedTitle}</span>
            )}
            {!isEditing && projectPath && (
              <TooltipSimple content="Rename" side="bottom">
                <button
                  onClick={() => { setEditValue(displayName ?? autoTitle); setIsEditing(true); }}
                  className="p-1 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <Pencil size={11} />
                </button>
              </TooltipSimple>
            )}
          </div>

          {!projectPath && (
            <Button variant="outline" size="sm" onClick={onSelectPath} className="flex items-center gap-1.5 shrink-0">
              <FolderOpen className="h-3.5 w-3.5" />
              Select Project
            </Button>
          )}
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-1 shrink-0">

          {onRefresh && !isStreaming && (
            <TooltipSimple content="Reload session" side="bottom">
              <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

          {displayedSessionId && (
            <TooltipSimple content={idCopied ? 'Copied!' : 'Copy session ID'} side="bottom">
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-accent transition-colors select-none font-mono"
                onClick={copySessionId}
              >
                <Hash className="h-3 w-3 mr-1" />
                {displayedSessionId.slice(0, 8)}
              </Badge>
            </TooltipSimple>
          )}

          {onOpenFolder && projectPath && (
            <TooltipSimple content="Open project folder" side="bottom">
              <Button variant="ghost" size="icon" onClick={onOpenFolder} className="h-8 w-8">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

          {onOpenSessionFolder && (
            <TooltipSimple content="Open session folder" side="bottom">
              <Button variant="ghost" size="icon" onClick={onOpenSessionFolder} className="h-8 w-8">
                <FolderOpen className="h-4 w-4 opacity-60" />
              </Button>
            </TooltipSimple>
          )}

          {onOpenSessionFile && (
            <TooltipSimple content="Open session JSONL" side="bottom">
              <Button variant="ghost" size="icon" onClick={onOpenSessionFile} className="h-8 w-8">
                <FileText className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

          {hasMessages && !isStreaming && (
            <Popover
              open={copyPopoverOpen}
              onOpenChange={setCopyPopoverOpen}
              trigger={
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Copy className="h-4 w-4" />
                </Button>
              }
              content={
                <div className="space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onCopyAsJsonl}>
                    Copy as JSONL
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onCopyAsMarkdown}>
                    Copy as Markdown
                  </Button>
                </div>
              }
              className="w-44 p-2"
            />
          )}

          {hasMessages && onCollapseAll && (
            <TooltipSimple content={allCollapsed ? 'Expand all' : 'Collapse all'} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={onCollapseAll}
                className={cn('h-8 w-8 transition-colors', allCollapsed && 'bg-accent text-accent-foreground')}
              >
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

          {gitInfo?.is_git_repo && gitInfo.remote_url && (
            <TooltipSimple content="Open remote repository" side="bottom">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  let url = gitInfo.remote_url!;
                  if (url.startsWith('git@')) {
                    url = url.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
                  } else {
                    url = url.replace(/\.git$/, '');
                  }
                  window.open(url, '_blank');
                }}
              >
                <GitBranch className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Model</DropdownMenuLabel>
              <div className="flex gap-1 px-2 pb-2">
                <button
                  onClick={() => onModelChange('sonnet')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors',
                    selectedModel === 'sonnet'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  )}
                >
                  <Zap className="h-3 w-3" />
                  Sonnet
                </button>
                <button
                  onClick={() => onModelChange('opus')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors',
                    selectedModel === 'opus'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  )}
                >
                  <Zap className="h-3 w-3 rotate-180" />
                  Opus
                </button>
              </div>
              {(onProjectSettings || onSlashCommandsSettings || onShowTimeline) && <DropdownMenuSeparator />}
              {onProjectSettings && (
                <DropdownMenuItem onClick={onProjectSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  Session Settings
                </DropdownMenuItem>
              )}
              {onSlashCommandsSettings && (
                <DropdownMenuItem onClick={onSlashCommandsSettings}>
                  <Command className="h-4 w-4 mr-2" />
                  Slash Commands
                </DropdownMenuItem>
              )}
              {onShowTimeline && (
                <DropdownMenuItem onClick={onShowTimeline}>
                  <GitBranch className="h-4 w-4 mr-2" />
                  Session Timeline
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </div>
  );
});
