import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, FolderCode } from "lucide-react";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { ccodeSettings } from "@/lib/ccodeSettings";
import { initializeWebMode } from "@/lib/apiAdapter";
import { OutputCacheProvider } from "@/lib/outputCache";
import { TabProvider } from "@/contexts/TabContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip-modern";
import { Card } from "@/components/ui/card";
import { ProjectList } from "@/components/ProjectList";
import { FilePicker } from "@/components/FilePicker";
import { SessionList } from "@/components/SessionList";
import { CustomTitlebar } from "@/components/CustomTitlebar";
import { Sidebar } from "@/components/Sidebar";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ClaudeFileEditor } from "@/components/ClaudeFileEditor";
import { Settings } from "@/components/Settings";
import { CCAgents } from "@/components/CCAgents";
import { UsageDashboard } from "@/components/UsageDashboard";
import { MCPManager } from "@/components/MCPManager";
import { ClaudeBinaryDialog } from "@/components/ClaudeBinaryDialog";
import { ProjectSettings } from '@/components/ProjectSettings';
import { TabContent } from "@/components/TabContent";
import { SystemFooter } from "@/components/SystemFooter";
import { useTabState } from "@/hooks/useTabState";
import { StartupIntro } from "@/components/StartupIntro";
import { Toaster } from "@/components/ui/Toaster";
import { showError, showSuccess } from "@/hooks/useToast";

type View = 
  | "welcome" 
  | "projects" 
  | "editor" 
  | "claude-file-editor" 
  | "settings"
  | "cc-agents"
  | "create-agent"
  | "github-agents"
  | "agent-execution"
  | "agent-run-view"
  | "mcp"
  | "usage-dashboard"
  | "project-settings"
  | "tabs"; // New view for tab-based interface

/**
 * AppContent component - Contains the main app logic, wrapped by providers
 */
