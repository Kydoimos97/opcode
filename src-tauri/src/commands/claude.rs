use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Global state to track current Claude process
pub struct ClaudeProcessState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl Default for ClaudeProcessState {
    fn default() -> Self {
        Self {
            current_process: Arc::new(Mutex::new(None)),
        }
    }
}

/// Represents a project in the ~/.claude/projects directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// The project ID (derived from the directory name)
    pub id: String,
    /// The original project path (decoded from the directory name)
    pub path: String,
    /// List of session IDs (JSONL file names without extension)
    pub sessions: Vec<String>,
    /// Unix timestamp when the project directory was created
    pub created_at: u64,
    /// Unix timestamp of the most recent session (if any)
    pub most_recent_session: Option<u64>,
    /// Absolute path to the git repository root (None if not a git repo)
    pub git_root: Option<String>,
    /// Current git branch for this worktree (None if not a git repo)
    pub git_branch: Option<String>,
}

/// Represents a session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// The session ID (UUID)
    pub id: String,
    /// The project ID this session belongs to
    pub project_id: String,
    /// The project path
    pub project_path: String,
    /// Optional todo data associated with this session
    pub todo_data: Option<serde_json::Value>,
    /// Unix timestamp when the session file was created
    pub created_at: u64,
    /// Unix timestamp when the session file was last modified (reflects last activity)
    pub modified_at: u64,
    /// First user message content (if available)
    pub first_message: Option<String>,
    /// Timestamp of the first user message (if available)
    pub message_timestamp: Option<String>,
}

/// Represents a message entry in the JSONL file
#[derive(Debug, Deserialize)]
struct JsonlEntry {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    entry_type: Option<String>,
    message: Option<MessageContent>,
    timestamp: Option<String>,
}

/// Represents the message content
#[derive(Debug, Deserialize)]
struct MessageContent {
    role: Option<String>,
    content: Option<String>,
}

/// Represents the settings from ~/.claude/settings.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            data: serde_json::json!({}),
        }
    }
}

/// Represents the Claude Code version status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeVersionStatus {
    /// Whether Claude Code is installed and working
    pub is_installed: bool,
    /// The version string if available
    pub version: Option<String>,
    /// The full output from the command
    pub output: String,
}

/// Represents a CLAUDE.md file found in the project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMdFile {
    /// Relative path from the project root
    pub relative_path: String,
    /// Absolute path to the file
    pub absolute_path: String,
    /// File size in bytes
    pub size: u64,
    /// Last modified timestamp
    pub modified: u64,
}

/// Represents a file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// The name of the file or directory
    pub name: String,
    /// The full path
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// File size in bytes (0 for directories)
    pub size: u64,
    /// File extension (if applicable)
    pub extension: Option<String>,
}

/// Represents an entry in the .claude directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
}

/// Represents a session log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLogEntry {
    pub session_id: String,
    pub project_path: String,
    pub file_path: String,
    pub modified: String,
    pub size: u64,
}

/// Finds the full path to the claude binary
/// This is necessary because macOS apps have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}

/// Gets the path to the ~/.claude directory
fn get_claude_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .context("Could not find home directory")?
        .join(".claude")
        .canonicalize()
        .context("Could not find ~/.claude directory")
}

/// Gets the actual project path by reading the cwd from the JSONL entries
fn get_project_path_from_sessions(project_dir: &PathBuf) -> Result<String, String> {
    // Try to read any JSONL file in the directory
    let entries = fs::read_dir(project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                // Read the JSONL file and find the first line with a valid cwd
                if let Ok(file) = fs::File::open(&path) {
                    let reader = BufReader::new(file);
                    // Check first few lines instead of just the first line
                    // Some session files may have null cwd in the first line
                    for line in reader.lines().take(10) {
                        if let Ok(line_content) = line {
                            // Parse the JSON and extract cwd
                            if let Ok(json) =
                                serde_json::from_str::<serde_json::Value>(&line_content)
                            {
                                if let Some(cwd) = json.get("cwd").and_then(|v| v.as_str()) {
                                    if !cwd.is_empty() {
                                        return Ok(cwd.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not determine project path from session files".to_string())
}

/// Decodes a project directory name back to its original path
/// The directory names in ~/.claude/projects are encoded paths
/// DEPRECATED: Use get_project_path_from_sessions instead when possible
fn decode_project_path(encoded: &str) -> String {
    // This is a fallback - the encoding isn't reversible when paths contain hyphens
    // For example: -Users-mufeedvh-dev-jsonl-viewer could be /Users/mufeedvh/dev/jsonl-viewer
    // or /Users/mufeedvh/dev/jsonl/viewer
    encoded.replace('-', "/")
}

/// Extracts the first valid user message from a JSONL file
fn extract_first_user_message(jsonl_path: &PathBuf) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(jsonl_path) {
        Ok(file) => file,
        Err(_) => return (None, None),
    };

    let reader = BufReader::new(file);

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) {
                if let Some(message) = entry.message {
                    if message.role.as_deref() == Some("user") {
                        if let Some(content) = message.content {
                            // Skip if it contains the caveat message
                            if content.contains("Caveat: The messages below were generated by the user while running local commands") {
                                continue;
                            }

                            // Skip if it starts with command tags
                            if content.starts_with("<command-name>")
                                || content.starts_with("<local-command-stdout>")
                            {
                                continue;
                            }

                            // Found a valid user message
                            return (Some(content), entry.timestamp);
                        }
                    }
                }
            }
        }
    }

    (None, None)
}

/// Helper function to create a tokio Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    // Convert std::process::Command to tokio::process::Command
    let _std_cmd = crate::claude_binary::create_command_with_env(program);

    // Create a new tokio Command from the program path
    let mut tokio_cmd = Command::new(program);

    // Copy over all environment variables
    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
        {
            log::debug!("Inheriting env var: {}={}", key, value);
            tokio_cmd.env(&key, &value);
        }
    }

    // Add NVM support if the program is in an NVM directory
    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                tokio_cmd.env("PATH", new_path);
            }
        }
    }

    // Add Homebrew support if the program is in a Homebrew directory
    if program.contains("/homebrew/") || program.contains("/opt/homebrew/") {
        if let Some(program_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let homebrew_bin_str = program_dir.to_string_lossy();
            if !current_path.contains(&homebrew_bin_str.as_ref()) {
                let new_path = format!("{}:{}", homebrew_bin_str, current_path);
                log::debug!(
                    "Adding Homebrew bin directory to PATH: {}",
                    homebrew_bin_str
                );
                tokio_cmd.env("PATH", new_path);
            }
        }
    }

    tokio_cmd
}

/// Creates a system binary command with the given arguments
fn create_system_command(claude_path: &str, args: Vec<String>, project_path: &str) -> Command {
    let mut cmd = create_command_with_env(claude_path);

    // Add all arguments
    for arg in args {
        cmd.arg(arg);
    }

    cmd.current_dir(project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd
}

/// Gets the user's home directory path
#[tauri::command]
pub async fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .and_then(|path| path.to_str().map(|s| s.to_string()))
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Lists all projects in the ~/.claude/projects directory
#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, String> {
    log::info!("Listing projects from ~/.claude/projects");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        log::warn!("Projects directory does not exist: {:?}", projects_dir);
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();

    // Read all directories in the projects folder
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "Invalid directory name".to_string())?;

            // Get directory creation time
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to read directory metadata: {}", e))?;

            let created_at = metadata
                .created()
                .or_else(|_| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            // Get the actual project path from JSONL files
            let project_path = match get_project_path_from_sessions(&path) {
                Ok(path) => path,
                Err(e) => {
                    log::warn!("Failed to get project path from sessions for {}: {}, falling back to decode", dir_name, e);
                    decode_project_path(dir_name)
                }
            };

            // List all JSONL files (sessions) in this project directory
            let mut sessions = Vec::new();
            let mut most_recent_session: Option<u64> = None;

            if let Ok(session_entries) = fs::read_dir(&path) {
                for session_entry in session_entries.flatten() {
                    let session_path = session_entry.path();
                    if session_path.is_file()
                        && session_path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                    {
                        if let Some(session_id) = session_path.file_stem().and_then(|s| s.to_str())
                        {
                            sessions.push(session_id.to_string());

                            // Track the most recent session timestamp
                            if let Ok(metadata) = fs::metadata(&session_path) {
                                let modified = metadata
                                    .modified()
                                    .unwrap_or(SystemTime::UNIX_EPOCH)
                                    .duration_since(UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();

                                most_recent_session = Some(match most_recent_session {
                                    Some(current) => current.max(modified),
                                    None => modified,
                                });
                            }
                        }
                    }
                }
            }

            // Detect git root and branch for this project path
            let git_root = std::process::Command::new("git")
                .args(["-C", &project_path, "rev-parse", "--show-toplevel"])
                .output()
                .ok()
                .and_then(|o| if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else { None });

            let git_branch = git_root.as_ref().and_then(|_| {
                std::process::Command::new("git")
                    .args(["-C", &project_path, "rev-parse", "--abbrev-ref", "HEAD"])
                    .output()
                    .ok()
                    .and_then(|o| if o.status.success() {
                        Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                    } else { None })
            });

            projects.push(Project {
                id: dir_name.to_string(),
                path: project_path,
                sessions,
                created_at,
                most_recent_session,
                git_root,
                git_branch,
            });
        }
    }

    // Sort projects by most recent session activity, then by creation time
    projects.sort_by(|a, b| {
        // First compare by most recent session
        match (a.most_recent_session, b.most_recent_session) {
            (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => b.created_at.cmp(&a.created_at),
        }
    });

    log::info!("Found {} projects", projects.len());
    Ok(projects)
}

