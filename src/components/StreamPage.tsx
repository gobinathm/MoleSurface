import { useState, useCallback, useRef, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Terminal from "./Terminal";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { ShieldCheck } from "lucide-react";

interface Props {
  title: string;
  description: string;
  command: string;
  args?: string[];
  icon: ReactNode;
  theme: Theme;
  allowAdmin?: boolean;
}

export default function StreamPage({
  title,
  description,
  command,
  args = [],
  icon,
  theme,
  allowAdmin = false,
}: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [useAdmin, setUseAdmin] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const c = colors[theme];

  const run = useCallback(async (withAdmin: boolean) => {
    // Cleanup any previous listener
    unlistenRef.current?.();
    setLines([]);
    setExitCode(null);
    setRunning(true);

    try {
      const homeDir = await getHomeDir();
      const loc = await findMoLocation(homeDir);
      if (!loc) throw new Error("mo not found — please install Mole from Settings.");

      // Unique ID so concurrent sessions don't bleed into each other
      const eventId = `${command}-${Date.now()}`;

      // Set up listener before invoking
      const unlisten = await listen<{ event_id: string; line: string }>(
        "cmd-line",
        (event) => {
          if (event.payload.event_id === eventId) {
            setLines((prev) => [...prev, event.payload.line]);
          }
        }
      );
      unlistenRef.current = unlisten;

      const rustCommand = withAdmin ? "stream_command_admin" : "stream_command";
      const code = await invoke<number>(rustCommand, {
        eventId,
        cmd: loc.path,
        args: [command, ...args],
        homeDir,
      });

      setExitCode(code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLines((prev) => [...prev, `Error: ${msg}`]);
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setRunning(false);
    }
  }, [command, args]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: c.text, display: "flex", alignItems: "center", gap: 8 }}>
            {icon}{title}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textMuted }}>{description}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Admin toggle — only shown when allowAdmin is true */}
          {allowAdmin && (
            <button
              onClick={() => setUseAdmin((v) => !v)}
              disabled={running}
              title={useAdmin
                ? "Admin mode on — click to disable"
                : "Enable admin mode to allow system-level cleanup that requires root access (e.g. /private/var/folders, system caches). macOS will show a native password prompt."}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: useAdmin ? "#FF9500" + "22" : "transparent",
                color: useAdmin ? "#FF9500" : c.textMuted,
                border: `1px solid ${useAdmin ? "#FF9500" : c.cardBorder}`,
                borderRadius: 6, padding: "6px 12px", fontSize: 12,
                cursor: running ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              <ShieldCheck size={13} />
              {useAdmin ? "Admin: On" : "Admin"}
            </button>
          )}

          <button
            onClick={() => run(useAdmin)}
            disabled={running}
            style={{
              background: running ? c.textMuted : c.accent,
              color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 20px", fontSize: 13, fontWeight: 500,
              cursor: running ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {allowAdmin && !useAdmin && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: c.card, border: `1px solid ${c.cardBorder}`,
          borderRadius: 8, padding: "10px 14px", fontSize: 12, color: c.textMuted,
        }}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontWeight: 600, color: c.text }}>Admin mode available.</span>
            {" "}Some system-level cleanup targets (e.g. <code style={{ fontSize: 11 }}>/private/var/folders</code>,
            system font caches, protected logs) require root access and are skipped by default.
            Enable <strong>Admin</strong> to unlock them — macOS will show a native password prompt before running.
          </div>
        </div>
      )}

      {allowAdmin && useAdmin && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "#FF9500" + "18", border: `1px solid ${"#FF9500"}44`,
          borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#FF9500",
        }}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontWeight: 600 }}>Admin mode enabled.</span>
            {" "}Pressing <strong>Run</strong> will trigger a macOS password prompt.
            Full system access will be granted to <code style={{ fontSize: 11 }}>mo {command}</code> for this session only.
          </div>
        </div>
      )}

      <Terminal lines={lines} theme={theme} maxHeight={520} />

      {exitCode !== null && (
        <div style={{ fontSize: 12, color: exitCode === 0 ? c.success : c.warning, display: "flex", alignItems: "center", gap: 6 }}>
          {exitCode === 0 ? "✓ Completed successfully" : `⚠ Exited with code ${exitCode}`}
        </div>
      )}
    </div>
  );
}
