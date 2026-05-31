// src/pages/DashboardPage.tsx
import { useState, useRef, useEffect } from "react";
import { useUIStore, usePresenceStore } from "@/store";
import { useGroups, useGroupMembers, useTasks, useCompleteTask, useUnreadCount, useEmergencyReset } from "@/hooks/useQueries";
import { taskApi } from "@/api/services";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/hooks/useQueries";
import type { TaskRead } from "@/types";

const C = {
  bg: "#0A0A0F", bgCard: "#111118", bgElevated: "#16161F",
  border: "rgba(255,255,255,0.07)", borderGreen: "rgba(34,197,94,0.25)",
  accent: "#7C6FFF", accentSoft: "rgba(124,111,255,0.15)",
  green: "#22C55E", greenSoft: "rgba(34,197,94,0.12)",
  amber: "#F59E0B", amberSoft: "rgba(245,158,11,0.12)",
  red: "#EF4444", redSoft: "rgba(239,68,68,0.12)",
  text: "#F0F0FF", textMuted: "rgba(240,240,255,0.45)", textSub: "rgba(240,240,255,0.22)",
};

const priorityColor = (p: string) => p === "high" ? C.red : p === "medium" ? C.amber : C.green;
const priorityBg    = (p: string) => p === "high" ? C.redSoft : p === "medium" ? C.amberSoft : C.greenSoft;

