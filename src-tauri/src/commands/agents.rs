use anyhow::Result;
use chrono;
use dirs;
use log::{debug, error, info, warn};
use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
// Sidecar support removed; using system binary execution only
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::Command;

/// Finds the full path to the claude binary
/// This is necessary because macOS apps have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}

/// Represents a CC Agent stored in JSON file
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub system_prompt: String,
    pub default_task: Option<String>,
    pub model: String,
    pub enable_file_read: bool,
    pub enable_file_write: bool,
    pub enable_network: bool,
    pub hooks: Option<String>, // JSON string of hooks configuration
    pub created_at: String,
    pub updated_at: String,
}

/// Represents an agent execution run
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentRun {
    pub id: i64,
    pub agent_id: String,
    pub agent_name: String,
    pub agent_icon: String,
    pub task: String,
    pub model: String,
    pub project_path: String,
    pub session_id: String, // UUID session ID from Claude Code
    pub status: String,     // 'pending', 'running', 'completed', 'failed', 'cancelled'
    pub pid: Option<u32>,
    pub process_started_at: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

/// Represents runtime metrics calculated from JSONL
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentRunMetrics {
    pub duration_ms: Option<i64>,
    pub total_tokens: Option<i64>,
    pub cost_usd: Option<f64>,
    pub message_count: Option<i64>,
}

/// Combined agent run with real-time metrics
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentRunWithMetrics {
    #[serde(flatten)]
    pub run: AgentRun,
    pub metrics: Option<AgentRunMetrics>,
    pub output: Option<String>, // Real-time JSONL content
}

/// Agent export format
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentExport {
    pub version: u32,
    pub exported_at: String,
    pub agent: AgentData,
}

/// Agent data within export
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentData {
    pub name: String,
    pub icon: String,
    pub system_prompt: String,
    pub default_task: Option<String>,
    pub model: String,
    pub hooks: Option<String>,
}


/// Real-time JSONL reading and processing functions
impl AgentRunMetrics {
    /// Calculate metrics from JSONL content
    pub fn from_jsonl(jsonl_content: &str) -> Self {
        let mut total_tokens = 0i64;
        let mut cost_usd = 0.0f64;
        let mut message_count = 0i64;
        let mut start_time: Option<chrono::DateTime<chrono::Utc>> = None;
        let mut end_time: Option<chrono::DateTime<chrono::Utc>> = None;

        for line in jsonl_content.lines() {
            if let Ok(json) = serde_json::from_str::<JsonValue>(line) {
                message_count += 1;

                // Track timestamps
                if let Some(timestamp_str) = json.get("timestamp").and_then(|t| t.as_str()) {
                    if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(timestamp_str) {
                        let utc_time = timestamp.with_timezone(&chrono::Utc);
                        if start_time.is_none() || utc_time < start_time.unwrap() {
                            start_time = Some(utc_time);
                        }
                        if end_time.is_none() || utc_time > end_time.unwrap() {
                            end_time = Some(utc_time);
                        }
                    }
                }

                // Extract token usage - check both top-level and nested message.usage
                let usage = json
                    .get("usage")
                    .or_else(|| json.get("message").and_then(|m| m.get("usage")));

                if let Some(usage) = usage {
                    if let Some(input_tokens) = usage.get("input_tokens").and_then(|t| t.as_i64()) {
                        total_tokens += input_tokens;
                    }
                    if let Some(output_tokens) = usage.get("output_tokens").and_then(|t| t.as_i64())
                    {
                        total_tokens += output_tokens;
                    }
                }

                // Extract cost information
                if let Some(cost) = json.get("cost").and_then(|c| c.as_f64()) {
                    cost_usd += cost;
                }
            }
        }

        let duration_ms = match (start_time, end_time) {
            (Some(start), Some(end)) => Some((end - start).num_milliseconds()),
            _ => None,
        };

        Self {
            duration_ms,
            total_tokens: if total_tokens > 0 {
                Some(total_tokens)
            } else {
                None
            },
            cost_usd: if cost_usd > 0.0 { Some(cost_usd) } else { None },
            message_count: if message_count > 0 {
                Some(message_count)
            } else {
                None
            },
        }
    }
}

/// Read JSONL content from a session file
pub async fn read_session_jsonl(session_id: &str, project_path: &str) -> Result<String, String> {
    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude")
        .join("projects");

    // Encode project path to match Claude Code's directory naming
    let encoded_project = project_path.replace('/', "-");
    let project_dir = claude_dir.join(&encoded_project);
    let session_file = project_dir.join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Err(format!(
            "Session file not found: {}",
            session_file.display()
        ));
    }

    match tokio::fs::read_to_string(&session_file).await {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read session file: {}", e)),
    }
}

