use std::env;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
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

#[derive(Serialize)]
pub struct DiskEntry {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub is_dir: bool,
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

/// Runs a command with admin privileges using a temporary SUDO_ASKPASS script
/// that invokes a native macOS password dialog via osascript.
/// Streams output line-by-line as "cmd-line" events (same as stream_command).
#[tauri::command]
async fn stream_command_admin(
    window: tauri::WebviewWindow,
    event_id: String,
    cmd: String,
    args: Vec<String>,
    home_dir: String,
) -> i32 {
    use std::os::unix::fs::PermissionsExt;
    use std::process::Stdio;

    // Write a temporary SUDO_ASKPASS script that shows a native macOS dialog
    let pid = std::process::id();
    let askpass_path = format!("/tmp/molesurface-askpass-{}.sh", pid);

    let script = "#!/bin/sh\nosascript -e 'Tell application \"System Events\" to display dialog \"MoleSurface needs administrator access to continue.\" with title \"MoleSurface\" default answer \"\" with hidden answer buttons {\"Cancel\", \"OK\"} default button \"OK\"' -e 'text returned of result' 2>/dev/null\n";

    if let Err(e) = std::fs::write(&askpass_path, script) {
        let _ = window.emit(
            "cmd-line",
            CmdLine { event_id, line: format!("Error writing askpass script: {}", e) },
        );
        return -1;
    }

    // Make the script executable
    if let Err(e) = std::fs::set_permissions(&askpass_path, std::fs::Permissions::from_mode(0o700)) {
        let _ = window.emit(
            "cmd-line",
            CmdLine { event_id, line: format!("Error setting askpass permissions: {}", e) },
        );
        let _ = std::fs::remove_file(&askpass_path);
        return -1;
    }

    let path_env = format!(
        "{}/.molesurface/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        home_dir
    );

    // Build sudo -A -E <cmd> <args>
    let mut full_args = vec!["-A".to_string(), "-E".to_string(), cmd];
    full_args.extend(args);

    let child = TokioCommand::new("sudo")
        .args(&full_args)
        .env("SUDO_ASKPASS", &askpass_path)
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
            let _ = std::fs::remove_file(&askpass_path);
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

    let code = child.wait().await.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
    let _ = std::fs::remove_file(&askpass_path);
    code
}

/// Scans disk usage for the top-level entries inside `scan_path` using `du`.
/// Returns entries sorted largest-first. Falls back to home dir if scan_path
/// is empty. Uses `du -sk` (kilobytes, don't cross mount points) per entry so
/// it stays fast even on large volumes.
#[tauri::command]
fn scan_disk(home_dir: String, scan_path: String) -> Vec<DiskEntry> {
    let root = if scan_path.is_empty() { home_dir.clone() } else { scan_path.clone() };

    // Collect immediate children of root
    let children: Vec<String> = match std::fs::read_dir(&root) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path().to_string_lossy().to_string())
            .collect(),
        Err(_) => return vec![],
    };

    if children.is_empty() {
        return vec![];
    }

    // Run: du -sk <child1> <child2> ...
    let output = std::process::Command::new("du")
        .arg("-sk")
        .args(&children)
        .env("HOME", &home_dir)
        .output();

    let out = match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return vec![],
    };

    let mut entries: Vec<DiskEntry> = out
        .lines()
        .filter_map(|line| {
            // du output: "<kb>\t<path>"
            let mut parts = line.splitn(2, '\t');
            let kb: u64 = parts.next()?.trim().parse().ok()?;
            let path = parts.next()?.trim().to_string();
            let name = std::path::Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            let is_dir = std::path::Path::new(&path).is_dir();
            Some(DiskEntry {
                path,
                name,
                size_bytes: kb * 1024,
                is_dir,
            })
        })
        .collect();

    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    entries
}

// ── App listing & uninstall ──────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct AppEntry {
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub size_bytes: u64,
    pub last_used: String, // ISO-ish date string from mdls, or ""
}