function Avatar({ letters, size = 32, color = C.accent, online }: {
  letters: string; size?: number; color?: string; online?: boolean;
}) {
  const initials = letters.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `${color}22`, border: `1.5px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 600, color,
        letterSpacing: "0.3px",
      }}>{initials}</div>
      {online !== undefined && (
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: size * 0.28, height: size * 0.28, borderRadius: "50%",
          background: online ? C.green : C.textSub,
          border: `1.5px solid ${C.bgCard}`,
        }} />
      )}
    </div>
  );
}

// ── Task Menu ─────────────────────────────────────────────────────────────────
function TaskMenu({ task, groupId, onEdit, onDelete }: {
  task: TaskRead; groupId: string;
  onEdit: (task: TaskRead) => void;
  onDelete: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.textMuted, fontSize: 18, padding: "2px 6px",
          borderRadius: 6, lineHeight: 1,
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.bgElevated)}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >⋯</button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "110%", zIndex: 100,
          background: "#1A1A25", border: `1px solid rgba(255,255,255,0.1)`,
          borderRadius: 10, padding: 4, minWidth: 130,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <button
            onClick={() => { onEdit(task); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 12px", background: "none",
              border: "none", borderRadius: 7, cursor: "pointer",
              color: C.text, fontSize: 13, textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.bgElevated)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >✏️ Edit</button>
          <button
            onClick={() => { onDelete(task.id); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 12px", background: "none",
              border: "none", borderRadius: 7, cursor: "pointer",
              color: C.red, fontSize: 13, textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.redSoft)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >🗑️ Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Edit Task Modal ───────────────────────────────────────────────────────────
function EditTaskModal({ task, groupId, onClose }: {
  task: TaskRead; groupId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await taskApi.update(groupId, task.id, { title, description, priority });
      qc.invalidateQueries({ queryKey: QK.tasks(groupId) });
      onClose();
    } catch {
      // error silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: "#111118", border: `1px solid rgba(255,255,255,0.1)`,
        borderRadius: 16, padding: 24, width: 440, maxWidth: "90vw",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Edit Task</div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6 }}>Title *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{
              width: "100%", background: C.bgElevated, border: `1px solid rgba(255,255,255,0.09)`,
              borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            style={{
              width: "100%", background: C.bgElevated, border: `1px solid rgba(255,255,255,0.09)`,
              borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
              outline: "none", resize: "vertical", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6 }}>Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as any)}
            style={{
              background: C.bgElevated, border: `1px solid rgba(255,255,255,0.09)`,
              borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none",
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            background: "none", border: `1px solid rgba(255,255,255,0.1)`,
            borderRadius: 8, padding: "8px 16px", color: C.textMuted, cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()} style={{
            background: C.accent, border: "none",
            borderRadius: 8, padding: "8px 16px", color: "#fff",
            cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500,
            opacity: saving ? 0.7 : 1,
          }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, groupId, groupColor, onEdit, onDelete }: {
  task: TaskRead; groupId: string; groupColor: string;
  onEdit: (task: TaskRead) => void;
  onDelete: (taskId: string) => void;
}) {
  const [localCompleting, setLocalCompleting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const completeMutation = useCompleteTask(groupId);
  const done = task.is_completed_this_period;
  const isCompleting = completeMutation.isPending || localCompleting;

  const handleComplete = async () => {
    if (done || isCompleting) return;
    setLocalCompleting(true);
    try {
      await completeMutation.mutateAsync({ taskId: task.id });
    } finally {
      setLocalCompleting(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.bgCard,
        border: `1px solid ${done ? C.borderGreen : C.border}`,
        borderRadius: 14, padding: "16px 18px",
        opacity: done ? 0.72 : 1,
        transition: "all 0.3s",
        position: "relative",
      }}>
      {done && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${C.green}, transparent)`,
        }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button
          onClick={handleComplete}
          disabled={done || isCompleting}
          style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            border: `1.5px solid ${done ? C.green : C.border}`,
            background: done ? C.greenSoft : isCompleting ? C.accentSoft : C.bgElevated,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: done ? 18 : 20, cursor: done ? "default" : "pointer",
            transition: "all 0.2s",
            animation: isCompleting ? "spin 1s linear infinite" : "none",
          }}
        >
          {isCompleting ? "↻" : done ? "✓" : task.emoji}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{
              color: done ? C.textMuted : C.text, fontSize: 14, fontWeight: 500,
              textDecoration: done ? "line-through" : "none",
            }}>{task.title}</span>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20,
              background: priorityBg(task.priority), color: priorityColor(task.priority),
              border: `1px solid ${priorityColor(task.priority)}33`,
            }}>{task.priority}</span>
            {task.is_pinned && <span style={{ fontSize: 12 }}>📌</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {task.recurrence_rule && (
              <span style={{ color: C.textMuted, fontSize: 12 }}>
                🔁 {task.recurrence_rule.recurrence_type}
                {task.recurrence_rule.interval_value ? ` ×${task.recurrence_rule.interval_value}` : ""}
              </span>
            )}
            {task.current_period_end && (
              <span style={{ color: C.textMuted, fontSize: 12 }}>
                ⏰ Due {new Date(task.current_period_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {task.completion_streak > 0 && (
              <span style={{ color: C.amber, fontSize: 12 }}>🔥 {task.completion_streak}d streak</span>
            )}
          </div>

          {done && task.latest_completion && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 8,
              background: C.greenSoft, border: `1px solid rgba(34,197,94,0.2)`,
              fontSize: 12, color: C.green,
            }}>
              ✓ {task.latest_completion.completed_by_user.full_name} completed ·{" "}
              {new Date(task.latest_completion.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* ⋯ menu — shows on hover */}
        <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
          <TaskMenu task={task} groupId={groupId} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { activeGroupId, toggleNotifPanel, toggleCreateTask, toggleInviteMembers } = useUIStore();
  const isOnline = usePresenceStore((s) => s.isOnline);
  const qc = useQueryClient();

  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === activeGroupId);

  const { data: tasks = [], isLoading: tasksLoading } = useTasks(activeGroupId ?? "");
  const { data: members = [] } = useGroupMembers(activeGroupId ?? "");
  const { data: unreadCount = 0 } = useUnreadCount();

  const [editingTask, setEditingTask] = useState<TaskRead | null>(null);

  const handleDelete = async (taskId: string) => {
    if (!activeGroupId) return;
    if (!confirm("Delete this task?")) return;
    try {
      await taskApi.delete(activeGroupId, taskId);
      qc.invalidateQueries({ queryKey: QK.tasks(activeGroupId) });
    } catch {
      alert("Failed to delete task");
    }
  };

  if (!activeGroupId || !group) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: C.textMuted, flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 40 }}>⟁</div>
        <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>Select a group</div>
        <div style={{ fontSize: 13 }}>Choose a group from the sidebar to see shared tasks</div>
      </div>
    );
  }

  const pending   = tasks.filter((t) => !t.is_completed_this_period);
  const completed = tasks.filter((t) => t.is_completed_this_period);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          groupId={group.id}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 26 }}>{group.icon}</span>
            <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.5px" }}>
              {group.name}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: C.textMuted, fontSize: 13 }}>{members.length} members</span>
            <div style={{ display: "flex" }}>
              {members.slice(0, 5).map((m, i) => (
                <div key={m.user.id} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${C.bgCard}`, borderRadius: "50%" }}>
                  <Avatar letters={m.user.full_name} size={24} color={group.color} online={isOnline(m.user.id)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={toggleNotifPanel} style={{
            background: C.bgElevated, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 14px", color: C.textMuted,
            cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          }}>
            🔔
            {unreadCount > 0 && (
              <span style={{
                background: C.red, color: "#fff", fontSize: 10,
                borderRadius: 10, padding: "1px 6px", fontWeight: 600,
              }}>{unreadCount}</span>
            )}
          </button>
          <button onClick={toggleInviteMembers} style={{
            background: C.bgElevated, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 14px", color: C.textMuted,
            cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          }}>
            👥 Invite
          </button>
          <button onClick={toggleCreateTask} style={{
            background: group.color, border: "none",
            borderRadius: 10, padding: "8px 16px", color: "#fff",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>+ Add Task</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Pending", value: pending.length, color: C.amber, emoji: "⏳" },
          { label: "Done today", value: completed.length, color: C.green, emoji: "✅" },
          { label: "Group streak", value: `${Math.max(...tasks.map(t => t.completion_streak), 0)}d`, color: C.accent, emoji: "🔥" },
        ].map((s) => (
          <div key={s.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>{s.emoji} {s.label}</div>
            <div style={{ color: s.color, fontSize: 26, fontWeight: 600 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Members presence */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.8px", marginBottom: 12, textTransform: "uppercase" }}>Members</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {members.map((m) => (
            <div key={m.user.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar letters={m.user.full_name} size={30} color={group.color} online={isOnline(m.user.id)} />
              <div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>{m.user.full_name.split(" ")[0]}</div>
                <div style={{ fontSize: 10, color: isOnline(m.user.id) ? C.green : C.textSub }}>
                  {isOnline(m.user.id) ? "Online" : "Offline"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {tasksLoading && (
        <div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>Loading tasks…</div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.8px", marginBottom: 12, textTransform: "uppercase" }}>
            Pending · {pending.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((t) => (
              <TaskCard key={t.id} task={t} groupId={group.id} groupColor={group.color}
                onEdit={setEditingTask} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.8px", marginBottom: 12, textTransform: "uppercase" }}>
            Completed · {completed.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {completed.map((t) => (
              <TaskCard key={t.id} task={t} groupId={group.id} groupColor={group.color}
                onEdit={setEditingTask} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {!tasksLoading && tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMuted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 15, color: C.text, marginBottom: 6 }}>No tasks yet</div>
          <div style={{ fontSize: 13 }}>Add the first shared task for your group</div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}