/// Get agent run with real-time metrics
pub async fn get_agent_run_with_metrics(run: AgentRun) -> AgentRunWithMetrics {
    match read_session_jsonl(&run.session_id, &run.project_path).await {
        Ok(jsonl_content) => {
            let metrics = AgentRunMetrics::from_jsonl(&jsonl_content);
            AgentRunWithMetrics {
                run,
                metrics: Some(metrics),
                output: Some(jsonl_content),
            }
        }
        Err(e) => {
            log::warn!("Failed to read JSONL for session {}: {}", run.session_id, e);
            AgentRunWithMetrics {
                run,
                metrics: None,
                output: None,
            }
        }
    }
}

fn get_ccode_dir() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())
        .map(|h| h.join(".ccode"))
}

fn agents_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_ccode_dir()?.join("agents");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn runs_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_ccode_dir()?.join("runs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_agent_file(agent: &Agent) -> Result<(), String> {
    let dir = agents_dir()?;
    let tmp = dir.join(format!("{}.tmp", agent.id));
    let path = dir.join(format!("{}.json", agent.id));
    let content = serde_json::to_string_pretty(agent)
        .map_err(|e| format!("Failed to serialize agent: {}", e))?;
    std::fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_agent_file(id: &str) -> Result<Agent, String> {
    let path = agents_dir()?.join(format!("{}.json", id));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Agent {} not found: {}", id, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse agent {}: {}", id, e))
}

fn delete_agent_file(id: &str) -> Result<(), String> {
    let path = agents_dir()?.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn list_agent_files() -> Result<Vec<Agent>, String> {
    let dir = agents_dir()?;
    let mut agents = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(agent) = serde_json::from_str::<Agent>(&content) {
                        agents.push(agent);
                    }
                }
            }
        }
    }
    agents.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(agents)
}

fn write_run_file(run: &AgentRun) -> Result<(), String> {
    let dir = runs_dir()?;
    let tmp = dir.join(format!("{}.tmp", run.id));
    let path = dir.join(format!("{}.json", run.id));
    let content = serde_json::to_string_pretty(run)
        .map_err(|e| format!("Failed to serialize run: {}", e))?;
    std::fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_run_file(id: i64) -> Result<AgentRun, String> {
    let path = runs_dir()?.join(format!("{}.json", id));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Run {} not found: {}", id, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse run {}: {}", id, e))
}

fn list_run_files(agent_id_filter: Option<&str>) -> Result<Vec<AgentRun>, String> {
    let dir = runs_dir()?;
    let mut runs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(run) = serde_json::from_str::<AgentRun>(&content) {
                        if agent_id_filter.map(|id| run.agent_id == id).unwrap_or(true) {
                            runs.push(run);
                        }
                    }
                }
            }
        }
    }
    runs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(runs)
}

async fn update_run_async(run_id: i64, updater: impl FnOnce(&mut AgentRun)) -> Result<(), String> {
    let path = runs_dir()?.join(format!("{}.json", run_id));
    let content = tokio::fs::read_to_string(&path).await
        .map_err(|e| format!("Failed to read run {}: {}", run_id, e))?;
    let mut run: AgentRun = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse run {}: {}", run_id, e))?;
    updater(&mut run);
    let new_content = serde_json::to_string_pretty(&run)
        .map_err(|e| format!("Failed to serialize run: {}", e))?;
    let tmp = path.with_extension("tmp");
    tokio::fs::write(&tmp, &new_content).await.map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, &path).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// List all agents
#[tauri::command]
pub async fn list_agents() -> Result<Vec<Agent>, String> {
    list_agent_files()
}

/// Create a new agent
#[tauri::command]
pub async fn create_agent(
    name: String,
    icon: String,
    system_prompt: String,
    default_task: Option<String>,
    model: Option<String>,
    enable_file_read: Option<bool>,
    enable_file_write: Option<bool>,
    enable_network: Option<bool>,
    hooks: Option<String>,
) -> Result<Agent, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let agent = Agent {
        id: Uuid::new_v4().to_string(),
        name,
        icon,
        system_prompt,
        default_task,
        model: model.unwrap_or_else(|| "sonnet".to_string()),
        enable_file_read: enable_file_read.unwrap_or(true),
        enable_file_write: enable_file_write.unwrap_or(true),
        enable_network: enable_network.unwrap_or(false),
        hooks,
        created_at: now.clone(),
        updated_at: now,
    };
    write_agent_file(&agent)?;
    Ok(agent)
}