/// Creates a new project for the given directory path
#[tauri::command]
pub async fn create_project(path: String) -> Result<Project, String> {
    log::info!("Creating project for path: {}", path);

    // Encode the path to create a project ID
    let project_id = path.replace('/', "-");

    // Get claude directory
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");

    // Create projects directory if it doesn't exist
    if !projects_dir.exists() {
        fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects directory: {}", e))?;
    }

    // Create project directory if it doesn't exist
    let project_dir = projects_dir.join(&project_id);
    if !project_dir.exists() {
        fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;
    }

    // Get creation time
    let metadata = fs::metadata(&project_dir)
        .map_err(|e| format!("Failed to read directory metadata: {}", e))?;

    let created_at = metadata
        .created()
        .or_else(|_| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Detect git info for the new project
    let git_root = std::process::Command::new("git")
        .args(["-C", &path, "rev-parse", "--show-toplevel"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else { None });

    let git_branch = git_root.as_ref().and_then(|_| {
        std::process::Command::new("git")
            .args(["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .ok()
            .and_then(|o| if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else { None })
    });

    // Return the created project
    Ok(Project {
        id: project_id,
        path,
        sessions: Vec::new(),
        created_at,
        most_recent_session: None,
        git_root,
        git_branch,
    })
}

/// Gets sessions for a specific project
#[tauri::command]
pub async fn get_project_sessions(project_id: String) -> Result<Vec<Session>, String> {
    log::info!("Getting sessions for project: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let project_dir = claude_dir.join("projects").join(&project_id);
    let todos_dir = claude_dir.join("todos");

    if !project_dir.exists() {
        return Err(format!("Project directory not found: {}", project_id));
    }

    // Get the actual project path from JSONL files
    let project_path = match get_project_path_from_sessions(&project_dir) {
        Ok(path) => path,
        Err(e) => {
            log::warn!(
                "Failed to get project path from sessions for {}: {}, falling back to decode",
                project_id,
                e
            );
            decode_project_path(&project_id)
        }
    };

    let mut sessions = Vec::new();

    // Read all JSONL files in the project directory
    let entries = fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) {
                // Get file creation time
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let created_at = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let modified_at = metadata
                    .modified()
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Extract first user message and timestamp
                let (first_message, message_timestamp) = extract_first_user_message(&path);

                // Try to load associated todo data
                let todo_path = todos_dir.join(format!("{}.json", session_id));
                let todo_data = if todo_path.exists() {
                    fs::read_to_string(&todo_path)
                        .ok()
                        .and_then(|content| serde_json::from_str(&content).ok())
                } else {
                    None
                };

                sessions.push(Session {
                    id: session_id.to_string(),
                    project_id: project_id.clone(),
                    project_path: project_path.clone(),
                    todo_data,
                    created_at,
                    modified_at,
                    first_message,
                    message_timestamp,
                });
            }
        }
    }

    // Sort sessions by last modification time (most recently active first)
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    log::info!(
        "Found {} sessions for project {}",
        sessions.len(),
        project_id
    );
    Ok(sessions)
}

/// Reads the Claude settings file
#[tauri::command]
pub async fn get_claude_settings() -> Result<ClaudeSettings, String> {
    log::info!("Reading Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    if !settings_path.exists() {
        log::warn!("Settings file not found, returning empty settings");
        return Ok(ClaudeSettings {
            data: serde_json::json!({}),
        });
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

    Ok(ClaudeSettings { data })
}

/// Opens a new Claude Code session by executing the claude command
#[tauri::command]
pub async fn open_new_session(app: AppHandle, path: Option<String>) -> Result<String, String> {
    log::info!("Opening new Claude Code session at path: {:?}", path);

    #[cfg(not(debug_assertions))]
    let _claude_path = find_claude_binary(&app)?;

    #[cfg(debug_assertions)]
    let claude_path = find_claude_binary(&app)?;

    // In production, we can't use std::process::Command directly
    // The user should launch Claude Code through other means or use the execute_claude_code command
    #[cfg(not(debug_assertions))]
    {
        log::error!("Cannot spawn processes directly in production builds");
        return Err("Direct process spawning is not available in production builds. Please use Claude Code directly or use the integrated execution commands.".to_string());
    }

    #[cfg(debug_assertions)]
    {
        let mut cmd = std::process::Command::new(claude_path);

        // If a path is provided, use it; otherwise use current directory
        if let Some(project_path) = path {
            cmd.current_dir(&project_path);
        }

        // Execute the command
        match cmd.spawn() {
            Ok(_) => {
                log::info!("Successfully launched Claude Code");
                Ok("Claude Code session started".to_string())
            }
            Err(e) => {
                log::error!("Failed to launch Claude Code: {}", e);
                Err(format!("Failed to launch Claude Code: {}", e))
            }
        }
    }
}

/// Reads the CLAUDE.md system prompt file
#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    log::info!("Reading CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    if !claude_md_path.exists() {
        log::warn!("CLAUDE.md not found");
        return Ok(String::new());
    }

    fs::read_to_string(&claude_md_path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Checks if Claude Code is installed and gets its version
#[tauri::command]
pub async fn check_claude_version(app: AppHandle) -> Result<ClaudeVersionStatus, String> {
    log::info!("Checking Claude Code version");

    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            return Ok(ClaudeVersionStatus {
                is_installed: false,
                version: None,
                output: e,
            });
        }
    };

    use log::debug;
    debug!("Claude path: {}", claude_path);

    // In production builds, we can't check the version directly
    #[cfg(not(debug_assertions))]
    {
        log::warn!("Cannot check claude version in production build");
        // If we found a path (either stored or in common locations), assume it's installed
        if claude_path != "claude" && PathBuf::from(&claude_path).exists() {
            return Ok(ClaudeVersionStatus {
                is_installed: true,
                version: None,
                output: "Claude binary found at: ".to_string() + &claude_path,
            });
        } else {
            return Ok(ClaudeVersionStatus {
                is_installed: false,
                version: None,
                output: "Cannot verify Claude installation in production build. Please ensure Claude Code is installed.".to_string(),
            });
        }
    }

    #[cfg(debug_assertions)]
    {
        let output = std::process::Command::new(claude_path)
            .arg("--version")
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                // Use regex to directly extract version pattern (e.g., "1.0.41")
                let version_regex =
                    regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)")
                        .ok();

                let version = if let Some(regex) = version_regex {
                    regex
                        .captures(&stdout)
                        .and_then(|captures| captures.get(1))
                        .map(|m| m.as_str().to_string())
                } else {
                    None
                };

                let full_output = if stderr.is_empty() {
                    stdout.clone()
                } else {
                    format!("{}\n{}", stdout, stderr)
                };

                // Check if the output matches the expected format
                // Expected format: "1.0.17 (Claude Code)" or similar
                let is_valid = stdout.contains("(Claude Code)") || stdout.contains("Claude Code");

                Ok(ClaudeVersionStatus {
                    is_installed: is_valid && output.status.success(),
                    version,
                    output: full_output.trim().to_string(),
                })
            }
            Err(e) => {
                log::error!("Failed to run claude command: {}", e);
                Ok(ClaudeVersionStatus {
                    is_installed: false,
                    version: None,
                    output: format!("Command not found: {}", e),
                })
            }
        }
    }
}

/// Represents Claude authentication status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub logged_in: bool,
    pub email: Option<String>,
    pub org_name: Option<String>,
    pub subscription_type: Option<String>,
    pub auth_method: Option<String>,
}

