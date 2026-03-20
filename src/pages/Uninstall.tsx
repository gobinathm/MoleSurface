import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir } from "../lib/mole";
import Terminal from "../components/Terminal";
import { PackageX, Search, RefreshCw, Eye, Trash2 } from "lucide-react";

interface Props { theme: Theme }

interface AppEntry {
  name: string;
  path: string;
  bundle_id: string;
  size_bytes: number;
  last_used: string; // "2024-01-15 10:30:00 +0000" or ""
}

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "never used";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "unknown";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1)   return "today";
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function Uninstall({ theme }: Props) {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const c = colors[theme];

  const loadApps = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setLines([]);
    setExitCode(null);
    try {
      const homeDir = await getHomeDir();
      const result = await invoke<AppEntry[]>("list_apps", { homeDir });
      setApps(result);
    } catch (e) {
      setApps([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadApps(); }, []);

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(a => a.path)));
  const selectNone = () => setSelected(new Set());

  const selectedApps = apps.filter(a => selected.has(a.path));
  const selectedSize = selectedApps.reduce((s, a) => s + a.size_bytes, 0);

  const runUninstall = useCallback(async (dryRun: boolean) => {
    if (selectedApps.length === 0) return;
    unlistenRef.current?.();
    setLines([]);
    setExitCode(null);
    setRunning(true);

    try {
      const homeDir = await getHomeDir();
      const eventId = `uninstall-${Date.now()}`;

      const unlisten = await listen<{ event_id: string; line: string }>(
        "cmd-line",
        (ev) => {
          if (ev.payload.event_id === eventId) {
            setLines(prev => [...prev, ev.payload.line]);
          }
        }
      );
      unlistenRef.current = unlisten;

      const code = await invoke<number>("uninstall_apps", {
        eventId,
        apps: selectedApps.map(a => ({ name: a.name, path: a.path, bundle_id: a.bundle_id })),
        homeDir,
        dryRun,
      });
      setExitCode(code);

      // Refresh app list after real uninstall
      if (!dryRun && code === 0) await loadApps();
    } catch (e: unknown) {
      setLines(prev => [...prev, `Error: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setRunning(false);
    }
  }, [selectedApps, loadApps]);

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", gap: 14, color: c.text }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <PackageX size={17} /> Uninstall Apps
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textMuted }}>
            Select apps to remove along with their leftover Library files.
          </p>
        </div>
        <button onClick={loadApps} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${c.cardBorder}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, color: c.text, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Search + select controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: c.textMuted, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter apps…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, fontSize: 12, borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: c.card, color: c.text, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <button onClick={selectAll} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: "transparent", color: c.text, cursor: "pointer" }}>
          Select all
        </button>
        <button onClick={selectNone} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: "transparent", color: c.text, cursor: "pointer" }}>
          Deselect all
        </button>
      </div>

      {/* App list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && (
          <div style={{ textAlign: "center", color: c.textMuted, paddingTop: 40, fontSize: 13 }}>
            <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
            <div>Scanning applications…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: c.textMuted, paddingTop: 40, fontSize: 13 }}>
            {apps.length === 0 ? "No applications found." : "No apps match the filter."}
          </div>
        )}

        {!loading && filtered.map((app) => {
          const isSelected = selected.has(app.path);
          const ago = timeAgo(app.last_used);
          const isOld = app.last_used && (Date.now() - new Date(app.last_used).getTime()) > 365 * 86400000;

          return (
            <div key={app.path}
              onClick={() => toggleSelect(app.path)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "9px 12px", borderRadius: 8, marginBottom: 4,
                background: isSelected ? c.accent + "18" : c.card,
                border: `1px solid ${isSelected ? c.accent + "66" : c.cardBorder}`,
                cursor: "pointer", transition: "all 0.1s",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${isSelected ? c.accent : c.cardBorder}`,
                background: isSelected ? c.accent : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.1s",
              }}>
                {isSelected && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
              </div>

              {/* Name + path */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.name}
                </div>
                <div style={{ fontSize: 10, color: c.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.path.replace("/Applications/", "/Applications/")}
                </div>
              </div>

              {/* Last used */}
              <div style={{ fontSize: 11, color: isOld ? "#FF9500" : c.textMuted, flexShrink: 0, minWidth: 70, textAlign: "right" }}>
                {ago}
              </div>

              {/* Size */}
              <div style={{ fontSize: 12, fontWeight: 600, color: c.text, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                {app.size_bytes > 0 ? formatBytes(app.size_bytes) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection summary + action buttons */}
      {apps.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${c.cardBorder}`, paddingTop: 12 }}>
          <div style={{ flex: 1, fontSize: 12, color: c.textMuted }}>
            {selected.size > 0
              ? <><strong style={{ color: c.text }}>{selected.size}</strong> app{selected.size !== 1 ? "s" : ""} selected · <strong style={{ color: c.text }}>{formatBytes(selectedSize)}</strong></>
              : `${apps.length} apps · select to remove`
            }
          </div>
          <button
            onClick={() => runUninstall(true)}
            disabled={selected.size === 0 || running}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 14px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: "transparent", color: selected.size === 0 ? c.textMuted : c.text, cursor: selected.size === 0 || running ? "not-allowed" : "pointer" }}
          >
            <Eye size={13} /> Preview
          </button>
          <button
            onClick={() => runUninstall(false)}
            disabled={selected.size === 0 || running}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none", background: selected.size === 0 ? c.textMuted : c.danger, color: "#fff", cursor: selected.size === 0 || running ? "not-allowed" : "pointer", fontWeight: 500 }}
          >
            <Trash2 size={13} />
            {running ? "Removing…" : `Uninstall ${selected.size > 0 ? `${selected.size} app${selected.size !== 1 ? "s" : ""}` : ""}`}
          </button>
        </div>
      )}

      {/* Output terminal */}
      {lines.length > 0 && (
        <>
          <Terminal lines={lines} theme={theme} minHeight={120} maxHeight={300} />
          {exitCode !== null && (
            <div style={{ fontSize: 12, color: exitCode === 0 ? c.success : c.warning, display: "flex", alignItems: "center", gap: 6 }}>
              {exitCode === 0 ? "✓ Completed" : `⚠ Exited with code ${exitCode}`}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