/// Update an existing agent
#[tauri::command]
pub async fn update_agent(
    id: String,
    name: String,
    icon: String,
    system_prompt: String,
    default_task: Option<String>,
    model: Option<String>,
    enable_file_read: Option<bool>,
    enable_file_write: Option<bool>,
    enable_network: Option<bool>,
    hooks: Option<String>,
) -> Result<Agent, String> {
    let mut agent = read_agent_file(&id)?;
    agent.name = name;
    agent.icon = icon;
    agent.system_prompt = system_prompt;
    agent.default_task = default_task;
    agent.model = model.unwrap_or_else(|| "sonnet".to_string());
    if let Some(v) = enable_file_read { agent.enable_file_read = v; }
    if let Some(v) = enable_file_write { agent.enable_file_write = v; }
    if let Some(v) = enable_network { agent.enable_network = v; }
    agent.hooks = hooks;
    agent.updated_at = chrono::Utc::now().to_rfc3339();
    write_agent_file(&agent)?;
    Ok(agent)
}

/// Delete an agent
#[tauri::command]
pub async fn delete_agent(id: String) -> Result<(), String> {
    delete_agent_file(&id)
}

/// Get a single agent by ID
#[tauri::command]
pub async fn get_agent(id: String) -> Result<Agent, String> {
    read_agent_file(&id)
}

/// List agent runs (optionally filtered by agent_id)
#[tauri::command]
pub async fn list_agent_runs(agent_id: Option<String>) -> Result<Vec<AgentRun>, String> {
    list_run_files(agent_id.as_deref())
}

/// Get a single agent run by ID
#[tauri::command]
pub async fn get_agent_run(id: i64) -> Result<AgentRun, String> {
    read_run_file(id)
}

/// Get agent run with real-time metrics from JSONL
#[tauri::command]
pub async fn get_agent_run_with_real_time_metrics(id: i64) -> Result<AgentRunWithMetrics, String> {
    let run = get_agent_run(id).await?;
    Ok(get_agent_run_with_metrics(run).await)
}

/// List agent runs with real-time metrics from JSONL
#[tauri::command]
pub async fn list_agent_runs_with_metrics(agent_id: Option<String>) -> Result<Vec<AgentRunWithMetrics>, String> {
    let runs = list_agent_runs(agent_id).await?;
    let mut result = Vec::new();
    for run in runs {
        result.push(get_agent_run_with_metrics(run).await);
    }
    Ok(result)
}

/// Execute a CC agent with streaming output
#[tauri::command]
pub async fn execute_agent(
    app: AppHandle,
    agent_id: String,
    project_path: String,
    task: String,
    model: Option<String>,
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<i64, String> {
    info!("Executing agent {} with task: {}", agent_id, task);

    let agent = get_agent(agent_id.clone()).await?;
    let execution_model = model.unwrap_or(agent.model.clone());

    // Create .claude/settings.json with agent hooks if it doesn't exist
    if let Some(hooks_json) = &agent.hooks {
        let claude_dir = std::path::Path::new(&project_path).join(".claude");
        let settings_path = claude_dir.join("settings.json");

        // Create .claude directory if it doesn't exist
        if !claude_dir.exists() {
            std::fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            info!("Created .claude directory at: {:?}", claude_dir);
        }

        // Check if settings.json already exists
        if !settings_path.exists() {
            // Parse the hooks JSON
            let hooks: serde_json::Value = serde_json::from_str(hooks_json)
                .map_err(|e| format!("Failed to parse agent hooks: {}", e))?;

            // Create a settings object with just the hooks
            let settings = serde_json::json!({
                "hooks": hooks
            });

            // Write the settings file
            let settings_content = serde_json::to_string_pretty(&settings)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;

            std::fs::write(&settings_path, settings_content)
                .map_err(|e| format!("Failed to write settings.json: {}", e))?;

            info!(
                "Created settings.json with agent hooks at: {:?}",
                settings_path
            );
        } else {
            info!("settings.json already exists at: {:?}", settings_path);
        }
    }

    let run_id = chrono::Utc::now().timestamp_millis();
    let now_str = chrono::Utc::now().to_rfc3339();
    let run = AgentRun {
        id: run_id,
        agent_id: agent_id.clone(),
        agent_name: agent.name.clone(),
        agent_icon: agent.icon.clone(),
        task: task.clone(),
        model: execution_model.clone(),
        project_path: project_path.clone(),
        session_id: String::new(),
        status: "pending".to_string(),
        pid: None,
        process_started_at: None,
        created_at: now_str,
        completed_at: None,
    };
    write_run_file(&run)?;

    info!("Running agent '{}'", agent.name);
    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to find claude binary: {}", e);
            return Err(e);
        }
    };

    let args = vec![
        "-p".to_string(),
        task.clone(),
        "--system-prompt".to_string(),
        agent.system_prompt.clone(),
        "--model".to_string(),
        execution_model.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    spawn_agent_system(
        app,
        run_id,
        agent.name.clone(),
        claude_path,
        args,
        project_path,
        task,
        execution_model,
        registry,
    )
    .await
}

