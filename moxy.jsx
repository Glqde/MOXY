import { useState, useEffect, useRef, useCallback } from "react";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg: "#0A0A0F",
  bgCard: "#111118",
  bgElevated: "#16161F",
  bgHover: "#1C1C28",
  border: "rgba(255,255,255,0.07)",
  borderHover: "rgba(255,255,255,0.14)",
  accent: "#7C6FFF",
  accentSoft: "rgba(124,111,255,0.15)",
  accentGlow: "rgba(124,111,255,0.35)",
  green: "#22C55E",
  greenSoft: "rgba(34,197,94,0.15)",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.12)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.12)",
  blue: "#3B82F6",
  blueSoft: "rgba(59,130,246,0.12)",
  text: "#F0F0FF",
  textMuted: "rgba(240,240,255,0.45)",
  textSub: "rgba(240,240,255,0.25)",
};

// ─── Mock data ────────────────────────────────────────────────────────────────
const INITIAL_STATE = {
  user: { id: "u1", name: "Manit Manoj", email: "manit@gmail.com", avatar: "MM", online: true },
  groups: [
    { id: "g1", name: "Westbrook Flat", icon: "🏠", memberCount: 4, color: "#7C6FFF" },
    { id: "g2", name: "Weekend Warriors", icon: "🏕️", memberCount: 3, color: "#22C55E" },
    { id: "g3", name: "Study Pod", icon: "📚", memberCount: 5, color: "#F59E0B" },
  ],
  members: {
    g1: [
      { id: "u1", name: "Manit Manoj", avatar: "MM", online: true, role: "admin" },
      { id: "u2", name: "Rahul Sharma", avatar: "RS", online: true, role: "member" },
      { id: "u3", name: "Priya Patel", avatar: "PP", online: false, role: "member" },
      { id: "u4", name: "Arun Verma", avatar: "AV", online: true, role: "member" },
    ],
    g2: [
      { id: "u1", name: "Manit Manoj", avatar: "MM", online: true, role: "admin" },
      { id: "u2", name: "Rahul Sharma", avatar: "RS", online: true, role: "member" },
      { id: "u5", name: "Sneha Iyer", avatar: "SI", online: false, role: "member" },
    ],
    g3: [
      { id: "u1", name: "Manit Manoj", avatar: "MM", online: true, role: "member" },
      { id: "u3", name: "Priya Patel", avatar: "PP", online: false, role: "admin" },
      { id: "u4", name: "Arun Verma", avatar: "AV", online: true, role: "member" },
      { id: "u5", name: "Sneha Iyer", avatar: "SI", online: false, role: "member" },
      { id: "u6", name: "Dev Kapoor", avatar: "DK", online: true, role: "member" },
    ],
  },
  tasks: {
    g1: [
      { id: "t1", title: "Feed the Cat", emoji: "🐱", priority: "high", recurrence: "Twice daily", nextDue: "7:00 PM", category: "Pet Care", completedBy: null, completedAt: null, streak: 12 },
      { id: "t2", title: "Take out trash", emoji: "🗑️", priority: "medium", recurrence: "Weekly", nextDue: "Mon 9 AM", category: "Chores", completedBy: null, completedAt: null, streak: 4 },
      { id: "t3", title: "Buy milk & groceries", emoji: "🛒", priority: "low", recurrence: "Every 3 days", nextDue: "Tomorrow", category: "Shopping", completedBy: "u2", completedAt: "Today 2:30 PM", streak: 8, completedByName: "Rahul" },
      { id: "t4", title: "Pay electricity bill", emoji: "⚡", priority: "high", recurrence: "Monthly", nextDue: "Jun 1", category: "Bills", completedBy: null, completedAt: null, streak: 3 },
      { id: "t5", title: "Clean bathroom", emoji: "🚿", priority: "medium", recurrence: "Weekly", nextDue: "Sunday", category: "Chores", completedBy: null, completedAt: null, streak: 6 },
    ],
    g2: [
      { id: "t6", title: "Book campsite", emoji: "⛺", priority: "high", recurrence: "Monthly", nextDue: "May 20", category: "Planning", completedBy: "u5", completedAt: "Yesterday", streak: 2, completedByName: "Sneha" },
      { id: "t7", title: "Pack first aid kit", emoji: "🩺", priority: "medium", recurrence: "Monthly", nextDue: "Before trip", category: "Safety", completedBy: null, completedAt: null, streak: 5 },
    ],
    g3: [
      { id: "t8", title: "Share lecture notes", emoji: "📝", priority: "high", recurrence: "After each class", nextDue: "Today 5 PM", category: "Academics", completedBy: null, completedAt: null, streak: 14 },
      { id: "t9", title: "Book study room", emoji: "📅", priority: "medium", recurrence: "Weekly", nextDue: "Tomorrow", category: "Resources", completedBy: null, completedAt: null, streak: 7 },
    ],
  },
  notifications: [
    { id: "n1", type: "complete", text: "Rahul completed Buy milk & groceries", time: "2m ago", read: false, groupName: "Westbrook Flat" },
    { id: "n2", type: "invite", text: "You were added to Study Pod", time: "1h ago", read: false, groupName: "Study Pod" },
    { id: "n3", type: "complete", text: "Sneha completed Book campsite", time: "1d ago", read: true, groupName: "Weekend Warriors" },
    { id: "n4", type: "reminder", text: "Feed the Cat is due in 2 hours", time: "2h ago", read: true, groupName: "Westbrook Flat" },
  ],
  activity: [
    { id: "a1", user: "Rahul", avatar: "RS", action: "completed", task: "Buy milk & groceries", time: "Today 2:30 PM", emoji: "🛒", group: "Westbrook Flat" },
    { id: "a2", user: "Sneha", avatar: "SI", action: "completed", task: "Book campsite", time: "Yesterday 4:10 PM", emoji: "⛺", group: "Weekend Warriors" },
    { id: "a3", user: "Manit", avatar: "MM", action: "completed", task: "Pay electricity bill", time: "May 1 11:00 AM", emoji: "⚡", group: "Westbrook Flat" },
    { id: "a4", user: "Priya", avatar: "PP", action: "completed", task: "Take out trash", time: "Apr 29 9:00 AM", emoji: "🗑️", group: "Westbrook Flat" },
  ],
  analytics: { totalCompleted: 147, streak: 12, productivityScore: 87, topContributor: "Rahul", heatmap: [3,5,2,7,4,6,1,0,4,5,3,7,6,2,5,4,7,3,6,2,4,5,1,3,6,4,7,5] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Avatar = ({ letters, size = 32, color = C.accent, online = false, fontSize }) => (
  <div style={{ position: "relative", flexShrink: 0 }}>
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`, border: `1.5px solid ${color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: fontSize || size * 0.36, fontWeight: 500, color,
      fontFamily: "monospace", letterSpacing: "0.5px",
    }}>{letters}</div>
    {online !== undefined && (
      <div style={{
        position: "absolute", bottom: 0, right: 0,
        width: size * 0.28, height: size * 0.28, borderRadius: "50%",
        background: online ? C.green : C.textSub, border: `1.5px solid ${C.bgCard}`,
      }} />
    )}
  </div>
);

const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{
    fontSize: 11, fontWeight: 500, letterSpacing: "0.5px",
    padding: "2px 8px", borderRadius: 20,
    background: bg || `${color}22`, color,
    border: `1px solid ${color}33`,
  }}>{children}</span>
);

