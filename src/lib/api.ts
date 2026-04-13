import { apiCall } from './apiAdapter';
import type { HooksConfiguration } from '@/types/hooks';

/** Process type for tracking in ProcessRegistry */
export type ProcessType =
  | { AgentRun: { agent_id: string; agent_name: string } }
  | { ClaudeSession: { session_id: string } };

/** Information about a running process */
export interface ProcessInfo {
  run_id: number;
  process_type: ProcessType;
  pid: number;
  started_at: string;
  project_path: string;
  task: string;
  model: string;
}

/**
 * Represents a project in the ~/.claude/projects directory
 */
export interface Project {
  /** The project ID (derived from the directory name) */
  id: string;
  /** The original project path (decoded from the directory name) */
  path: string;
  /** List of session IDs (JSONL file names without extension) */
  sessions: string[];
  /** Unix timestamp when the project directory was created */
  created_at: number;
  /** Unix timestamp of the most recent session (if any) */
  most_recent_session?: number;
  /** Absolute path to the git repository root (undefined if not a git repo) */
  git_root?: string;
  /** Current git branch for this worktree (undefined if not a git repo) */
  git_branch?: string;
}

/**
 * Represents a session with its metadata
 */
export interface Session {
  /** The session ID (UUID) */
  id: string;
  /** The project ID this session belongs to */
  project_id: string;
  /** The project path */
  project_path: string;
  /** Optional todo data associated with this session */
  todo_data?: any;
  /** Unix timestamp when the session file was created */
  created_at: number;
  /** Unix timestamp when the session file was last modified (reflects last activity) */
  modified_at?: number;
  /** First user message content (if available) */
  first_message?: string;
  /** Timestamp of the first user message (if available) */
  message_timestamp?: string;
}

/**
 * Represents the settings from ~/.claude/settings.json
 */
export interface ClaudeSettings {
  [key: string]: any;
}

/**
 * Represents the Claude Code version status
 */
export interface ClaudeVersionStatus {
  /** Whether Claude Code is installed and working */
  is_installed: boolean;
  /** The version string if available */
  version?: string;
  /** The full output from the command */
  output: string;
}

/**
 * Represents a CLAUDE.md file found in the project
 */
export interface ClaudeMdFile {
  /** Relative path from the project root */
  relative_path: string;
  /** Absolute path to the file */
  absolute_path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: number;
}

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  extension?: string;
}

/**
 * Represents a Claude installation found on the system
 */
export interface ClaudeInstallation {
  /** Full path to the Claude binary */
  path: string;
  /** Version string if available */
  version?: string;
  /** Source of discovery (e.g., "nvm", "system", "homebrew", "which") */
  source: string;
  /** Type of installation */
  installation_type: "System" | "Custom";
}

/**
 * Represents a sidebar session entry for persistence
 */
export interface SidebarStateEntry {
  session_id: string;
  project_id: string;
  project_path: string;
  title: string;
}

// Agent API types
export interface Agent {
  id: string;
  name: string;
  icon: string;
  system_prompt: string;
  default_task?: string;
  model: string;
  hooks?: string; // JSON string of HooksConfiguration
  created_at: string;
  updated_at: string;
}

export interface AgentExport {
  version: number;
  exported_at: string;
  agent: {
    name: string;
    icon: string;
    system_prompt: string;
    default_task?: string;
    model: string;
    hooks?: string;
  };
}

export interface GitHubAgentFile {
  name: string;
  path: string;
  download_url: string;
  size: number;
  sha: string;
}

export interface AgentRun {
  id?: number;
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface AgentRunMetrics {
  duration_ms?: number;
  total_tokens?: number;
  cost_usd?: number;
  message_count?: number;
}

export interface AgentRunWithMetrics {
  id?: number;
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  duration_ms?: number;
  total_tokens?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
  metrics?: AgentRunMetrics;
  output?: string; // Real-time JSONL content
}

export interface NativeAgent {
  name: string;
  path: string;
  description: string;
  model: string | null;
  raw_content: string;
}

export interface SkillInfo {
  name: string;
  display_name: string;
  path: string;
  description: string;
  usage_count: number;
}

// Usage Dashboard types
export interface UsageEntry {
  project: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}

export interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

export interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

/**
 * Represents a checkpoint in the session timeline
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  messageIndex: number;
  timestamp: string;
  description?: string;
  parentCheckpointId?: string;
  metadata: CheckpointMetadata;
}

/**
 * Metadata associated with a checkpoint
 */
export interface CheckpointMetadata {
  totalTokens: number;
  modelUsed: string;
  userPrompt: string;
  fileChanges: number;
  snapshotSize: number;
}

/**
 * Represents a file snapshot at a checkpoint
 */
export interface FileSnapshot {
  checkpointId: string;
  filePath: string;
  content: string;
  hash: string;
  isDeleted: boolean;
  permissions?: number;
  size: number;
}

/**
 * Represents a node in the timeline tree
 */
export interface TimelineNode {
  checkpoint: Checkpoint;
  children: TimelineNode[];
  fileSnapshotIds: string[];
}

/**
 * The complete timeline for a session
 */
export interface SessionTimeline {
  sessionId: string;
  rootNode?: TimelineNode;
  currentCheckpointId?: string;
  autoCheckpointEnabled: boolean;
  checkpointStrategy: CheckpointStrategy;
  totalCheckpoints: number;
}

/**
 * Strategy for automatic checkpoint creation
 */
export type CheckpointStrategy = 'manual' | 'per_prompt' | 'per_tool_use' | 'smart';

/**
 * Result of a checkpoint operation
 */
export interface CheckpointResult {
  checkpoint: Checkpoint;
  filesProcessed: number;
  warnings: string[];
}

/**
 * Diff between two checkpoints
 */
export interface CheckpointDiff {
  fromCheckpointId: string;
  toCheckpointId: string;
  modifiedFiles: FileDiff[];
  addedFiles: string[];
  deletedFiles: string[];
  tokenDelta: number;
}

/**
 * Diff for a single file
 */
export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  diffContent?: string;
}

/**
 * Represents an MCP server configuration
 */
export interface MCPServer {
  /** Server name/identifier */
  name: string;
  /** Transport type: "stdio" or "sse" */
  transport: string;
  /** Command to execute (for stdio) */
  command?: string;
  /** Command arguments (for stdio) */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** URL endpoint (for SSE) */
  url?: string;
  /** Configuration scope: "local", "project", or "user" */
  scope: string;
  /** Whether the server is currently active */
  is_active: boolean;
  /** Server status */
  status: ServerStatus;
}

/**
 * Server status information
 */
export interface ServerStatus {
  /** Whether the server is running */
  running: boolean;
  /** Last error message if any */
  error?: string;
  /** Last checked timestamp */
  last_checked?: number;
}

/**
 * MCP configuration for project scope (.mcp.json)
 */
export interface MCPProjectConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Individual server configuration in .mcp.json
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Represents a custom slash command
 */
