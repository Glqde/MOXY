// src/components/notifications/NotifPanel.tsx
import { useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/useQueries";
import { useUIStore } from "@/store";

const C = {
  bgCard: "#111118", bgElevated: "#16161F",
  border: "rgba(255,255,255,0.07)", accent: "#7C6FFF",
  accentSoft: "rgba(124,111,255,0.15)", accentGlow: "rgba(124,111,255,0.3)",
  text: "#F0F0FF", textMuted: "rgba(240,240,255,0.45)", textSub: "rgba(240,240,255,0.22)",
};

const typeEmoji: Record<string, string> = {
  task_completed: "✅", task_reminder: "⏰", task_overdue: "🚨",
  task_reset: "🔄", group_invite: "👥", friend_request: "🤝",
  friend_accepted: "🎉", system: "🔔",
};

export function NotifPanel() {
  const { closeNotifPanel } = useUIStore();
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const handleClick = (id: string, isRead: boolean) => {
    if (!isRead) markRead.mutate([id]);
  };

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 320,
      background: C.bgCard, borderLeft: `1px solid ${C.border}`,
      zIndex: 100, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 20px 14px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>Notifications</div>
        <button onClick={closeNotifPanel} style={{
          background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1,
        }}>×</button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
        {isLoading && (
          <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 13 }}>Loading…</div>
        )}
        {!isLoading && notifications.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.textMuted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
            <div style={{ fontSize: 13 }}>No notifications yet</div>
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => handleClick(n.id, n.is_read)}
            style={{
              padding: "12px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
              background: n.is_read ? "transparent" : C.accentSoft,
              border: `1px solid ${n.is_read ? "transparent" : C.accentGlow}`,
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{typeEmoji[n.type] ?? "🔔"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: n.is_read ? C.textMuted : C.text,
                  fontSize: 13, lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {n.title}
                </div>
                {n.body && (
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{n.body}</div>
                )}
                <div style={{ color: C.textSub, fontSize: 11, marginTop: 4 }}>
                  {new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {!n.is_read && (
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: C.accent, flexShrink: 0, marginTop: 4,
                }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px", borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          style={{
            width: "100%", padding: "10px", borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.bgElevated,
            color: C.textMuted, cursor: "pointer", fontSize: 13,
          }}
        >
          {markAllRead.isPending ? "Marking…" : "Mark all as read"}
        </button>
      </div>
    </div>
  );
}
