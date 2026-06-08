// src/components/layout/Sidebar.tsx
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadCount } from "@/hooks/useQueries";
import { useUIStore } from "@/store";
import { useColors } from "@/lib/theme";
import { groupApi } from "@/api/services";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/hooks/useQueries";
import type { GroupRead } from "@/types";

interface SidebarProps {
  groups: GroupRead[];
}

const NAV = [
  { id: "dashboard" as const, label: "Dashboard", icon: "⊞" },
  { id: "analytics" as const, label: "Analytics", icon: "◉" },
  { id: "activity"  as const, label: "Activity",  icon: "◎" },
  { id: "settings"  as const, label: "Settings",  icon: "⚙" },
];

// ── Edit Group Modal ──────────────────────────────────────────────────────────
function EditGroupModal({ group, onClose }: { group: GroupRead; onClose: () => void }) {
  const C = useColors();
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await groupApi.update(group.id, { name: name.trim(), description: description.trim() || undefined });
      qc.invalidateQueries({ queryKey: QK.groups });
      onClose();
    } catch {
      alert("Failed to update group");
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
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 24, width: 400, maxWidth: "90vw",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Edit Group</div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6 }}>Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: "100%", background: C.bgElevated, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6 }}>Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            style={{
              width: "100%", background: C.bgElevated, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "8px 16px", color: C.textMuted, cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} style={{
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

// ── Group Menu ────────────────────────────────────────────────────────────────
function GroupMenu({ group, onEdit, onDelete }: {
  group: GroupRead;
  onEdit: (g: GroupRead) => void;
  onDelete: (id: string) => void;
}) {
  const C = useColors();
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
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.textMuted, fontSize: 14, padding: "2px 5px",
          borderRadius: 5, lineHeight: 1,
        }}
      >⋯</button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "110%", zIndex: 100,
          background: C.bgElevated, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 4, minWidth: 120,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <button
            onClick={() => { onEdit(group); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 12px", background: "none",
              border: "none", borderRadius: 7, cursor: "pointer",
              color: C.text, fontSize: 12, textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.bgCard)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >✏️ Edit</button>
          <button
            onClick={() => { onDelete(group.id); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 12px", background: "none",
              border: "none", borderRadius: 7, cursor: "pointer",
              color: C.red, fontSize: 12, textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.redSoft)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >🗑️ Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar({ groups }: SidebarProps) {
  const C = useColors();
  const { user, signOut } = useAuth();
  const { activeGroupId, activePage, setActiveGroup, setActivePage, toggleCreateGroup, toggleInviteMembers } = useUIStore();
  const { data: unreadCount = 0 } = useUnreadCount();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRead | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const qc = useQueryClient();

  const initials = user?.full_name
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  const handleDeleteGroup = async (groupId: string) => {
  if (!confirm("Delete this group? All tasks will be lost.")) return;
  try {
    await groupApi.delete(groupId);
    qc.invalidateQueries({ queryKey: QK.groups });
  } catch {
    alert("Failed to delete group");
  }
  };  

  return (
    <div style={{
      width: 220, flexShrink: 0, background: C.bgCard,
      borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", height: "100%",
      userSelect: "none", transition: "background 0.2s, border-color 0.2s",
    }}>
      {editingGroup && (
        <EditGroupModal group={editingGroup} onClose={() => setEditingGroup(null)} />
      )}

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #7C6FFF, #A855F7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, boxShadow: "0 0 16px rgba(124,111,255,0.35)",
          }}>⟁</div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>MOXY</div>
            <div style={{ color: C.textSub, fontSize: 9, letterSpacing: "1.8px", textTransform: "uppercase" }}>Synchronize</div>
          </div>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 10px 6px" }}>
        <div style={{ color: C.textSub, fontSize: 9, letterSpacing: "1.4px", textTransform: "uppercase", padding: "0 10px 8px" }}>
          Navigation
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setActivePage(n.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
              background: activePage === n.id ? C.accentSoft : "transparent",
              color: activePage === n.id ? C.accent : C.textMuted,
              fontSize: 13, fontWeight: activePage === n.id ? 500 : 400,
              marginBottom: 2, transition: "all 0.15s", textAlign: "left",
            }}
          >
            <span style={{ fontSize: 14, opacity: 0.9 }}>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.id === "dashboard" && unreadCount > 0 && (
              <span style={{
                background: C.red, color: "#fff", fontSize: 10,
                borderRadius: 10, padding: "1px 6px", fontWeight: 600,
              }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Groups ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "6px 10px", flex: 1, overflowY: "auto" }}>
        <div style={{ color: C.textSub, fontSize: 9, letterSpacing: "1.4px", textTransform: "uppercase", padding: "0 10px 8px" }}>
          Groups
        </div>

        {groups.length === 0 && (
          <div style={{ padding: "8px 10px", color: C.textSub, fontSize: 12 }}>No groups yet</div>
        )}

        {groups.map((g) => {
          const isActive = activeGroupId === g.id && activePage === "dashboard";
          const isHovered = hoveredGroupId === g.id;
          return (
            <div
              key={g.id}
              onMouseEnter={() => setHoveredGroupId(g.id)}
              onMouseLeave={() => setHoveredGroupId(null)}
              style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 2 }}
            >
              <button
                onClick={() => { setActiveGroup(g.id); setActivePage("dashboard"); }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 32px 8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: isActive ? `${g.color}18` : "transparent",
                  color: isActive ? g.color : C.textMuted,
                  fontSize: 13, transition: "all 0.15s", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{g.icon}</span>
                <span style={{
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", fontWeight: isActive ? 500 : 400,
                }}>{g.name}</span>
                <span style={{
                  fontSize: 10, color: C.textSub,
                  background: C.border,
                  padding: "1px 5px", borderRadius: 6,
                }}>{g.member_count}</span>
              </button>

              {isHovered && (
                <div style={{ position: "absolute", right: 4 }}>
                  <GroupMenu group={g} onEdit={setEditingGroup} onDelete={handleDeleteGroup} />
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={toggleCreateGroup}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 9,
            padding: "8px 10px", borderRadius: 8, marginTop: 4,
            border: `1px dashed ${C.border}`, cursor: "pointer",
            background: "transparent", color: C.textSub, fontSize: 13,
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 14 }}>+</span>
          <span>New Group</span>
        </button>
      </div>

      {/* ── User footer ──────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, position: "relative" }}>
        {showUserMenu && (
          <div style={{
            position: "absolute", bottom: 60, left: 14, right: 14,
            background: C.bgElevated, border: `1px solid ${C.border}`,
            borderRadius: 10, overflow: "hidden", zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            <button
              onClick={() => { setActivePage("settings"); setShowUserMenu(false); }}
              style={{
                width: "100%", padding: "10px 14px", border: "none",
                background: "transparent", color: C.textMuted, fontSize: 13,
                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
              }}
            >⚙ Settings</button>
            <div style={{ height: 1, background: C.border }} />
            <button
              onClick={() => { signOut(); setShowUserMenu(false); }}
              style={{
                width: "100%", padding: "10px 14px", border: "none",
                background: "transparent", color: C.red, fontSize: 13,
                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
              }}
            >↪ Sign out</button>
          </div>
        )}

        <button
          onClick={() => setShowUserMenu((v) => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            background: "transparent", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: `${C.accent}22`, border: `1.5px solid ${C.accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, color: C.accent,
            }}>{initials}</div>
          )}
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{
              color: C.text, fontSize: 12, fontWeight: 500,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{user?.full_name}</div>
            <div style={{ color: C.green, fontSize: 10 }}>● Online</div>
          </div>
          <span style={{ color: C.textSub, fontSize: 14 }}>⋯</span>
        </button>
      </div>
    </div>
  );
}