use std::env;
use serde::Serialize;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct MoPath {
    pub path: String,
    pub bin_dir: String,
    pub source: String, // "managed" | "homebrew"
}

#[derive(Serialize)]
pub struct ShellOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize, Clone)]
struct CmdLine {
    event_id: String,
    line: String,
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Returns current CPU architecture.
#[tauri::command]
fn check_arch() -> String {
    if cfg!(target_arch = "aarch64") {
        "arm64".to_string()
    } else {
        "x86_64".to_string()
    }
}

/// Returns $HOME.
#[tauri::command]
fn get_home_dir() -> Option<String> {
    env::var("HOME").ok()
}

/// Finds the `mo` executable.
/// 1. Checks ~/.molesurface/bin/mo  (managed copy)
/// 2. Falls back to `command -v mo` via /bin/sh  (Homebrew / PATH)
#[tauri::command]
fn find_mo_path(home_dir: String) -> Option<MoPath> {
    // 1. Managed copy
    let managed_bin_dir = format!("{}/.molesurface/bin", home_dir);
    let managed_path = format!("{}/mo", managed_bin_dir);
    if std::path::Path::new(&managed_path).exists() {
        return Some(MoPath {
            path: managed_path,
            bin_dir: managed_bin_dir,
            source: "managed".to_string(),
        });
    }

    // 2. PATH fallback (Homebrew, /usr/local/bin, etc.)
    let result = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("command -v mo 2>/dev/null")
        .output();

    if let Ok(out) = result {
        let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !found.is_empty() {
            let bin_dir = found.rsplitn(2, '/').nth(1).unwrap_or("").to_string();
            return Some(MoPath {
                path: found,
                bin_dir,
                source: "homebrew".to_string(),
            });
        }
    }

    None
}

/// Runs a command synchronously and returns stdout + stderr + exit code.
/// Used for curl downloads, tar extraction, and JSON-output mo commands.
#[tauri::command]
fn run_command(cmd: String, args: Vec<String>, home_dir: String) -> ShellOutput {
    let path_env = format!(
        "{}/.molesurface/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        home_dir
    );
    let result = std::process::Command::new(&cmd)
        .args(&args)
        .env("PATH", &path_env)
        .env("HOME", &home_dir)
        .output();

    match result {
        Ok(out) => ShellOutput {
            code: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        },
        Err(e) => ShellOutput {
            code: -1,
            stdout: String::new(),
            stderr: e.to_string(),
        },
    }
}

/// Runs a command asynchronously, streaming each output line as a Tauri event.
/// The frontend listens on event `"cmd-line"` and filters by `event_id`.
/// Returns the exit code when the process finishes.
#[tauri::command]
async fn stream_command(
    window: tauri::WebviewWindow,
    event_id: String,
    cmd: String,
    args: Vec<String>,
    home_dir: String,
) -> i32 {
    use std::process::Stdio;

    let path_env = format!(
        "{}/.molesurface/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        home_dir
    );

    let child = TokioCommand::new(&cmd)
        .args(&args)
        .env("PATH", &path_env)
        .env("HOME", &home_dir)
        .env("TERM", "xterm-256color")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            let _ = window.emit(
                "cmd-line",
                CmdLine { event_id, line: format!("Error: {}", e) },
            );
            return -1;
        }
    };

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let w = window.clone();
        let eid = event_id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = w.emit("cmd-line", CmdLine { event_id: eid.clone(), line });
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let w = window.clone();
        let eid = event_id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = w.emit("cmd-line", CmdLine { event_id: eid.clone(), line });
            }
        });
    }

    child.wait().await.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1)
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            check_arch,
            get_home_dir,
            find_mo_path,
            run_command,
            stream_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
