import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { colors, type Theme } from "../lib/theme";
import { getHomeDir, findMoLocation } from "../lib/mole";
import { RefreshCw, Activity } from "lucide-react";

interface Props { theme: Theme }

// ── Real mo status --json schema ─────────────────────────────────────────────
interface StatusData {
  collected_at?: string;
  uptime?: string;
  procs?: number;
  health_score?: number;
  health_score_msg?: string;
  platform?: string;
  hardware?: {
    model?: string;
    cpu_model?: string;
    total_ram?: string;
    disk_size?: string;
    os_version?: string;
    refresh_rate?: string;
  };
  cpu?: {
    usage?: number;
    per_core?: number[];
    core_count?: number;
    logical_cpu?: number;
    p_core_count?: number;
    e_core_count?: number;
    load1?: number;
    load5?: number;
    load15?: number;
  };
  memory?: {
    used?: number;
    total?: number;
    used_percent?: number;
    swap_used?: number;
    swap_total?: number;
    cached?: number;
    pressure?: string;
  };
  disks?: Array<{
    mount?: string;
    device?: string;
    used?: number;
    total?: number;
    used_percent?: number;
    fstype?: string;
    external?: boolean;
  }>;
  disk_io?: { read_rate?: number; write_rate?: number };
  network?: Array<{
    name?: string;
    rx_rate_mbs?: number;
    tx_rate_mbs?: number;
    ip?: string;
  }>;
  proxy?: { enabled?: boolean; type?: string; host?: string };
  batteries?: Array<{ percent?: number; charging?: boolean; status?: string }> | null;
  thermal?: {
    cpu_temp?: number;
    gpu_temp?: number;
    fan_speed?: number;
    system_power?: number;
  };
  top_processes?: Array<{ name?: string; cpu?: number; memory?: number }>;
  bluetooth?: Array<{ name?: string; connected?: boolean; battery?: string }>;
}

const INTERVALS = [5, 10, 30, 60] as const;

function fmt(n: number | undefined, decimals = 1): string {
  return n !== undefined ? n.toFixed(decimals) : "—";
}
function fmtGB(bytes?: number): string {
  if (!bytes) return "—";
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ history, color }: { history: number[]; color: string }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18, marginTop: 6 }}>
      {history.map((v, i) => (
        <div key={i} style={{
          flex: 1, minHeight: 2,
          height: `${Math.max(2, (v / max) * 100)}%`,
          background: color,
          opacity: 0.2 + (i / history.length) * 0.8,
          borderRadius: 1,
          transition: "height 0.3s ease",
        }} />
      ))}
    </div>
  );
}

// ── Gauge card ───────────────────────────────────────────────────────────────
function Gauge({ label, value, unit, color, sub, history }: {
  label: string; value: number; unit: string; color: string; sub?: string; history: number[];
}) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct > 85 ? "#FF3B30" : pct > 65 ? "#FF9500" : color;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--cb)", background: "var(--cg)", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
        {value.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, opacity: 0.5 }}>{sub}</div>}
      <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 3, height: 4 }}>
        <div style={{ background: barColor, height: "100%", borderRadius: 3, width: `${pct}%`, transition: "width 0.5s ease, background 0.5s ease" }} />
      </div>
      <Sparkline history={history} color={barColor} />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--cb)", background: "var(--cg)" }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ── KV row ───────────────────────────────────────────────────────────────────
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: "1px solid var(--cb)" }}>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 500, maxWidth: "65%", textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard({ theme }: Props) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [interval, setInterval_] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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

      const push = (arr: number[], v?: number) =>
        v !== undefined ? [...arr, v].slice(-20) : arr;
      history.current = {
        cpu:  push(history.current.cpu,  parsed.cpu?.usage),
        mem:  push(history.current.mem,  parsed.memory?.used_percent),
        disk: push(history.current.disk, parsed.disks?.find(d => !d.external)?.used_percent),
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(refresh, interval * 1000);
    return () => window.clearInterval(id);
  }, [live, interval, refresh]);

  useEffect(() => { refresh(); }, []);

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  // Derived helpers
  const internalDisk = data?.disks?.find(d => !d.external);