/// Gets the current Claude authentication status
#[tauri::command]
pub async fn get_auth_status(app: AppHandle) -> Result<AuthStatus, String> {
    log::info!("Getting Claude auth status");

    let claude_path = match find_claude_binary(&app) {
        Ok(p) => p,
        Err(_) => {
            return Ok(AuthStatus {
                logged_in: false,
                email: None,
                org_name: None,
                subscription_type: None,
                auth_method: None,
            });
        }
    };

    let mut cmd = create_command_with_env(&claude_path);
    cmd.args(&["auth", "status", "--json"]);

    let output = match cmd.output().await {
        Ok(output) => output,
        Err(e) => {
            log::error!("Failed to run claude auth status: {}", e);
            return Ok(AuthStatus {
                logged_in: false,
                email: None,
                org_name: None,
                subscription_type: None,
                auth_method: None,
            });
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);

    let json: serde_json::Value = match serde_json::from_str(stdout.trim()) {
        Ok(val) => val,
        Err(e) => {
            log::error!("Failed to parse auth status JSON: {}", e);
            serde_json::Value::Null
        }
    };

    Ok(AuthStatus {
        logged_in: json
            .get("loggedIn")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        email: json
            .get("email")
            .and_then(|v| v.as_str())
            .map(String::from),
        org_name: json
            .get("orgName")
            .and_then(|v| v.as_str())
            .map(String::from),
        subscription_type: json
            .get("subscriptionType")
            .and_then(|v| v.as_str())
            .map(String::from),
        auth_method: json
            .get("authMethod")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct InstalledPlugin {
    pub id: String,
    pub version: Option<String>,
    pub scope: Option<String>,
    pub enabled: bool,
    pub installed_at: Option<String>,
    pub last_updated: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AvailablePlugin {
    pub plugin_id: String,
    pub name: String,
    pub description: Option<String>,
    pub marketplace_name: Option<String>,
    pub install_count: Option<u64>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PluginList {
    pub installed: Vec<InstalledPlugin>,
    pub available: Vec<AvailablePlugin>,
}

fn run_plugin_command(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let claude_path = find_claude_binary(app).map_err(|e| e.to_string())?;
    let mut cmd = create_command_with_env(&claude_path);
    cmd.arg("plugin");
    for arg in args {
        cmd.arg(arg);
    }
    let out = std::process::Command::new(&claude_path)
        .args(["plugin"])
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

fn parse_installed_plugin(v: &serde_json::Value) -> Option<InstalledPlugin> {
    Some(InstalledPlugin {
        id: v.get("id")?.as_str()?.to_string(),
        version: v.get("version").and_then(|x| x.as_str()).map(String::from),
        scope: v.get("scope").and_then(|x| x.as_str()).map(String::from),
        enabled: v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true),
        installed_at: v.get("installedAt").and_then(|x| x.as_str()).map(String::from),
        last_updated: v.get("lastUpdated").and_then(|x| x.as_str()).map(String::from),
    })
}

fn parse_available_plugin(v: &serde_json::Value) -> Option<AvailablePlugin> {
    Some(AvailablePlugin {
        plugin_id: v.get("pluginId")?.as_str()?.to_string(),
        name: v.get("name")?.as_str()?.to_string(),
        description: v.get("description").and_then(|x| x.as_str()).map(String::from),
        marketplace_name: v.get("marketplaceName").and_then(|x| x.as_str()).map(String::from),
        install_count: v.get("installCount").and_then(|x| x.as_u64()),
    })
}

#[tauri::command]
pub async fn list_plugins(app: AppHandle) -> Result<PluginList, String> {
    let output = run_plugin_command(&app, &["list", "--json", "--available"])
        .unwrap_or_else(|_| {
            run_plugin_command(&app, &["list", "--json"]).unwrap_or_default()
        });

    let trimmed = output.trim();
    if trimmed.is_empty() {
        return Ok(PluginList { installed: vec![], available: vec![] });
    }

    let json: serde_json::Value = serde_json::from_str(trimmed)
        .unwrap_or(serde_json::Value::Null);

    if let Some(obj) = json.as_object() {
        let installed = obj.get("installed")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(parse_installed_plugin).collect())
            .unwrap_or_default();
        let available = obj.get("available")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(parse_available_plugin).collect())
            .unwrap_or_default();
        return Ok(PluginList { installed, available });
    }

    if let Some(arr) = json.as_array() {
        let installed = arr.iter().filter_map(parse_installed_plugin).collect();
        return Ok(PluginList { installed, available: vec![] });
    }

    Ok(PluginList { installed: vec![], available: vec![] })
}

#[tauri::command]
pub async fn install_plugin(app: AppHandle, plugin_id: String, scope: String) -> Result<(), String> {
    run_plugin_command(&app, &["install", &plugin_id, "--scope", &scope])
        .map(|_| ())
}

#[tauri::command]
pub async fn uninstall_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    run_plugin_command(&app, &["uninstall", &plugin_id])
        .map(|_| ())
}

#[tauri::command]
pub async fn enable_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    run_plugin_command(&app, &["enable", &plugin_id])
        .map(|_| ())
}

#[tauri::command]
pub async fn disable_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    run_plugin_command(&app, &["disable", &plugin_id])
        .map(|_| ())
}

/// Saves the CLAUDE.md system prompt file
#[tauri::command]
pub async fn save_system_prompt(content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    fs::write(&claude_md_path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok("System prompt saved successfully".to_string())
}

/// Saves the Claude settings file
#[tauri::command]
pub async fn save_claude_settings(settings: serde_json::Value) -> Result<String, String> {
    log::info!("Saving Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    // Pretty print the JSON with 2-space indentation
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok("Settings saved successfully".to_string())
}

/// Recursively finds all CLAUDE.md files in a project directory
#[tauri::command]
pub async fn find_claude_md_files(project_path: String) -> Result<Vec<ClaudeMdFile>, String> {
    log::info!("Finding CLAUDE.md files in project: {}", project_path);

    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }

    let mut claude_files = Vec::new();
    find_claude_md_recursive(&path, &path, &mut claude_files)?;

    // Sort by relative path
    claude_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    log::info!("Found {} CLAUDE.md files", claude_files.len());
    Ok(claude_files)
}

/// Helper function to recursively find CLAUDE.md files
fn find_claude_md_recursive(
    current_path: &PathBuf,
    project_root: &PathBuf,
    claude_files: &mut Vec<ClaudeMdFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        if path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            find_claude_md_recursive(&path, project_root, claude_files)?;
        } else if path.is_file() {
            // Check if it's a CLAUDE.md file (case insensitive)
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.eq_ignore_ascii_case("CLAUDE.md") {
                    let metadata = fs::metadata(&path)
                        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                    let relative_path = path
                        .strip_prefix(project_root)
                        .map_err(|e| format!("Failed to get relative path: {}", e))?
                        .to_string_lossy()
                        .to_string();

                    let modified = metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    claude_files.push(ClaudeMdFile {
                        relative_path,
                        absolute_path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }

    Ok(())
}

/// Reads a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn read_claude_md_file(file_path: String) -> Result<String, String> {
    log::info!("Reading CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Saves a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn save_claude_md_file(file_path: String, content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);

    // Ensure the parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok("File saved successfully".to_string())
}

/// Loads the JSONL history for a specific session
#[tauri::command]
pub async fn load_session_history(
    session_id: String,
    project_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!(
        "Loading session history for session: {} in project: {}",
        session_id,
        project_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    let file =
        fs::File::open(&session_path).map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                messages.push(json);
            }
        }
    }

    Ok(messages)
}

/// Status of a JSONL session file for sidebar polling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFileStatus {
    /// The type string of the last meaningful entry
    pub last_type: Option<String>,
    /// Whether the last result entry has is_error = true
    pub is_error: bool,
    /// Total lines currently in the file
    pub lines_total: u64,
    /// Seconds since the file was last modified
    pub modified_secs_ago: u64,
    /// Whether a PermissionRequest/approval prompt is pending
    pub awaiting_approval: bool,
    /// The text of the last user message, truncated to 120 chars
    pub last_user_message: Option<String>,
}

/// Reads new lines from a JSONL session file starting at `from_line`.
/// Returns the parsed JSON objects for all new lines.
#[tauri::command]
pub async fn poll_session_file(
    session_id: String,
    project_id: String,
    from_line: u64,
) -> Result<Vec<serde_json::Value>, String> {
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    let file = fs::File::open(&session_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for (idx, line) in reader.lines().enumerate() {
        if (idx as u64) < from_line {
            continue;
        }
        if let Ok(line) = line {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                messages.push(json);
            }
        }
    }

    Ok(messages)
}

/// Result of reading new lines from a session tail.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct SessionTailResult {
    /// Raw JSONL line strings
    pub lines: Vec<String>,
    /// New byte offset after reading (file size)
    pub new_offset: u64,
}

/// Reads new lines from a session JSONL file starting at `byte_offset`.
/// Returns raw JSONL line strings and the new byte offset after reading.
/// If `new_offset < byte_offset` (file truncated/rotated), returns empty lines
/// with `new_offset = 0` so the caller can fall back to a full reload.
/// Opens with FILE_SHARE_READ | FILE_SHARE_WRITE on Windows to allow concurrent writes.
#[tauri::command]
pub async fn read_session_tail(
    session_id: String,
    project_id: String,
    byte_offset: u64,
) -> Result<SessionTailResult, String> {
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Ok(SessionTailResult { lines: vec![], new_offset: byte_offset });
    }

    // Open with file sharing on Windows so Claude can write concurrently
    #[cfg(target_os = "windows")]
    let file = {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0x00000001 | 0x00000002) // FILE_SHARE_READ | FILE_SHARE_WRITE
            .open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?
    };
    #[cfg(not(target_os = "windows"))]
    let file = std::fs::File::open(&session_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    // Get current file size
    let file_size = file.metadata()
        .map(|m| m.len())
        .unwrap_or(0);

    // File was truncated — signal caller to do a full reload
    if file_size < byte_offset {
        return Ok(SessionTailResult { lines: vec![], new_offset: 0 });
    }

    // Nothing new
    if file_size == byte_offset {
        return Ok(SessionTailResult { lines: vec![], new_offset: byte_offset });
    }

    // Seek to byte_offset and read new content
    use std::io::{Read, Seek, SeekFrom};
    let mut file = file;
    file.seek(SeekFrom::Start(byte_offset))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    let mut buf = String::new();
    file.read_to_string(&mut buf)
        .map_err(|e| format!("Failed to read: {}", e))?;

    let lines: Vec<String> = buf
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();

    // New offset = file_size (we've read everything up to now)
    Ok(SessionTailResult { lines, new_offset: file_size })
}

/// Returns the absolute path of a session JSONL file.
#[tauri::command]
pub async fn get_session_file_path(session_id: String, project_id: String) -> Result<String, String> {
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));
    path.to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

