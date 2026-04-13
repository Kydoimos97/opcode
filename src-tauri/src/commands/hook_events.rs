use std::path::PathBuf;

/// Returns the path to the hook events file for a session.
fn hook_events_path(session_id: &str) -> Option<PathBuf> {
    let base = dirs::home_dir()?.join(".ccode").join("hook-events");
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

/// Checks if the hook bridge scripts are installed.
/// Returns true if ~/.claude/hooks/hook-event-bridge.sh exists.
#[tauri::command]
pub fn check_hook_bridge_installed() -> bool {
    dirs::home_dir()
        .map(|h| h.join(".claude").join("hooks").join("hook-event-bridge.sh").exists())
        .unwrap_or(false)
}

/// Installs the hook event bridge:
/// 1. Creates ~/.ccode/hook-events/ directory
/// 2. Writes hook-event-bridge.py to ~/.claude/hooks/
/// 3. Writes hook-event-bridge.sh to ~/.claude/hooks/
/// 4. Adds bridge hook entries to ~/.claude/settings.json for the listed hook types
#[tauri::command]
pub fn install_hook_bridge() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    // Create ~/.ccode/hook-events/
    let events_dir = home.join(".ccode").join("hook-events");
    std::fs::create_dir_all(&events_dir)
        .map_err(|e| format!("Failed to create hook-events dir: {}", e))?;

    let hooks_dir = home.join(".claude").join("hooks");
    std::fs::create_dir_all(&hooks_dir)
        .map_err(|e| format!("Failed to ensure hooks dir: {}", e))?;

    // Write Python bridge script
    std::fs::write(
        hooks_dir.join("hook-event-bridge.py"),
        BRIDGE_PY_CONTENT,
    ).map_err(|e| format!("Failed to write bridge py: {}", e))?;

    // Write shell wrapper
    std::fs::write(
        hooks_dir.join("hook-event-bridge.sh"),
        BRIDGE_SH_CONTENT,
    ).map_err(|e| format!("Failed to write bridge sh: {}", e))?;

    // Make sh executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(hooks_dir.join("hook-event-bridge.sh"))
            .map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(hooks_dir.join("hook-event-bridge.sh"), perms)
            .map_err(|e| e.to_string())?;
    }

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

    let bridge_command = "bash $HOME/.claude/hooks/hook-event-bridge.sh";
    let hook_types = [
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "Notification",
        "SubagentStart",
        "SubagentStop",
        "SessionStart",
        "SessionEnd",
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

    let bridge_command = "bash $HOME/.claude/hooks/hook-event-bridge.sh";
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

    // Remove script files
    let hooks_dir = home.join(".claude").join("hooks");
    let _ = std::fs::remove_file(hooks_dir.join("hook-event-bridge.py"));
    let _ = std::fs::remove_file(hooks_dir.join("hook-event-bridge.sh"));

    Ok(())
}

const BRIDGE_SH_CONTENT: &str = r#"#!/bin/bash
# hook-event-bridge.sh — C-Code hook event bridge.
# Writes hook events to ~/.ccode/hook-events/<session_id>.jsonl for real-time UI enrichment.
# Never blocks; always exits 0.

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON=""
if command -v python3 &> /dev/null; then
  PYTHON="python3"
elif command -v python &> /dev/null; then
  PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
  exit 0
fi

"$PYTHON" "$HOOKS_DIR/hook-event-bridge.py"
exit 0
"#;

const BRIDGE_PY_CONTENT: &str = r#"#!/usr/bin/env python3
"""hook-event-bridge.py — C-Code hook event bridge.

Reads the hook payload from stdin and appends it to
~/.ccode/hook-events/<session_id>.jsonl so the C-Code app can
provide real-time enrichment (live tool indicators, auto-title, etc).

Always exits 0 and never blocks Claude Code.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    raw = sys.stdin.buffer.read()
    if not raw:
        return

    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, ValueError):
        return

    session_id = payload.get("session_id")
    if not session_id:
        return

    hook_type = payload.get("hook_event_name", "unknown")

    out_dir = Path.home() / ".ccode" / "hook-events"
    out_dir.mkdir(parents=True, exist_ok=True)

    entry = {
        "ts": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "hook_type": hook_type,
        "payload": payload,
    }

    out_path = out_dir / f"{session_id}.jsonl"
    try:
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    main()
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_events_path_uses_session_id() {
        let path = hook_events_path("test-session-123");
        assert!(path.is_some());
        let p = path.unwrap();
        assert!(p.to_string_lossy().contains("test-session-123.jsonl"));
        assert!(p.to_string_lossy().contains("hook-events"));
    }

    #[test]
    fn test_get_hook_events_returns_empty_for_missing_session() {
        let result = get_hook_events("nonexistent-session-id-xyz-12345".to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
