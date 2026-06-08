// src/pages/ActivityPage.tsx
import { useEffect, useRef, useState } from "react";
import { useGroups, useTasks } from "@/hooks/useQueries";
import { useAuthStore } from "@/store";
import { useColors } from "@/lib/theme";
import type { TaskRead, GroupRead } from "@/types";

interface ActivityEntry {
  id: string;
  type: "completion" | "reset" | "joined";
  emoji: string;
  actor: string;
  actorInitials: string;
  action: string;
  taskTitle: string;
  groupName: string;
  groupIcon: string;
  groupColor: string;
  time: Date;
  isNew?: boolean;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ActivityRow({ entry, isLast }: { entry: ActivityEntry; isLast: boolean }) {
  const C = useColors();
  return (
    <div style={{ display: "flex", gap: 14, position: "relative", paddingBottom: isLast ? 0 : 20 }}>
      {!isLast && (
        <div style={{
          position: "absolute", left: 17, top: 38, bottom: 0,
          width: 1, background: C.border,
        }} />
      )}

      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: `${entry.groupColor}22`,
        border: `1.5px solid ${entry.groupColor}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 600, color: entry.groupColor,
        zIndex: 1,
      }}>{entry.actorInitials}</div>

      <div style={{
        flex: 1, background: C.bgCard,
        border: `1px solid ${entry.isNew ? `${C.accent}40` : C.border}`,
        borderRadius: 12, padding: "12px 14px",
        animation: entry.isNew ? "fadeIn 0.4s ease" : "none",
        transition: "border-color 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{entry.actor}</span>
              <span style={{ color: C.textMuted, fontSize: 13 }}>{entry.action}</span>
              <span style={{ fontSize: 15 }}>{entry.emoji}</span>
              <span style={{ color: C.accent, fontSize: 13 }}>{entry.taskTitle}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: C.textSub }}>{entry.groupIcon} {entry.groupName}</span>
              <span style={{ color: C.textSub, fontSize: 11 }}>·</span>
              <span style={{ color: C.textSub, fontSize: 11 }}>{timeAgo(entry.time)}</span>
            </div>
          </div>
          {entry.isNew && (
            <div style={{
              background: C.accentSoft, border: `1px solid ${C.accent}40`,
              borderRadius: 6, padding: "2px 7px",
              color: C.accent, fontSize: 10, fontWeight: 500, flexShrink: 0,
            }}>NEW</div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildActivity(tasks: TaskRead[], group: GroupRead): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  tasks.forEach((t) => {
    if (t.latest_completion) {
      const c = t.latest_completion;
      const name = c.completed_by_user.full_name;
      entries.push({
        id: c.id,
        type: "completion",
        emoji: t.emoji,
        actor: name,
        actorInitials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        action: "completed",
        taskTitle: t.title,
        groupName: group.name,
        groupIcon: group.icon,
        groupColor: group.color,
        time: new Date(c.completed_at),
      });
    }
  });
  return entries;
}

export function ActivityPage() {
  const C = useColors();
  const { user } = useAuthStore();
  const { data: groups = [] } = useGroups();
  const [allActivity, setAllActivity] = useState<ActivityEntry[]>([]);

  const { data: g1tasks = [] } = useTasks(groups[0]?.id ?? "");
  const { data: g2tasks = [] } = useTasks(groups[1]?.id ?? "");
  const { data: g3tasks = [] } = useTasks(groups[2]?.id ?? "");

  useEffect(() => {
    const allTasks: Array<{ tasks: TaskRead[]; group: GroupRead }> = [
      { tasks: g1tasks, group: groups[0] },
      { tasks: g2tasks, group: groups[1] },
      { tasks: g3tasks, group: groups[2] },
    ].filter((x) => x.group);

    const entries = allTasks.flatMap(({ tasks, group }) => buildActivity(tasks, group));
    entries.sort((a, b) => b.time.getTime() - a.time.getTime());
    setAllActivity(entries);
  }, [g1tasks, g2tasks, g3tasks, groups]);

  const [filter, setFilter] = useState<string>("all");
  const filterOptions = [
    { id: "all", label: "All" },
    ...groups.map((g) => ({ id: g.id, label: `${g.icon} ${g.name}` })),
  ];

  const filtered = filter === "all"
    ? allActivity
    : allActivity.filter((e) => {
        const group = groups.find((g) => g.name === e.groupName);
        return group?.id === filter;
      });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
          Activity
        </h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          Real-time event log across all your groups
        </p>
      </div>

      {groups.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {filterOptions.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f.id ? C.accent : C.border,
                background: filter === f.id ? C.accentSoft : "transparent",
                color: filter === f.id ? C.accent : C.textMuted,
                fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMuted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
          <div style={{ color: C.text, fontSize: 15, marginBottom: 6 }}>No activity yet</div>
          <div style={{ fontSize: 13 }}>Activity will appear here when group members complete tasks</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {filtered.map((entry, i) => (
          <ActivityRow key={entry.id} entry={entry} isLast={i === filtered.length - 1} />
        ))}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}