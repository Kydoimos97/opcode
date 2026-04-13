use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use base64::{Engine as _, engine::general_purpose};
use tauri::Emitter;
use once_cell::sync::Lazy;

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static PTY_SESSIONS: Lazy<Mutex<HashMap<String, Arc<Mutex<PtySession>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static PTY_COUNTER: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub fn spawn_pty(path: String, app: tauri::AppHandle) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    #[cfg(target_os = "windows")]
    let mut cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let mut cmd = CommandBuilder::new(
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    );

    cmd.cwd(&path);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let pty_id = format!("pty-{}", PTY_COUNTER.fetch_add(1, Ordering::SeqCst));

    let session = PtySession {
        master: pair.master,
        writer: Arc::new(Mutex::new(writer)),
        child,
    };

    {
        let mut sessions = PTY_SESSIONS.lock().unwrap();
        sessions.insert(pty_id.clone(), Arc::new(Mutex::new(session)));
    }

    let reader_pty_id = pty_id.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let encoded = general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app_clone.emit(&format!("pty-output:{}", reader_pty_id), encoded);
                }
            }
        }
    });

    Ok(pty_id)
}

#[tauri::command]
pub fn write_pty(pty_id: String, data: String) -> Result<(), String> {
    use std::io::Write;

    let decoded = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode Base64: {}", e))?;

    let sessions = PTY_SESSIONS.lock().unwrap();
    let session_arc = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY session not found: {}", pty_id))?
        .clone();
    drop(sessions);

    let session = session_arc.lock().unwrap();
    let mut writer = session.writer.lock().unwrap();
    writer
        .write_all(&decoded)
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn resize_pty(pty_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = PTY_SESSIONS.lock().unwrap();
    let session_arc = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY session not found: {}", pty_id))?
        .clone();
    drop(sessions);

    let session = session_arc.lock().map_err(|_| "Failed to lock session".to_string())?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn kill_pty(pty_id: String) -> Result<(), String> {
    let mut sessions = PTY_SESSIONS.lock().unwrap();
    if let Some(session_arc) = sessions.remove(&pty_id) {
        if let Ok(mut session) = session_arc.lock() {
            let _ = session.child.kill();
        }
    }
    Ok(())
}