/// Creates a system binary command for agent execution
fn create_agent_system_command(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
) -> Command {
    let mut cmd = create_command_with_env(claude_path);

    // Add all arguments
    for arg in args {
        cmd.arg(arg);
    }

    cmd.current_dir(project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd
}

/// Spawn agent using system binary command
async fn spawn_agent_system(
    app: AppHandle,
    run_id: i64,
    agent_name: String,
    claude_path: String,
    args: Vec<String>,
    project_path: String,
    task: String,
    execution_model: String,
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<i64, String> {
    // Build the command
    let mut cmd = create_agent_system_command(&claude_path, args, &project_path);

    info!("Spawning Claude system process...");
    let mut child = cmd.spawn().map_err(|e| {
        error!("Failed to spawn Claude process: {}", e);
        format!("Failed to spawn Claude: {}", e)
    })?;

    info!("Using Stdio::null() for stdin - no input expected");

    let pid = child.id().unwrap_or(0);
    let now = chrono::Utc::now().to_rfc3339();
    info!("Claude process spawned successfully with PID: {}", pid);

    let _ = update_run_async(run_id, |r| {
        r.status = "running".to_string();
        r.pid = Some(pid);
        r.process_started_at = Some(now);
    }).await;
    info!("Updated run with running status and PID");

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
    info!("📡 Set up stdout/stderr readers");

    // Create readers
    let stdout_reader = TokioBufReader::new(stdout);
    let stderr_reader = TokioBufReader::new(stderr);

    // Shared state for collecting session ID and live output
    let session_id = std::sync::Arc::new(Mutex::new(String::new()));
    let live_output = std::sync::Arc::new(Mutex::new(String::new()));
    let start_time = std::time::Instant::now();

    // Spawn tasks to read stdout and stderr
    let app_handle = app.clone();
    let session_id_clone = session_id.clone();
    let live_output_clone = live_output.clone();
    let registry_clone = registry.0.clone();
    let first_output = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let first_output_clone = first_output.clone();

    let stdout_task = tokio::spawn(async move {
        info!("📖 Starting to read Claude stdout...");
        let mut lines = stdout_reader.lines();
        let mut line_count = 0;

        while let Ok(Some(line)) = lines.next_line().await {
            line_count += 1;

            if !first_output_clone.load(std::sync::atomic::Ordering::Relaxed) {
                info!("First output received from Claude process! Line: {}", line);
                first_output_clone.store(true, std::sync::atomic::Ordering::Relaxed);
            }

            if line_count <= 5 {
                info!("stdout[{}]: {}", line_count, line);
            } else {
                debug!("stdout[{}]: {}", line_count, line);
            }

            // Store live output in both local buffer and registry
            if let Ok(mut output) = live_output_clone.lock() {
                output.push_str(&line);
                output.push('\n');
            }

            // Also store in process registry for cross-session access
            let _ = registry_clone.append_live_output(run_id, &line);

            // Extract session ID from JSONL output
            if let Ok(json) = serde_json::from_str::<JsonValue>(&line) {
                // Claude Code uses "session_id" (underscore), not "sessionId"
                if json.get("type").and_then(|t| t.as_str()) == Some("system")
                    && json.get("subtype").and_then(|s| s.as_str()) == Some("init")
                {
                    if let Some(sid) = json.get("session_id").and_then(|s| s.as_str()) {
                        if let Ok(mut current_session_id) = session_id_clone.lock() {
                            if current_session_id.is_empty() {
                                *current_session_id = sid.to_string();
                                info!("Extracted session ID: {}", sid);
                                let sid_for_update = sid.to_string();
                                let run_id_for_update = run_id;
                                tokio::spawn(async move {
                                    let _ = update_run_async(run_id_for_update, |r| {
                                        r.session_id = sid_for_update.clone();
                                    }).await;
                                });
                            }
                        }
                    }
                }
            }

            // Emit the line to the frontend with run_id for isolation
            let _ = app_handle.emit(&format!("agent-output:{}", run_id), &line);
            // Also emit to the generic event for backward compatibility
            let _ = app_handle.emit("agent-output", &line);
        }

        info!(
            "📖 Finished reading Claude stdout. Total lines: {}",
            line_count
        );
    });

    let app_handle_stderr = app.clone();
    let first_error = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let first_error_clone = first_error.clone();

    let stderr_task = tokio::spawn(async move {
        info!("📖 Starting to read Claude stderr...");
        let mut lines = stderr_reader.lines();
        let mut error_count = 0;

        while let Ok(Some(line)) = lines.next_line().await {
            error_count += 1;

            if !first_error_clone.load(std::sync::atomic::Ordering::Relaxed) {
                warn!("First error output from Claude process! Line: {}", line);
                first_error_clone.store(true, std::sync::atomic::Ordering::Relaxed);
            }

            error!("stderr[{}]: {}", error_count, line);
            // Emit error lines to the frontend with run_id for isolation
            let _ = app_handle_stderr.emit(&format!("agent-error:{}", run_id), &line);
            // Also emit to the generic event for backward compatibility
            let _ = app_handle_stderr.emit("agent-error", &line);
        }

        if error_count > 0 {
            warn!(
                "📖 Finished reading Claude stderr. Total error lines: {}",
                error_count
            );
        } else {
            info!("📖 Finished reading Claude stderr. No errors.");
        }
    });

    registry
        .0
        .register_process(
            run_id,
            0,
            agent_name,
            pid,
            project_path.clone(),
            task.clone(),
            execution_model.clone(),
            child,
        )
        .map_err(|e| format!("Failed to register process: {}", e))?;
    info!("Registered process in registry");

    tokio::spawn(async move {
        info!("Starting process monitoring...");

        // Wait for first output with timeout
        for i in 0..300 {
            if first_output.load(std::sync::atomic::Ordering::Relaxed) {
                info!("Output detected after {}ms, continuing normal execution", i * 100);
                break;
            }

            if i == 299 {
                warn!("TIMEOUT: No output from Claude process after 30 seconds");
                warn!("Process likely stuck waiting for input, attempting to kill PID: {}", pid);
                let kill_result = std::process::Command::new("kill")
                    .arg("-TERM")
                    .arg(pid.to_string())
                    .output();

                match kill_result {
                    Ok(output) if output.status.success() => {
                        warn!("Successfully sent TERM signal to process");
                    }
                    Ok(_) => {
                        warn!("Failed to kill process with TERM, trying KILL");
                        let _ = std::process::Command::new("kill")
                            .arg("-KILL")
                            .arg(pid.to_string())
                            .output();
                    }
                    Err(e) => {
                        warn!("Error killing process: {}", e);
                    }
                }

                let _ = update_run_async(run_id, |r| {
                    r.status = "failed".to_string();
                    r.completed_at = Some(chrono::Utc::now().to_rfc3339());
                }).await;

                let _ = app.emit("agent-complete", false);
                let _ = app.emit(&format!("agent-complete:{}", run_id), false);
                return;
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        info!("Waiting for stdout/stderr reading to complete...");
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let duration_ms = start_time.elapsed().as_millis() as i64;
        info!("Process execution took {} ms", duration_ms);

        let extracted_session_id = if let Ok(sid) = session_id.lock() {
            sid.clone()
        } else {
            String::new()
        };

        info!("Claude process execution monitoring complete");

        let _ = update_run_async(run_id, |r| {
            r.session_id = extracted_session_id.clone();
            r.status = "completed".to_string();
            r.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }).await;

        // Cleanup will be handled by the cleanup_finished_processes function

        let _ = app.emit("agent-complete", true);
        let _ = app.emit(&format!("agent-complete:{}", run_id), true);
    });

    Ok(run_id)
}

/// List all currently running agent sessions
#[tauri::command]
pub async fn list_running_sessions(
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<AgentRun>, String> {
    let mut runs: Vec<AgentRun> = list_run_files(None)?
        .into_iter()
        .filter(|r| r.status == "running")
        .collect();

    let registry_run_ids: std::collections::HashSet<i64> = registry
        .0
        .get_running_agent_processes()?
        .iter()
        .map(|p| p.run_id)
        .collect();

    runs.retain(|r| registry_run_ids.contains(&r.id));
    Ok(runs)
}

/// Kill a running agent session
#[tauri::command]
pub async fn kill_agent_session(
    app: AppHandle,
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<bool, String> {
    info!("Attempting to kill agent session {}", run_id);

    let killed_via_registry = match registry.0.kill_process(run_id).await {
        Ok(success) => {
            if success {
                info!("Successfully killed process {} via registry", run_id);
                true
            } else {
                warn!("Process {} not found in registry", run_id);
                false
            }
        }
        Err(e) => {
            warn!("Failed to kill process {} via registry: {}", run_id, e);
            false
        }
    };

    if !killed_via_registry {
        if let Ok(run) = read_run_file(run_id) {
            if let Some(pid) = run.pid {
                info!("Attempting fallback kill for PID {} from file", pid);
                let _ = registry.0.kill_process_by_pid(run_id, pid)?;
            }
        }
    }

    let was_running = update_run_async(run_id, |r| {
        if r.status == "running" {
            r.status = "cancelled".to_string();
            r.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }).await.is_ok();

    let _ = app.emit(&format!("agent-cancelled:{}", run_id), true);

    Ok(killed_via_registry || was_running)
}

/// Get the status of a specific agent session
#[tauri::command]
pub async fn get_session_status(run_id: i64) -> Result<Option<String>, String> {
    match read_run_file(run_id) {
        Ok(run) => Ok(Some(run.status)),
        Err(_) => Ok(None),
    }
}

/// Cleanup finished processes and update their status
#[tauri::command]
pub async fn cleanup_finished_processes() -> Result<Vec<i64>, String> {
    let running: Vec<AgentRun> = list_run_files(None)?
        .into_iter()
        .filter(|r| r.status == "running" && r.pid.is_some())
        .collect();

    let mut cleaned = Vec::new();
    for run in running {
        let pid = run.pid.unwrap() as i64;
        let is_running = if cfg!(target_os = "windows") {
            match std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV"])
                .output()
            {
                Ok(output) => String::from_utf8_lossy(&output.stdout).lines().count() > 1,
                Err(_) => false,
            }
        } else {
            match std::process::Command::new("kill").args(["-0", &pid.to_string()]).output() {
                Ok(output) => output.status.success(),
                Err(_) => false,
            }
        };

        if !is_running {
            let run_id = run.id;
            let _ = update_run_async(run_id, |r| {
                r.status = "completed".to_string();
                r.completed_at = Some(chrono::Utc::now().to_rfc3339());
            }).await;
            cleaned.push(run_id);
        }
    }
    Ok(cleaned)
}

/// Get live output from a running process
#[tauri::command]
pub async fn get_live_session_output(
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<String, String> {
    registry.0.get_live_output(run_id)
}

/// Get real-time output for a running session by reading its JSONL file with live output fallback
#[tauri::command]
pub async fn get_session_output(
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<String, String> {
    let run = get_agent_run(run_id).await?;

    // If no session ID yet, try to get live output from registry
    if run.session_id.is_empty() {
        let live_output = registry.0.get_live_output(run_id)?;
        if !live_output.is_empty() {
            return Ok(live_output);
        }
        return Ok(String::new());
    }

    // Get the Claude directory
    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    // Find the correct project directory by searching for the session file
    let projects_dir = claude_dir.join("projects");

    // Check if projects directory exists
    if !projects_dir.exists() {
        log::error!("Projects directory not found at: {:?}", projects_dir);
        return Err("Projects directory not found".to_string());
    }

    // Search for the session file in all project directories
    let mut session_file_path = None;
    log::info!(
        "Searching for session file {} in all project directories",
        run.session_id
    );

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
                log::debug!("Checking project directory: {}", dir_name);

                let potential_session_file = path.join(format!("{}.jsonl", run.session_id));
                if potential_session_file.exists() {
                    log::info!("Found session file at: {:?}", potential_session_file);
                    session_file_path = Some(potential_session_file);
                    break;
                } else {
                    log::debug!("Session file not found in: {}", dir_name);
                }
            }
        }
    } else {
        log::error!("Failed to read projects directory");
    }

    // If we found the session file, read it
    if let Some(session_path) = session_file_path {
        match tokio::fs::read_to_string(&session_path).await {
            Ok(content) => Ok(content),
            Err(e) => {
                log::error!(
                    "Failed to read session file {}: {}",
                    session_path.display(),
                    e
                );
                // Fallback to live output if file read fails
                let live_output = registry.0.get_live_output(run_id)?;
                Ok(live_output)
            }
        }
    } else {
        // If session file not found, try the old method as fallback
        log::warn!(
            "Session file not found for {}, trying legacy method",
            run.session_id
        );
        match read_session_jsonl(&run.session_id, &run.project_path).await {
            Ok(content) => Ok(content),
            Err(_) => {
                // Final fallback to live output
                let live_output = registry.0.get_live_output(run_id)?;
                Ok(live_output)
            }
        }
    }
}

/// Stream real-time session output by watching the JSONL file
#[tauri::command]
pub async fn stream_session_output(
    app: AppHandle,
    run_id: i64,
) -> Result<(), String> {
    let run = get_agent_run(run_id).await?;

    // If no session ID yet, can't stream
    if run.session_id.is_empty() {
        return Err("Session not started yet".to_string());
    }

    let session_id = run.session_id.clone();
    let project_path = run.project_path.clone();

    // Spawn a task to monitor the file
    tokio::spawn(async move {
        let claude_dir = match dirs::home_dir() {
            Some(home) => home.join(".claude").join("projects"),
            None => return,
        };

        let encoded_project = project_path.replace('/', "-");
        let project_dir = claude_dir.join(&encoded_project);
        let session_file = project_dir.join(format!("{}.jsonl", session_id));

        let mut last_size = 0u64;

        // Monitor file changes continuously while session is running
        loop {
            if session_file.exists() {
                if let Ok(metadata) = tokio::fs::metadata(&session_file).await {
                    let current_size = metadata.len();

                    if current_size > last_size {
                        // File has grown, read new content
                        if let Ok(content) = tokio::fs::read_to_string(&session_file).await {
                            let _ = app
                                .emit("session-output-update", &format!("{}:{}", run_id, content));
                        }
                        last_size = current_size;
                    }
                }
            } else {
                // If session file doesn't exist yet, keep waiting
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }

            match read_run_file(run_id) {
                Ok(run) if run.status != "running" => {
                    debug!("Session {} is no longer running, stopping stream", run_id);
                    break;
                }
                _ => {}
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        debug!("Stopped streaming for session {}", run_id);
    });

    Ok(())
}

/// Export a single agent to JSON format
#[tauri::command]
pub async fn export_agent(id: String) -> Result<String, String> {
    let agent = read_agent_file(&id)?;
    let export_data = serde_json::json!({
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "agent": {
            "name": agent.name,
            "icon": agent.icon,
            "system_prompt": agent.system_prompt,
            "default_task": agent.default_task,
            "model": agent.model,
            "hooks": agent.hooks,
        }
    });
    serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
}

/// Export agent to file with native dialog
#[tauri::command]
pub async fn export_agent_to_file(id: String, file_path: String) -> Result<(), String> {
    let json_data = export_agent(id).await?;
    std::fs::write(&file_path, json_data).map_err(|e| e.to_string())
}

/// Get the stored Claude binary path from settings
#[tauri::command]
pub async fn get_claude_binary_path() -> Result<Option<String>, String> {
    let path = match dirs::home_dir() {
        Some(h) => h.join(".ccode").join("settings.json"),
        None => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&content).unwrap_or_default();
    Ok(map.get("claude_binary_path").and_then(|v| v.as_str()).map(String::from))
}

/// Set the Claude binary path in settings
#[tauri::command]
pub async fn set_claude_binary_path(path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    let has_directory_component = path_buf.parent()
        .map(|p| p != std::path::Path::new("")).unwrap_or(false);
    if has_directory_component && !path_buf.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&path_buf)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err(format!("File is not executable: {}", path));
        }
    }

    let ccode_dir = dirs::home_dir()
        .ok_or("No home dir")?
        .join(".ccode");
    std::fs::create_dir_all(&ccode_dir).map_err(|e| e.to_string())?;
    let settings_path = ccode_dir.join("settings.json");
    let mut map: serde_json::Map<String, serde_json::Value> = if settings_path.exists() {
        let c = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&c).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    map.insert("claude_binary_path".to_string(), path.into());
    let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    let tmp = settings_path.with_extension("tmp");
    std::fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &settings_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// List all available Claude installations on the system
#[tauri::command]
pub async fn list_claude_installations(
    _app: AppHandle,
) -> Result<Vec<crate::claude_binary::ClaudeInstallation>, String> {
    let installations = crate::claude_binary::discover_claude_installations();

    if installations.is_empty() {
        return Err("No Claude Code installations found on the system".to_string());
    }

    Ok(installations)
}

/// Helper function to create a tokio Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    // Convert std::process::Command to tokio::process::Command
    let _std_cmd = crate::claude_binary::create_command_with_env(program);

    // Create a new tokio Command from the program path
    let mut tokio_cmd = Command::new(program);

    // Copy over all environment variables from the std::process::Command
    // This is a workaround since we can't directly convert between the two types
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

    // Ensure PATH contains common Homebrew locations
    if let Ok(existing_path) = std::env::var("PATH") {
        let mut paths: Vec<&str> = existing_path.split(':').collect();
        for p in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].iter() {
            if !paths.contains(p) {
                paths.push(p);
            }
        }
        let joined = paths.join(":");
        tokio_cmd.env("PATH", joined);
    } else {
        tokio_cmd.env("PATH", "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
    }

    tokio_cmd
}

/// Import an agent from JSON data
#[tauri::command]
pub async fn import_agent(json_data: String) -> Result<Agent, String> {
    let export_data: AgentExport = serde_json::from_str(&json_data)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;
    if export_data.version != 1 {
        return Err(format!("Unsupported export version: {}", export_data.version));
    }
    let data = export_data.agent;
    let existing = list_agent_files()?;
    let final_name = if existing.iter().any(|a| a.name == data.name) {
        format!("{} (Imported)", data.name)
    } else {
        data.name
    };
    let now = chrono::Utc::now().to_rfc3339();
    let agent = Agent {
        id: Uuid::new_v4().to_string(),
        name: final_name,
        icon: data.icon,
        system_prompt: data.system_prompt,
        default_task: data.default_task,
        model: data.model,
        enable_file_read: true,
        enable_file_write: true,
        enable_network: false,
        hooks: data.hooks,
        created_at: now.clone(),
        updated_at: now,
    };
    write_agent_file(&agent)?;
    Ok(agent)
}

/// Import agent from file
#[tauri::command]
pub async fn import_agent_from_file(file_path: String) -> Result<Agent, String> {
    let mut json_data =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    if json_data.starts_with('\u{feff}') {
        json_data = json_data.trim_start_matches('\u{feff}').to_string();
    }
    json_data = json_data.trim().to_string();
    import_agent(json_data).await
}

// GitHub Agent Import functionality

/// Represents a GitHub agent file from the API
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubAgentFile {
    pub name: String,
    pub path: String,
    pub download_url: String,
    pub size: i64,
    pub sha: String,
}

/// Represents the GitHub API response for directory contents
#[derive(Debug, Deserialize)]
struct GitHubApiResponse {
    name: String,
    path: String,
    sha: String,
    size: i64,
    download_url: Option<String>,
    #[serde(rename = "type")]
    file_type: String,
}

/// Fetch list of agents from GitHub repository
#[tauri::command]
pub async fn fetch_github_agents() -> Result<Vec<GitHubAgentFile>, String> {
    info!("Fetching agents from GitHub repository...");

    let client = reqwest::Client::new();
    let url = "https://api.github.com/repos/getAsterisk/opcode/contents/cc_agents";

    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "opcode-App")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch from GitHub: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, error_text));
    }

    let api_files: Vec<GitHubApiResponse> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    // Filter only .opcode.json agent files
    let agent_files: Vec<GitHubAgentFile> = api_files
        .into_iter()
        .filter(|f| f.name.ends_with(".opcode.json") && f.file_type == "file")
        .filter_map(|f| {
            f.download_url.map(|download_url| GitHubAgentFile {
                name: f.name,
                path: f.path,
                download_url,
                size: f.size,
                sha: f.sha,
            })
        })
        .collect();

    info!("Found {} agents on GitHub", agent_files.len());
    Ok(agent_files)
}

/// Fetch and preview a specific agent from GitHub
#[tauri::command]
pub async fn fetch_github_agent_content(download_url: String) -> Result<AgentExport, String> {
    info!("Fetching agent content from: {}", download_url);

    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header("Accept", "application/json")
        .header("User-Agent", "opcode-App")
        .send()
        .await
        .map_err(|e| format!("Failed to download agent: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download agent: HTTP {}",
            response.status()
        ));
    }

    let json_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse and validate the agent data
    let export_data: AgentExport = serde_json::from_str(&json_text)
        .map_err(|e| format!("Invalid agent JSON format: {}", e))?;

    // Validate version
    if export_data.version != 1 {
        return Err(format!(
            "Unsupported agent version: {}",
            export_data.version
        ));
    }

    Ok(export_data)
}

