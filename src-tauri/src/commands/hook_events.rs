use std::path::PathBuf;

/// Returns the path to the hook events file for a session.
fn hook_events_path(session_id: &str) -> Option<PathBuf> {
    let base = dirs::home_dir()?.join(".ccode").join("states").join("hooks");
    Some(base.join(format!("{}.jsonl", session_id)))
}

/// Returns all hook event lines for a session as raw JSONL strings.
/// Returns an empty vec if the file does not exist.
#[tauri::command]
pub fn get_hook_events(session_id: String) -> Result<Vec<String>, String> {
    let path = match hook_events_path(&session_id) {
        Some(p) => p,
        None => return Ok(vec![]),
    };
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read hook events: {}", e))?;
    Ok(content.lines().filter(|l| !l.trim().is_empty()).map(String::from).collect())
}

/// Returns 1 if the c-bridge script exists at ~/.ccode/hooks/c-bridge/c-bridge.sh
/// and the c-bridge command is referenced anywhere in ~/.claude/settings.json hooks.
/// Returns 0 otherwise.
#[tauri::command]
pub fn check_hook_bridge_installed() -> u8 {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return 0,
    };

    if !home.join(".ccode").join("hooks").join("c-bridge").join("c-bridge.sh").exists() {
        return 0;
    }

    let settings_path = home.join(".claude").join("settings.json");
    let content = match std::fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => return 0,
    };

    if content.contains("c-bridge/c-bridge.sh") { 1 } else { 0 }
}

/// Wires the c-bridge hook into ~/.claude/settings.json for all known hook types.
/// Does NOT write any script files — the user manages those in ~/.ccode/hooks/c-bridge/.
/// Only creates the ~/.ccode/states/hooks/ output directory if missing.
#[tauri::command]
pub fn install_hook_bridge() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    // Ensure output directory exists
    let events_dir = home.join(".ccode").join("states").join("hooks");
    std::fs::create_dir_all(&events_dir)
        .map_err(|e| format!("Failed to create hook-events dir: {}", e))?;

    // Wire into ~/.claude/settings.json
    let settings_path = home.join(".claude").join("settings.json");
    let settings_content = if settings_path.exists() {
        std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?
    } else {
        "{}".to_string()
    };

    let mut settings: serde_json::Value = serde_json::from_str(&settings_content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

    let hooks_obj = settings
        .as_object_mut()
        .ok_or("settings.json root is not an object")?
        .entry("hooks")
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
        .as_object_mut()
        .ok_or("hooks is not an object")?;

    let bridge_command = "bash $HOME/.ccode/hooks/c-bridge/c-bridge.sh";
    let hook_types = [
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
        "StopFailure",
        "Notification",
        "SubagentStart",
        "SubagentStop",
        "SessionStart",
        "SessionEnd",
        "PreCompact",
        "PostCompact",
        "InstructionsLoaded",
        "PermissionRequest",
        "PermissionDenied",
        "Elicitation",
        "ElicitationResult",
        "ConfigChange",
        "CwdChanged",
        "FileChanged",
        "TaskCreated",
        "TaskCompleted",
        "TeammateIdle",
        "WorktreeCreate",
        "WorktreeRemove",
    ];

    for hook_type in &hook_types {
        let entry = hooks_obj
            .entry(hook_type.to_string())
            .or_insert_with(|| serde_json::Value::Array(vec![]));

        // Check if bridge command already present
        let already_present = entry.as_array()
            .map(|arr| arr.iter().any(|item| {
                item.get("hooks")
                    .and_then(|h| h.as_array())
                    .map(|h| h.iter().any(|cmd| {
                        cmd.get("command").and_then(|c| c.as_str()) == Some(bridge_command)
                    }))
                    .unwrap_or(false)
            }))
            .unwrap_or(false);

        if !already_present {
            let new_entry = serde_json::json!({
                "hooks": [{ "type": "command", "command": bridge_command }]
            });
            if let Some(arr) = entry.as_array_mut() {
                arr.push(new_entry);
            }
        }
    }

    let updated = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&settings_path, updated)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Removes the hook event bridge entries from ~/.claude/settings.json
/// and deletes the bridge scripts.
#[tauri::command]
pub fn remove_hook_bridge() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    let bridge_command = "bash $HOME/.ccode/hooks/c-bridge/c-bridge.sh";
    let settings_path = home.join(".claude").join("settings.json");

    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

        if let Some(hooks_obj) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
            for (_, value) in hooks_obj.iter_mut() {
                if let Some(arr) = value.as_array_mut() {
                    arr.retain(|item| {
                        !item.get("hooks")
                            .and_then(|h| h.as_array())
                            .map(|h| h.iter().all(|cmd| {
                                cmd.get("command").and_then(|c| c.as_str()) == Some(bridge_command)
                            }))
                            .unwrap_or(false)
                    });
                }
            }
        }

        let updated = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        std::fs::write(&settings_path, updated)
            .map_err(|e| format!("Failed to write settings: {}", e))?;
    }

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_events_path_uses_session_id() {
        let path = hook_events_path("test-session-123");
        assert!(path.is_some());
        let p = path.unwrap();
        assert!(p.to_string_lossy().contains("test-session-123.jsonl"));
        assert!(p.to_string_lossy().contains("states"));
        assert!(p.to_string_lossy().contains("hooks"));
    }

    #[test]
    fn test_get_hook_events_returns_empty_for_missing_session() {
        let result = get_hook_events("nonexistent-session-id-xyz-12345".to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
