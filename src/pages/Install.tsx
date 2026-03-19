import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeTextFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { fetchLatestRelease, getAssetUrlForArch } from "../lib/github";
import { invalidateMoCache } from "../lib/mole";
import { colors, type Theme } from "../lib/theme";

interface Props {
  onInstalled: () => void;
  theme: Theme;
}

type Status = "idle" | "downloading" | "extracting" | "done" | "error";

export default function Install({ onInstalled, theme }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  const c = colors[theme];

  const addLog = (line: string) => setLog((l) => [...l, line]);

  const install = async () => {
    setStatus("downloading");
    setLog([]);
    setProgress(0);

    try {
      addLog("Fetching latest Mole release from GitHub…");
      const release = await fetchLatestRelease();
      addLog(`Found ${release.tag}`);

      const arch = await invoke<string>("check_arch");
      addLog(`Detected architecture: ${arch}`);

      const url = getAssetUrlForArch(release.assets, arch);
      if (!url) throw new Error(`No binary found for architecture: ${arch}`);

      const homeDir = await invoke<string>("get_home_dir");
      const tarball = `${homeDir}/.molesurface/mole.tar.gz`;

      await mkdir(".molesurface", { baseDir: BaseDirectory.Home, recursive: true });
      await mkdir(".molesurface/bin", { baseDir: BaseDirectory.Home, recursive: true });

      // Stream curl output so we can show progress
      const eventId = `install-${Date.now()}`;
      const unlisten = await listen<{ event_id: string; line: string }>("cmd-line", (event) => {
        if (event.payload.event_id !== eventId) return;
        const line = event.payload.line;
        const match = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) setProgress(parseFloat(match[1]));
      });
      unlistenRef.current = unlisten;

      addLog(`Downloading ${url.split("/").pop()}…`);
      const dlResult = await invoke<number>("stream_command", {
        eventId,
        cmd: "/usr/bin/curl",
        args: ["-L", "--progress-bar", "-o", tarball, url],
        homeDir,
      });
      unlistenRef.current?.();
      unlistenRef.current = null;

      if (dlResult !== 0) throw new Error(`Download failed (exit ${dlResult})`);
      setProgress(100);
      addLog("Download complete. Extracting…");
      setStatus("extracting");

      const extractResult = await invoke<{ code: number; stdout: string; stderr: string }>(
        "run_command",
        {
          cmd: "/bin/sh",
          args: [
            "-c",
            `tar -xzf "${tarball}" -C "${homeDir}/.molesurface/" && chmod -R +x "${homeDir}/.molesurface/bin/" && rm -f "${tarball}"`,
          ],
          homeDir,
        }
      );

      if (extractResult.code !== 0) {
        throw new Error(extractResult.stderr || `Extraction failed (exit ${extractResult.code})`);
      }

      await writeTextFile(".molesurface/version", release.tag, { baseDir: BaseDirectory.Home });
      invalidateMoCache();

      addLog(`✓ Mole ${release.tag} installed to ~/.molesurface/bin/mo`);
      setStatus("done");
      setTimeout(onInstalled, 1200);
    } catch (e: unknown) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      addLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
      setStatus("error");
    }
  };

  const isRunning = status === "downloading" || status === "extracting";

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28, padding: 48, textAlign: "center", color: c.text }}>
      <div style={{ fontSize: 56, lineHeight: 1 }}>🐹</div>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Welcome to MoleSurface</h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: c.textMuted, maxWidth: 380 }}>
          Mole is not installed yet. MoleSurface will download and install it automatically — no Homebrew required.
        </p>
      </div>

      {status === "idle" && (
        <button onClick={install} style={{ background: c.accent, color: "#fff", border: "none", borderRadius: 10, padding: "11px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Install Mole
        </button>
      )}

      {isRunning && (
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: c.textMuted, marginBottom: 6 }}>
            <span>{status === "downloading" ? "Downloading…" : "Extracting…"}</span>
            {status === "downloading" && <span>{progress.toFixed(0)}%</span>}
          </div>
          <div style={{ background: c.card, borderRadius: 4, height: 5, overflow: "hidden" }}>
            <div style={{ background: c.accent, height: "100%", borderRadius: 4, width: status === "extracting" ? "100%" : `${progress}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {status === "error" && (
        <button onClick={install} style={{ background: c.danger, color: "#fff", border: "none", borderRadius: 10, padding: "11px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Retry
        </button>
      )}

      {log.length > 0 && (
        <div style={{ width: "100%", maxWidth: 460, textAlign: "left", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.6, background: c.card, border: `1px solid ${c.cardBorder}`, padding: "12px 14px", borderRadius: 8, color: c.termText }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
