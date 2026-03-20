import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir } from "../lib/mole";
import { HardDrive, RefreshCw, Folder, FileText, ChevronRight, Home } from "lucide-react";

interface Props { theme: Theme }

interface DiskEntry {
  path: string;
  name: string;
  size_bytes: number;
  is_dir: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function sizeColor(bytes: number): string {
  if (bytes >= 5e9)  return "#FF3B30";
  if (bytes >= 1e9)  return "#FF9500";
  if (bytes >= 1e8)  return "#FFCC00";
  if (bytes >= 1e7)  return "#34C759";
  return "#007AFF";
}

// ── Treemap ───────────────────────────────────────────────────────────────────
function Treemap({ entries, total, onNavigate }: {
  entries: DiskEntry[]; total: number; onNavigate: (e: DiskEntry) => void;
}) {
  const top = entries.slice(0, 12);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
      {top.map((entry, i) => {
        const pct = total > 0 ? (entry.size_bytes / total) * 100 : 0;
        const minW = Math.max(6, pct);
        const col = sizeColor(entry.size_bytes);
        return (
          <div key={i}
            title={`${entry.path}\n${formatBytes(entry.size_bytes)}`}
            onClick={() => entry.is_dir && onNavigate(entry)}
            style={{
              flexGrow: pct, flexBasis: `${minW}%`, minWidth: 40, height: 40,
              borderRadius: 6, background: col + (i === 0 ? "cc" : "88"),
              border: `1px solid ${col}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", cursor: entry.is_dir ? "pointer" : "default",
            }}
          >
            {pct > 8 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", padding: "0 4px", textShadow: "0 1px 2px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {entry.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ path, homeDir, onNavigate, theme }: {
  path: string; homeDir: string; onNavigate: (p: string) => void; theme: Theme;
}) {
  const c = colors[theme];
  // Build segments: replace home prefix with ~
  const display = path.startsWith(homeDir) ? "~" + path.slice(homeDir.length) : path;
  const segments = display.split("/").filter(Boolean);
  const isHome = path === homeDir;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.textMuted, flexWrap: "wrap", marginBottom: 10 }}>
      <button onClick={() => onNavigate(homeDir)}
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: isHome ? c.text : c.accent, cursor: "pointer", padding: "2px 4px", borderRadius: 4, fontSize: 12 }}>
        <Home size={12} /> ~
      </button>
      {segments.map((seg, i) => {
        // Reconstruct full path up to this segment
        const fullPath = homeDir + display.slice(1).split("/").slice(0, i + 1).join("/").replace(/^/, "/");
        const isLast = i === segments.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronRight size={10} style={{ opacity: 0.4 }} />
            <button onClick={() => !isLast && onNavigate(fullPath)}
              style={{ background: "none", border: "none", color: isLast ? c.text : c.accent, cursor: isLast ? "default" : "pointer", padding: "2px 4px", borderRadius: 4, fontSize: 12, fontWeight: isLast ? 600 : 400 }}>
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Analyze({ theme }: Props) {
  const [entries, setEntries] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [showHidden, setShowHidden] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [homeDir, setHomeDir] = useState<string>("");
  const c = colors[theme];

  const scan = useCallback(async (scanPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const home = homeDir !== "" ? homeDir : await getHomeDir();
      if (!homeDir) setHomeDir(home);
      const path = scanPath ?? (currentPath !== "" ? currentPath : home);
      setCurrentPath(path);

      const result = await invoke<DiskEntry[]>("scan_disk", {
        homeDir: home,
        scanPath: path,
      });

      const visible = showHidden ? result : result.filter(e => !e.name.startsWith("."));
      const tot = visible.reduce((s, e) => s + e.size_bytes, 0);
      setEntries(visible);
      setTotal(tot);
      setScannedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [homeDir, currentPath, showHidden]);

  const navigate = useCallback((entry: DiskEntry) => {
    if (entry.is_dir) scan(entry.path);
  }, [scan]);

  const navigateTo = useCallback((path: string) => {
    scan(path);
  }, [scan]);

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", color: c.text }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={17} /> Disk Analyze
          </h2>
          {scannedAt && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>Scanned at {scannedAt}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {entries.length > 0 && (
            <>
              <button onClick={() => setShowHidden(v => !v)}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: showHidden ? c.accent : "transparent", color: showHidden ? "#fff" : c.text, cursor: "pointer" }}>
                {showHidden ? "Hide dotfiles" : "Show dotfiles"}
              </button>
              <button onClick={() => setView("list")}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: view === "list" ? c.accent : "transparent", color: view === "list" ? "#fff" : c.text, cursor: "pointer" }}>
                List
              </button>
              <button onClick={() => setView("map")}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: view === "map" ? c.accent : "transparent", color: view === "map" ? "#fff" : c.text, cursor: "pointer" }}>
                Map
              </button>
            </>
          )}
          <button onClick={() => scan()} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, background: loading ? c.textMuted : c.accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer" }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Scanning…" : entries.length > 0 ? "Re-scan" : "Scan"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: c.danger + "22", border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.danger, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Breadcrumb — shown after first scan */}
      {currentPath && homeDir && (
        <Breadcrumb path={currentPath} homeDir={homeDir} onNavigate={navigateTo} theme={theme} />
      )}

      {/* Summary bar */}
      {entries.length > 0 && (
        <div style={{ display: "flex", gap: 20, marginBottom: 12, padding: "8px 14px", borderRadius: 8, background: c.card, border: `1px solid ${c.cardBorder}`, fontSize: 13, flexWrap: "wrap" }}>
          <span><strong>{entries.length}</strong> <span style={{ color: c.textMuted }}>items</span></span>
          <span><strong>{formatBytes(total)}</strong> <span style={{ color: c.textMuted }}>total</span></span>
          {entries[0] && (
            <span style={{ color: c.textMuted }}>
              Largest: <strong style={{ color: c.text }}>{entries[0].name}</strong>
              {" "}({formatBytes(entries[0].size_bytes)})
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {view === "map" && entries.length > 0 && (
          <Treemap entries={entries} total={total} onNavigate={navigate} />
        )}

        {(view === "list" || entries.length === 0) && (
          <>
            {entries.map((entry, i) => {
              const pctOfTotal = total > 0 ? (entry.size_bytes / total) * 100 : 0;
              const col = sizeColor(entry.size_bytes);

              return (
                <div key={i}
                  onClick={() => entry.is_dir && navigate(entry)}
                  style={{
                    padding: "10px 14px", borderRadius: 8, marginBottom: 5,
                    background: c.card, border: `1px solid ${c.cardBorder}`,
                    position: "relative", overflow: "hidden",
                    cursor: entry.is_dir ? "pointer" : "default",
                  }}
                >
                  {/* Proportional fill bar */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(pctOfTotal * 3, 95)}%`, background: col + "18" }} />

                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 20, textAlign: "right" }}>{i + 1}</span>
                        {entry.is_dir
                          ? <Folder size={13} style={{ color: col, flexShrink: 0 }} />
                          : <FileText size={13} style={{ color: c.textMuted, flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.name}
                          {entry.is_dir && <span style={{ fontSize: 10, color: c.textMuted, marginLeft: 4 }}>›</span>}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2, paddingLeft: 41, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.path.replace(homeDir, "~")}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: col }}>{formatBytes(entry.size_bytes)}</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{pctOfTotal.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Left accent bar */}
                  <div style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, borderRadius: "0 2px 2px 0", background: col }} />
                </div>
              );
            })}

            {!loading && entries.length === 0 && !error && (
              <div style={{ textAlign: "center", color: c.textMuted, paddingTop: 60 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💾</div>
                <p style={{ fontSize: 14, margin: 0 }}>Click Scan to analyze disk usage</p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
