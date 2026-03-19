import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { HardDrive, RefreshCw } from "lucide-react";

interface Props {
  theme: Theme;
}

interface DiskEntry {
  path: string;
  size_bytes: number;
  name?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function Analyze({ theme }: Props) {
  const [entries, setEntries] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
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

      // Try to find JSON array or object in output
      const match = output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (!match) {
        setError("Could not parse JSON output from `mo analyze --json`");
        return;
      }

      const parsed = JSON.parse(match[0]);
      // Normalize: could be array or { items: [] } or { directories: [] }
      let items: DiskEntry[] = [];
      if (Array.isArray(parsed)) {
        items = parsed as DiskEntry[];
      } else if (parsed.items) {
        items = parsed.items as DiskEntry[];
      } else if (parsed.directories) {
        items = parsed.directories as DiskEntry[];
      } else {
        // Try top-level keys as entries
        items = Object.entries(parsed).map(([path, val]) => {
          const v = val as { size_bytes?: number; size?: number };
          return { path, size_bytes: v.size_bytes ?? v.size ?? 0 };
        });
      }

      items.sort((a, b) => b.size_bytes - a.size_bytes);
      setEntries(items);
      setTotal(items.reduce((s, e) => s + e.size_bytes, 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  const maxSize = entries[0]?.size_bytes ?? 1;

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", color: c.text }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={17} />
            Disk Analyze
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textMuted }}>
            Scan disk usage with <code style={{ fontSize: 11 }}>mo analyze</code>
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: loading ? c.textMuted : c.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Scanning…" : "Scan"}
        </button>
      </div>

      {error && (
        <div style={{ background: c.danger + "22", border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.danger, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 12 }}>
          {entries.length} items · {formatBytes(total)} total
        </div>
      )}

      {/* Results list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {entries.map((entry, i) => {
          const pct = (entry.size_bytes / maxSize) * 100;
          const name = entry.name ?? entry.path.split("/").pop() ?? entry.path;
          return (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 6,
                background: c.card,
                border: `1px solid ${c.cardBorder}`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Background bar */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: i === 0 ? "#FF6B6B22" : "#45B7D122",
                  borderRadius: 8,
                }}
              />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{entry.path}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginLeft: 16, flexShrink: 0 }}>
                  {formatBytes(entry.size_bytes)}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && entries.length === 0 && !error && (
          <div style={{ textAlign: "center", color: c.textMuted, paddingTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💾</div>
            <p style={{ fontSize: 14, margin: 0 }}>Click Scan to analyze disk usage</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