export interface SlashCommand {
  /** Unique identifier for the command */
  id: string;
  /** Command name (without prefix) */
  name: string;
  /** Full command with prefix (e.g., "/project:optimize") */
  full_command: string;
  /** Command scope: "project" or "user" */
  scope: string;
  /** Optional namespace (e.g., "frontend" in "/project:frontend:component") */
  namespace?: string;
  /** Path to the markdown file */
  file_path: string;
  /** Command content (markdown body) */
  content: string;
  /** Optional description from frontmatter */
  description?: string;
  /** Allowed tools from frontmatter */
  allowed_tools: string[];
  /** Whether the command has bash commands (!) */
  has_bash_commands: boolean;
  /** Whether the command has file references (@) */
  has_file_references: boolean;
  /** Whether the command uses $ARGUMENTS placeholder */
  accepts_arguments: boolean;
}

/**
 * Result of adding a server
 */
export interface AddServerResult {
  success: boolean;
  message: string;
  server_name?: string;
}

/**
 * Import result for multiple servers
 */
export interface ImportResult {
  imported_count: number;
  failed_count: number;
  servers: ImportServerResult[];
}

/**
 * Result for individual server import
 */
export interface ImportServerResult {
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Git repository information
 */
export interface GitInfo {
  repo_name: string;
  branch: string;
  is_git_repo: boolean;
  remote_url?: string;
}

/**
 * Git diff statistics
 */
export interface GitDiffStat {
  additions: number;
  deletions: number;
}

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  is_main: boolean;
}

/**
 * Status of a JSONL session file for sidebar polling
 */
export interface SessionFileStatus {
  last_type: string | null;
  is_error: boolean;
  lines_total: number;
  modified_secs_ago: number;
  awaiting_approval: boolean;
  last_user_message: string | null;
}

export interface ClaudeEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

export interface SessionLogEntry {
  session_id: string;
  project_path: string;
  file_path: string;
  modified: string;
  size: number;
}

/**
 * API client for interacting with the Rust backend
 */
