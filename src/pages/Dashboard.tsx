import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { RefreshCw, Activity } from "lucide-react";

interface Props { theme: Theme }

interface StatusData {
  cpu?:     { usage_percent?: number; core_count?: number; model?: string };
  memory?:  { used_percent?: number; used_gb?: number; total_gb?: number; free_gb?: number };
  disk?:    { used_percent?: number; used_gb?: number; total_gb?: number; free_gb?: number };
  network?: { interface?: string; bytes_sent?: number; bytes_recv?: number; bytes_sent_readable?: string; bytes_recv_readable?: string };
  battery?: { percent?: number; charging?: boolean; status?: string };
  system?:  { hostname?: string; os?: string; uptime?: string; kernel?: string };
  [key: string]: unknown;
}

const INTERVALS = [5, 10, 30, 60] as const;

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ history, color }: { history: number[]; color: string }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18, marginTop: 6 }}>
      {history.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            minHeight: 2,
            height: `${Math.max(2, (v / max) * 100)}%`,
            background: color,
            opacity: 0.2 + (i / history.length) * 0.8,
            borderRadius: 1,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Gauge card ───────────────────────────────────────────────────────────────
function Gauge({ label, value, unit, color, sub, history }: {
  label: string; value: number; unit: string; color: string; sub?: string; history: number[];
}) {
  const pct = Math.min(100, Math.max(0, value));
  // Color shifts red as value approaches 100%
  const barColor = pct > 85 ? "#FF3B30" : pct > 65 ? "#FF9500" : color;

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 10,
      border: "1px solid var(--cb)", background: "var(--cg)",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
        {value.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, opacity: 0.5 }}>{sub}</div>}
      <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 3, height: 4 }}>
        <div style={{ background: barColor, height: "100%", borderRadius: 3, width: `${pct}%`, transition: "width 0.5s ease, background 0.5s ease" }} />
      </div>
      <Sparkline history={history} color={barColor} />
    </div>
  );
}

// ── Info table ───────────────────────────────────────────────────────────────
function InfoTable({ rows, cardBorder }: { rows: [string, string][]; cardBorder: string }) {
  return (
    <div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: `1px solid ${cardBorder}` }}>
          <span style={{ opacity: 0.5 }}>{label}</span>
          <span style={{ fontWeight: 500, maxWidth: "60%", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard({ theme }: Props) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [interval, setInterval_] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Rolling history (last 20 readings) for sparklines
  const history = useRef<{ cpu: number[]; mem: number[]; disk: number[] }>({ cpu: [], mem: [], disk: [] });

  const c = colors[theme];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const homeDir = await getHomeDir();
      const loc = await findMoLocation(homeDir);
      if (!loc) throw new Error("mo not found — check Settings");

      const result = await invoke<{ code: number; stdout: string; stderr: string }>(
        "run_command",
        { cmd: loc.path, args: ["status", "--json"], homeDir }
      );

      const output = result.stdout + result.stderr;
      const match = output.match(/\{[\s\S]*\}/);
      if (!match) { setError("Could not parse JSON from `mo status --json`"); return; }

      const parsed = JSON.parse(match[0]) as StatusData;
      setData(parsed);
      setLastUpdated(new Date());

      // Append to history (cap at 20)
      const push = (arr: number[], v?: number) => {
        if (v === undefined) return arr;
        return [...arr, v].slice(-20);
      };
      history.current = {
        cpu:  push(history.current.cpu,  parsed.cpu?.usage_percent),
        mem:  push(history.current.mem,  parsed.memory?.used_percent),
        disk: push(history.current.disk, parsed.disk?.used_percent),
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(refresh, interval * 1000);
    return () => window.clearInterval(id);
  }, [live, interval, refresh]);

  // Load on mount
  useEffect(() => { refresh(); }, []);

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div style={{ padding: 24, color: c.text, height: "100%", overflowY: "auto", "--cg": c.card, "--cb": c.cardBorder } as React.CSSProperties}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>System Status</h2>
          {timeStr && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>Last updated {timeStr}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Live toggle */}
          <button
            onClick={() => setLive((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: live ? c.accent : "transparent",
              color: live ? "#fff" : c.text,
              border: `1px solid ${live ? c.accent : c.cardBorder}`,
              borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            <Activity size={12} />
            {live ? "Live" : "Live off"}
          </button>

          {/* Interval selector */}
          {live && (
            <select
              value={interval}
              onChange={(e) => setInterval_(Number(e.target.value))}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: c.card, color: c.text, cursor: "pointer" }}
            >
              {INTERVALS.map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          )}

          {/* Manual refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: `1px solid ${c.cardBorder}`,
              borderRadius: 6, padding: "5px 12px", fontSize: 12,
              color: c.text, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: c.danger + "22", border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.danger, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "55%", gap: 12, color: c.textMuted }}>
          <span style={{ fontSize: 36 }}>📊</span>
          <p style={{ margin: 0, fontSize: 14 }}>{loading ? "Loading…" : "Loading system status…"}</p>
        </div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Gauges row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 12 }}>
            {data.cpu?.usage_percent !== undefined && (
              <Gauge label="CPU" value={data.cpu.usage_percent} unit="%" color="#FF6B6B"
                sub={[data.cpu.model?.split("@")[0].trim(), data.cpu.core_count ? `${data.cpu.core_count} cores` : undefined].filter(Boolean).join(" · ")}
                history={history.current.cpu} />
            )}
            {data.memory?.used_percent !== undefined && (
              <Gauge label="Memory" value={data.memory.used_percent} unit="%" color="#4ECDC4"
                sub={data.memory.used_gb !== undefined && data.memory.total_gb !== undefined
                  ? `${data.memory.used_gb.toFixed(1)} / ${data.memory.total_gb.toFixed(1)} GB used`
                  : undefined}
                history={history.current.mem} />
            )}
            {data.disk?.used_percent !== undefined && (
              <Gauge label="Disk" value={data.disk.used_percent} unit="%" color="#45B7D1"
                sub={data.disk.free_gb !== undefined ? `${data.disk.free_gb.toFixed(1)} GB free` : undefined}
                history={history.current.disk} />
            )}
            {data.battery?.percent !== undefined && (
              <Gauge label="Battery" value={data.battery.percent} unit="%" color="#34C759"
                sub={data.battery.status ?? (data.battery.charging ? "Charging" : "Discharging")}
                history={[]} />
            )}
          </div>

          {/* Network */}
          {data.network && (
            <div style={{ padding: "14px 18px", borderRadius: 10, border: `1px solid ${c.cardBorder}`, background: c.card }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>
                Network {data.network.interface ? `· ${data.network.interface}` : ""}
              </div>
              <InfoTable cardBorder={c.cardBorder} rows={[
                ["Sent",     data.network.bytes_sent_readable ?? formatBytes(data.network.bytes_sent)],
                ["Received", data.network.bytes_recv_readable ?? formatBytes(data.network.bytes_recv)],
              ].filter(([, v]) => v !== "—") as [string, string][]} />
            </div>
          )}

          {/* System info */}
          {data.system && (
            <div style={{ padding: "14px 18px", borderRadius: 10, border: `1px solid ${c.cardBorder}`, background: c.card }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>
                System
              </div>
              <InfoTable cardBorder={c.cardBorder} rows={[
                ["Hostname", data.system.hostname ?? ""],
                ["OS",       data.system.os ?? ""],
                ["Kernel",   data.system.kernel ?? ""],
                ["Uptime",   data.system.uptime ?? ""],
              ].filter(([, v]) => v) as [string, string][]} />
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