/// Import an agent directly from GitHub
#[tauri::command]
pub async fn import_agent_from_github(download_url: String) -> Result<Agent, String> {
    info!("Importing agent from GitHub: {}", download_url);
    let export_data = fetch_github_agent_content(download_url).await?;
    let json_data = serde_json::to_string(&export_data)
        .map_err(|e| format!("Failed to serialize agent data: {}", e))?;
    import_agent(json_data).await
}

/// Load agent session history from JSONL file
/// Similar to Claude Code's load_session_history, but searches across all project directories
#[tauri::command]
pub async fn load_agent_session_history(
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("Loading agent session history for session: {}", session_id);

    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        log::error!("Projects directory not found at: {:?}", projects_dir);
        return Err("Projects directory not found".to_string());
    }

    // Search for the session file in all project directories
    let mut session_file_path = None;
    log::info!(
        "Searching for session file {} in all project directories",
        session_id
    );

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
                log::debug!("Checking project directory: {}", dir_name);

                let potential_session_file = path.join(format!("{}.jsonl", session_id));
                if potential_session_file.exists() {
                    log::info!("Found session file at: {:?}", potential_session_file);
                    session_file_path = Some(potential_session_file);
                    break;
                } else {
                    log::debug!("Session file not found in: {}", dir_name);
                }
            }
        }
    } else {
        log::error!("Failed to read projects directory");
    }

    if let Some(session_path) = session_file_path {
        let file = std::fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;

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
    } else {
        Err(format!("Session file not found: {}", session_id))
    }
}