#[derive(Deserialize)]
pub struct AppToRemove {
    pub name: String,
    pub path: String,
    pub bundle_id: String,
}

/// Reads CFBundleIdentifier from an .app's Info.plist.
/// Handles both XML and binary plists (binary falls back to PlistBuddy).
fn read_bundle_id(app_path: &str) -> String {
    let plist = format!("{}/Contents/Info.plist", app_path);
    if let Ok(bytes) = std::fs::read(&plist) {
        if bytes.starts_with(b"bplist") {
            // Binary plist — delegate to PlistBuddy
            return std::process::Command::new("/usr/libexec/PlistBuddy")
                .args(["-c", "Print CFBundleIdentifier", &plist])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_default();
        }
        // XML plist — simple string search
        let text = String::from_utf8_lossy(&bytes);
        if let Some(i) = text.find("CFBundleIdentifier") {
            let rest = &text[i + 18..];
            if let Some(s) = rest.find("<string>") {
                let inner = &rest[s + 8..];
                if let Some(e) = inner.find("</string>") {
                    return inner[..e].trim().to_string();
                }
            }
        }
    }
    String::new()
}

/// Scans /Applications, /Applications/Utilities, ~/Applications, and one level
/// of non-`.app` subdirs inside /Applications (covers many Cask-installed apps).
/// Returns entries sorted oldest-used first.
#[tauri::command]
fn list_apps(home_dir: String) -> Vec<AppEntry> {
    // Build list of directories to scan for .app bundles
    let mut scan_dirs: Vec<String> = vec![
        "/Applications".to_string(),
        "/Applications/Utilities".to_string(),
        format!("{}/Applications", home_dir),
    ];
    // One level deep into non-.app subdirectories of /Applications
    // (handles Cask installs like /Applications/Utilities/ subfolders, etc.)
    if let Ok(rd) = std::fs::read_dir("/Applications") {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() && p.extension().and_then(|x| x.to_str()) != Some("app") {
                scan_dirs.push(p.to_string_lossy().to_string());
            }
        }
    }

    let mut paths: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for dir in &scan_dirs {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.filter_map(|e| e.ok()) {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("app") {
                    let s = p.to_string_lossy().to_string();
                    if seen.insert(s.clone()) {
                        paths.push(s);
                    }
                }
            }
        }
    }
    if paths.is_empty() {
        return vec![];
    }

    // Sizes — one du call for all paths
    let mut sizes: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    if let Ok(out) = std::process::Command::new("du").arg("-sk").args(&paths)
        .env("HOME", &home_dir).output()
    {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let mut p = line.splitn(2, '\t');
            if let (Some(kb), Some(path)) = (p.next(), p.next()) {
                if let Ok(kb) = kb.trim().parse::<u64>() {
                    sizes.insert(path.trim().to_string(), kb * 1024);
                }
            }
        }
    }

    // Last used dates — use -raw flag so output is one value per line in path
    // order with no key name or padding whitespace to parse around.
    // With multiple files, values are null-byte separated.
    let mut last_used: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Ok(out) = std::process::Command::new("mdls")
        .arg("-raw").arg("-name").arg("kMDItemLastUsedDate")
        .args(&paths).output()
    {
        let raw = out.stdout;
        // Values are separated by null bytes (0x00) when querying multiple files
        let text = String::from_utf8_lossy(&raw);
        for (path, val) in paths.iter().zip(text.split('\0')) {
            let v = val.trim();
            if v != "(null)" && !v.is_empty() {
                last_used.insert(path.clone(), v.to_string());
            }
        }
    }

    let mut entries: Vec<AppEntry> = paths.iter().map(|path| {
        let name = std::path::Path::new(path)
            .file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();
        AppEntry {
            bundle_id: read_bundle_id(path),
            size_bytes: *sizes.get(path).unwrap_or(&0),
            last_used: last_used.get(path).cloned().unwrap_or_default(),
            name,
            path: path.clone(),
        }
    }).collect();

    // Sort: entries with last_used date first (oldest = smallest date string first),
    // then unknown (empty) at the end
    entries.sort_by(|a, b| match (a.last_used.is_empty(), b.last_used.is_empty()) {
        (true, true)   => std::cmp::Ordering::Equal,
        (true, false)  => std::cmp::Ordering::Greater,
        (false, true)  => std::cmp::Ordering::Less,
        (false, false) => a.last_used.cmp(&b.last_used), // lexicographic on ISO date = chronological
    });

    entries
}