/// Returns lightweight status info about a session JSONL file for sidebar status dots.
#[tauri::command]
pub async fn get_session_file_status(
    session_id: String,
    project_id: String,
) -> Result<SessionFileStatus, String> {
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Ok(SessionFileStatus {
            last_type: None,
            is_error: false,
            lines_total: 0,
            modified_secs_ago: u64::MAX,
            awaiting_approval: false,
            last_user_message: None,
        });
    }

    let metadata = fs::metadata(&session_path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let modified_secs_ago = metadata
        .modified()
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|d| d.as_secs())
        .unwrap_or(u64::MAX);

    let file = fs::File::open(&session_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    let mut lines_total: u64 = 0;
    let mut last_type: Option<String> = None;
    let mut is_error = false;
    let mut awaiting_approval = false;
    let mut last_user_message: Option<String> = None;

    for line in reader.lines() {
        if let Ok(line) = line {
            lines_total += 1;
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(t) = json.get("type").and_then(|v| v.as_str()) {
                    last_type = Some(t.to_string());
                    if t == "result" {
                        is_error = json
                            .get("is_error")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        awaiting_approval = false;
                    } else if t == "system" {
                        if let Some(subtype) = json.get("subtype").and_then(|v| v.as_str()) {
                            if subtype == "permission_request" || subtype == "approval" {
                                awaiting_approval = true;
                            }
                        }
                    } else if t == "user" {
                        // Extract text from the last user message for sidebar subtitle
                        let text = json
                            .get("message")
                            .and_then(|m| m.get("content"))
                            .and_then(|c| {
                                if let Some(s) = c.as_str() {
                                    return Some(s.to_string());
                                }
                                if let Some(arr) = c.as_array() {
                                    return arr.iter()
                                        .filter_map(|item| {
                                            if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                                                item.get("text").and_then(|v| v.as_str()).map(|s| s.to_string())
                                            } else {
                                                None
                                            }
                                        })
                                        .next();
                                }
                                None
                            });
                        if let Some(mut text) = text {
                            // Strip leading context-compaction prefix if present
                            if let Some(pos) = text.find('\n') {
                                if text.starts_with('<') {
                                    text = text[pos + 1..].to_string();
                                }
                            }
                            let trimmed = text.trim().to_string();
                            if !trimmed.is_empty() {
                                last_user_message = Some(if trimmed.len() > 120 {
                                    let truncated: String = trimmed.chars().take(120).collect();
                                    format!("{}…", truncated)
                                } else {
                                    trimmed
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(SessionFileStatus {
        last_type,
        is_error,
        lines_total,
        modified_secs_ago,
        awaiting_approval,
        last_user_message,
    })
}

/// Map a permission mode string to the --permission-mode CLI flag.
/// Claude Code owns the full semantics of each mode including hooks.
fn permission_args(mode: &str) -> Vec<String> {
    vec!["--permission-mode".to_string(), mode.to_string()]
}

/// Execute a new interactive Claude Code session with streaming output
#[tauri::command]
pub async fn execute_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
) -> Result<(), String> {
    let mode = permission_mode.as_deref().unwrap_or("bypassPermissions");
    log::info!(
        "Starting new Claude Code session in: {} with model: {} permission_mode: {}",
        project_path,
        model,
        mode
    );

    let claude_path = find_claude_binary(&app)?;

    let mut args = vec![
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        model.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    args.extend(permission_args(mode));

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Continue an existing Claude Code conversation with streaming output
#[tauri::command]
pub async fn continue_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
) -> Result<(), String> {
    let mode = permission_mode.as_deref().unwrap_or("bypassPermissions");
    log::info!(
        "Continuing Claude Code conversation in: {} with model: {} permission_mode: {}",
        project_path,
        model,
        mode
    );

    let claude_path = find_claude_binary(&app)?;

    let mut args = vec![
        "-c".to_string(),
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        model.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    args.extend(permission_args(mode));

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Resume an existing Claude Code session by ID with streaming output
#[tauri::command]
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
) -> Result<(), String> {
    let mode = permission_mode.as_deref().unwrap_or("bypassPermissions");
    log::info!(
        "Resuming Claude Code session: {} in: {} with model: {} permission_mode: {}",
        session_id,
        project_path,
        model,
        mode
    );

    let claude_path = find_claude_binary(&app)?;

    let mut args = vec![
        "--resume".to_string(),
        session_id.clone(),
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        model.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    args.extend(permission_args(mode));

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Cancel the currently running Claude Code execution
#[tauri::command]
pub async fn cancel_claude_execution(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Cancelling Claude Code execution for session: {:?}",
        session_id
    );

    let mut killed = false;
    let mut attempted_methods = Vec::new();

    // Method 1: Try to find and kill via ProcessRegistry using session ID
    if let Some(sid) = &session_id {
        let registry = app.state::<crate::process::ProcessRegistryState>();
        match registry.0.get_claude_session_by_id(sid) {
            Ok(Some(process_info)) => {
                log::info!(
                    "Found process in registry for session {}: run_id={}, PID={}",
                    sid,
                    process_info.run_id,
                    process_info.pid
                );
                match registry.0.kill_process(process_info.run_id).await {
                    Ok(success) => {
                        if success {
                            log::info!("Successfully killed process via registry");
                            killed = true;
                        } else {
                            log::warn!("Registry kill returned false");
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to kill via registry: {}", e);
                    }
                }
                attempted_methods.push("registry");
            }
            Ok(None) => {
                log::warn!("Session {} not found in ProcessRegistry", sid);
            }
            Err(e) => {
                log::error!("Error querying ProcessRegistry: {}", e);
            }
        }
    }

    // Method 2: Try the legacy approach via ClaudeProcessState
    if !killed {
        let claude_state = app.state::<ClaudeProcessState>();
        let mut current_process = claude_state.current_process.lock().await;

        if let Some(mut child) = current_process.take() {
            // Try to get the PID before killing
            let pid = child.id();
            log::info!(
                "Attempting to kill Claude process via ClaudeProcessState with PID: {:?}",
                pid
            );

            // Kill the process
            match child.kill().await {
                Ok(_) => {
                    log::info!("Successfully killed Claude process via ClaudeProcessState");
                    killed = true;
                }
                Err(e) => {
                    log::error!(
                        "Failed to kill Claude process via ClaudeProcessState: {}",
                        e
                    );

                    // Method 3: If we have a PID, try system kill as last resort
                    if let Some(pid) = pid {
                        log::info!("Attempting system kill as last resort for PID: {}", pid);
                        let kill_result = if cfg!(target_os = "windows") {
                            std::process::Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .output()
                        } else {
                            std::process::Command::new("kill")
                                .args(["-KILL", &pid.to_string()])
                                .output()
                        };

                        match kill_result {
                            Ok(output) if output.status.success() => {
                                log::info!("Successfully killed process via system command");
                                killed = true;
                            }
                            Ok(output) => {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                log::error!("System kill failed: {}", stderr);
                            }
                            Err(e) => {
                                log::error!("Failed to execute system kill command: {}", e);
                            }
                        }
                    }
                }
            }
            attempted_methods.push("claude_state");
        } else {
            log::warn!("No active Claude process in ClaudeProcessState");
        }
    }

    if !killed && attempted_methods.is_empty() {
        log::warn!("No active Claude process found to cancel");
    }

    // Always emit cancellation events for UI consistency
    if let Some(sid) = session_id {
        let _ = app.emit(&format!("claude-cancelled:{}", sid), true);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let _ = app.emit(&format!("claude-complete:{}", sid), false);
    }

    // Also emit generic events for backward compatibility
    let _ = app.emit("claude-cancelled", true);
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let _ = app.emit("claude-complete", false);

    if killed {
        log::info!("Claude process cancellation completed successfully");
    } else if !attempted_methods.is_empty() {
        log::warn!("Claude process cancellation attempted but process may have already exited. Attempted methods: {:?}", attempted_methods);
    }

    Ok(())
}

/// Get all running Claude sessions
#[tauri::command]
pub async fn list_running_claude_sessions(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<crate::process::ProcessInfo>, String> {
    registry.0.get_running_claude_sessions()
}

/// Get live output from a Claude session
#[tauri::command]
pub async fn get_claude_session_output(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
    session_id: String,
) -> Result<String, String> {
    // Find the process by session ID
    if let Some(process_info) = registry.0.get_claude_session_by_id(&session_id)? {
        registry.0.get_live_output(process_info.run_id)
    } else {
        Ok(String::new())
    }
}

/// Helper function to spawn Claude process and handle streaming
async fn spawn_claude_process(
    app: AppHandle,
    mut cmd: Command,
    prompt: String,
    model: String,
    project_path: String,
) -> Result<(), String> {
    use std::sync::Mutex;
    use tokio::io::{AsyncBufReadExt, BufReader};

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Get the child PID for logging
    let pid = child.id().unwrap_or(0);
    log::info!("Spawned Claude process with PID: {:?}", pid);

    // Create readers first (before moving child)
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // We'll extract the session ID from Claude's init message
    let session_id_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let run_id_holder: Arc<Mutex<Option<i64>>> = Arc::new(Mutex::new(None));

    // Store the child process in the global state (for backward compatibility)
    let claude_state = app.state::<ClaudeProcessState>();
    {
        let mut current_process = claude_state.current_process.lock().await;
        // If there's already a process running, kill it first
        if let Some(mut existing_child) = current_process.take() {
            log::warn!("Killing existing Claude process before starting new one");
            let _ = existing_child.kill().await;
        }
        *current_process = Some(child);
    }

    // Spawn tasks to read stdout and stderr
    let app_handle = app.clone();
    let session_id_holder_clone = session_id_holder.clone();
    let run_id_holder_clone = run_id_holder.clone();
    let registry = app.state::<crate::process::ProcessRegistryState>();
    let registry_clone = registry.0.clone();
    let project_path_clone = project_path.clone();
    let prompt_clone = prompt.clone();
    let model_clone = model.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("Claude stdout: {}", line);

            // Parse the line to check for init message with session ID
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(claude_session_id) = msg["session_id"].as_str() {
                        let mut session_id_guard = session_id_holder_clone.lock().unwrap();
                        if session_id_guard.is_none() {
                            *session_id_guard = Some(claude_session_id.to_string());
                            log::info!("Extracted Claude session ID: {}", claude_session_id);

                            // Now register with ProcessRegistry using Claude's session ID
                            match registry_clone.register_claude_session(
                                claude_session_id.to_string(),
                                pid,
                                project_path_clone.clone(),
                                prompt_clone.clone(),
                                model_clone.clone(),
                            ) {
                                Ok(run_id) => {
                                    log::info!("Registered Claude session with run_id: {}", run_id);
                                    let mut run_id_guard = run_id_holder_clone.lock().unwrap();
                                    *run_id_guard = Some(run_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to register Claude session: {}", e);
                                }
                            }
                        }
                    }
                }
            }

            // Store live output in registry if we have a run_id
            if let Some(run_id) = *run_id_holder_clone.lock().unwrap() {
                let _ = registry_clone.append_live_output(run_id, &line);
            }

            // Emit the line to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone.lock().unwrap() {
                let _ = app_handle.emit(&format!("claude-output:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility
            let _ = app_handle.emit("claude-output", &line);
        }
    });

    let app_handle_stderr = app.clone();
    let session_id_holder_clone2 = session_id_holder.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::error!("Claude stderr: {}", line);
            // Emit error lines to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone2.lock().unwrap() {
                let _ = app_handle_stderr.emit(&format!("claude-error:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility
            let _ = app_handle_stderr.emit("claude-error", &line);
        }
    });

    // Wait for the process to complete
    let app_handle_wait = app.clone();
    let claude_state_wait = claude_state.current_process.clone();
    let session_id_holder_clone3 = session_id_holder.clone();
    let run_id_holder_clone2 = run_id_holder.clone();
    let registry_clone2 = registry.0.clone();
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        // Get the child from the state to wait on it
        let mut current_process = claude_state_wait.lock().await;
        if let Some(mut child) = current_process.take() {
            match child.wait().await {
                Ok(status) => {
                    log::info!("Claude process exited with status: {}", status);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        let _ = app_handle_wait
                            .emit(&format!("claude-complete:{}", session_id), status.success());
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", status.success());
                }
                Err(e) => {
                    log::error!("Failed to wait for Claude process: {}", e);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        let _ =
                            app_handle_wait.emit(&format!("claude-complete:{}", session_id), false);
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", false);
                }
            }
        }

        // Unregister from ProcessRegistry if we have a run_id
        if let Some(run_id) = *run_id_holder_clone2.lock().unwrap() {
            let _ = registry_clone2.unregister_process(run_id);
        }

        // Clear the process from state
        *current_process = None;
    });

    Ok(())
}

/// Lists files and directories in a given path
#[tauri::command]
pub async fn list_directory_contents(directory_path: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Listing directory contents: '{}'", directory_path);

    // Check if path is empty
    if directory_path.trim().is_empty() {
        log::error!("Directory path is empty or whitespace");
        return Err("Directory path cannot be empty".to_string());
    }

    let path = PathBuf::from(&directory_path);
    log::debug!("Resolved path: {:?}", path);

    if !path.exists() {
        log::error!("Path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", directory_path));
    }

    if !path.is_dir() {
        log::error!("Path is not a directory: {:?}", path);
        return Err(format!("Path is not a directory: {}", directory_path));
    }

    let mut entries = Vec::new();

    let dir_entries =
        fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in dir_entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        // Skip hidden files/directories unless they are .claude directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') && name != ".claude" {
                continue;
            }
        }

        let name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let extension = if metadata.is_file() {
            entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len(),
            extension,
        });
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Search for files and directories matching a pattern
#[tauri::command]
pub async fn search_files(base_path: String, query: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Searching files in '{}' for: '{}'", base_path, query);

    // Check if path is empty
    if base_path.trim().is_empty() {
        log::error!("Base path is empty or whitespace");
        return Err("Base path cannot be empty".to_string());
    }

    // Check if query is empty
    if query.trim().is_empty() {
        log::warn!("Search query is empty, returning empty results");
        return Ok(Vec::new());
    }

    let path = PathBuf::from(&base_path);
    log::debug!("Resolved search base path: {:?}", path);

    if !path.exists() {
        log::error!("Base path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", base_path));
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    search_files_recursive(&path, &path, &query_lower, &mut results, 0)?;

    // Sort by relevance: exact matches first, then by name
    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;

        match (a_exact, b_exact) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    // Limit results to prevent overwhelming the UI
    results.truncate(50);

    Ok(results)
}

fn search_files_recursive(
    current_path: &PathBuf,
    base_path: &PathBuf,
    query: &str,
    results: &mut Vec<FileEntry>,
    depth: usize,
) -> Result<(), String> {
    // Limit recursion depth to prevent excessive searching
    if depth > 5 || results.len() >= 50 {
        return Ok(());
    }

    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }

            // Check if name matches query
            if name.to_lowercase().contains(query) {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;

                let extension = if metadata.is_file() {
                    entry_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_string())
                } else {
                    None
                };

                results.push(FileEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: metadata.is_dir(),
                    size: metadata.len(),
                    extension,
                });
            }
        }

        // Recurse into directories
        if entry_path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            search_files_recursive(&entry_path, base_path, query, results, depth + 1)?;
        }
    }

    Ok(())
}