const activeNets = data?.network?.filter(n => (n.rx_rate_mbs ?? 0) > 0 || (n.tx_rate_mbs ?? 0) > 0 || n.ip);
  const battery = data?.batteries?.[0];
  const healthColor = (data?.health_score ?? 100) >= 80 ? c.success
    : (data?.health_score ?? 100) >= 50 ? "#FF9500" : c.danger;

  return (
    <div style={{ padding: 24, color: c.text, height: "100%", overflowY: "auto", "--cg": c.card, "--cb": c.cardBorder } as React.CSSProperties}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>System Status</h2>
          {timeStr && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>Last updated {timeStr}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setLive(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: live ? c.accent : "transparent", color: live ? "#fff" : c.text, border: `1px solid ${live ? c.accent : c.cardBorder}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
            <Activity size={12} />{live ? "Live" : "Live off"}
          </button>
          {live && (
            <select value={interval} onChange={e => setInterval_(Number(e.target.value))}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${c.cardBorder}`, background: c.card, color: c.text, cursor: "pointer" }}>
              {INTERVALS.map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
          )}
          <button onClick={refresh} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${c.cardBorder}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, color: c.text, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: c.danger + "22", border: `1px solid ${c.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: c.danger, marginBottom: 14 }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Health score banner */}
          {data.health_score !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, background: healthColor + "18", border: `1px solid ${healthColor}44` }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: healthColor, lineHeight: 1 }}>{data.health_score}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: healthColor }}>Health Score</div>
                {data.health_score_msg && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{data.health_score_msg}</div>}
              </div>
              {data.hardware && (
                <div style={{ marginLeft: "auto", fontSize: 11, color: c.textMuted, textAlign: "right" }}>
                  {[data.hardware.model, data.hardware.cpu_model].filter(Boolean).join(" · ")}
                  {data.uptime && <><br />up {data.uptime}</>}
                  {data.procs && <> · {data.procs} procs</>}
                </div>
              )}
            </div>
          )}

          {/* Gauges row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {data.cpu?.usage !== undefined && (
              <Gauge label="CPU" value={data.cpu.usage} unit="%" color="#FF6B6B"
                sub={[
                  data.cpu.core_count ? `${data.cpu.core_count} cores` : undefined,
                  data.cpu.load1 !== undefined ? `load ${fmt(data.cpu.load1)}` : undefined,
                ].filter(Boolean).join(" · ")}
                history={history.current.cpu} />
            )}
            {data.memory?.used_percent !== undefined && (
              <Gauge label="Memory" value={data.memory.used_percent} unit="%" color="#4ECDC4"
                sub={data.memory.used !== undefined && data.memory.total !== undefined
                  ? `${fmtGB(data.memory.used)} / ${fmtGB(data.memory.total)}`
                  : undefined}
                history={history.current.mem} />
            )}
            {internalDisk?.used_percent !== undefined && (
              <Gauge label="Disk (internal)" value={internalDisk.used_percent} unit="%" color="#45B7D1"
                sub={internalDisk.used !== undefined && internalDisk.total !== undefined
                  ? `${fmtGB(internalDisk.used)} / ${fmtGB(internalDisk.total)}`
                  : undefined}
                history={history.current.disk} />
            )}
            {battery?.percent !== undefined && (
              <Gauge label="Battery" value={battery.percent} unit="%" color="#34C759"
                sub={battery.status ?? (battery.charging ? "Charging" : "Discharging")}
                history={[]} />
            )}
          </div>

          {/* CPU per-core + load */}
          {data.cpu?.per_core && data.cpu.per_core.length > 0 && (
            <Section title={`CPU Cores — ${fmt(data.cpu.usage)}% total · load ${fmt(data.cpu.load1)} ${fmt(data.cpu.load5)} ${fmt(data.cpu.load15)}`}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
                {data.cpu.per_core.map((v, i) => {
                  const col = v > 85 ? "#FF3B30" : v > 65 ? "#FF9500" : "#FF6B6B";
                  return (
                    <div key={i} style={{ fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ opacity: 0.5 }}>Core {i + 1}</span>
                        <span style={{ fontWeight: 600, color: col }}>{fmt(v)}%</span>
                      </div>
                      <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 2, height: 3 }}>
                        <div style={{ background: col, height: "100%", borderRadius: 2, width: `${Math.min(100, v)}%`, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Memory details + Swap */}
          {data.memory && (
            <Section title="Memory">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <KV label="Used" value={`${fmtGB(data.memory.used)} (${fmt(data.memory.used_percent)}%)`} />
                <KV label="Free" value={fmtGB((data.memory.total ?? 0) - (data.memory.used ?? 0))} />
                <KV label="Total" value={fmtGB(data.memory.total)} />
                <KV label="Cached" value={fmtGB(data.memory.cached)} />
                {data.memory.swap_total ? <>
                  <KV label="Swap Used" value={`${fmtGB(data.memory.swap_used)} / ${fmtGB(data.memory.swap_total)}`} />
                  <KV label="Swap %" value={`${fmt((data.memory.swap_used ?? 0) / (data.memory.swap_total ?? 1) * 100)}%`} />
                </> : null}
              </div>
            </Section>
          )}

          {/* Disk details */}
          {data.disks && data.disks.length > 0 && (
            <Section title={`Disks${data.disk_io ? ` · Read ${fmt(data.disk_io.read_rate)} MB/s · Write ${fmt(data.disk_io.write_rate)} MB/s` : ""}`}>
              {data.disks.map((d, i) => {
                const pct = d.used_percent ?? 0;
                const col = pct > 85 ? "#FF3B30" : pct > 65 ? "#FF9500" : "#45B7D1";
                return (
                  <div key={i} style={{ marginBottom: i < data.disks!.length - 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{d.mount}{d.external ? " · external" : ""}</span>
                      <span style={{ color: col, fontWeight: 600 }}>{fmt(pct)}% · {fmtGB(d.used)} / {fmtGB(d.total)}</span>
                    </div>
                    <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 3, height: 4 }}>
                      <div style={{ background: col, height: "100%", borderRadius: 3, width: `${Math.min(100, pct)}%`, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 3 }}>{d.device} · {d.fstype}</div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Network */}
          {activeNets && activeNets.length > 0 && (
            <Section title={`Network${data.proxy?.enabled ? ` · Proxy ${data.proxy.type}` : ""}`}>
              {activeNets.map((n, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: i < activeNets.length - 1 ? "1px solid var(--cb)" : "none" }}>
                  <span style={{ opacity: 0.6 }}>{n.name}{n.ip ? ` · ${n.ip}` : ""}</span>
                  <span style={{ fontWeight: 500 }}>↓ {fmt(n.rx_rate_mbs, 2)} MB/s · ↑ {fmt(n.tx_rate_mbs, 2)} MB/s</span>
                </div>
              ))}
            </Section>
          )}

          {/* Top processes */}
          {data.top_processes && data.top_processes.length > 0 && (
            <Section title="Top Processes">
              {data.top_processes.slice(0, 8).map((p, i) => {
                const col = (p.cpu ?? 0) > 50 ? "#FF3B30" : (p.cpu ?? 0) > 25 ? "#FF9500" : c.text;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12, borderBottom: i < Math.min(7, data.top_processes!.length - 1) ? "1px solid var(--cb)" : "none" }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ color: col, fontWeight: 600, minWidth: 60, textAlign: "right" }}>CPU {fmt(p.cpu)}%</span>
                    <span style={{ color: c.textMuted, minWidth: 56, textAlign: "right" }}>MEM {fmt(p.memory)}%</span>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Thermal */}
          {data.thermal && (data.thermal.system_power ?? 0) > 0 && (
            <Section title="Thermal">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {(data.thermal.cpu_temp ?? 0) > 0 && <KV label="CPU Temp" value={`${fmt(data.thermal.cpu_temp)}°C`} />}
                {(data.thermal.gpu_temp ?? 0) > 0 && <KV label="GPU Temp" value={`${fmt(data.thermal.gpu_temp)}°C`} />}
                {(data.thermal.system_power ?? 0) > 0 && <KV label="System Power" value={`${fmt(data.thermal.system_power)} W`} />}
                {(data.thermal.fan_speed ?? 0) > 0 && <KV label="Fan" value={`${data.thermal.fan_speed} RPM`} />}
              </div>
            </Section>
          )}

          {/* Hardware info */}
          {data.hardware && (
            <Section title="System">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {data.hardware.model && <KV label="Model" value={data.hardware.model} />}
                {data.hardware.cpu_model && <KV label="CPU" value={data.hardware.cpu_model} />}
                {data.hardware.os_version && <KV label="OS" value={data.hardware.os_version} />}
                {data.platform && <KV label="Platform" value={data.platform} />}
                {data.hardware.total_ram && <KV label="RAM" value={data.hardware.total_ram} />}
                {data.hardware.disk_size && <KV label="Disk" value={data.hardware.disk_size} />}
                {data.uptime && <KV label="Uptime" value={data.uptime} />}
                {data.procs !== undefined && <KV label="Processes" value={String(data.procs)} />}
              </div>
            </Section>
          )}

        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