const priorityColor = (p) => p === "high" ? C.red : p === "medium" ? C.amber : C.green;
const priorityBg = (p) => p === "high" ? C.redSoft : p === "medium" ? C.amberSoft : C.greenSoft;

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: C.bgElevated, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "12px 20px", zIndex: 999,
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: `0 0 0 1px ${C.accentGlow}, 0 8px 32px rgba(0,0,0,0.5)`,
      animation: "fadeUp 0.3s ease",
    }}>
      <span style={{ fontSize: 18 }}>{msg.emoji || "✅"}</span>
      <div>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{msg.title}</div>
        {msg.sub && <div style={{ color: C.textMuted, fontSize: 12 }}>{msg.sub}</div>}
      </div>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = ({ activeGroup, setActiveGroup, groups, page, setPage, unread, user }) => {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "analytics", label: "Analytics", icon: "◉" },
    { id: "activity", label: "Activity", icon: "◎" },
  ];
  return (
    <div style={{
      width: 220, flexShrink: 0, background: C.bgCard,
      borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.accent}, #A855F7)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>⟁</div>
          <div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 15, letterSpacing: "-0.3px" }}>MOXY</div>
            <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "1.5px" }}>SYNCHRONIZE</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: "12px 10px 8px" }}>
        <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1px", padding: "0 10px 8px", textTransform: "uppercase" }}>Navigation</div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
            background: page === n.id ? C.accentSoft : "transparent",
            color: page === n.id ? C.accent : C.textMuted,
            fontSize: 13, fontWeight: page === n.id ? 500 : 400,
            marginBottom: 2, transition: "all 0.15s",
            textAlign: "left",
          }}>
            <span style={{ fontSize: 15 }}>{n.icon}</span>
            {n.label}
            {n.id === "dashboard" && unread > 0 && (
              <span style={{ marginLeft: "auto", background: C.red, color: "#fff", fontSize: 10, borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>{unread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Groups */}
      <div style={{ padding: "8px 10px", flex: 1, overflowY: "auto" }}>
        <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1px", padding: "0 10px 8px", textTransform: "uppercase" }}>Groups</div>
        {groups.map(g => (
          <button key={g.id} onClick={() => { setActiveGroup(g.id); setPage("dashboard"); }} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
            background: activeGroup === g.id && page === "dashboard" ? `${g.color}18` : "transparent",
            color: activeGroup === g.id && page === "dashboard" ? g.color : C.textMuted,
            fontSize: 13, marginBottom: 2, transition: "all 0.15s", textAlign: "left",
          }}>
            <span style={{ fontSize: 16 }}>{g.icon}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
            <span style={{ fontSize: 11, color: C.textSub }}>{g.memberCount}</span>
          </button>
        ))}
        <button style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 8, border: `1px dashed ${C.border}`, cursor: "pointer",
          background: "transparent", color: C.textMuted, fontSize: 13, marginTop: 4,
        }}>
          <span style={{ fontSize: 15, color: C.textSub }}>+</span> New Group
        </button>
      </div>

      {/* User */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar letters={user.avatar} size={32} online={true} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ color: C.green, fontSize: 10 }}>● Online</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Task Card ────────────────────────────────────────────────────────────────
