use std::process::Command;

/// Opens an external terminal emulator in the given directory.
/// Tries WezTerm → Windows Terminal (`wt`) → cmd.exe (Windows) / xterm (Unix).
/// Returns the terminal name that was launched, or an error if all attempts fail.
#[tauri::command]
pub fn open_terminal_in(path: String) -> Result<String, String> {
    // Guard: path must not be empty
    if path.trim().is_empty() {
        return Err("Path must not be empty".to_string());
    }

    // Attempt 1: WezTerm
    if try_wezterm(&path) {
        return Ok("WezTerm".to_string());
    }

    // Attempt 2: Windows Terminal (wt)
    #[cfg(target_os = "windows")]
    if try_windows_terminal(&path) {
        return Ok("Windows Terminal".to_string());
    }

    // Attempt 3: Fallback
    #[cfg(target_os = "windows")]
    if try_cmd(&path) {
        return Ok("cmd.exe".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    if try_xterm(&path) {
        return Ok("xterm".to_string());
    }

    Err("No supported terminal emulator found (tried WezTerm, Windows Terminal, cmd.exe)".to_string())
}

fn try_wezterm(path: &str) -> bool {
    Command::new("wezterm")
        .args(["start", "--cwd", path])
        .spawn()
        .is_ok()
}

#[cfg(target_os = "windows")]
fn try_windows_terminal(path: &str) -> bool {
    Command::new("wt")
        .args(["-d", path])
        .spawn()
        .is_ok()
}

#[cfg(target_os = "windows")]
fn try_cmd(path: &str) -> bool {
    Command::new("cmd")
        .args(["/K", &format!("cd /d \"{}\"", path)])
        .spawn()
        .is_ok()
}

#[cfg(not(target_os = "windows"))]
fn try_xterm(path: &str) -> bool {
    Command::new("xterm")
        .current_dir(path)
        .spawn()
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_terminal_in_empty_path_returns_error() {
        let result = open_terminal_in("".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_open_terminal_in_whitespace_path_returns_error() {
        let result = open_terminal_in("   ".to_string());
        assert!(result.is_err());
    }
}