/// Returns Library paths related to an app (for preview / cleanup).
fn find_leftovers(name: &str, bundle_id: &str, home_dir: &str) -> Vec<String> {
    let lib = format!("{}/Library", home_dir);
    let candidates = vec![
        format!("{}/Application Support/{}", lib, name),
        format!("{}/Application Support/{}", lib, bundle_id),
        format!("{}/Caches/{}", lib, bundle_id),
        format!("{}/Preferences/{}.plist", lib, bundle_id),
        format!("{}/Saved Application State/{}.savedState", lib, bundle_id),
        format!("{}/Containers/{}", lib, bundle_id),
        format!("{}/WebKit/{}", lib, bundle_id),
    ];

    // Also scan for prefix matches in Preferences and Caches
    let mut found: Vec<String> = candidates.into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect();

    // Glob-style: ~/Library/Preferences/<bundle_id>*.plist
    if !bundle_id.is_empty() {
        for subdir in &["Preferences", "Group Containers"] {
            let dir = format!("{}/{}", lib, subdir);
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for e in rd.filter_map(|e| e.ok()) {
                    let fname = e.file_name().to_string_lossy().to_string();
                    if fname.starts_with(bundle_id) || fname.contains(bundle_id) {
                        let full = e.path().to_string_lossy().to_string();
                        if !found.contains(&full) {
                            found.push(full);
                        }
                    }
                }
            }
        }
    }

    found
}

/// Uninstalls selected apps: moves .app to Trash, removes leftover Library files.
/// Streams progress as "cmd-line" events. Supports dry_run (preview only).
#[tauri::command]
async fn uninstall_apps(
    window: tauri::WebviewWindow,
    event_id: String,
    apps: Vec<AppToRemove>,
    home_dir: String,
    dry_run: bool,
) -> i32 {
    let prefix = if dry_run { "[DRY RUN] " } else { "" };

    for app in &apps {
        let _ = window.emit("cmd-line", CmdLine {
            event_id: event_id.clone(),
            line: format!("{}→ {} ({})", prefix, app.name, app.path),
        });

        let leftovers = find_leftovers(&app.name, &app.bundle_id, &home_dir);

        if !dry_run {
            // Move .app to Trash via Finder
            let script = format!(
                "tell application \"Finder\" to delete POSIX file \"{}\"",
                app.path.replace('"', "\\\"")
            );
            let result = std::process::Command::new("osascript")
                .arg("-e").arg(&script).output();
            match result {
                Ok(out) if out.status.success() => {
                    let _ = window.emit("cmd-line", CmdLine {
                        event_id: event_id.clone(),
                        line: format!("  ✓ Moved to Trash"),
                    });
                }
                Ok(out) => {
                    let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
                    let _ = window.emit("cmd-line", CmdLine {
                        event_id: event_id.clone(),
                        line: format!("  ⚠ Could not move to Trash: {}", msg),
                    });
                }
                Err(e) => {
                    let _ = window.emit("cmd-line", CmdLine {
                        event_id: event_id.clone(),
                        line: format!("  ✗ Error: {}", e),
                    });
                }
            }
        } else {
            let _ = window.emit("cmd-line", CmdLine {
                event_id: event_id.clone(),
                line: format!("  Would move to Trash: {}", app.path),
            });
        }

        // Handle leftover files
        if leftovers.is_empty() {
            let _ = window.emit("cmd-line", CmdLine {
                event_id: event_id.clone(),
                line: "  No leftover files found.".to_string(),
            });
        } else {
            let _ = window.emit("cmd-line", CmdLine {
                event_id: event_id.clone(),
                line: format!("  {} leftover item(s):", leftovers.len()),
            });
            for path in &leftovers {
                let short = path.replace(&format!("{}/Library/", home_dir), "~/Library/");
                if dry_run {
                    let _ = window.emit("cmd-line", CmdLine {
                        event_id: event_id.clone(),
                        line: format!("    Would remove: {}", short),
                    });
                } else {
                    let removed = if std::path::Path::new(path).is_dir() {
                        std::fs::remove_dir_all(path).is_ok()
                    } else {
                        std::fs::remove_file(path).is_ok()
                    };
                    let _ = window.emit("cmd-line", CmdLine {
                        event_id: event_id.clone(),
                        line: format!("    {} {}", if removed { "✓ Removed:" } else { "⚠ Skipped:" }, short),
                    });
                }
            }
        }

        let _ = window.emit("cmd-line", CmdLine {
            event_id: event_id.clone(),
            line: String::new(),
        });
    }

    let _ = window.emit("cmd-line", CmdLine {
        event_id: event_id.clone(),
        line: if dry_run {
            format!("Dry run complete. {} app(s) would be removed.", apps.len())
        } else {
            format!("Done. {} app(s) removed.", apps.len())
        },
    });

    0
}