const TaskCard = ({ task, members, onComplete, groupColor }) => {
  const [completing, setCompleting] = useState(false);
  const done = !!task.completedBy;

  const handleComplete = async () => {
    if (done || completing) return;
    setCompleting(true);
    await new Promise(r => setTimeout(r, 600));
    onComplete(task.id);
    setCompleting(false);
  };

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${done ? C.greenSoft : C.border}`,
      borderRadius: 14, padding: "16px 18px",
      opacity: done ? 0.7 : 1, transition: "all 0.3s",
      position: "relative", overflow: "hidden",
    }}>
      {done && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${C.green}, transparent)`,
        }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Emoji + complete button */}
        <button onClick={handleComplete} disabled={done || completing} style={{
          width: 42, height: 42, borderRadius: 12, border: `1.5px solid ${done ? C.green : C.border}`,
          background: done ? C.greenSoft : completing ? C.accentSoft : C.bgElevated,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: done ? 16 : 20, cursor: done ? "default" : "pointer",
          transition: "all 0.2s", flexShrink: 0,
          animation: completing ? "pulse 0.6s ease" : "none",
        }}>
          {completing ? "⟳" : done ? "✓" : task.emoji}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              color: done ? C.textMuted : C.text, fontSize: 14, fontWeight: 500,
              textDecoration: done ? "line-through" : "none",
            }}>{task.title}</span>
            <Badge color={priorityColor(task.priority)} bg={priorityBg(task.priority)}>
              {task.priority}
            </Badge>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>🔁 {task.recurrence}</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>⏰ {task.nextDue}</span>
            <span style={{ color: C.amber, fontSize: 12 }}>🔥 {task.streak}d streak</span>
          </div>

          {done && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 8,
              background: C.greenSoft, border: `1px solid ${C.green}22`,
              fontSize: 12, color: C.green,
            }}>
              ✓ {task.completedByName} completed · {task.completedAt}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Dashboard Page ───────────────────────────────────────────────────────────
