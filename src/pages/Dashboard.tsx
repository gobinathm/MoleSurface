import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { RefreshCw } from "lucide-react";

interface Props {
  theme: Theme;
}

interface StatusData {
  cpu?: { usage_percent?: number; core_count?: number; model?: string };
  memory?: { used_percent?: number; used_gb?: number; total_gb?: number };
  disk?: { used_percent?: number; used_gb?: number; total_gb?: number; free_gb?: number };
  network?: { interface?: string; bytes_sent?: number; bytes_recv?: number };
  system?: { hostname?: string; os?: string; uptime?: string };
  [key: string]: unknown;
}

function Gauge({ label, value, unit, color, sub }: {
  label: string; value: number; unit: string; color: string; sub?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 10,
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>
        {value.toFixed(1)}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 12, opacity: 0.5 }}>{sub}</div>}
      <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 3, height: 5 }}>
        <div
          style={{
            background: color,
            height: "100%",
            borderRadius: 3,
            width: `${pct}%`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function Dashboard({ theme }: Props) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = colors[theme];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const homeDir = await getHomeDir();
      const loc = await findMoLocation(homeDir);
      if (!loc) throw new Error("mo not found");

      const result = await invoke<{ code: number; stdout: string; stderr: string }>(
        "run_command",
        { cmd: loc.path, args: ["status", "--json"], homeDir }
      );

      const output = result.stdout + result.stderr;
      const match = output.match(/\{[\s\S]*\}/);
      if (match) {
        setData(JSON.parse(match[0]) as StatusData);
      } else {
        setError("Could not parse JSON output from `mo status --json`");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  return (
    <div
      style={{
        padding: 24,
        color: c.text,
        height: "100%",
        overflowY: "auto",
        // CSS vars for card styles
        "--card-bg": c.card,
        "--card-border": c.cardBorder,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>System Status</h2>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            color: c.text,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ background: c.danger + "22", border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.danger, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60%",
            gap: 12,
            color: c.textMuted,
          }}
        >
          <span style={{ fontSize: 36 }}>📊</span>
          <p style={{ margin: 0, fontSize: 14 }}>Click Refresh to load system status</p>
          <button
            onClick={refresh}
            style={{
              background: c.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Load Status
          </button>
        </div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {data.cpu?.usage_percent !== undefined && (
              <Gauge
                label="CPU"
                value={data.cpu.usage_percent}
                unit="%"
                color="#FF6B6B"
                sub={data.cpu.model ? data.cpu.model.split("@")[0].trim() : undefined}
              />
            )}
            {data.memory?.used_percent !== undefined && (
              <Gauge
                label="Memory"
                value={data.memory.used_percent}
                unit="%"
                color="#4ECDC4"
                sub={
                  data.memory.used_gb !== undefined && data.memory.total_gb !== undefined
                    ? `${data.memory.used_gb.toFixed(1)} / ${data.memory.total_gb.toFixed(1)} GB`
                    : undefined
                }
              />
            )}
            {data.disk?.used_percent !== undefined && (
              <Gauge
                label="Disk"
                value={data.disk.used_percent}
                unit="%"
                color="#45B7D1"
                sub={
                  data.disk.free_gb !== undefined
                    ? `${data.disk.free_gb.toFixed(1)} GB free`
                    : undefined
                }
              />
            )}
          </div>

          {/* System info */}
          {data.system && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 10,
                border: `1px solid ${c.cardBorder}`,
                background: c.card,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>
                System
              </div>
              <div style={{ borderTop: `1px solid ${c.cardBorder}` }}>
                {data.system.hostname && <InfoRow label="Hostname" value={data.system.hostname} />}
                {data.system.os && <InfoRow label="OS" value={data.system.os} />}
                {data.system.uptime && <InfoRow label="Uptime" value={data.system.uptime} />}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
