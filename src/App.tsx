import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Bot, FolderCode } from "lucide-react";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { ccodeSettings } from "@/lib/ccodeSettings";
import { initializeWebMode } from "@/lib/apiAdapter";
import { OutputCacheProvider } from "@/lib/outputCache";
import { TabProvider, useTabContext } from "@/contexts/TabContext";
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
import { startupCache } from "@/lib/startupCache";

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

  const [splashVisible, setSplashVisible] = useState(() => {
    try {
      const v = window.localStorage.getItem('app_setting:startup_intro_enabled');
      if (v === 'false') return false;
    } catch { /* ignore */ }
    return true;
  });
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashStep, setSplashStep] = useState('');

  const { tabs, updateTab } = useTabContext();
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Comprehensive 7-step startup sequence
  useEffect(() => {
    if (!splashVisible) return; // splash disabled — skip eager load

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const runStep = async (
      label: string,
      minMs: number,
      work: () => Promise<void>
    ) => {
      setSplashStep(label);
      await Promise.all([work().catch(console.error), sleep(minMs)]);
    };

    (async () => {
      try {
        // Step 1 — Load settings (0 → 14%)
        await runStep('Loading settings...', 600, async () => {
          initializeWebMode();
          ccodeSettings.warmup();
          const settingsData = await api.readCcodeSettings().catch(() => ({} as Record<string, string>));
          startupCache.lastUpdated = new Date();
          // Check if splash is disabled by settings
          const pref = settingsData['startup_intro_enabled'] ?? null;
          if (pref === 'false') { setSplashVisible(false); return; }
        });
        setSplashProgress(14);

        // Step 2 — Read projects and sessions (14 → 28%)
        await runStep('Reading projects and sessions...', 700, async () => {
          const projects = await api.listProjects().catch(() => []);
          startupCache.projects = projects;
        });
        setSplashProgress(28);

        // Step 3 — Check session statuses (28 → 45%)
        await runStep('Checking session statuses...', 900, async () => {
          // Wait briefly for TabContext to finish loading from localStorage
          await sleep(150);
          const currentTabs = tabsRef.current;
          const chatTabs = currentTabs.filter(t =>
            t.type === 'chat' && (t.claudeSessionId || t.sessionId) &&
            (t.claudeProjectId || (t.sessionData as any)?.project_id)
          );
          for (const tab of chatTabs) {
            const sessionId = tab.claudeSessionId || tab.sessionId!;
            const projectId = tab.claudeProjectId || (tab.sessionData as any)?.project_id;
            if (!sessionId || !projectId) continue;
            try {
              const status = await api.getSessionFileStatus(sessionId, projectId);
              let newStatus: 'idle' | 'running' | 'complete' | 'error' | 'waiting' = 'idle';
              if (status.last_type === 'result') {
                newStatus = status.is_error ? 'error' : 'complete';
              } else if (status.awaiting_approval) {
                newStatus = 'waiting';
              } else if (status.modified_secs_ago < 30) {
                newStatus = 'running';
              }
              if (tab.status !== newStatus) {
                updateTab(tab.id, { status: newStatus });
              }
            } catch { /* ignore per-tab errors */ }
          }
        });
        setSplashProgress(45);

        // Step 4 — Configure sidebar (45 → 57%)
        await runStep('Configuring sidebar and watcher...', 500, async () => {
          // Sidebar state is loaded by TabContext on mount; nothing extra needed here
          await sleep(50);
        });
        setSplashProgress(57);

        // Step 5 — Load MCP servers (57 → 71%)
        await runStep('Loading MCP servers...', 800, async () => {
          const servers = await api.mcpList().catch(() => []);
          startupCache.mcpServers = servers;
        });
        setSplashProgress(71);

        // Step 6 — Load plugins (71 → 85%)
        await runStep('Loading plugins...', 800, async () => {
          const plugins = await api.listPlugins().catch(() => null);
          if (plugins) startupCache.plugins = plugins as any;
        });
        setSplashProgress(85);

        // Step 7 — Apply configuration (85 → 100%)
        await runStep('Applying configuration...', 600, async () => {
          const settings = await api.readCcodeSettings().catch(() => ({} as Record<string, string>));
          if (settings.font_sans) document.documentElement.style.setProperty('--font-sans', settings.font_sans);
          if (settings.font_mono) document.documentElement.style.setProperty('--font-mono', settings.font_mono);
          if (settings.font_size) document.documentElement.style.setProperty('font-size', `${settings.font_size}px`);
          if (settings.show_system_footer !== undefined) setShowSystemFooter(Boolean(settings.show_system_footer));
          startupCache.lastUpdated = new Date();
        });
        setSplashProgress(100);

        await sleep(200);
        setSplashVisible(false);
      } catch {
        setSplashVisible(false);
      }
    })();
  }, []);

  // Listen for live preference changes emitted by Settings
  useEffect(() => {
    const handleFooterToggle = (e: Event) => {
      setShowSystemFooter((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('ccode:show-system-footer', handleFooterToggle);
    return () => window.removeEventListener('ccode:show-system-footer', handleFooterToggle);
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

      {/* Startup Splash Screen */}
      <StartupIntro visible={splashVisible} progress={splashProgress} stepLabel={splashStep} />
    </div>
  );
}

/**
 * Main App component - Wraps the app with providers
 */
function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <OutputCacheProvider>
          <TabProvider>
            <AppContent />
          </TabProvider>
        </OutputCacheProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
