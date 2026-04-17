use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StartupSnapshot {
    pub hook_bridge_type_count: u8,
    pub cguard_installed: bool,
    pub claude_version: Option<String>,
    pub claude_json_valid: bool,
    pub claude_settings_valid: bool,
    pub mcp_server_count: u32,
    pub plugin_count: u32,
    pub session_count: u32,
    pub project_count: u32,
    pub skill_count: u32,
    pub agent_count: u32,
}

fn run_claude(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let claude_path = crate::claude_binary::find_claude_binary(app)
        .map_err(|e| e.to_string())?;
    let mut cmd = crate::claude_binary::create_command_with_env(&claude_path);
    for arg in args {
        cmd.arg(arg);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

fn count_mcp_servers(app: &AppHandle) -> u32 {
    match run_claude(app, &["mcp", "list"]) {
        Ok(output) => {
            let trimmed = output.trim();
            if trimmed.is_empty() || trimmed.contains("No MCP servers configured") {
                0
            } else {
                // Count lines that look like server entries (have a colon and no leading whitespace)
                trimmed.lines()
                    .filter(|l| {
                        let t = l.trim();
                        !t.is_empty() && !t.starts_with(' ') && t.contains(':')
                            && !t.contains('/') // exclude path-only lines
                    })
                    .count() as u32
            }
        }
        Err(_) => 0,
    }
}

fn count_plugins(app: &AppHandle) -> u32 {
    match run_claude(app, &["plugin", "list", "--json"]) {
        Ok(output) => {
            let trimmed = output.trim();
            if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
                return 0;
            }
            // Parse as JSON array and count
            serde_json::from_str::<serde_json::Value>(trimmed)
                .ok()
                .and_then(|v| v.as_array().map(|a| a.len() as u32))
                .unwrap_or(0)
        }
        Err(_) => 0,
    }
}

fn get_claude_version(app: &AppHandle) -> Option<String> {
    run_claude(app, &["--version"]).ok().and_then(|output| {
        let re = regex::Regex::new(r"(\d+\.\d+\.\d+)").ok()?;
        re.captures(&output)?.get(1).map(|m| m.as_str().to_string())
    })
}

fn check_json_file_valid(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some()
}

fn count_dir_entries(path: &Path) -> u32 {
    std::fs::read_dir(path)
        .map(|rd| rd.filter_map(|e| e.ok()).count() as u32)
        .unwrap_or(0)
}

fn count_sessions_and_projects() -> (u32, u32) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return (0, 0),
    };
    let projects_dir = home.join(".claude").join("projects");
    let Ok(entries) = std::fs::read_dir(&projects_dir) else {
        return (0, 0);
    };
    let mut project_count = 0u32;
    let mut session_count = 0u32;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            project_count += 1;
            // Count .jsonl files in this project dir as sessions
            if let Ok(files) = std::fs::read_dir(&path) {
                session_count += files
                    .filter_map(|f| f.ok())
                    .filter(|f| f.path().extension().map(|e| e == "jsonl").unwrap_or(false))
                    .count() as u32;
            }
        }
    }
    (session_count, project_count)
}

fn count_agents(app: &AppHandle) -> u32 {
    // Try claude agents CLI first
    if let Ok(output) = run_claude(app, &["agents"]) {
        let trimmed = output.trim();
        if trimmed.is_empty() || trimmed.to_lowercase().contains("no agents") {
            return 0;
        }
        // Count non-empty lines as a rough agent count
        return trimmed.lines().filter(|l| !l.trim().is_empty()).count() as u32;
    }
    // Fallback: count ~/.claude/agents/ directory
    dirs::home_dir()
        .map(|h| count_dir_entries(&h.join(".claude").join("agents")))
        .unwrap_or(0)
}

#[tauri::command]
pub async fn get_startup_snapshot(app: AppHandle) -> Result<StartupSnapshot, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;

    // Fast file checks (synchronous, negligible time)
    let hook_bridge_type_count = crate::commands::hook_events::check_hook_bridge_installed();
    let claude_json_valid = check_json_file_valid(&home.join(".claude.json"));
    let claude_settings_valid = check_json_file_valid(&home.join(".claude").join("settings.json"));
    let skill_count = count_dir_entries(&home.join(".claude").join("skills"));
    let (session_count, project_count) = count_sessions_and_projects();

    // cguard: run python check (fast)
    let cguard_installed = {
        let python = if cfg!(target_os = "windows") { "python" } else { "python3" };
        std::process::Command::new(python)
            .args(["-c", "import ccode_guard; print('ok')"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };

    // Slow CLI calls — run sequentially (they're fast enough combined, ~2-4s total)
    let claude_version = get_claude_version(&app);
    let mcp_server_count = count_mcp_servers(&app);
    let plugin_count = count_plugins(&app);
    let agent_count = count_agents(&app);

    Ok(StartupSnapshot {
        hook_bridge_type_count,
        cguard_installed,
        claude_version,
        claude_json_valid,
        claude_settings_valid,
        mcp_server_count,
        plugin_count,
        session_count,
        project_count,
        skill_count,
        agent_count,
    })
}