// ── Tray helpers ──────────────────────────────────────────────────────────────

/// Resolves the mo binary path synchronously (managed → PATH fallback).
fn resolve_mo_path() -> Option<String> {
    if let Ok(home) = env::var("HOME") {
        let managed = format!("{}/.molesurface/bin/mo", home);
        if std::path::Path::new(&managed).exists() {
            return Some(managed);
        }
    }
    if let Ok(out) = std::process::Command::new("/bin/sh")
        .arg("-c").arg("command -v mo 2>/dev/null").output()
    {
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !p.is_empty() { return Some(p); }
    }
    None
}

/// Runs `mo <subcommand>` in the background, ignoring output.
fn run_mo_background(subcommand: &'static str) {
    if let Some(mo) = resolve_mo_path() {
        let home = env::var("HOME").unwrap_or_default();
        let path_env = format!(
            "{}/.molesurface/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", home
        );
        std::thread::spawn(move || {
            let _ = std::process::Command::new(&mo)
                .arg(subcommand)
                .env("PATH", &path_env)
                .env("HOME", &home)
                .output();
        });
    }
}

/// Shows the main window and optionally navigates to a page.
fn show_window(app: &tauri::AppHandle, navigate_to: Option<&str>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        if let Some(page) = navigate_to {
            let _ = win.emit("navigate", page);
        }
    }
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
            stream_command_admin,
            scan_disk,
            list_apps,
            uninstall_apps,
        ])
        .setup(|app| {
            // ── Build tray menu ──────────────────────────────────────────────
            let purge    = MenuItem::with_id(app, "purge",    "⚡ Purge Memory", true, None::<&str>)?;
            let clean    = MenuItem::with_id(app, "clean",    "🧹 Quick Clean",  true, None::<&str>)?;
            let sep1     = PredefinedMenuItem::separator(app)?;
            let open     = MenuItem::with_id(app, "open",     "Open MoleSurface", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings",         true, None::<&str>)?;
            let sep2     = PredefinedMenuItem::separator(app)?;
            let quit     = MenuItem::with_id(app, "quit",     "Exit",             true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &purge, &clean, &sep1, &open, &settings, &sep2, &quit,
            ])?;

            // ── Build tray icon ──────────────────────────────────────────────
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("MoleSurface")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "purge"    => run_mo_background("purge"),
                        "clean"    => run_mo_background("clean"),
                        "open"     => show_window(app, None),
                        "settings" => show_window(app, Some("settings")),
                        "quit"     => app.exit(0),
                        _          => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click toggles window visibility
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up, ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
