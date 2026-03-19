import { useState, useCallback, useRef, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Terminal from "./Terminal";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";

interface Props {
  title: string;
  description: string;
  command: string;
  args?: string[];
  icon: ReactNode;
  theme: Theme;
}

export default function StreamPage({
  title,
  description,
  command,
  args = [],
  icon,
  theme,
}: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const c = colors[theme];

  const run = useCallback(async () => {
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

      const code = await invoke<number>("stream_command", {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: c.text, display: "flex", alignItems: "center", gap: 8 }}>
            {icon}{title}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textMuted }}>{description}</p>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            background: running ? c.textMuted : c.accent,
            color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 20px", fontSize: 13, fontWeight: 500,
            cursor: running ? "not-allowed" : "pointer",
            flexShrink: 0, transition: "background 0.15s",
          }}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      <Terminal lines={lines} theme={theme} maxHeight={520} />

      {exitCode !== null && (
        <div style={{ fontSize: 12, color: exitCode === 0 ? c.success : c.warning, display: "flex", alignItems: "center", gap: 6 }}>
          {exitCode === 0 ? "✓ Completed successfully" : `⚠ Exited with code ${exitCode}`}
        </div>
      )}
    </div>
  );
}
