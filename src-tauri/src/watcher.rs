use std::collections::HashMap;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use tokio::time::interval;

pub struct SessionWatcherState;

impl Default for SessionWatcherState {
    fn default() -> Self {
        Self
    }
}

/// Parses `~/.claude/projects/<project_id>/<session_id>.jsonl` → `(session_id, project_id)`
/// Returns None if path does not match expected structure.
pub fn parse_session_path(path: &std::path::Path) -> Option<(String, String)> {
    let session_id = path.file_stem()?.to_str()?;
    let ext = path.extension()?.to_str()?;
    if ext != "jsonl" {
        return None;
    }
    if session_id.len() != 36 {
        return None;
    }
    let project_id = path.parent()?.file_name()?.to_str()?;
    Some((session_id.to_string(), project_id.to_string()))
}

/// Start polling `~/.claude/projects/` every 2 seconds. Emits `session-file-changed` events
/// to the frontend when `.jsonl` files have an updated mtime since the last scan.
/// First scan only records mtimes — no events emitted — to avoid a startup flood.
pub fn init_session_watcher(app: AppHandle) -> SessionWatcherState {
    let projects_dir = match dirs::home_dir() {
        Some(h) => h.join(".claude").join("projects"),
        None => {
            eprintln!("[watcher] Cannot find home directory");
            return SessionWatcherState;
        }
    };

    if !projects_dir.exists() {
        eprintln!("[watcher] ~/.claude/projects/ does not exist, watcher not started");
        return SessionWatcherState;
    }

    println!("[watcher] Polling {:?} every 2s", projects_dir);

    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(2));
        let mut last_mtimes: HashMap<String, SystemTime> = HashMap::new();
        let mut first_run = true;

        loop {
            ticker.tick().await;

            let project_dirs = match std::fs::read_dir(&projects_dir) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("[watcher] read_dir error: {:?}", e);
                    continue;
                }
            };

            let mut changed_count = 0usize;

            for project_entry in project_dirs.flatten() {
                let project_path = project_entry.path();
                if !project_path.is_dir() {
                    continue;
                }

                let session_files = match std::fs::read_dir(&project_path) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                for session_entry in session_files.flatten() {
                    let path = session_entry.path();
                    let (session_id, project_id) = match parse_session_path(&path) {
                        Some(pair) => pair,
                        None => continue,
                    };

                    let mtime = match std::fs::metadata(&path).and_then(|m| m.modified()) {
                        Ok(t) => t,
                        Err(_) => continue,
                    };

                    let key = format!("{}/{}", project_id, session_id);
                    let prev = last_mtimes.get(&key).copied();
                    last_mtimes.insert(key, mtime);

                    // On first run: record baseline mtimes, do not emit
                    if first_run {
                        continue;
                    }

                    // Emit only when mtime changed since last scan
                    let changed = prev.map(|p| mtime != p).unwrap_or(false);
                    if changed {
                        changed_count += 1;
                        println!(
                            "[watcher] File changed: {} in project {} — emitting",
                            session_id, project_id
                        );
                        let _ = app.emit(
                            "session-file-changed",
                            serde_json::json!({
                                "session_id": session_id,
                                "project_id": project_id,
                            }),
                        );
                    }
                }
            }

            if !first_run && changed_count == 0 {
                // Quiet tick — no log spam
            } else if !first_run {
                println!("[watcher] Tick: {} file(s) changed", changed_count);
            } else {
                println!(
                    "[watcher] Initial scan complete: {} sessions indexed",
                    last_mtimes.len()
                );
                first_run = false;
            }
        }
    });

    SessionWatcherState
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_parse_session_path_valid() {
        let path = Path::new("/home/user/.claude/projects/C--Users-foo/b4260412-9f0d-4b02-8c49-9ff0f0c74d19.jsonl");
        let result = parse_session_path(path);
        assert_eq!(
            result,
            Some((
                "b4260412-9f0d-4b02-8c49-9ff0f0c74d19".to_string(),
                "C--Users-foo".to_string()
            ))
        );
    }

    #[test]
    fn test_parse_session_path_not_jsonl() {
        let path = Path::new("/home/user/.claude/projects/C--Users-foo/somefile.txt");
        assert_eq!(parse_session_path(path), None);
    }

    #[test]
    fn test_parse_session_path_wrong_stem_length() {
        let path = Path::new("/home/user/.claude/projects/C--Users-foo/short.jsonl");
        assert_eq!(parse_session_path(path), None);
    }
}