function AppContent() {
  const [view, setView] = useState<View>("tabs");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { } = useTabState();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingClaudeFile, setEditingClaudeFile] = useState<ClaudeMdFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [showClaudeBinaryDialog, setShowClaudeBinaryDialog] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [homeDirectory, setHomeDirectory] = useState<string>('/');
  const [projectForSettings, setProjectForSettings] = useState<Project | null>(null);
  const [previousView] = useState<View>("welcome");
  const [showSystemFooter, setShowSystemFooter] = useState(false);

  // Initialize web mode compatibility on mount, apply saved font preferences
  useEffect(() => {
    initializeWebMode();
    ccodeSettings.warmup();
    // Apply saved font preferences immediately so they take effect without
    // the user needing to open Settings first
    Promise.all([
      ccodeSettings.getPreference('font_sans'),
      ccodeSettings.getPreference('font_mono'),
      ccodeSettings.getPreference('font_size'),
      ccodeSettings.getPreference('show_system_footer'),
    ]).then(([sans, mono, size, footer]) => {
      if (sans) document.documentElement.style.setProperty('--font-sans', sans);
      if (mono) document.documentElement.style.setProperty('--font-mono', mono);
      if (size) document.documentElement.style.setProperty('font-size', `${size}px`);
      if (footer !== null && footer !== undefined) setShowSystemFooter(Boolean(footer));
    }).catch(() => {});
  }, []);

  // Load projects on mount when in projects view
  useEffect(() => {
    if (view === "projects") {
      loadProjects();
    } else if (view === "welcome") {
      // Reset loading state for welcome view
      setLoading(false);
    }
  }, [view]);

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    if (view !== "tabs") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (modKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('create-chat-tab'));
            break;
          case 'w':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('close-current-tab'));
            break;
          case 'Tab':
            e.preventDefault();
            if (e.shiftKey) {
              window.dispatchEvent(new CustomEvent('switch-to-previous-tab'));
            } else {
              window.dispatchEvent(new CustomEvent('switch-to-next-tab'));
            }
            break;
          default:
            // Handle number keys 1-9
            if (e.key >= '1' && e.key <= '9') {
              e.preventDefault();
              const index = parseInt(e.key) - 1;
              window.dispatchEvent(new CustomEvent('switch-to-tab-by-index', { detail: { index } }));
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Listen for Claude not found events
  useEffect(() => {
    const handleClaudeNotFound = () => {
      setShowClaudeBinaryDialog(true);
    };

    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    return () => {
      window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    };
  }, []);

  /**
   * Loads all projects from the ~/.claude/projects directory
   */
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects. Please ensure ~/.claude directory exists.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles project selection and loads its sessions
   */
  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions for this project.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Opens the project directory picker
   */
  const handleOpenProject = async () => {
    // Get home directory before showing picker
    const homeDir = await api.getHomeDirectory();
    setHomeDirectory(homeDir);
    setShowProjectPicker(true);
  };

  /**
   * Opens a new Claude Code session in the interactive UI
   */
  // New session creation is handled by the tab system via titlebar actions

  /**
   * Handles editing a CLAUDE.md file from a project
   */
  const handleEditClaudeFile = (file: ClaudeMdFile) => {
    setEditingClaudeFile(file);
    handleViewChange("claude-file-editor");
  };

  /**
   * Returns from CLAUDE.md file editor to projects view
   */
  const handleBackFromClaudeFileEditor = () => {
    setEditingClaudeFile(null);
    handleViewChange("projects");
  };

  /**
   * Handles view changes with navigation protection
   */
  const handleViewChange = (newView: View) => {
    // No need for navigation protection with tabs since sessions stay open
    setView(newView);
  };

  /**
   * Handles navigating to hooks configuration
   */
  // Project settings navigation handled via `projectForSettings` state when needed


  const renderContent = () => {
    switch (view) {
      case "welcome":
        return (
          <div className="flex items-center justify-center p-4" style={{ height: "100%" }}>
            <div className="w-full max-w-4xl">
              {/* Welcome Header */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="mb-12 text-center"
              >
                <h1 className="text-4xl font-bold tracking-tight">
                  <span className="rotating-symbol"></span>
                  Welcome to C-Code
                </h1>
              </motion.div>

              {/* Navigation Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {/* CC Agents Card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: 0.05 }}
                >
                  <Card 
                    className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border"
                    onClick={() => handleViewChange("cc-agents")}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-8">
                      <Bot className="h-16 w-16 mb-4 text-primary" />
                      <h2 className="text-xl font-semibold">CC Agents</h2>
                    </div>
                  </Card>
                </motion.div>

                {/* Projects Card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: 0.1 }}
                >
                  <Card 
                    className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border"
                    onClick={() => handleViewChange("projects")}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-8">
                      <FolderCode className="h-16 w-16 mb-4 text-primary" />
                      <h2 className="text-xl font-semibold">Projects</h2>
                    </div>
                  </Card>
                </motion.div>

              </div>
            </div>
          </div>
        );

      case "cc-agents":
        return (
          <CCAgents 
            onBack={() => handleViewChange("welcome")} 
          />
        );

      case "editor":
        return (
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor onBack={() => handleViewChange("welcome")} />
          </div>
        );
      
      case "settings":
        return <Settings onBack={() => handleViewChange("welcome")} />;
      
      case "projects":
        if (selectedProject) {
          return (
            <SessionList
              sessions={sessions}
              projectPath={selectedProject.path}
              onEditClaudeFile={handleEditClaudeFile}
            />
          );
        }
        return (
          <ProjectList
            projects={projects}
            onProjectClick={handleProjectClick}
            onOpenProject={handleOpenProject}
            loading={loading}
          />
        );
      
      case "claude-file-editor":
        return editingClaudeFile ? (
          <ClaudeFileEditor
            file={editingClaudeFile}
            onBack={handleBackFromClaudeFileEditor}
          />
        ) : null;
      
      case "tabs":
        return (
          <div className="h-full flex flex-row overflow-hidden">
            <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(v => !v)} />
            <div className="flex-1 min-w-0 overflow-hidden">
              <TabContent />
            </div>
          </div>
        );
      
      case "usage-dashboard":
        return (
          <UsageDashboard onBack={() => handleViewChange("welcome")} />
        );
      
      case "mcp":
        return (
          <MCPManager onBack={() => handleViewChange("welcome")} />
        );
      
      case "project-settings":
        if (projectForSettings) {
          return (
            <ProjectSettings
              project={projectForSettings}
              onBack={() => {
                setProjectForSettings(null);
                handleViewChange(previousView || "projects");
              }}
            />
          );
        }
        break;
      
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Custom Titlebar */}
      <CustomTitlebar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(v => !v)} />
      
      {/* Topbar - Commented out since navigation moved to titlebar */}
      {/* <Topbar
        onClaudeClick={() => createClaudeMdTab()}
        onSettingsClick={() => createSettingsTab()}
        onUsageClick={() => createUsageTab()}
        onMCPClick={() => createMCPTab()}
        onInfoClick={() => setShowNFO(true)}
        onAgentsClick={() => setShowAgentsModal(true)}
      /> */}
      
      
      
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {showSystemFooter && <SystemFooter />}

      {/* Claude Binary Dialog */}
      <ClaudeBinaryDialog
        open={showClaudeBinaryDialog}
        onOpenChange={setShowClaudeBinaryDialog}
        onSuccess={() => {
          showSuccess("Claude binary path saved successfully");
          // Trigger a refresh of the Claude version check
          window.location.reload();
        }}
        onError={(message) => showError(message)}
      />

      {/* File picker modal for selecting project directory */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[600px] bg-background border rounded-lg shadow-lg">
            <FilePicker
              basePath={homeDirectory}
              onSelect={async (entry) => {
                if (entry.is_directory) {
                  // Create or open a project for this directory
                  try {
                    const project = await api.createProject(entry.path);
                    setShowProjectPicker(false);
                    await loadProjects();
                    await handleProjectClick(project);
                  } catch (err) {
                    console.error('Failed to create project:', err);
                    setError('Failed to create project for the selected directory.');
                  }
                }
              }}
              onClose={() => setShowProjectPicker(false)}
            />
          </div>
        </div>
      )}

      {/* Global Toast System */}
      <Toaster />
    </div>
  );
}

/**
 * Main App component - Wraps the app with providers
 */
function App() {
  const [showIntro, setShowIntro] = useState(() => {
    // Read cached preference synchronously to avoid any initial flash
    try {
      const cached = typeof window !== 'undefined'
        ? window.localStorage.getItem('app_setting:startup_intro_enabled')
        : null;
      if (cached === 'true') return true;
      if (cached === 'false') return false;
    } catch (_ignore) {}
    return true; // default if no cache
  });

  useEffect(() => {
    let timer: number | undefined;
    (async () => {
      try {
        const ccodeSettings = await api.readCcodeSettings().catch(() => ({} as Record<string, string>));
        const pref: string | null = ccodeSettings['startup_intro_enabled'] ?? null;
        const enabled = pref === null ? true : pref === 'true';
        if (enabled) {
          // keep intro visible and hide after duration
          timer = window.setTimeout(() => setShowIntro(false), 2000);
        } else {
          // user disabled intro: hide immediately to avoid any overlay delay
          setShowIntro(false);
        }
      } catch (err) {
        // On failure, show intro once to keep UX consistent
        timer = window.setTimeout(() => setShowIntro(false), 2000);
      }
    })();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <OutputCacheProvider>
          <TabProvider>
            <AppContent />
            <StartupIntro visible={showIntro} />
          </TabProvider>
        </OutputCacheProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