/// Creates a checkpoint for the current session state
#[tauri::command]
pub async fn create_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message_index: Option<usize>,
    description: Option<String>,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Creating checkpoint for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    // Always load current session messages from the JSONL file
    let session_path = get_claude_dir()
        .map_err(|e| e.to_string())?
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if session_path.exists() {
        let file = fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;
        let reader = BufReader::new(file);

        let mut line_count = 0;
        for line in reader.lines() {
            if let Some(index) = message_index {
                if line_count > index {
                    break;
                }
            }
            if let Ok(line) = line {
                manager
                    .track_message(line)
                    .await
                    .map_err(|e| format!("Failed to track message: {}", e))?;
            }
            line_count += 1;
        }
    }

    manager
        .create_checkpoint(description, None)
        .await
        .map_err(|e| format!("Failed to create checkpoint: {}", e))
}

/// Restores a session to a specific checkpoint
#[tauri::command]
pub async fn restore_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    checkpoint_id: String,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Restoring checkpoint: {} for session: {}",
        checkpoint_id,
        session_id
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let result = manager
        .restore_checkpoint(&checkpoint_id)
        .await
        .map_err(|e| format!("Failed to restore checkpoint: {}", e))?;

    // Update the session JSONL file with restored messages
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&result.checkpoint.project_id)
        .join(format!("{}.jsonl", session_id));

    // The manager has already restored the messages internally,
    // but we need to update the actual session file
    let (_, _, messages) = manager
        .storage
        .load_checkpoint(&result.checkpoint.project_id, &session_id, &checkpoint_id)
        .map_err(|e| format!("Failed to load checkpoint data: {}", e))?;

    fs::write(&session_path, messages)
        .map_err(|e| format!("Failed to update session file: {}", e))?;

    Ok(result)
}

/// Lists all checkpoints for a session
#[tauri::command]
pub async fn list_checkpoints(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<Vec<crate::checkpoint::Checkpoint>, String> {
    log::info!(
        "Listing checkpoints for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.list_checkpoints().await)
}

/// Forks a new timeline branch from a checkpoint
#[tauri::command]
pub async fn fork_from_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    checkpoint_id: String,
    session_id: String,
    project_id: String,
    project_path: String,
    new_session_id: String,
    description: Option<String>,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Forking from checkpoint: {} to new session: {}",
        checkpoint_id,
        new_session_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;

    // First, copy the session file to the new session
    let source_session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));
    let new_session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", new_session_id));

    if source_session_path.exists() {
        fs::copy(&source_session_path, &new_session_path)
            .map_err(|e| format!("Failed to copy session file: {}", e))?;
    }

    // Create manager for the new session
    let manager = app
        .get_or_create_manager(
            new_session_id.clone(),
            project_id,
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .fork_from_checkpoint(&checkpoint_id, description)
        .await
        .map_err(|e| format!("Failed to fork checkpoint: {}", e))
}

/// Gets the timeline for a session
#[tauri::command]
pub async fn get_session_timeline(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<crate::checkpoint::SessionTimeline, String> {
    log::info!(
        "Getting timeline for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.get_timeline().await)
}

/// Updates checkpoint settings for a session
#[tauri::command]
pub async fn update_checkpoint_settings(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    auto_checkpoint_enabled: bool,
    checkpoint_strategy: String,
) -> Result<(), String> {
    use crate::checkpoint::CheckpointStrategy;

    log::info!("Updating checkpoint settings for session: {}", session_id);

    let strategy = match checkpoint_strategy.as_str() {
        "manual" => CheckpointStrategy::Manual,
        "per_prompt" => CheckpointStrategy::PerPrompt,
        "per_tool_use" => CheckpointStrategy::PerToolUse,
        "smart" => CheckpointStrategy::Smart,
        _ => {
            return Err(format!(
                "Invalid checkpoint strategy: {}",
                checkpoint_strategy
            ))
        }
    };

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .update_settings(auto_checkpoint_enabled, strategy)
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))
}

