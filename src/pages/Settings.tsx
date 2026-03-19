import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { colors, type Theme } from "../lib/theme";
import { fetchLatestRelease, getAssetUrlForArch, isNewerVersion } from "../lib/github";
import {
  getHomeDir,
  getInstalledVersion,
  findMoLocation,
  invalidateMoCache,
  type MoLocation,
} from "../lib/mole";
import { RefreshCw, Download, CheckCircle, Package } from "lucide-react";

interface Props {
  theme: Theme;
}

type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "updating" | "done" | "error";

export default function Settings({ theme }: Props) {
  const [loc, setLoc] = useState<MoLocation | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [log, setLog] = useState<string[]>([]);
  const c = colors[theme];

  const addLog = (line: string) => setLog((l) => [...l, line]);

  useEffect(() => {
    getHomeDir().then(async (home) => {
      const found = await findMoLocation(home);
      setLoc(found);
      if (found?.source === "managed") {
        getInstalledVersion().then(setInstalledVersion);
      }
    });
  }, []);

  const checkForUpdates = useCallback(async () => {
    setUpdateState("checking");
    setLog([]);
    try {
      addLog("Checking GitHub for latest release…");
      const release = await fetchLatestRelease();
      setLatestVersion(release.tag);
      const installed = await getInstalledVersion();
      if (!installed) {
        setUpdateState("available");
        addLog(`Latest: ${release.tag}`);
        return;
      }
      if (isNewerVersion(release.tag, installed)) {
        setUpdateState("available");
        addLog(`Update available: ${installed} → ${release.tag}`);
      } else {
        setUpdateState("up-to-date");
        addLog(`✓ Already on latest (${installed})`);
      }
    } catch (e: unknown) {
      addLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUpdateState("error");
    }
  }, []);

  const downloadAndExtract = async (homeDir: string, url: string, arch: string, tag: string) => {
    const tarball = `${homeDir}/.molesurface/mole-update.tar.gz`;
    await mkdir(".molesurface", { baseDir: BaseDirectory.Home, recursive: true });
    await mkdir(".molesurface/bin", { baseDir: BaseDirectory.Home, recursive: true });

    addLog(`Downloading ${tag} for ${arch}…`);
    const dlResult = await invoke<{ code: number; stderr: string }>("run_command", {
      cmd: "/usr/bin/curl",
      args: ["-L", "-s", "-o", tarball, url],
      homeDir,
    });
    if (dlResult.code !== 0) throw new Error(dlResult.stderr || "Download failed");

    addLog("Extracting…");
    const extract = await invoke<{ code: number; stderr: string }>("run_command", {
      cmd: "/bin/sh",
      args: [
        "-c",
        `tar -xzf "${tarball}" -C "${homeDir}/.molesurface/" && chmod -R +x "${homeDir}/.molesurface/bin/" && rm -f "${tarball}"`,
      ],
      homeDir,
    });
    if (extract.code !== 0) throw new Error(extract.stderr || "Extraction failed");
  };

  const updateManaged = useCallback(async () => {
    setUpdateState("updating");
    setLog([]);
    try {
      const release = await fetchLatestRelease();
      const arch = await invoke<string>("check_arch");
      const url = getAssetUrlForArch(release.assets, arch);
      if (!url) throw new Error(`No binary for arch: ${arch}`);
      const homeDir = await invoke<string>("get_home_dir");

      await downloadAndExtract(homeDir, url, arch, release.tag);
      await writeTextFile(".molesurface/version", release.tag, { baseDir: BaseDirectory.Home });

      setInstalledVersion(release.tag);
      setLatestVersion(release.tag);
      addLog(`✓ Updated to ${release.tag}`);
      setUpdateState("done");
    } catch (e: unknown) {
      addLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUpdateState("error");
    }
  }, []);

  const installManaged = useCallback(async () => {
    setUpdateState("updating");
    setLog([]);
    try {
      const release = await fetchLatestRelease();
      const arch = await invoke<string>("check_arch");
      const url = getAssetUrlForArch(release.assets, arch);
      if (!url) throw new Error(`No binary for arch: ${arch}`);
      const homeDir = await invoke<string>("get_home_dir");

      await downloadAndExtract(homeDir, url, arch, release.tag);
      await writeTextFile(".molesurface/version", release.tag, { baseDir: BaseDirectory.Home });

      invalidateMoCache();
      const newLoc = await findMoLocation(homeDir);
      setLoc(newLoc);
      setInstalledVersion(release.tag);
      addLog(`✓ Managed copy installed (${release.tag}) — MoleSurface will now use it.`);
      setUpdateState("done");
    } catch (e: unknown) {
      addLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUpdateState("error");
    }
  }, []);

  const card = (children: React.ReactNode) => (
    <div style={{ background: c.card, border: `1px solid ${c.cardBorder}`, borderRadius: 10, padding: "16px 18px", marginBottom: 14 }}>
      {children}
    </div>
  );

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13, borderBottom: `1px solid ${c.cardBorder}` }}>
      <span style={{ color: c.textMuted }}>{label}</span>
      <span style={{ fontWeight: 500, color: c.text }}>{value}</span>
    </div>
  );

  const sourceBadge = (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
      background: loc?.source === "managed" ? c.accent + "22" : c.success + "22",
      color: loc?.source === "managed" ? c.accent : c.success,
    }}>
      {loc?.source === "managed" ? "Managed" : "Homebrew"}
    </span>
  );

  return (
    <div style={{ padding: 24, color: c.text, maxWidth: 560, overflowY: "auto", height: "100%" }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 600 }}>Settings</h2>

      {card(<>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>Mole</div>
        {row("Source", sourceBadge)}
        {loc && row("Path", <code style={{ fontSize: 11, opacity: 0.8 }}>{loc.path}</code>)}
        {loc?.source === "managed" && row("Installed version", installedVersion ?? "—")}
        {loc?.source === "managed" && row("Latest version", latestVersion ?? "—")}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {loc?.source === "managed" && <>
            <button onClick={checkForUpdates} disabled={updateState === "checking" || updateState === "updating"}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${c.cardBorder}`, borderRadius: 7, padding: "7px 14px", fontSize: 13, color: c.text, cursor: "pointer" }}>
              <RefreshCw size={13} /> Check for Updates
            </button>
            {updateState === "available" && (
              <button onClick={updateManaged}
                style={{ display: "flex", alignItems: "center", gap: 6, background: c.accent, border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer" }}>
                <Download size={13} /> Update to {latestVersion}
              </button>
            )}
            {(updateState === "up-to-date" || updateState === "done") && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.success }}>
                <CheckCircle size={14} /> Up to date
              </span>
            )}
          </>}

          {loc?.source === "homebrew" && (
            <div style={{ width: "100%" }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: c.textMuted, lineHeight: 1.5 }}>
                Mole is managed by Homebrew. To update, run{" "}
                <code style={{ background: c.card, padding: "1px 5px", borderRadius: 4 }}>brew upgrade mole</code> in your terminal.
              </p>
              <button onClick={installManaged} disabled={updateState === "updating"}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${c.cardBorder}`, borderRadius: 7, padding: "7px 14px", fontSize: 13, color: c.text, cursor: "pointer" }}>
                <Package size={13} />
                {updateState === "updating" ? "Installing…" : "Also install managed copy"}
              </button>
              {updateState === "done" && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: c.success }}>
                  ✓ Managed copy installed — MoleSurface will use it from now on.
                </p>
              )}
            </div>
          )}
        </div>
      </>)}

      {log.length > 0 && card(
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.6, color: c.termText }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {card(<>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>About</div>
        {row("MoleSurface", "UI wrapper for tw93/mole")}
        {row("Mole source", (
          <a href="https://github.com/tw93/mole" target="_blank" rel="noopener noreferrer"
            style={{ color: c.accent, textDecoration: "none", fontSize: 12 }}>
            github.com/tw93/mole
          </a>
        ))}
      </>)}
    </div>
  );
}
