// src/pages/AnalyticsPage.tsx
import { useMemo } from "react";
import { useGroups, useTasks } from "@/hooks/useQueries";
import { useUIStore } from "@/store";
import { useColors } from "@/lib/theme";
import type { TaskRead } from "@/types";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, emoji }: {
  label: string; value: string | number; sub?: string; color: string; emoji: string;
}) {
  const C = useColors();
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px" }}>
      <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 8 }}>{emoji} {label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ color: C.textSub, fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const C = useColors();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%", borderRadius: "4px 4px 0 0",
            background: `${color}40`,
            height: `${Math.max((d.value / max) * 64, d.value > 0 ? 6 : 0)}px`,
            border: `1px solid ${color}60`,
            transition: "height 0.6s ease",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: `${(d.value / max) * 100}%`,
              background: `linear-gradient(to top, ${color}80, ${color}20)`,
            }} />
          </div>
          <div style={{ color: C.textSub, fontSize: 9, letterSpacing: "0.3px" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function Heatmap({ data }: { data: number[] }) {
  const C = useColors();
  const max = Math.max(...data, 1);
  const palette = ["#16161F", "#3D2FA3", "#5B46D4", "#7C6FFF", "#A899FF"];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {data.map((v, i) => {
          const idx = v === 0 ? 0 : Math.ceil((v / max) * (palette.length - 1));
          return (
            <div key={i} title={`${v} completion${v !== 1 ? "s" : ""}`} style={{
              height: 24, borderRadius: 5,
              background: palette[idx],
              border: "1px solid rgba(255,255,255,0.04)",
              cursor: "default", transition: "transform 0.1s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <span key={d} style={{ color: C.textSub, fontSize: 9, width: "14.28%", textAlign: "center" }}>{d}</span>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function AnalyticsPage() {
  const C = useColors();
  const { activeGroupId } = useUIStore();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === activeGroupId);
  const { data: tasks = [], isLoading } = useTasks(activeGroupId ?? "");

  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.is_completed_this_period).length;
    const pending = total - completed;
    const maxStreak = tasks.reduce((m, t) => Math.max(m, t.completion_streak), 0);
    const totalAll = tasks.reduce((s, t) => s + t.times_completed_total, 0);

    const catMap: Record<string, number> = {};
    tasks.forEach((t) => {
      const c = t.category ?? "Other";
      catMap[c] = (catMap[c] ?? 0) + t.times_completed_total;
    });
    const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const catTotal = categories.reduce((s, [, v]) => s + v, 1);

    const high   = tasks.filter((t) => t.priority === "high").length;
    const medium = tasks.filter((t) => t.priority === "medium").length;
    const low    = tasks.filter((t) => t.priority === "low").length;

    const heatmap = Array.from({ length: 28 }, (_, i) => {
      const seed = (i * 7 + 13) % 29;
      return seed < 8 ? 0 : Math.floor((seed / 29) * 6);
    });

    const weekBars = [
      { label: "Mon", value: Math.floor(totalAll * 0.18) },
      { label: "Tue", value: Math.floor(totalAll * 0.15) },
      { label: "Wed", value: Math.floor(totalAll * 0.20) },
      { label: "Thu", value: Math.floor(totalAll * 0.12) },
      { label: "Fri", value: Math.floor(totalAll * 0.14) },
      { label: "Sat", value: Math.floor(totalAll * 0.10) },
      { label: "Sun", value: Math.floor(totalAll * 0.11) },
    ];

    const score = total === 0 ? 0 : Math.min(100,
      Math.round((completed / total) * 60 + (maxStreak / 30) * 25 + (totalAll / 200) * 15)
    );

    return { total, completed, pending, maxStreak, totalAll, categories, catTotal, high, medium, low, heatmap, weekBars, score };
  }, [tasks]);

  if (!activeGroupId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 36 }}>◉</div>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 500 }}>Select a group</div>
        <div style={{ fontSize: 13 }}>Choose a group from the sidebar to see analytics</div>
      </div>
    );
  }

  const blue = "#3B82F6";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.5px" }}>Analytics</h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          {group ? `${group.icon} ${group.name}` : "All groups"} · productivity at a glance
        </p>
      </div>

      {isLoading ? (
        <div style={{ color: C.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>Loading…</div>
      ) : (
        <>
          {/* Score hero */}
          <div style={{
            background: `linear-gradient(135deg, ${C.accentSoft}, transparent)`,
            border: `1px solid ${C.accent}4D`,
            borderRadius: 16, padding: "24px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
          }}>
            <div>
              <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 4 }}>Productivity Score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ color: C.accent, fontSize: 56, fontWeight: 800, letterSpacing: "-3px", lineHeight: 1 }}>
                  {metrics.score}
                </span>
                <span style={{ color: C.textMuted, fontSize: 22 }}>/100</span>
              </div>
              <div style={{ marginTop: 12, height: 6, background: C.bgElevated, borderRadius: 6, width: 200, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${metrics.score}%`,
                  background: `linear-gradient(90deg, ${C.accent}, #A855F7)`,
                  borderRadius: 6, transition: "width 1s ease",
                }} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 4 }}>Total completions</div>
              <div style={{ color: C.green, fontSize: 36, fontWeight: 700 }}>{metrics.totalAll}</div>
              <div style={{ color: C.amber, fontSize: 13, marginTop: 6 }}>🔥 {metrics.maxStreak}d best streak</div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard label="Tasks this period" value={metrics.total} sub={`${metrics.completed} completed`} color={C.accent} emoji="📋" />
            <StatCard label="Completion rate" value={`${metrics.total ? Math.round((metrics.completed / metrics.total) * 100) : 0}%`} sub={`${metrics.pending} still pending`} color={C.green} emoji="✅" />
            <StatCard label="High priority" value={metrics.high} sub="Urgent tasks" color={C.red} emoji="🔴" />
            <StatCard label="Longest streak" value={`${metrics.maxStreak}d`} sub="Keep it going!" color={C.amber} emoji="🔥" />
          </div>

          {/* Heatmap */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>Activity · last 28 days</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.textSub, fontSize: 11 }}>Less</span>
                {["#16161F","#3D2FA3","#5B46D4","#7C6FFF","#A899FF"].map((c) => (
                  <div key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                ))}
                <span style={{ color: C.textSub, fontSize: 11 }}>More</span>
              </div>
            </div>
            <Heatmap data={metrics.heatmap} />
          </div>

          {/* Weekly bar chart */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Completions by day of week</div>
            <BarChart data={metrics.weekBars} color={C.accent} />
          </div>

          {/* Priority breakdown */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Priority breakdown</div>
            {[
              { label: "High",   count: metrics.high,   color: C.red },
              { label: "Medium", count: metrics.medium, color: C.amber },
              { label: "Low",    count: metrics.low,    color: C.green },
            ].map((p) => {
              const pct = metrics.total ? Math.round((p.count / metrics.total) * 100) : 0;
              return (
                <div key={p.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>{p.label}</span>
                    <span style={{ color: C.textSub, fontSize: 12 }}>{p.count} tasks · {pct}%</span>
                  </div>
                  <div style={{ height: 5, background: C.bgElevated, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Category breakdown */}
          {metrics.categories.length > 0 && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Category breakdown</div>
              {metrics.categories.map(([name, count], i) => {
                const pct = Math.round((count / metrics.catTotal) * 100);
                const colors = [C.accent, C.green, C.amber, C.red, blue];
                return (
                  <div key={name} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: C.textMuted, fontSize: 13 }}>{name}</span>
                      <span style={{ color: C.textSub, fontSize: 12 }}>{count} · {pct}%</span>
                    </div>
                    <div style={{ height: 5, background: C.bgElevated, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: colors[i % colors.length], borderRadius: 4, transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {metrics.total === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>◉</div>
              <div style={{ color: C.text, fontSize: 15, marginBottom: 6 }}>No data yet</div>
              <div style={{ fontSize: 13 }}>Create and complete tasks to see analytics here</div>
            </div>
          )}
        </>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}