const DashboardPage = ({ state, activeGroup, onComplete, onNotifClick }) => {
  const group = state.groups.find(g => g.id === activeGroup);
  const tasks = state.tasks[activeGroup] || [];
  const members = state.members[activeGroup] || [];
  const pending = tasks.filter(t => !t.completedBy);
  const completed = tasks.filter(t => t.completedBy);

  if (!group) return null;
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>{group.icon}</span>
            <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.5px" }}>{group.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ color: C.textMuted, fontSize: 13 }}>{members.length} members</span>
            <div style={{ display: "flex", gap: -6 }}>
              {members.slice(0, 4).map((m, i) => (
                <div key={m.id} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${C.bgCard}`, borderRadius: "50%" }}>
                  <Avatar letters={m.avatar} size={22} online={m.online} color={group.color} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNotifClick} style={{
            background: C.bgElevated, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 14px", color: C.textMuted,
            cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          }}>
            🔔 <span style={{ background: C.red, color: "#fff", fontSize: 10, borderRadius: 10, padding: "1px 5px" }}>
              {state.notifications.filter(n => !n.read).length}
            </span>
          </button>
          <button style={{
            background: group.color, border: "none",
            borderRadius: 10, padding: "8px 16px", color: "#fff",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>+ Add Task</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Pending", value: pending.length, color: C.amber, emoji: "⏳" },
          { label: "Completed today", value: completed.length, color: C.green, emoji: "✅" },
          { label: "Group streak", value: "12d", color: C.accent, emoji: "🔥" },
        ].map(s => (
          <div key={s.label} style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>{s.emoji} {s.label}</div>
            <div style={{ color: s.color, fontSize: 24, fontWeight: 600 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Members online */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>Members</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar letters={m.avatar} size={28} online={m.online} color={group.color} />
              <div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>{m.name.split(" ")[0]}</div>
                <div style={{ color: m.online ? C.green : C.textSub, fontSize: 10 }}>{m.online ? "Online" : "Offline"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.5px", marginBottom: 12 }}>
            PENDING TASKS · {pending.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map(t => (
              <TaskCard key={t.id} task={t} members={members} onComplete={onComplete} groupColor={group.color} />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <div style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.5px", marginBottom: 12 }}>
            COMPLETED TODAY · {completed.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {completed.map(t => (
              <TaskCard key={t.id} task={t} members={members} onComplete={onComplete} groupColor={group.color} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Analytics Page ───────────────────────────────────────────────────────────
const AnalyticsPage = ({ state }) => {
  const { analytics } = state;
  const heatmapColors = [C.bgElevated, "#4C1D95", "#7C3AED", "#A855F7", "#C084FC"];
  const maxVal = Math.max(...analytics.heatmap);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.5px" }}>Analytics</h1>
      <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 24 }}>Your household productivity at a glance</p>

      {/* Score card */}
      <div style={{
        background: `linear-gradient(135deg, ${C.accentSoft}, transparent)`,
        border: `1px solid ${C.accentGlow}`,
        borderRadius: 16, padding: "24px", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>Productivity Score</div>
          <div style={{ color: C.accent, fontSize: 48, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1 }}>
            {analytics.productivityScore}
            <span style={{ fontSize: 20, color: C.textMuted }}>/100</span>
          </div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>
            🥇 Top contributor: <span style={{ color: C.text }}>{analytics.topContributor}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.textMuted, fontSize: 12 }}>Total completions</div>
          <div style={{ color: C.green, fontSize: 32, fontWeight: 600 }}>{analytics.totalCompleted}</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>🔥 {analytics.streak}d streak</div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Tasks this week", value: 23, sub: "+12% vs last week", color: C.accent },
          { label: "Avg completion time", value: "4.2h", sub: "Before due date", color: C.green },
          { label: "Missed tasks", value: 2, sub: "This month", color: C.red },
          { label: "Active groups", value: 3, sub: "Across all groups", color: C.amber },
        ].map(s => (
          <div key={s.label} style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "16px",
          }}>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 8 }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>{s.value}</div>
            <div style={{ color: C.textSub, fontSize: 11 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 20 }}>
        <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 14 }}>Activity heatmap · last 28 days</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {analytics.heatmap.map((v, i) => {
            const intensity = v / maxVal;
            const shade = Math.round(intensity * 4);
            return (
              <div key={i} style={{
                height: 28, borderRadius: 6,
                background: v === 0 ? C.bgElevated : heatmapColors[shade],
                border: `1px solid rgba(255,255,255,0.04)`,
                transition: "all 0.15s",
                cursor: "default",
              }} title={`${v} tasks completed`} />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <span key={d} style={{ color: C.textSub, fontSize: 10, width: "14.28%", textAlign: "center" }}>{d}</span>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 14 }}>Category breakdown</div>
        {[
          { name: "Chores", count: 45, pct: 31, color: C.accent },
          { name: "Bills", count: 12, pct: 8, color: C.red },
          { name: "Shopping", count: 38, pct: 26, color: C.green },
          { name: "Pet Care", count: 28, pct: 19, color: C.amber },
          { name: "Other", count: 24, pct: 16, color: C.textMuted },
        ].map(c => (
          <div key={c.name} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ color: C.text, fontSize: 13 }}>{c.name}</span>
              <span style={{ color: C.textMuted, fontSize: 12 }}>{c.count} · {c.pct}%</span>
            </div>
            <div style={{ height: 4, background: C.bgElevated, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${c.pct}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 1s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Activity Page ────────────────────────────────────────────────────────────
const ActivityPage = ({ state }) => (
  <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
    <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.5px" }}>Activity</h1>
    <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 24 }}>Real-time log across all your groups</p>

    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {state.activity.map((a, i) => (
        <div key={a.id} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: 20 }}>
          {/* Timeline line */}
          {i < state.activity.length - 1 && (
            <div style={{
              position: "absolute", left: 17, top: 36, bottom: 0,
              width: 1, background: C.border,
            }} />
          )}
          <Avatar letters={a.avatar} size={36} online={false} />
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "12px 14px", flex: 1,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{a.user}</span>
              <span style={{ color: C.textMuted, fontSize: 13 }}>completed</span>
              <span style={{ fontSize: 14 }}>{a.emoji}</span>
              <span style={{ color: C.accent, fontSize: 13 }}>{a.task}</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: C.textMuted, fontSize: 11 }}>🕐 {a.time}</span>
              <span style={{ color: C.textMuted, fontSize: 11 }}>in {a.group}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Notification Panel ───────────────────────────────────────────────────────
const NotifPanel = ({ notifications, onClose, onMark }) => (
  <div style={{
    position: "absolute", top: 0, right: 0, bottom: 0, width: 320,
    background: C.bgCard, borderLeft: `1px solid ${C.border}`,
    zIndex: 100, display: "flex", flexDirection: "column",
    animation: "slideIn 0.2s ease",
  }}>
    <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>Notifications</div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 18 }}>×</button>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
      {notifications.map(n => (
        <div key={n.id} onClick={() => onMark(n.id)} style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
          background: n.read ? "transparent" : C.accentSoft,
          border: `1px solid ${n.read ? "transparent" : C.accentGlow}`,
          transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ fontSize: 18 }}>
              {n.type === "complete" ? "✅" : n.type === "invite" ? "👥" : "🔔"}
            </span>
            <div>
              <div style={{ color: n.read ? C.textMuted : C.text, fontSize: 13 }}>{n.text}</div>
              <div style={{ color: C.textSub, fontSize: 11, marginTop: 3 }}>{n.time} · {n.groupName}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div style={{ padding: "12px", borderTop: `1px solid ${C.border}` }}>
      <button onClick={() => notifications.forEach(n => onMark(n.id))} style={{
        width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
        background: C.bgElevated, color: C.textMuted, cursor: "pointer", fontSize: 13,
      }}>Mark all as read</button>
    </div>
  </div>
);

// ─── Realtime event simulator ─────────────────────────────────────────────────
const useRealtimeSimulator = (onEvent) => {
  useEffect(() => {
    const events = [
      { delay: 5000, fn: () => onEvent({ type: "user_complete", userName: "Rahul", taskName: "Feed the Cat", emoji: "🐱", groupId: "g1", taskId: "t1_sim" }) },
      { delay: 12000, fn: () => onEvent({ type: "friend_online", userName: "Priya", avatar: "PP" }) },
      { delay: 20000, fn: () => onEvent({ type: "user_complete", userName: "Arun", taskName: "Take out trash", emoji: "🗑️", groupId: "g1", taskId: "t2_sim" }) },
    ];
    const timers = events.map(e => setTimeout(e.fn, e.delay));
    return () => timers.forEach(clearTimeout);
  }, []);
};

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [activeGroup, setActiveGroup] = useState("g1");
  const [page, setPage] = useState("dashboard");
  const [showNotif, setShowNotif] = useState(false);
  const [toast, setToast] = useState(null);

  const addToast = useCallback((msg) => setToast(msg), []);

  // Simulate real-time incoming events
  useRealtimeSimulator(useCallback((event) => {
    if (event.type === "user_complete") {
      addToast({ emoji: event.emoji, title: `${event.userName} completed ${event.taskName}`, sub: "Real-time sync · just now" });
      setState(prev => ({
        ...prev,
        notifications: [
          { id: `n_${Date.now()}`, type: "complete", text: `${event.userName} completed ${event.taskName}`, time: "just now", read: false, groupName: prev.groups.find(g => g.id === event.groupId)?.name || "" },
          ...prev.notifications,
        ],
        activity: [
          { id: `a_${Date.now()}`, user: event.userName, avatar: event.userName.slice(0,2).toUpperCase(), action: "completed", task: event.taskName, time: "just now", emoji: event.emoji, group: prev.groups.find(g => g.id === event.groupId)?.name || "" },
          ...prev.activity,
        ],
      }));
    } else if (event.type === "friend_online") {
      addToast({ emoji: "🟢", title: `${event.userName} came online`, sub: "" });
      setState(prev => {
        const updated = { ...prev };
        Object.keys(updated.members).forEach(gid => {
          updated.members[gid] = updated.members[gid].map(m =>
            m.avatar === event.avatar ? { ...m, online: true } : m
          );
        });
        return updated;
      });
    }
  }, []));

  const handleComplete = useCallback((taskId) => {
    setState(prev => {
      const newTasks = { ...prev.tasks };
      Object.keys(newTasks).forEach(gid => {
        newTasks[gid] = newTasks[gid].map(t =>
          t.id === taskId ? { ...t, completedBy: "u1", completedAt: "Just now", completedByName: "You" } : t
        );
      });
      const task = Object.values(prev.tasks).flat().find(t => t.id === taskId);
      if (task) {
        addToast({ emoji: task.emoji, title: `${task.title} marked complete!`, sub: "Your group has been notified" });
      }
      return { ...prev, tasks: newTasks };
    });
  }, [addToast]);

  const handleMarkNotif = useCallback((id) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }));
  }, []);

  const unread = state.notifications.filter(n => !n.read).length;

  return (
    <div style={{
      display: "flex", height: "100vh", background: C.bg,
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: C.text, overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        button { font-family: inherit; }
      `}</style>

      <Sidebar
        activeGroup={activeGroup}
        setActiveGroup={setActiveGroup}
        groups={state.groups}
        page={page}
        setPage={setPage}
        unread={unread}
        user={state.user}
      />

      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
        {page === "dashboard" && (
          <DashboardPage
            state={state}
            activeGroup={activeGroup}
            onComplete={handleComplete}
            onNotifClick={() => setShowNotif(v => !v)}
          />
        )}
        {page === "analytics" && <AnalyticsPage state={state} />}
        {page === "activity" && <ActivityPage state={state} />}

        {showNotif && (
          <NotifPanel
            notifications={state.notifications}
            onClose={() => setShowNotif(false)}
            onMark={handleMarkNotif}
          />
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
