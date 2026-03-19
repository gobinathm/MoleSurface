import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { HardDrive, RefreshCw } from "lucide-react";

interface Props { theme: Theme }

interface DiskEntry {
  path: string;
  size_bytes: number;
  file_count?: number;
  name?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function sizeColor(bytes: number): string {
  if (bytes >= 5e9)  return "#FF3B30"; // > 5 GB  — red
  if (bytes >= 1e9)  return "#FF9500"; // > 1 GB  — orange
  if (bytes >= 1e8)  return "#FFCC00"; // > 100 MB — yellow
  if (bytes >= 1e7)  return "#34C759"; // > 10 MB  — green
  return "#007AFF";                    // rest     — blue
}

function shortenPath(path: string): string {
  // Replace home prefix with ~
  const home = path.match(/^\/Users\/[^/]+/)?.[0];
  return home ? path.replace(home, "~") : path;
}

// ── Treemap block (top-level visual) ─────────────────────────────────────────
function Treemap({ entries, total }: { entries: DiskEntry[]; total: number; theme: Theme }) {
  // Show top 12 items as proportional blocks in a flex-wrap layout
  const top = entries.slice(0, 12);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
      {top.map((entry, i) => {
        const pct = total > 0 ? (entry.size_bytes / total) * 100 : 0;
        const minW = Math.max(6, pct); // at least 6% width so tiny items are visible
        const name = entry.name ?? entry.path.split("/").pop() ?? entry.path;
        const col = sizeColor(entry.size_bytes);

        return (
          <div
            key={i}
            title={`${entry.path}\n${formatBytes(entry.size_bytes)}`}
            style={{
              flexGrow: pct,
              flexBasis: `${minW}%`,
              minWidth: 40,
              height: 36,
              borderRadius: 6,
              background: col + (i === 0 ? "cc" : "88"),
              border: `1px solid ${col}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              cursor: "default",
            }}
          >
            {pct > 8 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", padding: "0 4px", textShadow: "0 1px 2px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Analyze({ theme }: Props) {
  const [entries, setEntries] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const c = colors[theme];

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    try {
      const homeDir = await getHomeDir();
      const loc = await findMoLocation(homeDir);
      if (!loc) throw new Error("mo not found");

      const result = await invoke<{ code: number; stdout: string; stderr: string }>(
        "run_command",
        { cmd: loc.path, args: ["analyze", "--json"], homeDir }
      );
      const output = result.stdout + result.stderr;

      const match = output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (!match) { setError("Could not parse JSON from `mo analyze --json`"); return; }

      const parsed = JSON.parse(match[0]);
      let items: DiskEntry[] = [];
      if (Array.isArray(parsed)) {
        items = parsed as DiskEntry[];
      } else if (parsed.items) {
        items = parsed.items as DiskEntry[];
      } else if (parsed.directories) {
        items = parsed.directories as DiskEntry[];
      } else {
        items = Object.entries(parsed).map(([path, val]) => {
          const v = val as { size_bytes?: number; size?: number; file_count?: number };
          return { path, size_bytes: v.size_bytes ?? v.size ?? 0, file_count: v.file_count };
        });
      }

      items.sort((a, b) => b.size_bytes - a.size_bytes);
      const tot = items.reduce((s, e) => s + e.size_bytes, 0);
      setEntries(items);
      setTotal(tot);
      setScannedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", color: c.text }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={17} /> Disk Analyze
          </h2>
          {scannedAt && (
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>Scanned at {scannedAt}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {entries.length > 0 && (
            <>
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
          <button onClick={run} disabled={loading}
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

      {/* Summary bar */}
      {entries.length > 0 && (
        <div style={{ display: "flex", gap: 20, marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: c.card, border: `1px solid ${c.cardBorder}`, fontSize: 13, flexWrap: "wrap" }}>
          <span><strong>{entries.length}</strong> <span style={{ color: c.textMuted }}>items</span></span>
          <span><strong>{formatBytes(total)}</strong> <span style={{ color: c.textMuted }}>total</span></span>
          {entries[0] && (
            <span style={{ color: c.textMuted }}>
              Largest: <strong style={{ color: c.text }}>{entries[0].name ?? entries[0].path.split("/").pop()}</strong>
              {" "}({formatBytes(entries[0].size_bytes)})
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Treemap view */}
        {view === "map" && entries.length > 0 && (
          <Treemap entries={entries} total={total} theme={theme} />
        )}

        {/* List view */}
        {(view === "list" || entries.length === 0) && (
          <>
            {entries.map((entry, i) => {
              const pctOfTotal = total > 0 ? (entry.size_bytes / total) * 100 : 0;
              const name = entry.name ?? entry.path.split("/").pop() ?? entry.path;
              const col = sizeColor(entry.size_bytes);

              return (
                <div key={i} style={{
                  padding: "10px 14px", borderRadius: 8, marginBottom: 5,
                  background: c.card, border: `1px solid ${c.cardBorder}`,
                  position: "relative", overflow: "hidden",
                }}>
                  {/* Proportional fill — relative to TOTAL, not max */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${Math.min(pctOfTotal * 3, 95)}%`,
                    background: col + "18",
                  }} />

                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    {/* Left: rank + name + path */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 20, textAlign: "right" }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2, paddingLeft: 28, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {shortenPath(entry.path)}
                      </div>
                    </div>

                    {/* Right: size + percent + file count */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: col }}>{formatBytes(entry.size_bytes)}</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                        {pctOfTotal.toFixed(1)}%
                        {entry.file_count !== undefined && ` · ${entry.file_count} files`}
                      </div>
                    </div>
                  </div>

                  {/* Thin left accent bar */}
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
