import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Terminal,
  FolderOpen,
  Copy,
  GitBranch,
  Settings,
  Hash,
  Command,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { TooltipSimple } from '@/components/ui/tooltip-modern';
import { cn } from '@/lib/utils';
import { useProjectDisplayName } from '@/hooks/useProjectDisplayName';

interface SessionHeaderProps {
  projectPath: string;
  claudeSessionId: string | null;
  totalTokens: number;
  isStreaming: boolean;
  hasMessages: boolean;
  showTimeline: boolean;
  copyPopoverOpen: boolean;
  gitInfo?: { repo_name: string; branch: string; is_git_repo: boolean } | null;
  onBack: () => void;
  onSelectPath: () => void;
  onCopyAsJsonl: () => void;
  onCopyAsMarkdown: () => void;
  onToggleTimeline: () => void;
  onProjectSettings?: () => void;
  onSlashCommandsSettings?: () => void;
  onOpenFolder?: () => void;
  setCopyPopoverOpen: (open: boolean) => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = React.memo(({
  projectPath,
  claudeSessionId,
  totalTokens,
  isStreaming,
  hasMessages,
  showTimeline,
  copyPopoverOpen,
  gitInfo,
  onBack,
  onSelectPath,
  onCopyAsJsonl,
  onCopyAsMarkdown,
  onToggleTimeline,
  onProjectSettings,
  onSlashCommandsSettings,
  onOpenFolder,
  setCopyPopoverOpen
}) => {
  const { displayName, setDisplayName } = useProjectDisplayName(projectPath);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background/95 backdrop-blur-sm border-b px-4 py-3 sticky top-0 z-40"
    >
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
            <Terminal className="h-5 w-5 text-primary" />
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

          {projectPath && onOpenFolder && (
            <TooltipSimple content="Open folder" side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenFolder}
                className="h-8 w-8"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          )}

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
          {claudeSessionId && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Hash className="h-3 w-3 mr-1" />
                {claudeSessionId.slice(0, 8)}
              </Badge>
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

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTimeline}
            className={cn(
              "h-8 w-8 transition-colors",
              showTimeline && "bg-accent text-accent-foreground"
            )}
          >
            <GitBranch className="h-4 w-4" />
          </Button>

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
    </motion.div>
  );
});