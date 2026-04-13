use std::sync::Mutex;
use std::time::Duration;
use notify::{EventKind, Watcher};
use notify_debouncer_full::{new_debouncer, DebouncedEvent};
use tauri::{AppHandle, Emitter};

pub struct SessionWatcherState {
    _debouncer: Mutex<Option<notify_debouncer_full::Debouncer<
        notify::RecommendedWatcher,
        notify_debouncer_full::FileIdMap,
    >>>,
}

impl Default for SessionWatcherState {
    fn default() -> Self {
        Self { _debouncer: Mutex::new(None) }
    }
}

/// Parses `~/.claude/projects/<project_id>/<session_id>.jsonl` → `(session_id, project_id)`
/// Returns None if path does not match expected structure.
pub fn parse_session_path(path: &std::path::Path) -> Option<(String, String)> {
    let session_id = path.file_stem()?.to_str()?;
    let ext = path.extension()?.to_str()?;
    if ext != "jsonl" { return None; }
    // session_id must look like a UUID (36 chars with hyphens) — basic sanity check
    if session_id.len() != 36 { return None; }
    let project_id = path.parent()?.file_name()?.to_str()?;
    Some((session_id.to_string(), project_id.to_string()))
}

/// Start watching `~/.claude/projects/` recursively. Emits `session-file-changed` events
/// to the frontend when `.jsonl` files are created or modified.
pub fn init_session_watcher(app: AppHandle) -> SessionWatcherState {
    let projects_dir = match dirs::home_dir() {
        Some(h) => h.join(".claude").join("projects"),
        None => {
            eprintln!("[watcher] Cannot find home directory");
            return SessionWatcherState::default();
        }
    };

    if !projects_dir.exists() {
        eprintln!("[watcher] ~/.claude/projects/ does not exist, watcher not started");
        return SessionWatcherState::default();
    }

    let app_clone = app.clone();
    let result = new_debouncer(Duration::from_millis(300), None, move |result: Result<Vec<DebouncedEvent>, Vec<notify::Error>>| {
        let events = match result {
            Ok(e) => e,
            Err(errs) => {
                for e in errs { eprintln!("[watcher] error: {:?}", e); }
                return;
            }
        };

        for event in events {
            match event.kind {
                EventKind::Modify(_) | EventKind::Create(_) => {
                    for path in &event.paths {
                        if let Some((session_id, project_id)) = parse_session_path(path) {
                            let _ = app_clone.emit("session-file-changed", serde_json::json!({
                                "session_id": session_id,
                                "project_id": project_id,
                            }));
                        }
                    }
                }
                _ => {}
            }
        }
    });

    let mut debouncer = match result {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[watcher] Failed to create debouncer: {:?}", e);
            return SessionWatcherState::default();
        }
    };

    if let Err(e) = debouncer.watcher().watch(&projects_dir, notify::RecursiveMode::Recursive) {
        eprintln!("[watcher] Failed to watch {:?}: {:?}", projects_dir, e);
    } else {
        println!("[watcher] Watching {:?}", projects_dir);
    }

    SessionWatcherState {
        _debouncer: Mutex::new(Some(debouncer)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_parse_session_path_valid() {
        let path = Path::new("/home/user/.claude/projects/C--Users-foo/b4260412-9f0d-4b02-8c49-9ff0f0c74d19.jsonl");
        let result = parse_session_path(path);
        assert_eq!(result, Some(("b4260412-9f0d-4b02-8c49-9ff0f0c74d19".to_string(), "C--Users-foo".to_string())));
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
