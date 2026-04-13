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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { TooltipSimple } from '@/components/ui/tooltip-modern';
import { cn } from '@/lib/utils';
import { useProjectDisplayName } from '@/hooks/useProjectDisplayName';
import { useProjectColor } from '@/hooks/useProjectColor';

interface SessionHeaderProps {
  projectPath: string;
  claudeSessionId: string | null;
  totalTokens: number;
  isStreaming: boolean;
  hasMessages: boolean;
  allCollapsed?: boolean;
  copyPopoverOpen: boolean;
  gitInfo?: { repo_name: string; branch: string; is_git_repo: boolean; remote_url?: string } | null;
  onBack: () => void;
  onSelectPath: () => void;
  onCopyAsJsonl: () => void;
  onCopyAsMarkdown: () => void;
  onProjectSettings?: () => void;
  onSlashCommandsSettings?: () => void;
  onOpenFolder?: () => void;
  onOpenSessionFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onOpenSessionFile?: () => void;
  setCopyPopoverOpen: (open: boolean) => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = React.memo(({
  projectPath,
  claudeSessionId,
  totalTokens,
  isStreaming,
  hasMessages,
  allCollapsed,
  copyPopoverOpen,
  gitInfo,
  onBack,
  onSelectPath,
  onCopyAsJsonl,
  onCopyAsMarkdown,
  onProjectSettings,
  onSlashCommandsSettings,
  onOpenFolder,
  onOpenSessionFolder,
  onRefresh,
  onCollapseAll,
  onOpenSessionFile,
  setCopyPopoverOpen
}) => {
  const { displayName, setDisplayName } = useProjectDisplayName(projectPath);
  const { color: projectColor } = useProjectColor(projectPath);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [idCopied, setIdCopied] = useState(false);

  const copySessionId = () => {
    if (!claudeSessionId) return;
    navigator.clipboard.writeText(claudeSessionId).then(() => {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    });
  };

  const autoTitle = (() => {
    if (gitInfo?.is_git_repo) {
      return `${gitInfo.repo_name}(${gitInfo.branch})`;
    }
    if (gitInfo) {
      const lastSegment = projectPath.split(/[/\\]/).filter(Boolean).pop();
      return lastSegment || "Claude Code Session";
    }
    return "Claude Code Session";
  })();

  const displayedTitle = displayName ?? autoTitle;

  return (
    <div className="bg-background border-b px-4 py-3 flex-shrink-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          <div className="group flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: projectColor }}
            />
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDisplayName(editValue.trim() || null);
                    setIsEditing(false);
                  }
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
                onBlur={() => {
                  setDisplayName(editValue.trim() || null);
                  setIsEditing(false);
                }}
                className="font-semibold bg-transparent border-b border-primary outline-none w-48"
              />
            ) : (
              <span className="font-semibold">{displayedTitle}</span>
            )}

            {!isEditing && projectPath && (
              <TooltipSimple content="Rename project" side="bottom">
                <button
                  onClick={() => {
                    setEditValue(displayName ?? autoTitle);
                    setIsEditing(true);
                  }}
                  className="p-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Pencil size={12} />
                </button>
              </TooltipSimple>
            )}
          </div>

          {!projectPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectPath}
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Select Project
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && claudeSessionId && !isStreaming && (
            <TooltipSimple content="Reload session from file" side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                className="h-8 w-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}
          {claudeSessionId && (
            <div className="flex items-center gap-2">
              <TooltipSimple content={idCopied ? "Copied!" : "Copy session ID"} side="bottom">
                <Badge
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-accent transition-colors select-none"
                  onClick={copySessionId}
                >
                  <Hash className="h-3 w-3 mr-1" />
                  {claudeSessionId.slice(0, 8)}
                </Badge>
              </TooltipSimple>
              {onOpenFolder && projectPath && (
                <TooltipSimple content="Open project folder (CWD)" side="bottom">
                  <Button variant="ghost" size="icon" onClick={onOpenFolder} className="h-8 w-8">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </TooltipSimple>
              )}
              {onOpenSessionFolder && (
                <TooltipSimple content="Open .claude session folder" side="bottom">
                  <Button variant="ghost" size="icon" onClick={onOpenSessionFolder} className="h-8 w-8">
                    <FolderOpen className="h-4 w-4 opacity-60" />
                  </Button>
                </TooltipSimple>
              )}
              {onOpenSessionFile && (
                <TooltipSimple content="Open session JSONL file" side="bottom">
                  <Button variant="ghost" size="icon" onClick={onOpenSessionFile} className="h-8 w-8">
                    <FileText className="h-4 w-4" />
                  </Button>
                </TooltipSimple>
              )}
              {totalTokens > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalTokens.toLocaleString()} tokens
                </Badge>
              )}
            </div>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onCopyAsJsonl}
                  >
                    Copy as JSONL
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onCopyAsMarkdown}
                  >
                    Copy as Markdown
                  </Button>
                </div>
              }
              className="w-48 p-2"
            />
          )}

          {hasMessages && onCollapseAll && (
            <TooltipSimple content={allCollapsed ? "Expand all steps" : "Collapse all steps"} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={onCollapseAll}
                className={cn("h-8 w-8 transition-colors", allCollapsed && "bg-accent text-accent-foreground")}
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
                  // Convert SSH remote to HTTPS
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
            <DropdownMenuContent align="end" className="w-48">
              {onProjectSettings && projectPath && (
                <DropdownMenuItem onClick={onProjectSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  Project Settings
                </DropdownMenuItem>
              )}
              {onSlashCommandsSettings && projectPath && (
                <DropdownMenuItem onClick={onSlashCommandsSettings}>
                  <Command className="h-4 w-4 mr-2" />
                  Slash Commands
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});