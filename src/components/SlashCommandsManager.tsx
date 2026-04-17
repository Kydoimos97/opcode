import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Edit,
  Save,
  Command,
  Globe,
  FolderOpen,
  Terminal,
  FileCode,
  Zap,
  Code,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { BreathingDots } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import MDEditor from "@uiw/react-md-editor";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { api, type SlashCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/hooks";
import { COMMON_TOOL_MATCHERS } from "@/types/hooks";

interface SlashCommandsManagerProps {
  projectPath?: string;
  className?: string;
  scopeFilter?: 'project' | 'user' | 'all';
}

type ScopeOption = 'all' | 'project' | 'user' | 'built-in';

interface CommandForm {
  name: string;
  namespace: string;
  content: string;
  description: string;
  allowedTools: string[];
  scope: 'project' | 'user';
}

const EXAMPLE_COMMANDS = [
  {
    name: "review",
    description: "Review code for best practices",
    content: "Review the following code for best practices, potential issues, and improvements:\n\n@$ARGUMENTS",
    allowedTools: ["Read", "Grep"]
  },
  {
    name: "explain",
    description: "Explain how something works",
    content: "Explain how $ARGUMENTS works in detail, including its purpose, implementation, and usage examples.",
    allowedTools: ["Read", "Grep", "WebSearch"]
  },
  {
    name: "fix-issue",
    description: "Fix a specific issue",
    content: "Fix issue #$ARGUMENTS following our coding standards and best practices.",
    allowedTools: ["Read", "Edit", "MultiEdit", "Write"]
  },
  {
    name: "test",
    description: "Write tests for code",
    content: "Write comprehensive tests for:\n\n@$ARGUMENTS\n\nInclude unit tests, edge cases, and integration tests where appropriate.",
    allowedTools: ["Read", "Write", "Edit"]
  }
];

// Get icon for command based on its properties
const getCommandIcon = (command: SlashCommand) => {
  if (command.has_bash_commands) return Terminal;
  if (command.has_file_references) return FileCode;
  if (command.accepts_arguments) return Zap;
  if (command.scope === "project") return FolderOpen;
  if (command.scope === "user") return Globe;
  return Command;
};

/**
 * SlashCommandsManager component for managing custom slash commands
 * Provides a no-code interface for creating, editing, and deleting commands
 */
export const SlashCommandsManager: React.FC<SlashCommandsManagerProps> = ({
  projectPath,
  className,
  scopeFilter = 'all',
}) => {
  const { theme } = useTheme();
  const syntaxTheme = getClaudeSyntaxTheme(theme);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<ScopeOption>(scopeFilter === 'all' ? 'all' : scopeFilter as 'project' | 'user');
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SlashCommand | null>(null);
  const [commandForm, setCommandForm] = useState<CommandForm>({
    name: "",
    namespace: "",
    content: "",
    description: "",
    allowedTools: [],
    scope: 'user'
  });

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commandToDelete, setCommandToDelete] = useState<SlashCommand | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load commands on mount
  useEffect(() => {
    loadCommands();
  }, [projectPath]);

  const loadCommands = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedCommands = await api.slashCommandsList(projectPath);
      setCommands(loadedCommands);
    } catch (err) {
      console.error("Failed to load slash commands:", err);
      setError("Failed to load commands");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingCommand(null);
    setCommandForm({
      name: "",
      namespace: "",
      content: "",
      description: "",
      allowedTools: [],
      scope: scopeFilter !== 'all' ? scopeFilter : (projectPath ? 'project' : 'user')
    });
    setEditDialogOpen(true);
  };

  const handleEdit = (command: SlashCommand) => {
    setEditingCommand(command);
    setCommandForm({
      name: command.name,
      namespace: command.namespace || "",
      content: command.content,
      description: command.description || "",
      allowedTools: command.allowed_tools,
      scope: command.scope as 'project' | 'user'
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await api.slashCommandSave(
        commandForm.scope,
        commandForm.name,
        commandForm.namespace || undefined,
        commandForm.content,
        commandForm.description || undefined,
        commandForm.allowedTools,
        commandForm.scope === 'project' ? projectPath : undefined
      );

      setEditDialogOpen(false);
      await loadCommands();
    } catch (err) {
      console.error("Failed to save command:", err);
      setError(err instanceof Error ? err.message : "Failed to save command");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (command: SlashCommand) => {
    setCommandToDelete(command);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!commandToDelete) return;

    try {
      setDeleting(true);
      setError(null);
      await api.slashCommandDelete(commandToDelete.id, projectPath);
      setDeleteDialogOpen(false);
      setCommandToDelete(null);
      await loadCommands();
    } catch (err) {
      console.error("Failed to delete command:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to delete command";
      setError(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setCommandToDelete(null);
  };

  const toggleExpanded = (commandId: string) => {
    setExpandedCommands(prev => {
      const next = new Set(prev);
      if (next.has(commandId)) {
        next.delete(commandId);
      } else {
        next.add(commandId);
      }
      return next;
    });
  };

  const handleToolToggle = (tool: string) => {
    setCommandForm(prev => ({
      ...prev,
      allowedTools: prev.allowedTools.includes(tool)
        ? prev.allowedTools.filter(t => t !== tool)
        : [...prev.allowedTools, tool]
    }));
  };

  const applyExample = (example: typeof EXAMPLE_COMMANDS[0]) => {
    setCommandForm(prev => ({
      ...prev,
      name: example.name,
      description: example.description,
      content: example.content,
      allowedTools: example.allowedTools
    }));
  };

  // Filter commands
  const filteredCommands = commands.filter(cmd => {
    // When a specific scopeFilter is set by the parent, hide built-ins
    if (cmd.scope === 'default' && scopeFilter !== 'all') {
      return false;
    }

    // Apply scopeFilter if set to specific scope
    if (scopeFilter !== 'all' && cmd.scope !== scopeFilter) {
      return false;
    }

    // Selected scope filter (user-driven dropdown)
    let scopeMatch = true;
    if (selectedScope === 'built-in') {
      scopeMatch = cmd.scope === 'default';
    } else if (selectedScope !== 'all') {
      scopeMatch = cmd.scope === selectedScope;
    }
    if (!scopeMatch) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        cmd.name.toLowerCase().includes(query) ||
        cmd.full_command.toLowerCase().includes(query) ||
        (cmd.description && cmd.description.toLowerCase().includes(query)) ||
        (cmd.namespace && cmd.namespace.toLowerCase().includes(query))
      );
    }

    return true;
  });

  // Group commands by scope
  const groupedByScope = useMemo(() => {
    const user = filteredCommands.filter(c => c.scope === 'user');
    const project = filteredCommands.filter(c => c.scope === 'project');
    const builtin = filteredCommands.filter(c => c.scope === 'default');
    return { user, project, builtin };
  }, [filteredCommands]);

  // Render a command row with optional read-only mode
  const renderCommandRow = (command: SlashCommand, readOnly: boolean) => {
    const Icon = getCommandIcon(command);
    const isExpanded = expandedCommands.has(command.id);

    return (
      <div key={command.id}>
        <div className={cn("p-4", readOnly && "opacity-60")}>
          <div className="flex items-start gap-4">
            <Icon className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <code className="text-sm font-mono text-primary">
                  {command.full_command}
                </code>
                {command.accepts_arguments && (
                  <Badge variant="secondary" className="text-xs">
                    Arguments
                  </Badge>
                )}
                {readOnly && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Read-only
                  </Badge>
                )}
              </div>

              {command.description && (
                <p className="text-sm text-muted-foreground mb-2">
                  {command.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs">
                {command.allowed_tools.length > 0 && (
                  <span className="text-muted-foreground">
                    {command.allowed_tools.length} tool{command.allowed_tools.length === 1 ? '' : 's'}
                  </span>
                )}

                {command.has_bash_commands && (
                  <Badge variant="outline" className="text-xs">
                    Bash
                  </Badge>
                )}

                {command.has_file_references && (
                  <Badge variant="outline" className="text-xs">
                    Files
                  </Badge>
                )}

                <button
                  onClick={() => toggleExpanded(command.id)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Hide content
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      Show content
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!readOnly && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(command)}
                    className="h-8 w-8"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(command)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {command.content}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {scopeFilter === 'project' ? 'Project Slash Commands' : 'Slash Commands'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {scopeFilter === 'project' 
              ? 'Create custom commands for this project' 
              : 'Create custom commands to streamline your workflow'}
          </p>
        </div>
        <Button onClick={handleCreateNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Command
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {scopeFilter === 'all' && (
          <Select value={selectedScope} onValueChange={(value: ScopeOption) => setSelectedScope(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Commands</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="built-in">Built-in</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Commands List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <BreathingDots className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : filteredCommands.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <Command className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "No commands found"
                : scopeFilter === 'project'
                  ? "No project commands created yet"
                  : "No commands created yet"}
            </p>
            {!searchQuery && scopeFilter !== 'project' && (
              <Button onClick={handleCreateNew} variant="outline" size="sm" className="mt-4">
                Create your first command
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByScope.user.length > 0 && (
            <Card className="overflow-hidden">
              <div className="p-4 bg-muted/50 border-b">
                <h4 className="text-sm font-medium">User</h4>
              </div>
              <div className="divide-y">
                {groupedByScope.user.map(cmd => renderCommandRow(cmd, false))}
              </div>
            </Card>
          )}

          {groupedByScope.project.length > 0 && (
            <Card className="overflow-hidden">
              <div className="p-4 bg-muted/50 border-b">
                <h4 className="text-sm font-medium">Project</h4>
              </div>
              <div className="divide-y">
                {groupedByScope.project.map(cmd => renderCommandRow(cmd, false))}
              </div>
            </Card>
          )}

          {groupedByScope.builtin.length > 0 && (
            <Card className="overflow-hidden">
              <div className="p-4 bg-muted/50 border-b">
                <h4 className="text-sm font-medium">Built-in</h4>
              </div>
              <div className="divide-y">
                {groupedByScope.builtin.map(cmd => renderCommandRow(cmd, true))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCommand ? "Edit Command" : "Create New Command"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Scope */}
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select 
                value={commandForm.scope} 
                onValueChange={(value: 'project' | 'user') => setCommandForm(prev => ({ ...prev, scope: value }))}
                disabled={scopeFilter !== 'all' || (!projectPath && commandForm.scope === 'project')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(scopeFilter === 'all' || scopeFilter === 'user') && (
                    <SelectItem value="user">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        User (Global)
                      </div>
                    </SelectItem>
                  )}
                  {(scopeFilter === 'all' || scopeFilter === 'project') && (
                    <SelectItem value="project" disabled={!projectPath}>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Project
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {commandForm.scope === 'user' 
                  ? "Available across all projects" 
                  : "Only available in this project"}
              </p>
            </div>

            {/* Name and Namespace */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Command Name*</Label>
                <Input
                  placeholder="e.g., review, fix-issue"
                  value={commandForm.name}
                  onChange={(e) => setCommandForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Namespace (Optional)</Label>
                <Input
                  placeholder="e.g., frontend, backend"
                  value={commandForm.namespace}
                  onChange={(e) => setCommandForm(prev => ({ ...prev, namespace: e.target.value }))}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Brief description of what this command does"
                value={commandForm.description}
                onChange={(e) => setCommandForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            {/* Content */}
            <div className="space-y-2" data-color-mode="dark">
              <Label>Command Content*</Label>
              <MDEditor
                value={commandForm.content}
                onChange={(val) => setCommandForm(prev => ({ ...prev, content: val || '' }))}
                preview="live"
                height={220}
                visibleDragbar={false}
                previewOptions={{
                  components: {
                    code({ children, className: codeClass, ...rest }: any) {
                      const match = /language-(\w+)/.exec(codeClass || '');
                      return match ? (
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language={match[1]}
                          PreTag="div"
                          {...rest}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={codeClass} {...rest}>{children}</code>
                      );
                    },
                  },
                }}
              />
              <p className="text-xs text-muted-foreground">
                Use <code>$ARGUMENTS</code> for user input, <code>@filename</code> for files,
                and <code>!`command`</code> for bash commands
              </p>
            </div>

            {/* Allowed Tools */}
            <div className="space-y-2">
              <Label>Allowed Tools</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_TOOL_MATCHERS.map((tool) => (
                  <Button
                    key={tool}
                    variant={commandForm.allowedTools.includes(tool) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToolToggle(tool)}
                    type="button"
                  >
                    {tool}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select which tools Claude can use with this command
              </p>
            </div>

            {/* Examples */}
            {!editingCommand && (
              <div className="space-y-2">
                <Label>Examples</Label>
                <div className="grid grid-cols-2 gap-2">
                  {EXAMPLE_COMMANDS.map((example) => (
                    <Button
                      key={example.name}
                      variant="outline"
                      size="sm"
                      onClick={() => applyExample(example)}
                      className="justify-start"
                    >
                      <Code className="h-4 w-4 mr-2" />
                      {example.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {commandForm.name && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-3 bg-muted rounded-md">
                  <code className="text-sm">
                    /
                    {commandForm.namespace && `${commandForm.namespace}:`}
                    {commandForm.name}
                    {commandForm.content.includes('$ARGUMENTS') && ' [arguments]'}
                  </code>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!commandForm.name || !commandForm.content || saving}
            >
              {saving ? (
                <>
                  <BreathingDots className="h-4 w-4 mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Command</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p>Are you sure you want to delete this command?</p>
            {commandToDelete && (
              <div className="p-3 bg-muted rounded-md">
                <code className="text-sm font-mono">{commandToDelete.full_command}</code>
                {commandToDelete.description && (
                  <p className="text-sm text-muted-foreground mt-1">{commandToDelete.description}</p>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The command file will be permanently deleted.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <BreathingDots className="h-4 w-4 mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 