export const api = {
  /**
   * Gets the user's home directory path
   * @returns Promise resolving to the home directory path
   */
  async getHomeDirectory(): Promise<string> {
    try {
      return await apiCall<string>("get_home_directory");
    } catch (error) {
      console.error("Failed to get home directory:", error);
      return "/";
    }
  },

  /**
   * Lists all projects in the ~/.claude/projects directory
   * @returns Promise resolving to an array of projects
   */
  async listProjects(): Promise<Project[]> {
    try {
      return await apiCall<Project[]>("list_projects");
    } catch (error) {
      console.error("Failed to list projects:", error);
      throw error;
    }
  },

  /**
   * Creates a new project for the given directory path
   * @param path - The directory path to create a project for
   * @returns Promise resolving to the created project
   */
  async createProject(path: string): Promise<Project> {
    try {
      return await apiCall<Project>('create_project', { path });
    } catch (error) {
      console.error("Failed to create project:", error);
      throw error;
    }
  },

  /**
   * Retrieves sessions for a specific project
   * @param projectId - The ID of the project to retrieve sessions for
   * @returns Promise resolving to an array of sessions
   */
  async getProjectSessions(projectId: string): Promise<Session[]> {
    try {
      return await apiCall<Session[]>('get_project_sessions', { projectId });
    } catch (error) {
      console.error("Failed to get project sessions:", error);
      throw error;
    }
  },

  /**
   * Saves the sidebar session state to ~/.ccode/sidebar_state.json
   * @param state - The sidebar state containing sessions list
   */
  async saveSidebarState(state: { sessions: SidebarStateEntry[] }): Promise<void> {
    return apiCall<void>('save_sidebar_state', { json: JSON.stringify(state) });
  },

  /**
   * Loads the sidebar session state from ~/.ccode/sidebar_state.json
   * @returns Promise resolving to the sidebar state or null if invalid
   */
  async loadSidebarState(): Promise<{ sessions: SidebarStateEntry[] } | null> {
    const json = await apiCall<string>('load_sidebar_state', {});
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed.sessions) ? parsed as { sessions: SidebarStateEntry[] } : null;
    } catch {
      return null;
    }
  },

  /**
   * Fetch list of agents from GitHub repository
   * @returns Promise resolving to list of available agents on GitHub
   */
  async fetchGitHubAgents(): Promise<GitHubAgentFile[]> {
    try {
      return await apiCall<GitHubAgentFile[]>('fetch_github_agents');
    } catch (error) {
      console.error("Failed to fetch GitHub agents:", error);
      throw error;
    }
  },

  /**
   * Fetch and preview a specific agent from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the agent export data
   */
  async fetchGitHubAgentContent(downloadUrl: string): Promise<AgentExport> {
    try {
      return await apiCall<AgentExport>('fetch_github_agent_content', { downloadUrl });
    } catch (error) {
      console.error("Failed to fetch GitHub agent content:", error);
      throw error;
    }
  },

  /**
   * Import an agent directly from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromGitHub(downloadUrl: string): Promise<Agent> {
    try {
      return await apiCall<Agent>('import_agent_from_github', { downloadUrl });
    } catch (error) {
      console.error("Failed to import agent from GitHub:", error);
      throw error;
    }
  },

  /**
   * Reads the Claude settings file
   * @returns Promise resolving to the settings object
   */
  async getClaudeSettings(): Promise<ClaudeSettings> {
    try {
      const result = await apiCall<{ data: ClaudeSettings }>("get_claude_settings");
      console.log("Raw result from get_claude_settings:", result);
      
      // The Rust backend returns ClaudeSettings { data: ... }
      // We need to extract the data field
      if (result && typeof result === 'object' && 'data' in result) {
        return result.data;
      }
      
      // If the result is already the settings object, return it
      return result as ClaudeSettings;
    } catch (error) {
      console.error("Failed to get Claude settings:", error);
      throw error;
    }
  },

  /**
   * Opens a new Claude Code session
   * @param path - Optional path to open the session in
   * @returns Promise resolving when the session is opened
   */
  async openNewSession(path?: string): Promise<string> {
    try {
      return await apiCall<string>("open_new_session", { path });
    } catch (error) {
      console.error("Failed to open new session:", error);
      throw error;
    }
  },

  /**
   * Reads the CLAUDE.md system prompt file
   * @returns Promise resolving to the system prompt content
   */
  async getSystemPrompt(): Promise<string> {
    try {
      return await apiCall<string>("get_system_prompt");
    } catch (error) {
      console.error("Failed to get system prompt:", error);
      throw error;
    }
  },

  /**
   * Checks if Claude Code is installed and gets its version
   * @returns Promise resolving to the version status
   */
  async checkClaudeVersion(): Promise<ClaudeVersionStatus> {
    try {
      return await apiCall<ClaudeVersionStatus>("check_claude_version");
    } catch (error) {
      console.error("Failed to check Claude version:", error);
      throw error;
    }
  },

  /**
   * Saves the CLAUDE.md system prompt file
   * @param content - The new content for the system prompt
   * @returns Promise resolving when the file is saved
   */
  async saveSystemPrompt(content: string): Promise<string> {
    try {
      return await apiCall<string>("save_system_prompt", { content });
    } catch (error) {
      console.error("Failed to save system prompt:", error);
      throw error;
    }
  },

  /**
   * Saves the Claude settings file
   * @param settings - The settings object to save
   * @returns Promise resolving when the settings are saved
   */
  async saveClaudeSettings(settings: ClaudeSettings): Promise<string> {
    try {
      return await apiCall<string>("save_claude_settings", { settings });
    } catch (error) {
      console.error("Failed to save Claude settings:", error);
      throw error;
    }
  },

  /**
   * Finds all CLAUDE.md files in a project directory
   * @param projectPath - The absolute path to the project
   * @returns Promise resolving to an array of CLAUDE.md files
   */
  async findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
    try {
      return await apiCall<ClaudeMdFile[]>("find_claude_md_files", { projectPath });
    } catch (error) {
      console.error("Failed to find CLAUDE.md files:", error);
      throw error;
    }
  },

  /**
   * Reads a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @returns Promise resolving to the file content
   */
  async readClaudeMdFile(filePath: string): Promise<string> {
    try {
      return await apiCall<string>("read_claude_md_file", { filePath });
    } catch (error) {
      console.error("Failed to read CLAUDE.md file:", error);
      throw error;
    }
  },

  async readPlanFile(path: string): Promise<string> {
    try {
      return await apiCall<string>("read_plan_file", { path });
    } catch (error) {
      console.error("Failed to read plan file:", error);
      throw error;
    }
  },

  /**
   * Saves a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @param content - The new content for the file
   * @returns Promise resolving when the file is saved
   */
  async saveClaudeMdFile(filePath: string, content: string): Promise<string> {
    try {
      return await apiCall<string>("save_claude_md_file", { filePath, content });
    } catch (error) {
      console.error("Failed to save CLAUDE.md file:", error);
      throw error;
    }
  },

  // Agent API methods
  
  /**
   * Lists all CC agents
   * @returns Promise resolving to an array of agents
   */
  async listAgents(): Promise<Agent[]> {
    try {
      return await apiCall<Agent[]>('list_agents');
    } catch (error) {
      console.error("Failed to list agents:", error);
      throw error;
    }
  },

  /**
   * Creates a new agent
   * @param name - The agent name
   * @param icon - The icon identifier
   * @param system_prompt - The system prompt for the agent
   * @param default_task - Optional default task
   * @param model - Optional model (defaults to 'sonnet')
   * @param hooks - Optional hooks configuration as JSON string
   * @returns Promise resolving to the created agent
   */
  async createAgent(
    name: string, 
    icon: string, 
    system_prompt: string, 
    default_task?: string, 
    model?: string,
    hooks?: string
  ): Promise<Agent> {
    try {
      return await apiCall<Agent>('create_agent', { 
        name, 
        icon, 
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks
      });
    } catch (error) {
      console.error("Failed to create agent:", error);
      throw error;
    }
  },

  /**
   * Updates an existing agent
   * @param id - The agent ID
   * @param name - The updated name
   * @param icon - The updated icon
   * @param system_prompt - The updated system prompt
   * @param default_task - Optional default task
   * @param model - Optional model
   * @param hooks - Optional hooks configuration as JSON string
   * @returns Promise resolving to the updated agent
   */
  async updateAgent(
    id: string,
    name: string,
    icon: string, 
    system_prompt: string, 
    default_task?: string, 
    model?: string,
    hooks?: string
  ): Promise<Agent> {
    try {
      return await apiCall<Agent>('update_agent', { 
        id, 
        name, 
        icon, 
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks
      });
    } catch (error) {
      console.error("Failed to update agent:", error);
      throw error;
    }
  },

  /**
   * Deletes an agent
   * @param id - The agent ID to delete
   * @returns Promise resolving when the agent is deleted
   */
  async deleteAgent(id: string): Promise<void> {
    try {
      return await apiCall('delete_agent', { id });
    } catch (error) {
      console.error("Failed to delete agent:", error);
      throw error;
    }
  },

  /**
   * Gets a single agent by ID
   * @param id - The agent ID
   * @returns Promise resolving to the agent
   */
  async getAgent(id: string): Promise<Agent> {
    try {
      return await apiCall<Agent>('get_agent', { id });
    } catch (error) {
      console.error("Failed to get agent:", error);
      throw error;
    }
  },

  /**
   * Exports a single agent to JSON format
   * @param id - The agent ID to export
   * @returns Promise resolving to the JSON string
   */
  async exportAgent(id: string): Promise<string> {
    try {
      return await apiCall<string>('export_agent', { id });
    } catch (error) {
      console.error("Failed to export agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from JSON data
   * @param jsonData - The JSON string containing the agent export
   * @returns Promise resolving to the imported agent
   */
  async importAgent(jsonData: string): Promise<Agent> {
    try {
      return await apiCall<Agent>('import_agent', { jsonData });
    } catch (error) {
      console.error("Failed to import agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from a file
   * @param filePath - The path to the JSON file
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromFile(filePath: string): Promise<Agent> {
    try {
      return await apiCall<Agent>('import_agent_from_file', { filePath });
    } catch (error) {
      console.error("Failed to import agent from file:", error);
      throw error;
    }
  },

  /**
   * Executes an agent
   * @param agentId - The agent ID to execute
   * @param projectPath - The project path to run the agent in
   * @param task - The task description
   * @param model - Optional model override
   * @returns Promise resolving to the run ID when execution starts
   */
  async executeAgent(agentId: string, projectPath: string, task: string, model?: string): Promise<number> {
    try {
      return await apiCall<number>('execute_agent', { agentId, projectPath, task, model });
    } catch (error) {
      console.error("Failed to execute agent:", error);
      // Return a sentinel value to indicate error
      throw new Error(`Failed to execute agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Lists agent runs without metrics (basic info only)
   * @param agentId - Optional agent ID to filter runs
   * @returns Promise resolving to an array of agent runs
   */
  async listAgentRuns(agentId?: string): Promise<AgentRunWithMetrics[]> {
    try {
      return await apiCall<AgentRunWithMetrics[]>('list_agent_runs', { agentId });
    } catch (error) {
      console.error("Failed to list agent runs:", error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  },

  /**
   * Lists agent runs with metrics (includes token counts and duration)
   * @param agentId - Optional agent ID to filter runs
   * @returns Promise resolving to an array of agent runs with metrics
   */
  async listAgentRunsWithMetrics(agentId?: string): Promise<AgentRunWithMetrics[]> {
    try {
      return await apiCall<AgentRunWithMetrics[]>('list_agent_runs_with_metrics', { agentId });
    } catch (error) {
      console.error("Failed to list agent runs with metrics:", error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  },

  /**
   * Gets a single agent run by ID with metrics
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRun(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await apiCall<AgentRunWithMetrics>('get_agent_run', { id });
    } catch (error) {
      console.error("Failed to get agent run:", error);
      throw new Error(`Failed to get agent run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Gets a single agent run by ID with real-time metrics from JSONL
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRunWithRealTimeMetrics(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await apiCall<AgentRunWithMetrics>('get_agent_run_with_real_time_metrics', { id });
    } catch (error) {
      console.error("Failed to get agent run with real-time metrics:", error);
      throw new Error(`Failed to get agent run with real-time metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Lists all currently running agent sessions
   * @returns Promise resolving to list of running agent sessions
   */
  async listRunningAgentSessions(): Promise<AgentRun[]> {
    try {
      return await apiCall<AgentRun[]>('list_running_sessions');
    } catch (error) {
      console.error("Failed to list running agent sessions:", error);
      throw new Error(`Failed to list running agent sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Kills a running agent session
   * @param runId - The run ID to kill
   * @returns Promise resolving to whether the session was successfully killed
   */
  async killAgentSession(runId: number): Promise<boolean> {
    try {
      return await apiCall<boolean>('kill_agent_session', { runId });
    } catch (error) {
      console.error("Failed to kill agent session:", error);
      throw new Error(`Failed to kill agent session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Gets the status of a specific agent session
   * @param runId - The run ID to check
   * @returns Promise resolving to the session status or null if not found
   */
  async getSessionStatus(runId: number): Promise<string | null> {
    try {
      return await apiCall<string | null>('get_session_status', { runId });
    } catch (error) {
      console.error("Failed to get session status:", error);
      throw new Error(`Failed to get session status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Cleanup finished processes and update their status
   * @returns Promise resolving to list of run IDs that were cleaned up
   */
  async cleanupFinishedProcesses(): Promise<number[]> {
    try {
      return await apiCall<number[]>('cleanup_finished_processes');
    } catch (error) {
      console.error("Failed to cleanup finished processes:", error);
      throw new Error(`Failed to cleanup finished processes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Get real-time output for a running session (with live output fallback)
   * @param runId - The run ID to get output for
   * @returns Promise resolving to the current session output (JSONL format)
   */
  async getSessionOutput(runId: number): Promise<string> {
    try {
      return await apiCall<string>('get_session_output', { runId });
    } catch (error) {
      console.error("Failed to get session output:", error);
      throw new Error(`Failed to get session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Get live output directly from process stdout buffer
   * @param runId - The run ID to get live output for
   * @returns Promise resolving to the current live output
   */
  async getLiveSessionOutput(runId: number): Promise<string> {
    try {
      return await apiCall<string>('get_live_session_output', { runId });
    } catch (error) {
      console.error("Failed to get live session output:", error);
      throw new Error(`Failed to get live session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Start streaming real-time output for a running session
   * @param runId - The run ID to stream output for
   * @returns Promise that resolves when streaming starts
   */
  async streamSessionOutput(runId: number): Promise<void> {
    try {
      return await apiCall<void>('stream_session_output', { runId });
    } catch (error) {
      console.error("Failed to start streaming session output:", error);
      throw new Error(`Failed to start streaming session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Loads the JSONL history for a specific session
   */
  async loadSessionHistory(sessionId: string, projectId: string): Promise<any[]> {
    return apiCall("load_session_history", { sessionId, projectId });
  },

  /**
   * Loads the JSONL history for a specific agent session
   * Similar to loadSessionHistory but searches across all project directories
   * @param sessionId - The session ID (UUID)
   * @returns Promise resolving to array of session messages
   */
  async loadAgentSessionHistory(sessionId: string): Promise<any[]> {
    try {
      return await apiCall<any[]>('load_agent_session_history', { sessionId });
    } catch (error) {
      console.error("Failed to load agent session history:", error);
      throw error;
    }
  },

  /**
   * Executes a new interactive Claude Code session with streaming output
   */
  async executeClaudeCode(projectPath: string, prompt: string, model: string, permissionMode?: string): Promise<void> {
    return apiCall("execute_claude_code", { projectPath, prompt, model, permissionMode });
  },

  /**
   * Continues an existing Claude Code conversation with streaming output
   */
  async continueClaudeCode(projectPath: string, prompt: string, model: string, permissionMode?: string): Promise<void> {
    return apiCall("continue_claude_code", { projectPath, prompt, model, permissionMode });
  },

  /**
   * Resumes an existing Claude Code session by ID with streaming output
   */
  async resumeClaudeCode(projectPath: string, sessionId: string, prompt: string, model: string, permissionMode?: string): Promise<void> {
    return apiCall("resume_claude_code", { projectPath, sessionId, prompt, model, permissionMode });
  },

  /**
   * Cancels the currently running Claude Code execution
   * @param sessionId - Optional session ID to cancel a specific session
   */
  async cancelClaudeExecution(sessionId?: string): Promise<void> {
    return apiCall("cancel_claude_execution", { sessionId });
  },

  /**
   * Lists all currently running Claude sessions
   * @returns Promise resolving to list of running Claude sessions
   */
  async listRunningClaudeSessions(): Promise<any[]> {
    return apiCall("list_running_claude_sessions");
  },

  /**
   * Gets live output from a Claude session
   * @param sessionId - The session ID to get output for
   * @returns Promise resolving to the current live output
   */
  async getClaudeSessionOutput(sessionId: string): Promise<string> {
    return apiCall("get_claude_session_output", { sessionId });
  },

  /**
   * Lists files and directories in a given path
   */
  async listDirectoryContents(directoryPath: string): Promise<FileEntry[]> {
    return apiCall("list_directory_contents", { directoryPath });
  },

  /**
   * Searches for files and directories matching a pattern
   */
  async searchFiles(basePath: string, query: string): Promise<FileEntry[]> {
    return apiCall("search_files", { basePath, query });
  },

  /**
   * Gets overall usage statistics
   * @returns Promise resolving to usage statistics
   */
  async getUsageStats(): Promise<UsageStats> {
    try {
      return await apiCall<UsageStats>("get_usage_stats");
    } catch (error) {
      console.error("Failed to get usage stats:", error);
      throw error;
    }
  },

  /**
   * Gets usage statistics filtered by date range
   * @param startDate - Start date (ISO format)
   * @param endDate - End date (ISO format)
   * @returns Promise resolving to usage statistics
   */
  async getUsageByDateRange(startDate: string, endDate: string): Promise<UsageStats> {
    try {
      return await apiCall<UsageStats>("get_usage_by_date_range", { startDate, endDate });
    } catch (error) {
      console.error("Failed to get usage by date range:", error);
      throw error;
    }
  },

  /**
   * Gets usage statistics grouped by session
   * @param since - Optional start date (YYYYMMDD)
   * @param until - Optional end date (YYYYMMDD)
   * @param order - Optional sort order ('asc' or 'desc')
   * @returns Promise resolving to an array of session usage data
   */
  async getSessionStats(
    since?: string,
    until?: string,
    order?: "asc" | "desc"
  ): Promise<ProjectUsage[]> {
    try {
      return await apiCall<ProjectUsage[]>("get_session_stats", {
        since,
        until,
        order,
      });
    } catch (error) {
      console.error("Failed to get session stats:", error);
      throw error;
    }
  },

  /**
   * Gets detailed usage entries with optional filtering
   * @param limit - Optional limit for number of entries
   * @returns Promise resolving to array of usage entries
   */
  async getUsageDetails(limit?: number): Promise<UsageEntry[]> {
    try {
      return await apiCall<UsageEntry[]>("get_usage_details", { limit });
    } catch (error) {
      console.error("Failed to get usage details:", error);
      throw error;
    }
  },

  /**
   * Loads the persisted usage cache from disk
   * @returns Promise resolving to cached data with savedAt timestamp, or null if not available
   */
  async loadUsageCache(): Promise<{ stats: any; sessionStats: any; savedAt: number } | null> {
    try {
      const raw = await apiCall<any>("read_usage_cache");
      if (!raw || typeof raw !== 'object') return null;
      return raw;
    } catch {
      return null;
    }
  },

  /**
   * Saves usage stats to the persistent cache on disk
   * @param stats - Usage statistics to cache
   * @param sessionStats - Session statistics to cache
   */
  async saveUsageCache(stats: any, sessionStats: any): Promise<void> {
    try {
      await apiCall<void>("write_usage_cache", {
        data: { stats, sessionStats, savedAt: Date.now() }
      });
    } catch (err) {
      console.error("Failed to save usage cache:", err);
    }
  },

  /**
   * Creates a checkpoint for the current session state
   */
  async createCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    messageIndex?: number,
    description?: string
  ): Promise<CheckpointResult> {
    return apiCall("create_checkpoint", {
      sessionId,
      projectId,
      projectPath,
      messageIndex,
      description
    });
  },

  /**
   * Restores a session to a specific checkpoint
   */
  async restoreCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<CheckpointResult> {
    return apiCall("restore_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Lists all checkpoints for a session
   */
  async listCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<Checkpoint[]> {
    return apiCall("list_checkpoints", {
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Forks a new timeline branch from a checkpoint
   */
  async forkFromCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string,
    newSessionId: string,
    description?: string
  ): Promise<CheckpointResult> {
    return apiCall("fork_from_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
      newSessionId,
      description
    });
  },

  /**
   * Gets the timeline for a session
   */
  async getSessionTimeline(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<SessionTimeline> {
    return apiCall("get_session_timeline", {
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Updates checkpoint settings for a session
   */
  async updateCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string,
    autoCheckpointEnabled: boolean,
    checkpointStrategy: CheckpointStrategy
  ): Promise<void> {
    return apiCall("update_checkpoint_settings", {
      sessionId,
      projectId,
      projectPath,
      autoCheckpointEnabled,
      checkpointStrategy
    });
  },

  /**
   * Gets diff between two checkpoints
   */
  async getCheckpointDiff(
    fromCheckpointId: string,
    toCheckpointId: string,
    sessionId: string,
    projectId: string
  ): Promise<CheckpointDiff> {
    try {
      return await apiCall<CheckpointDiff>("get_checkpoint_diff", {
        fromCheckpointId,
        toCheckpointId,
        sessionId,
        projectId
      });
    } catch (error) {
      console.error("Failed to get checkpoint diff:", error);
      throw error;
    }
  },

  /**
   * Tracks a message for checkpointing
   */
  async trackCheckpointMessage(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<void> {
    try {
      await apiCall("track_checkpoint_message", {
        sessionId,
        projectId,
        projectPath,
        message
      });
    } catch (error) {
      console.error("Failed to track checkpoint message:", error);
      throw error;
    }
  },

  /**
   * Checks if auto-checkpoint should be triggered
   */
  async checkAutoCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<boolean> {
    try {
      return await apiCall<boolean>("check_auto_checkpoint", {
        sessionId,
        projectId,
        projectPath,
        message
      });
    } catch (error) {
      console.error("Failed to check auto checkpoint:", error);
      throw error;
    }
  },

  /**
   * Triggers cleanup of old checkpoints
   */
  async cleanupOldCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string,
    keepCount: number
  ): Promise<number> {
    try {
      return await apiCall<number>("cleanup_old_checkpoints", {
        sessionId,
        projectId,
        projectPath,
        keepCount
      });
    } catch (error) {
      console.error("Failed to cleanup old checkpoints:", error);
      throw error;
    }
  },

  /**
   * Gets checkpoint settings for a session
   */
  async getCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<{
    auto_checkpoint_enabled: boolean;
    checkpoint_strategy: CheckpointStrategy;
    total_checkpoints: number;
    current_checkpoint_id?: string;
  }> {
    try {
      return await apiCall("get_checkpoint_settings", {
        sessionId,
        projectId,
        projectPath
      });
    } catch (error) {
      console.error("Failed to get checkpoint settings:", error);
      throw error;
    }
  },

  /**
   * Clears checkpoint manager for a session (cleanup on session end)
   */
  async clearCheckpointManager(sessionId: string): Promise<void> {
    try {
      await apiCall("clear_checkpoint_manager", { sessionId });
    } catch (error) {
      console.error("Failed to clear checkpoint manager:", error);
      throw error;
    }
  },

  /**
   * Tracks a batch of messages for a session for checkpointing
   */
  trackSessionMessages: (
    sessionId: string, 
    projectId: string, 
    projectPath: string, 
    messages: string[]
  ): Promise<void> =>
    apiCall("track_session_messages", { sessionId, projectId, projectPath, messages }),

  /**
   * Adds a new MCP server
   */
  async mcpAdd(
    name: string,
    transport: string,
    command?: string,
    args: string[] = [],
    env: Record<string, string> = {},
    url?: string,
    scope: string = "local"
  ): Promise<AddServerResult> {
    try {
      return await apiCall<AddServerResult>("mcp_add", {
        name,
        transport,
        command,
        args,
        env,
        url,
        scope
      });
    } catch (error) {
      console.error("Failed to add MCP server:", error);
      throw error;
    }
  },

  /**
   * Lists all configured MCP servers
   */
  async mcpList(): Promise<MCPServer[]> {
    try {
      console.log("API: Calling mcp_list...");
      const result = await apiCall<MCPServer[]>("mcp_list");
      console.log("API: mcp_list returned:", result);
      return result;
    } catch (error) {
      console.error("API: Failed to list MCP servers:", error);
      throw error;
    }
  },

  /**
   * Gets details for a specific MCP server
   */
  async mcpGet(name: string): Promise<MCPServer> {
    try {
      return await apiCall<MCPServer>("mcp_get", { name });
    } catch (error) {
      console.error("Failed to get MCP server:", error);
      throw error;
    }
  },

  /**
   * Removes an MCP server
   */
  async mcpRemove(name: string): Promise<string> {
    try {
      return await apiCall<string>("mcp_remove", { name });
    } catch (error) {
      console.error("Failed to remove MCP server:", error);
      throw error;
    }
  },

  /**
   * Adds an MCP server from JSON configuration
   */
  async mcpAddJson(name: string, jsonConfig: string, scope: string = "local"): Promise<AddServerResult> {
    try {
      return await apiCall<AddServerResult>("mcp_add_json", { name, jsonConfig, scope });
    } catch (error) {
      console.error("Failed to add MCP server from JSON:", error);
      throw error;
    }
  },

  /**
   * Imports MCP servers from Claude Desktop
   */
  async mcpAddFromClaudeDesktop(scope: string = "local"): Promise<ImportResult> {
    try {
      return await apiCall<ImportResult>("mcp_add_from_claude_desktop", { scope });
    } catch (error) {
      console.error("Failed to import from Claude Desktop:", error);
      throw error;
    }
  },

  /**
   * Starts Claude Code as an MCP server
   */
  async mcpServe(): Promise<string> {
    try {
      return await apiCall<string>("mcp_serve");
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      throw error;
    }
  },

  /**
   * Tests connection to an MCP server
   */
  async mcpTestConnection(name: string): Promise<string> {
    try {
      return await apiCall<string>("mcp_test_connection", { name });
    } catch (error) {
      console.error("Failed to test MCP connection:", error);
      throw error;
    }
  },

  /**
   * Resets project-scoped server approval choices
   */
  async mcpResetProjectChoices(): Promise<string> {
    try {
      return await apiCall<string>("mcp_reset_project_choices");
    } catch (error) {
      console.error("Failed to reset project choices:", error);
      throw error;
    }
  },

  /**
   * Gets the status of MCP servers
   */
  async mcpGetServerStatus(): Promise<Record<string, ServerStatus>> {
    try {
      return await apiCall<Record<string, ServerStatus>>("mcp_get_server_status");
    } catch (error) {
      console.error("Failed to get server status:", error);
      throw error;
    }
  },

  /**
   * Reads .mcp.json from the current project
   */
  async mcpReadProjectConfig(projectPath: string): Promise<MCPProjectConfig> {
    try {
      return await apiCall<MCPProjectConfig>("mcp_read_project_config", { projectPath });
    } catch (error) {
      console.error("Failed to read project MCP config:", error);
      throw error;
    }
  },

  /**
   * Saves .mcp.json to the current project
   */
  async mcpSaveProjectConfig(projectPath: string, config: MCPProjectConfig): Promise<string> {
    try {
      return await apiCall<string>("mcp_save_project_config", { projectPath, config });
    } catch (error) {
      console.error("Failed to save project MCP config:", error);
      throw error;
    }
  },

  /**
   * Get the stored Claude binary path from settings
   * @returns Promise resolving to the path if set, null otherwise
   */
  async getClaudeBinaryPath(): Promise<string | null> {
    try {
      return await apiCall<string | null>("get_claude_binary_path");
    } catch (error) {
      console.error("Failed to get Claude binary path:", error);
      throw error;
    }
  },

  /**
   * Set the Claude binary path in settings
   * @param path - The absolute path to the Claude binary
   * @returns Promise resolving when the path is saved
   */
  async setClaudeBinaryPath(path: string): Promise<void> {
    try {
      return await apiCall<void>("set_claude_binary_path", { path });
    } catch (error) {
      console.error("Failed to set Claude binary path:", error);
      throw error;
    }
  },

  /**
   * List all available Claude installations on the system
   * @returns Promise resolving to an array of Claude installations
   */
  async listClaudeInstallations(): Promise<ClaudeInstallation[]> {
    try {
      return await apiCall<ClaudeInstallation[]>("list_claude_installations");
    } catch (error) {
      console.error("Failed to list Claude installations:", error);
      throw error;
    }
  },

  /**
   * Get hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to the hooks configuration
   */
  async getHooksConfig(scope: 'user' | 'project' | 'local', projectPath?: string): Promise<HooksConfiguration> {
    try {
      return await apiCall<HooksConfiguration>("get_hooks_config", { scope, projectPath });
    } catch (error) {
      console.error("Failed to get hooks config:", error);
      throw error;
    }
  },

  /**
   * Update hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param hooks - The hooks configuration to save
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to success message
   */
  async updateHooksConfig(
    scope: 'user' | 'project' | 'local',
    hooks: HooksConfiguration,
    projectPath?: string
  ): Promise<string> {
    try {
      return await apiCall<string>("update_hooks_config", { scope, projectPath, hooks });
    } catch (error) {
      console.error("Failed to update hooks config:", error);
      throw error;
    }
  },

  /**
   * Validate a hook command syntax
   * @param command - The shell command to validate
   * @returns Promise resolving to validation result
   */
  async validateHookCommand(command: string): Promise<{ valid: boolean; message: string }> {
    try {
      return await apiCall<{ valid: boolean; message: string }>("validate_hook_command", { command });
    } catch (error) {
      console.error("Failed to validate hook command:", error);
      throw error;
    }
  },

  /**
   * Get merged hooks configuration (respecting priority)
   * @param projectPath - The project path
   * @returns Promise resolving to merged hooks configuration
   */
  async getMergedHooksConfig(projectPath: string): Promise<HooksConfiguration> {
    try {
      const [userHooks, projectHooks, localHooks] = await Promise.all([
        this.getHooksConfig('user'),
        this.getHooksConfig('project', projectPath),
        this.getHooksConfig('local', projectPath)
      ]);

      // Import HooksManager for merging
      const { HooksManager } = await import('@/lib/hooksManager');
      return HooksManager.mergeConfigs(userHooks, projectHooks, localHooks);
    } catch (error) {
      console.error("Failed to get merged hooks config:", error);
      throw error;
    }
  },

  /**
   * Gets git information for a given path
   * @param path - The directory path to get git info for
   * @returns Promise resolving to git information
   */
  async getGitInfo(path: string): Promise<GitInfo> {
    try {
      return await apiCall<GitInfo>("get_git_info", { path });
    } catch (error) {
      console.error("Failed to get git info:", error);
      throw error;
    }
  },

  /**
   * Gets git diff statistics for a given path
   * @param path - The directory path to get diff stat for
   * @returns Promise resolving to diff statistics
   */
  async getGitDiffStat(path: string): Promise<GitDiffStat> {
    try {
      return await apiCall<GitDiffStat>("get_git_diff_stat", { path });
    } catch (error) {
      console.error("Failed to get git diff stat:", error);
      throw error;
    }
  },

  /**
   * Gets list of git worktrees for a given path
   * @param path - The directory path to get worktrees for
   * @returns Promise resolving to array of worktree information
   */
  async getWorktrees(path: string): Promise<WorktreeInfo[]> {
    try {
      return await apiCall<WorktreeInfo[]>("get_worktrees", { path });
    } catch (error) {
      console.error("Failed to get worktrees:", error);
      throw error;
    }
  },

  /**
   * Reads new lines from a JSONL session file starting at fromLine.
   */
  async pollSessionFile(sessionId: string, projectId: string, fromLine: number): Promise<any[]> {
    try {
      return await apiCall<any[]>("poll_session_file", {
        session_id: sessionId,
        project_id: projectId,
        from_line: fromLine,
      });
    } catch (error) {
      console.error("Failed to poll session file:", error);
      throw error;
    }
  },

  /**
   * Reads new lines from a JSONL session file starting at a byte offset.
   * Returns raw JSONL lines and the new byte offset after reading.
   */
  async readSessionTail(sessionId: string, projectId: string, byteOffset: number): Promise<{
    lines: string[];
    newOffset: number;
  }> {
    return apiCall<{ lines: string[]; newOffset: number }>("read_session_tail", {
      session_id: sessionId,
      project_id: projectId,
      byte_offset: byteOffset,
    });
  },

  /**
   * Returns the absolute filesystem path of a session JSONL file.
   */
  async getSessionFilePath(sessionId: string, projectId: string): Promise<string> {
    return await apiCall<string>("get_session_file_path", {
      session_id: sessionId,
      project_id: projectId,
    });
  },

  /**
   * Gets lightweight status info about a session JSONL file for sidebar status dots.
   */
  async getSessionFileStatus(sessionId: string, projectId: string): Promise<SessionFileStatus> {
    try {
      return await apiCall<SessionFileStatus>("get_session_file_status", {
        session_id: sessionId,
        project_id: projectId,
      });
    } catch (error) {
      console.error("Failed to get session file status:", error);
      throw error;
    }
  },

  // Slash Commands API methods

  /**
   * Lists all available slash commands
   * @param projectPath - Optional project path to include project-specific commands
   * @returns Promise resolving to array of slash commands
   */
  async slashCommandsList(projectPath?: string): Promise<SlashCommand[]> {
    try {
      return await apiCall<SlashCommand[]>("slash_commands_list", { projectPath });
    } catch (error) {
      console.error("Failed to list slash commands:", error);
      throw error;
    }
  },

  /**
   * Gets a single slash command by ID
   * @param commandId - Unique identifier of the command
   * @returns Promise resolving to the slash command
   */
  async slashCommandGet(commandId: string): Promise<SlashCommand> {
    try {
      return await apiCall<SlashCommand>("slash_command_get", { commandId });
    } catch (error) {
      console.error("Failed to get slash command:", error);
      throw error;
    }
  },

  /**
   * Creates or updates a slash command
   * @param scope - Command scope: "project" or "user"
   * @param name - Command name (without prefix)
   * @param namespace - Optional namespace for organization
   * @param content - Markdown content of the command
   * @param description - Optional description
   * @param allowedTools - List of allowed tools for this command
   * @param projectPath - Required for project scope commands
   * @returns Promise resolving to the saved command
   */
  async slashCommandSave(
    scope: string,
    name: string,
    namespace: string | undefined,
    content: string,
    description: string | undefined,
    allowedTools: string[],
    projectPath?: string
  ): Promise<SlashCommand> {
    try {
      return await apiCall<SlashCommand>("slash_command_save", {
        scope,
        name,
        namespace,
        content,
        description,
        allowedTools,
        projectPath
      });
    } catch (error) {
      console.error("Failed to save slash command:", error);
      throw error;
    }
  },

  /**
   * Deletes a slash command
   * @param commandId - Unique identifier of the command to delete
   * @param projectPath - Optional project path for deleting project commands
   * @returns Promise resolving to deletion message
   */
  async slashCommandDelete(commandId: string, projectPath?: string): Promise<string> {
    try {
      return await apiCall<string>("slash_command_delete", { commandId, projectPath });
    } catch (error) {
      console.error("Failed to delete slash command:", error);
      throw error;
    }
  },

  // Native Agent API methods

  /**
   * Lists all native agents from ~/.claude/agents/
   * @returns Promise resolving to array of native agents
   */
  async listNativeAgents(): Promise<NativeAgent[]> {
    try {
      return await apiCall<NativeAgent[]>("list_native_agents");
    } catch (error) {
      console.error("Failed to list native agents:", error);
      throw error;
    }
  },

  /**
   * Reads a single native agent by path
   * @param path - The path to the agent file
   * @returns Promise resolving to the native agent
   */
  async readNativeAgent(path: string): Promise<NativeAgent> {
    try {
      return await apiCall<NativeAgent>("read_native_agent", { path });
    } catch (error) {
      console.error("Failed to read native agent:", error);
      throw error;
    }
  },

  /**
   * Writes a new native agent to disk
   * @param name - The agent name (becomes filename without extension)
   * @param content - The markdown content of the agent
   * @returns Promise resolving to the path of the created agent
   */
  async writeNativeAgent(name: string, content: string): Promise<string> {
    try {
      return await apiCall<string>("write_native_agent", { name, content });
    } catch (error) {
      console.error("Failed to write native agent:", error);
      throw error;
    }
  },

  /**
   * Deletes a native agent file
   * @param path - The path to the agent file to delete
   * @returns Promise resolving when the agent is deleted
   */
  async deleteNativeAgent(path: string): Promise<void> {
    try {
      return await apiCall<void>("delete_native_agent", { path });
    } catch (error) {
      console.error("Failed to delete native agent:", error);
      throw error;
    }
  },

  /**
   * Lists all available skills
   * @returns Promise resolving to array of skill info
   */
  async listSkills(): Promise<SkillInfo[]> {
    try {
      return await apiCall<SkillInfo[]>("list_skills");
    } catch (error) {
      console.error("Failed to list skills:", error);
      throw error;
    }
  },

  /**
   * Gets global settings
   * @returns Promise resolving to global settings object
   */
  async getGlobalSettings(): Promise<Record<string, any>> {
    try {
      return await apiCall<Record<string, any>>("get_global_settings");
    } catch (error) {
      console.error("Failed to get global settings:", error);
      throw error;
    }
  },

  /**
   * Reads the commands.conf file
   * @returns Promise resolving to object with content and exists flag
   */
  async readCommandsConf(): Promise<{ content: string; exists: boolean }> {
    try {
      return await apiCall<{ content: string; exists: boolean }>("read_commands_conf");
    } catch (error) {
      console.error("Failed to read commands.conf:", error);
      throw error;
    }
  },

  /**
   * Writes and verifies the commands.conf file
   * @param content - The content to write
   * @returns Promise resolving to the path of the written file
   */
  async writeAndVerifyCommandsConf(content: string): Promise<string> {
    try {
      return await apiCall<string>("write_and_verify_commands_conf", { content });
    } catch (error) {
      console.error("Failed to write and verify commands.conf:", error);
      throw error;
    }
  },

  /**
   * Sets whether c-guard is enabled
   * @param enabled - Whether c-guard should be enabled
   * @returns Promise resolving when the setting is saved
   */
  async setCguardEnabled(enabled: boolean): Promise<void> {
    try {
      return await apiCall<void>("set_cguard_enabled", { enabled });
    } catch (error) {
      console.error("Failed to set c-guard enabled:", error);
      throw error;
    }
  },

  /**
   * Checks if c-guard is installed and wired into PreToolUse hooks
   * @returns Promise resolving to install status object
   */
  async checkCguardInstalled(): Promise<{ script_exists: boolean; hook_wired: boolean; installed: boolean }> {
    try {
      return await apiCall<{ script_exists: boolean; hook_wired: boolean; installed: boolean }>("check_cguard_installed");
    } catch {
      return { script_exists: false, hook_wired: false, installed: false };
    }
  },

  /**
   * Runs the c-guard CLI
   * @param args - Command line arguments to pass to c-guard
   * @returns Promise resolving to the command output
   */
  async runCguardCli(args: string[]): Promise<string> {
    try {
      return await apiCall<string>("run_cguard_cli", { args });
    } catch (error) {
      console.error("Failed to run c-guard CLI:", error);
      throw error;
    }
  },

  async getAutoModeConfig(): Promise<unknown> {
    try {
      return await apiCall<unknown>("get_auto_mode_config");
    } catch (error) {
      console.error("Failed to get auto-mode config:", error);
      throw error;
    }
  },

  async runDoctor(): Promise<string> {
    try {
      return await apiCall<string>("run_doctor");
    } catch (error) {
      console.error("Failed to run doctor:", error);
      throw error;
    }
  },

  async listClaudeDirectory(subpath: string): Promise<ClaudeEntry[]> {
    try {
      return await apiCall<ClaudeEntry[]>("list_claude_directory", { subpath });
    } catch (error) {
      console.error("Failed to list Claude directory:", error);
      throw error;
    }
  },

  async readClaudeFile(subpath: string): Promise<string> {
    try {
      return await apiCall<string>("read_claude_file", { subpath });
    } catch (error) {
      console.error("Failed to read Claude file:", error);
      throw error;
    }
  },

  async listSessionLogs(): Promise<SessionLogEntry[]> {
    try {
      return await apiCall<SessionLogEntry[]>("list_session_logs");
    } catch (error) {
      console.error("Failed to list session logs:", error);
      throw error;
    }
  },

  async readCcodeSettings(): Promise<Record<string, any>> {
    try {
      return await apiCall<Record<string, any>>("read_ccode_settings");
    } catch (error) {
      console.error("Failed to read ~/.ccode/settings.json:", error);
      return {};
    }
  },

  async writeCcodeSettings(settings: Record<string, any>): Promise<void> {
    try {
      return await apiCall<void>("write_ccode_settings", { settings });
    } catch (error) {
      console.error("Failed to write ~/.ccode/settings.json:", error);
      throw error;
    }
  },

  async readSessionStatus(sessionId: string): Promise<{
    session_id?: string;
    cwd?: string;
    model?: { id: string; display_name: string };
    session_name?: string;
    agent?: { name: string };
    agent_type?: string;
    version?: string;
    cost?: {
      total_cost_usd: number;
      total_duration_ms: number;
      total_lines_added: number;
      total_lines_removed: number;
    };
    context_window?: {
      used_percentage: number;
      remaining_percentage: number;
      context_window_size: number;
      current_usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
    };
    rate_limits?: {
      five_hour?: { used_percentage: number; resets_at: number };
      seven_day?: { used_percentage: number; resets_at: number };
    };
  } | null> {
    try {
      const result = await apiCall<Record<string, any> | null>("read_session_status", { sessionId });
      if (result === null || (typeof result === 'object' && Object.keys(result).length === 0)) {
        return null;
      }
      return result;
    } catch {
      return null;
    }
  },

  async openPath(path: string): Promise<void> {
    await apiCall<void>("open_path", { path });
  },

  async openTerminalIn(path: string): Promise<string> {
    return apiCall<string>("open_terminal_in", { path });
  },

  async listSystemFonts(): Promise<Array<{ name: string; is_monospace: boolean }>> {
    try {
      return await apiCall<Array<{ name: string; is_monospace: boolean }>>("list_system_fonts");
    } catch (err) {
      console.error("Failed to list system fonts:", err);
      return [];
    }
  },

  /**
   * Gets hook events for a session
   * @param sessionId - The session ID
   * @returns Promise resolving to array of JSONL event lines
   */
  async getHookEvents(sessionId: string): Promise<string[]> {
    return apiCall<string[]>('get_hook_events', { sessionId });
  },

  /**
   * Checks if the hook bridge scripts are installed
   * @returns Promise resolving to number of hook types wired (0-14)
   */
  async checkHookBridgeInstalled(): Promise<number> {
    return apiCall<number>('check_hook_bridge_installed');
  },

  /**
   * Gets the current Claude authentication status
   * @returns Promise resolving to auth status
   */
  async getAuthStatus(): Promise<{
    loggedIn: boolean;
    email: string | null;
    orgName: string | null;
    subscriptionType: string | null;
    authMethod: string | null;
  }> {
    return apiCall('get_auth_status');
  },

  async listPlugins(): Promise<{
    installed: Array<{
      id: string;
      version: string | null;
      scope: string | null;
      enabled: boolean;
      installedAt: string | null;
      lastUpdated: string | null;
    }>;
    available: Array<{
      pluginId: string;
      name: string;
      description: string | null;
      marketplaceName: string | null;
      installCount: number | null;
    }>;
  }> {
    return apiCall('list_plugins');
  },

  async installPlugin(pluginId: string, scope: string = 'user'): Promise<void> {
    return apiCall('install_plugin', { pluginId, scope });
  },

  async uninstallPlugin(pluginId: string): Promise<void> {
    return apiCall('uninstall_plugin', { pluginId });
  },

  async enablePlugin(pluginId: string): Promise<void> {
    return apiCall('enable_plugin', { pluginId });
  },

  async disablePlugin(pluginId: string): Promise<void> {
    return apiCall('disable_plugin', { pluginId });
  },

  /**
   * Installs the hook event bridge
   * @returns Promise resolving when installation completes
   */
  async installHookBridge(): Promise<void> {
    return apiCall<void>('install_hook_bridge');
  },

  /**
   * Removes the hook event bridge
   * @returns Promise resolving when removal completes
   */
  async removeHookBridge(): Promise<void> {
    return apiCall<void>('remove_hook_bridge');
  },

  /**
   * Gets a startup snapshot with all system checks
   * @returns Promise resolving to startup snapshot data
   */
  async getStartupSnapshot(): Promise<{
    hookBridgeTypeCount: number;
    cguardInstalled: boolean;
    claudeVersion: string | null;
    claudeJsonValid: boolean;
    claudeSettingsValid: boolean;
    mcpServerCount: number;
    pluginCount: number;
    sessionCount: number;
    projectCount: number;
    skillCount: number;
    agentCount: number;
  }> {
    return apiCall('get_startup_snapshot');
  },

  async spawnPty(path: string): Promise<string> {
    return apiCall<string>('spawn_pty', { path });
  },

  async writePty(ptyId: string, data: string): Promise<void> {
    return apiCall<void>('write_pty', { ptyId, data });
  },

  async resizePty(ptyId: string, cols: number, rows: number): Promise<void> {
    return apiCall<void>('resize_pty', { ptyId, cols, rows });
  },

  async killPty(ptyId: string): Promise<void> {
    return apiCall<void>('kill_pty', { ptyId });
  },

};