/// Gets diff between two checkpoints
#[tauri::command]
pub async fn get_checkpoint_diff(
    from_checkpoint_id: String,
    to_checkpoint_id: String,
    session_id: String,
    project_id: String,
) -> Result<crate::checkpoint::CheckpointDiff, String> {
    use crate::checkpoint::storage::CheckpointStorage;

    log::info!(
        "Getting diff between checkpoints: {} -> {}",
        from_checkpoint_id,
        to_checkpoint_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let storage = CheckpointStorage::new(claude_dir);

    // Load both checkpoints
    let (from_checkpoint, from_files, _) = storage
        .load_checkpoint(&project_id, &session_id, &from_checkpoint_id)
        .map_err(|e| format!("Failed to load source checkpoint: {}", e))?;
    let (to_checkpoint, to_files, _) = storage
        .load_checkpoint(&project_id, &session_id, &to_checkpoint_id)
        .map_err(|e| format!("Failed to load target checkpoint: {}", e))?;

    // Build file maps
    let mut from_map: std::collections::HashMap<PathBuf, &crate::checkpoint::FileSnapshot> =
        std::collections::HashMap::new();
    for file in &from_files {
        from_map.insert(file.file_path.clone(), file);
    }

    let mut to_map: std::collections::HashMap<PathBuf, &crate::checkpoint::FileSnapshot> =
        std::collections::HashMap::new();
    for file in &to_files {
        to_map.insert(file.file_path.clone(), file);
    }

    // Calculate differences
    let mut modified_files = Vec::new();
    let mut added_files = Vec::new();
    let mut deleted_files = Vec::new();

    // Check for modified and deleted files
    for (path, from_file) in &from_map {
        if let Some(to_file) = to_map.get(path) {
            if from_file.hash != to_file.hash {
                // File was modified
                let additions = to_file.content.lines().count();
                let deletions = from_file.content.lines().count();

                modified_files.push(crate::checkpoint::FileDiff {
                    path: path.clone(),
                    additions,
                    deletions,
                    diff_content: None, // TODO: Generate actual diff
                });
            }
        } else {
            // File was deleted
            deleted_files.push(path.clone());
        }
    }

    // Check for added files
    for (path, _) in &to_map {
        if !from_map.contains_key(path) {
            added_files.push(path.clone());
        }
    }

    // Calculate token delta
    let token_delta = (to_checkpoint.metadata.total_tokens as i64)
        - (from_checkpoint.metadata.total_tokens as i64);

    Ok(crate::checkpoint::CheckpointDiff {
        from_checkpoint_id,
        to_checkpoint_id,
        modified_files,
        added_files,
        deleted_files,
        token_delta,
    })
}

/// Tracks a message for checkpointing
#[tauri::command]
pub async fn track_checkpoint_message(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message: String,
) -> Result<(), String> {
    log::info!("Tracking message for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .track_message(message)
        .await
        .map_err(|e| format!("Failed to track message: {}", e))
}

/// Checks if auto-checkpoint should be triggered
#[tauri::command]
pub async fn check_auto_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message: String,
) -> Result<bool, String> {
    log::info!("Checking auto-checkpoint for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id.clone(), project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.should_auto_checkpoint(&message).await)
}

/// Triggers cleanup of old checkpoints
#[tauri::command]
pub async fn cleanup_old_checkpoints(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    keep_count: usize,
) -> Result<usize, String> {
    log::info!(
        "Cleaning up old checkpoints for session: {}, keeping {}",
        session_id,
        keep_count
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .storage
        .cleanup_old_checkpoints(&project_id, &session_id, keep_count)
        .map_err(|e| format!("Failed to cleanup checkpoints: {}", e))
}

/// Gets checkpoint settings for a session
#[tauri::command]
pub async fn get_checkpoint_settings(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<serde_json::Value, String> {
    log::info!("Getting checkpoint settings for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let timeline = manager.get_timeline().await;

    Ok(serde_json::json!({
        "auto_checkpoint_enabled": timeline.auto_checkpoint_enabled,
        "checkpoint_strategy": timeline.checkpoint_strategy,
        "total_checkpoints": timeline.total_checkpoints,
        "current_checkpoint_id": timeline.current_checkpoint_id,
    }))
}

/// Clears checkpoint manager for a session (cleanup on session end)
#[tauri::command]
pub async fn clear_checkpoint_manager(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
) -> Result<(), String> {
    log::info!("Clearing checkpoint manager for session: {}", session_id);

    app.remove_manager(&session_id).await;
    Ok(())
}

/// Gets checkpoint state statistics (for debugging/monitoring)
#[tauri::command]
pub async fn get_checkpoint_state_stats(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
) -> Result<serde_json::Value, String> {
    let active_count = app.active_count().await;
    let active_sessions = app.list_active_sessions().await;

    Ok(serde_json::json!({
        "active_managers": active_count,
        "active_sessions": active_sessions,
    }))
}

/// Gets files modified in the last N minutes for a session
#[tauri::command]
pub async fn get_recently_modified_files(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    minutes: i64,
) -> Result<Vec<String>, String> {
    use chrono::{Duration, Utc};

    log::info!(
        "Getting files modified in the last {} minutes for session: {}",
        minutes,
        session_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let since = Utc::now() - Duration::minutes(minutes);
    let modified_files = manager.get_files_modified_since(since).await;

    // Also log the last modification time
    if let Some(last_mod) = manager.get_last_modification_time().await {
        log::info!("Last file modification was at: {}", last_mod);
    }

    Ok(modified_files
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Track session messages from the frontend for checkpointing
#[tauri::command]
pub async fn track_session_messages(
    state: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    messages: Vec<String>,
) -> Result<(), String> {
    log::info!(
        "Tracking {} messages for session {}",
        messages.len(),
        session_id
    );

    let manager = state
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    for message in messages {
        manager
            .track_message(message)
            .await
            .map_err(|e| format!("Failed to track message: {}", e))?;
    }

    Ok(())
}

/// Gets hooks configuration from settings at specified scope
#[tauri::command]
pub async fn get_hooks_config(
    scope: String,
    project_path: Option<String>,
) -> Result<serde_json::Value, String> {
    log::info!(
        "Getting hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            PathBuf::from(path).join(".claude").join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            PathBuf::from(path)
                .join(".claude")
                .join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    if !settings_path.exists() {
        log::info!(
            "Settings file does not exist at {:?}, returning empty hooks",
            settings_path
        );
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings
        .get("hooks")
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Updates hooks configuration in settings at specified scope
#[tauri::command]
pub async fn update_hooks_config(
    scope: String,
    hooks: serde_json::Value,
    project_path: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Updating hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    // Read existing settings or create new
    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Update hooks section
    settings["hooks"] = hooks;

    // Write back with pretty formatting
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok("Hooks configuration updated successfully".to_string())
}

/// Validates a hook command by dry-running it
#[tauri::command]
pub async fn validate_hook_command(command: String) -> Result<serde_json::Value, String> {
    log::info!("Validating hook command syntax");

    // Validate syntax without executing
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-n") // Syntax check only
        .arg("-c")
        .arg(&command);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(serde_json::json!({
                    "valid": true,
                    "message": "Command syntax is valid"
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Ok(serde_json::json!({
                    "valid": false,
                    "message": format!("Syntax error: {}", stderr)
                }))
            }
        }
        Err(e) => Err(format!("Failed to validate command: {}", e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitInfo {
    pub repo_name: String,
    pub branch: String,
    pub is_git_repo: bool,
    pub remote_url: Option<String>,
}

#[tauri::command]
pub fn get_git_info(path: String) -> Result<GitInfo, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(&["-C", &path, "rev-parse", "--show-toplevel"])
        .output();

    match output {
        Ok(result) => {
            if !result.status.success() {
                let folder_name = std::path::Path::new(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                return Ok(GitInfo {
                    repo_name: folder_name,
                    branch: String::new(),
                    is_git_repo: false,
                    remote_url: None,
                });
            }

            let repo_root = String::from_utf8_lossy(&result.stdout).trim().to_string();
            let repo_name = std::path::Path::new(&repo_root)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let branch_output = Command::new("git")
                .args(&["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
                .output();

            let branch = match branch_output {
                Ok(branch_result) if branch_result.status.success() => {
                    String::from_utf8_lossy(&branch_result.stdout)
                        .trim()
                        .to_string()
                }
                _ => String::new(),
            };

            let remote_url = Command::new("git")
                .args(&["-C", &path, "remote", "get-url", "origin"])
                .output()
                .ok()
                .and_then(|o| if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else { None });

            Ok(GitInfo {
                repo_name,
                branch,
                is_git_repo: true,
                remote_url,
            })
        }
        Err(_) => {
            let folder_name = std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            Ok(GitInfo {
                repo_name: folder_name,
                branch: String::new(),
                is_git_repo: false,
                remote_url: None,
            })
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitDiffStat {
    pub additions: i32,
    pub deletions: i32,
}

#[tauri::command]
pub fn get_git_diff_stat(path: String) -> Result<GitDiffStat, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(&["-C", &path, "diff", "--numstat"])
        .output();

    match output {
        Ok(result) => {
            if !result.status.success() {
                return Ok(GitDiffStat {
                    additions: 0,
                    deletions: 0,
                });
            }

            let stdout = String::from_utf8_lossy(&result.stdout);
            let mut total_additions = 0i32;
            let mut total_deletions = 0i32;

            for line in stdout.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let additions_str = parts[0];
                    let deletions_str = parts[1];

                    if additions_str != "-" {
                        if let Ok(add) = additions_str.parse::<i32>() {
                            total_additions += add;
                        }
                    }

                    if deletions_str != "-" {
                        if let Ok(del) = deletions_str.parse::<i32>() {
                            total_deletions += del;
                        }
                    }
                }
            }

            Ok(GitDiffStat {
                additions: total_additions,
                deletions: total_deletions,
            })
        }
        Err(_) => Ok(GitDiffStat {
            additions: 0,
            deletions: 0,
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

#[tauri::command]
pub fn get_worktrees(path: String) -> Result<Vec<WorktreeInfo>, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(&["-C", &path, "worktree", "list", "--porcelain"])
        .output();

    match output {
        Ok(result) => {
            if !result.status.success() {
                return Ok(Vec::new());
            }

            let stdout = String::from_utf8_lossy(&result.stdout);
            let mut worktrees = Vec::new();
            let mut is_main = true;
            let mut current_worktree: Option<(String, String)> = None;

            for line in stdout.lines() {
                if line.starts_with("worktree ") {
                    if let Some((wt_path, branch)) = current_worktree.take() {
                        worktrees.push(WorktreeInfo {
                            path: wt_path,
                            branch,
                            is_main,
                        });
                        is_main = false;
                    }

                    let wt_path = line.strip_prefix("worktree ").unwrap_or("").to_string();
                    current_worktree = Some((wt_path, String::new()));
                } else if line.starts_with("branch ") {
                    if let Some((_, ref mut branch_ref)) = current_worktree.as_mut() {
                        let full_ref = line.strip_prefix("branch ").unwrap_or("");
                        *branch_ref = full_ref
                            .strip_prefix("refs/heads/")
                            .unwrap_or(full_ref)
                            .to_string();
                    }
                } else if line.starts_with("detached") {
                    if let Some((_, ref mut branch_ref)) = current_worktree.as_mut() {
                        *branch_ref = "(detached)".to_string();
                    }
                }
            }

            if let Some((wt_path, branch)) = current_worktree {
                worktrees.push(WorktreeInfo {
                    path: wt_path,
                    branch,
                    is_main,
                });
            }

            Ok(worktrees)
        }
        Err(_) => Ok(Vec::new()),
    }
}

/// Represents a native agent from ~/.claude/agents/
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeAgent {
    pub name: String,
    pub path: String,
    pub description: String,
    pub model: Option<String>,
    pub raw_content: String,
}

/// Represents a skill from ~/.claude/skills/
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub path: String,
    pub description: String,
}

/// Lists all native agents from ~/.claude/agents/
#[tauri::command]
pub async fn list_native_agents() -> Result<Vec<NativeAgent>, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let agents_dir = home.join(".claude").join("agents");

    if !agents_dir.exists() {
        return Ok(Vec::new());
    }

    let mut agents = Vec::new();

    match fs::read_dir(&agents_dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        match read_native_agent(path.to_string_lossy().to_string()).await {
                            Ok(agent) => agents.push(agent),
                            Err(e) => {
                                log::warn!("Failed to read agent {}: {}", name, e);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to read agents directory: {}", e);
        }
    }

    Ok(agents)
}

/// Reads a single native agent from the given path
#[tauri::command]
pub async fn read_native_agent(path: String) -> Result<NativeAgent, String> {
    let file_path = std::path::PathBuf::from(&path);
    let raw_content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read agent file: {}", e))?;

    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let model = extract_frontmatter_model(&raw_content);
    let description = extract_description(&raw_content);

    Ok(NativeAgent {
        name,
        path,
        description,
        model,
        raw_content,
    })
}

/// Extracts the model field from YAML frontmatter
fn extract_frontmatter_model(content: &str) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() || !lines[0].starts_with("---") {
        return None;
    }

    for i in 1..lines.len() {
        if lines[i].starts_with("---") {
            break;
        }
        if lines[i].starts_with("model:") {
            let model_line = lines[i].trim_start_matches("model:").trim();
            if !model_line.is_empty() {
                return Some(model_line.to_string());
            }
        }
    }

    None
}

/// Extracts the first non-empty, non-frontmatter paragraph as description (up to 200 chars)
fn extract_description(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let mut in_frontmatter = false;
    let mut description = String::new();

    for line in lines {
        if line.starts_with("---") {
            in_frontmatter = !in_frontmatter;
            continue;
        }

        if in_frontmatter {
            continue;
        }

        let trimmed = line.trim();
        if !trimmed.is_empty() {
            description = trimmed.to_string();
            break;
        }
    }

    if description.len() > 200 {
        description.truncate(200);
        description.push_str("...");
    }

    description
}

/// Writes a native agent to ~/.claude/agents/{name}.md
#[tauri::command]
pub async fn write_native_agent(name: String, content: String) -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let agents_dir = home.join(".claude").join("agents");

    fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents directory: {}", e))?;

    let file_path = agents_dir.join(format!("{}.md", name));
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write agent file: {}", e))?;

    file_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

/// Deletes a native agent file
#[tauri::command]
pub async fn delete_native_agent(path: String) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.exists() {
        return Err("Agent file does not exist".to_string());
    }

    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete agent file: {}", e))
}

/// Lists all skills from ~/.claude/skills/
#[tauri::command]
pub async fn list_skills() -> Result<Vec<SkillInfo>, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let skills_dir = home.join(".claude").join("skills");

    if !skills_dir.exists() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();

    match fs::read_dir(&skills_dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let skill_md = path.join("SKILL.md");
                    if skill_md.exists() {
                        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                            if let Ok(content) = fs::read_to_string(&skill_md) {
                                let description = content
                                    .lines()
                                    .find(|line| !line.trim().is_empty())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();
                                let desc = if description.len() > 200 {
                                    format!("{}...", &description[..200])
                                } else {
                                    description
                                };

                                skills.push(SkillInfo {
                                    name: name.to_string(),
                                    path: skill_md.to_string_lossy().to_string(),
                                    description: desc,
                                });
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to read skills directory: {}", e);
        }
    }

    Ok(skills)
}

/// Gets global settings from ~/.claude/settings.json
#[tauri::command]
pub async fn get_global_settings() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let settings_path = home.join(".claude").join("settings.json");

    if !settings_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))
}

/// Reads ~/.claude/hooks/resources/commands.conf
#[tauri::command]
pub async fn read_commands_conf() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let conf_path = home.join(".claude").join("hooks").join("resources").join("commands.conf");

    if !conf_path.exists() {
        return Ok(serde_json::json!({ "content": "", "exists": false }));
    }

    let content = fs::read_to_string(&conf_path)
        .map_err(|e| format!("Failed to read commands.conf: {}", e))?;
    Ok(serde_json::json!({ "content": content, "exists": true }))
}

/// Writes to ~/.claude/hooks/resources/commands.conf and verifies with command-guard.py
#[tauri::command]
pub async fn write_and_verify_commands_conf(content: String) -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let conf_path = home.join(".claude").join("hooks").join("resources").join("commands.conf");

    fs::create_dir_all(conf_path.parent().ok_or_else(|| "Invalid path".to_string())?)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    fs::write(&conf_path, content)
        .map_err(|e| format!("Failed to write commands.conf: {}", e))?;

    let guard_script = home.join(".claude").join("hooks").join("command-guard.py");
    if !guard_script.exists() {
        return Ok("Verification skipped: command-guard.py not found".to_string());
    }

    let output = std::process::Command::new("python")
        .arg(guard_script.to_string_lossy().to_string())
        .arg("--verify")
        .output()
        .or_else(|_| {
            std::process::Command::new("python3")
                .arg(home.join(".claude").join("hooks").join("command-guard.py").to_string_lossy().to_string())
                .arg("--verify")
                .output()
        });

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(format!("{}{}", stdout, stderr))
        }
        Err(_) => Ok("Verification skipped: command-guard.py not found".to_string()),
    }
}

/// Checks if c-guard is installed and wired into PreToolUse hooks
#[tauri::command]
pub async fn check_cguard_installed() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let script_path = home.join(".claude").join("hooks").join("command-guard.py");
    let script_exists = script_path.exists();

    let settings_path = home.join(".claude").join("settings.json");
    let hook_wired = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).unwrap_or_default();
        let settings: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();

        settings["hooks"]["PreToolUse"]
            .as_array()
            .map(|arr| {
                arr.iter().any(|entry| {
                    entry
                        .get("hooks")
                        .and_then(|h| h.as_array())
                        .map(|h| {
                            h.iter().any(|hook| {
                                hook.get("command")
                                    .and_then(|c| c.as_str())
                                    .map(|s| s.contains("hook-dispatcher") || s.contains("command-guard"))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    } else {
        false
    };

    Ok(serde_json::json!({
        "script_exists": script_exists,
        "hook_wired": hook_wired,
        "installed": script_exists && hook_wired,
    }))
}

/// Enables or disables command guard by modifying ~/.claude/settings.json
#[tauri::command]
pub async fn set_cguard_enabled(enabled: bool) -> Result<(), String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let settings_path = home.join(".claude").join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let hook_dispatcher_path = format!(
        "C:/Users/{username}/.claude/hooks/hook-dispatcher.sh",
        username = std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
    );

    if enabled {
        if !settings["hooks"].is_object() {
            settings["hooks"] = serde_json::json!({});
        }

        if !settings["hooks"]["PreToolUse"].is_array() {
            settings["hooks"]["PreToolUse"] = serde_json::json!([]);
        }

        if let Some(array) = settings["hooks"]["PreToolUse"].as_array_mut() {
            let has_dispatcher = array.iter().any(|entry| {
                entry
                    .get("hooks")
                    .and_then(|h| h.as_array())
                    .map(|h| {
                        h.iter().any(|hook| {
                            hook.get("command")
                                .and_then(|c| c.as_str())
                                .map(|s| s.contains("hook-dispatcher"))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false)
            });

            if !has_dispatcher {
                array.push(serde_json::json!({
                    "matcher": "*",
                    "hooks": [{
                        "type": "command",
                        "command": hook_dispatcher_path
                    }]
                }));
            }
        }
    } else {
        if let Some(hooks) = settings.get_mut("hooks") {
            if let Some(pre_tool_use) = hooks.get_mut("PreToolUse") {
                if let Some(array) = pre_tool_use.as_array_mut() {
                    array.retain(|entry| {
                        if let Some(hooks_arr) = entry.get("hooks").and_then(|h| h.as_array()) {
                            !hooks_arr.iter().any(|hook| {
                                hook.get("command")
                                    .and_then(|c| c.as_str())
                                    .map(|s| s.contains("hook-dispatcher"))
                                    .unwrap_or(false)
                            })
                        } else {
                            true
                        }
                    });
                }
            }
        }
    }

    let settings_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, settings_str)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

/// Runs the command-guard.py script with the given arguments
#[tauri::command]
pub async fn run_cguard_cli(args: Vec<String>) -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let guard_script = home.join(".claude").join("hooks").join("command-guard.py");

    let output = std::process::Command::new("python")
        .arg(guard_script.to_string_lossy().to_string())
        .args(&args)
        .output()
        .or_else(|_| {
            std::process::Command::new("python3")
                .arg(home.join(".claude").join("hooks").join("command-guard.py").to_string_lossy().to_string())
                .args(&args)
                .output()
        });

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(format!("{}{}", stdout, stderr))
        }
        Err(_) => Err("Python not found".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    /// Helper function to create a test session file
    fn create_test_session_file(
        dir: &PathBuf,
        filename: &str,
        content: &str,
    ) -> Result<(), std::io::Error> {
        let file_path = dir.join(filename);
        let mut file = fs::File::create(file_path)?;
        file.write_all(content.as_bytes())?;
        Ok(())
    }

    #[test]
    fn test_get_project_path_from_sessions_normal_case() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // Create a session file with cwd on the first line
        let content = r#"{"type":"system","cwd":"/Users/test/my-project"}"#;
        create_test_session_file(&project_dir, "session1.jsonl", content).unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/Users/test/my-project");
    }

    #[test]
    fn test_get_project_path_from_sessions_with_hyphen() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // This is the bug scenario - project path contains hyphens
        let content = r#"{"type":"system","cwd":"/Users/test/data-discovery"}"#;
        create_test_session_file(&project_dir, "session1.jsonl", content).unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/Users/test/data-discovery");
    }

    #[test]
    fn test_get_project_path_from_sessions_null_cwd_first_line() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // First line has null cwd, second line has valid path
        let content = format!(
            "{}\n{}",
            r#"{"type":"system","cwd":null}"#,
            r#"{"type":"system","cwd":"/Users/test/valid-path"}"#
        );
        create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/Users/test/valid-path");
    }

    #[test]
    fn test_get_project_path_from_sessions_multiple_lines() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // Multiple lines with cwd appearing on line 5
        let content = format!(
            "{}\n{}\n{}\n{}\n{}",
            r#"{"type":"other"}"#,
            r#"{"type":"system","cwd":null}"#,
            r#"{"type":"message"}"#,
            r#"{"type":"system"}"#,
            r#"{"type":"system","cwd":"/Users/test/project"}"#
        );
        create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/Users/test/project");
    }

    #[test]
    fn test_get_project_path_from_sessions_empty_dir() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "Could not determine project path from session files"
        );
    }

    #[test]
    fn test_get_project_path_from_sessions_no_jsonl_files() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // Create a non-JSONL file
        create_test_session_file(&project_dir, "readme.txt", "Some text").unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_project_path_from_sessions_no_cwd() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // JSONL file without any cwd field
        let content = format!(
            "{}\n{}\n{}",
            r#"{"type":"system"}"#, r#"{"type":"message"}"#, r#"{"type":"other"}"#
        );
        create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_project_path_from_sessions_multiple_sessions() {
        let temp_dir = TempDir::new().unwrap();
        let project_dir = temp_dir.path().to_path_buf();

        // Create multiple session files - should return from first valid one
        create_test_session_file(
            &project_dir,
            "session1.jsonl",
            r#"{"type":"system","cwd":"/path1"}"#,
        )
        .unwrap();
        create_test_session_file(
            &project_dir,
            "session2.jsonl",
            r#"{"type":"system","cwd":"/path2"}"#,
        )
        .unwrap();

        let result = get_project_path_from_sessions(&project_dir);
        assert!(result.is_ok());
        // Should get one of the paths (implementation checks first file it finds)
        let path = result.unwrap();
        assert!(path == "/path1" || path == "/path2");
    }
}

#[tauri::command]
pub async fn list_claude_directory(subpath: String) -> Result<Vec<ClaudeEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let home = dirs::home_dir().ok_or("Could not find home directory")?;
        let mut claude_path = home.join(".claude");

        if !subpath.is_empty() {
            claude_path = claude_path.join(&subpath);
        }

        if !claude_path.exists() {
            return Err(format!("Directory does not exist: {}", subpath));
        }

        let entries = fs::read_dir(&claude_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut dirs = Vec::new();
        let mut files = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let metadata = entry.metadata()
                .map_err(|e| format!("Failed to get metadata: {}", e))?;

            let name = entry.file_name().into_string()
                .unwrap_or_default();

            let entry_path = if subpath.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", subpath, name)
            };

            let modified = metadata.modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|d| {
                    let datetime = std::time::UNIX_EPOCH + d;
                    let datetime: chrono::DateTime<chrono::Utc> = datetime.into();
                    datetime.to_rfc3339()
                })
                .unwrap_or_default();

            let claude_entry = ClaudeEntry {
                name,
                path: entry_path,
                is_dir: path.is_dir(),
                size: if path.is_dir() { 0 } else { metadata.len() },
                modified,
            };

            if path.is_dir() {
                dirs.push(claude_entry);
            } else {
                files.push(claude_entry);
            }
        }

        dirs.sort_by(|a, b| a.name.cmp(&b.name));
        files.sort_by(|a, b| a.name.cmp(&b.name));

        dirs.extend(files);
        Ok(dirs)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn read_claude_file(subpath: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let home = dirs::home_dir().ok_or("Could not find home directory")?;
        let file_path = home.join(".claude").join(&subpath);

        let metadata = fs::metadata(&file_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;

        if metadata.len() > 1_000_000 {
            return Err("File is too large (max 1MB)".to_string());
        }

        fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read file: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn list_session_logs() -> Result<Vec<SessionLogEntry>, String> {
    tokio::task::spawn_blocking(|| {
        let home = dirs::home_dir().ok_or("Could not find home directory")?;
        let projects_dir = home.join(".claude").join("projects");

        if !projects_dir.exists() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();

        let projects = fs::read_dir(&projects_dir)
            .map_err(|e| format!("Failed to read projects directory: {}", e))?;

        for project_entry in projects {
            let project_entry = project_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let project_path = project_entry.path();

            if !project_path.is_dir() {
                continue;
            }

            let encoded_name = project_entry.file_name().into_string()
                .unwrap_or_default();
            let decoded_path = encoded_name.replace("-", "/");

            let session_files = match fs::read_dir(&project_path) {
                Ok(files) => files,
                Err(_) => continue,
            };

            for session_entry in session_files {
                if let Ok(session_entry) = session_entry {
                    let session_path = session_entry.path();

                    if !session_path.is_file() {
                        continue;
                    }

                    if let Some(Some("jsonl")) = session_path.extension().and_then(|e| e.to_str()).map(|s| Some(s)) {
                        let session_id = session_path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string();

                        if let Ok(metadata) = session_path.metadata() {
                            let modified = metadata.modified()
                                .ok()
                                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                                .map(|d| {
                                    let datetime = std::time::UNIX_EPOCH + d;
                                    let datetime: chrono::DateTime<chrono::Utc> = datetime.into();
                                    datetime.to_rfc3339()
                                })
                                .unwrap_or_default();

                            let file_path = format!("projects/{}/{}.jsonl", encoded_name, session_id);

                            entries.push(SessionLogEntry {
                                session_id,
                                project_path: decoded_path.clone(),
                                file_path,
                                modified,
                                size: metadata.len(),
                            });
                        }
                    }
                }
            }
        }

        entries.sort_by(|a, b| b.modified.cmp(&a.modified));
        entries.truncate(200);

        Ok(entries)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

fn ccode_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    let dir = home.join(".ccode");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create ~/.ccode: {}", e))?;
    }
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn read_session_status(session_id: String) -> Result<serde_json::Value, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    let path = home.join(".ccode").join("status").join(format!("{}.json", session_id));
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session status: {}", e))?;
    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse session status: {}", e))
}

#[tauri::command]
pub fn read_ccode_settings() -> Result<serde_json::Value, String> {
    let path = ccode_settings_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ~/.ccode/settings.json: {}", e))?;
    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse ~/.ccode/settings.json: {}", e))
}

#[tauri::command]
pub fn write_ccode_settings(settings: serde_json::Value) -> Result<(), String> {
    let path = ccode_settings_path()?;
    let tmp = path.with_extension("json.tmp");
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&tmp, &contents)
        .map_err(|e| format!("Failed to write temp settings file: {}", e))?;
    fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to rename settings file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct PlanFile {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
}

#[tauri::command]
pub fn list_plan_files() -> Result<Vec<PlanFile>, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    let plans_dir = home.join(".claude").join("plans");
    if !plans_dir.exists() {
        return Ok(vec![]);
    }
    let mut plans: Vec<PlanFile> = std::fs::read_dir(&plans_dir)
        .map_err(|e| format!("Failed to read plans directory: {}", e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? != "md" {
                return None;
            }
            let metadata = path.metadata().ok()?;
            let modified_ms = metadata
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            let name = path.file_stem()?.to_str()?.to_string();
            Some(PlanFile {
                path: path.to_string_lossy().to_string(),
                name,
                modified_ms,
            })
        })
        .collect();
    plans.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(plans)
}

#[tauri::command]
pub fn read_plan_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read plan file: {}", e))
}
