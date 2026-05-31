// src/pages/SettingsPage.tsx
import { useState, useRef } from "react";
import { useMe, useUpdateMe, useGroups, useGroupMembers } from "@/hooks/useQueries";
import { useUIStore } from "@/store";
import { useAuth } from "@/hooks/useAuth";

const C = {
  bgCard: "#111118", bgElevated: "#16161F",
  border: "rgba(255,255,255,0.07)", borderHover: "rgba(255,255,255,0.12)",
  accent: "#7C6FFF", accentSoft: "rgba(124,111,255,0.12)",
  green: "#22C55E", greenSoft: "rgba(34,197,94,0.1)",
  amber: "#F59E0B", amberSoft: "rgba(245,158,11,0.1)",
  red: "#EF4444", redSoft: "rgba(239,68,68,0.1)",
  text: "#F0F0FF", textMuted: "rgba(240,240,255,0.45)", textSub: "rgba(240,240,255,0.22)",
};

// ── Shared primitives ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 12 }}>
        {title}
      </div>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, sub, children, first, last }: {
  label: string; sub?: string; children?: React.ReactNode;
  first?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", gap: 16,
      borderTop: first ? "none" : `1px solid ${C.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ color: C.textSub, fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, color = C.accent }: {
  value: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: value ? color : "rgba(255,255,255,0.12)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3,
        left: value ? 22 : 3,
        width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

function EditableField({ label, value, onSave, placeholder }: {
  label: string; value: string; onSave: (v: string) => Promise<void>; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.focus(), 50); };
  const cancel = () => { setEditing(false); setDraft(value); };
  const save = async () => {
    if (draft.trim() === value) { cancel(); return; }
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); }
    catch { /* toast handled by mutation */ }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            style={{
              background: C.bgElevated, border: `1px solid ${C.accent}60`,
              borderRadius: 8, color: C.text, fontSize: 13, padding: "6px 10px",
              outline: "none", fontFamily: "inherit", width: 200,
            }}
          />
          <button onClick={save} disabled={saving} style={{
            padding: "6px 12px", borderRadius: 8, border: "none",
            background: C.accent, color: "#fff", fontSize: 12, cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}>{saving ? "…" : "Save"}</button>
          <button onClick={cancel} style={{
            padding: "6px 10px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.textMuted, fontSize: 12, cursor: "pointer",
          }}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ color: value ? C.text : C.textSub, fontSize: 13 }}>
            {value || placeholder || "—"}
          </span>
          <button onClick={start} style={{
            padding: "4px 10px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.textMuted, fontSize: 11, cursor: "pointer",
          }}>Edit</button>
        </>
      )}
    </div>
  );
}

// ── Theme selector ────────────────────────────────────────────────────────────
function ThemeSelector({ current, onChange }: { current: string; onChange: (t: string) => void }) {
  const themes = [
    { id: "dark", label: "Dark", icon: "🌙" },
    { id: "light", label: "Light", icon: "☀️" },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${current === t.id ? C.accent : C.border}`,
            background: current === t.id ? C.accentSoft : "transparent",
            color: current === t.id ? C.accent : C.textMuted,
            fontSize: 12, display: "flex", alignItems: "center", gap: 5,
            transition: "all 0.15s",
          }}
        >{t.icon} {t.label}</button>
      ))}
    </div>
  );
}

// ── Group member manager ──────────────────────────────────────────────────────
function GroupMembersSection({ groupId, groupName, groupColor }: {
  groupId: string; groupName: string; groupColor: string;
}) {
  const { data: members = [] } = useGroupMembers(groupId);
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12,
      marginBottom: 10, overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", padding: "12px 16px", background: "transparent",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: groupColor,
          }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{groupName}</span>
          <span style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 6,
            padding: "1px 7px", color: C.textSub, fontSize: 11,
          }}>{members.length}</span>
        </div>
        <span style={{ color: C.textSub, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {members.map((m, i) => (
            <div key={m.user.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              borderTop: i > 0 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: `${groupColor}22`, border: `1.5px solid ${groupColor}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: groupColor,
              }}>
                {m.user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontSize: 13 }}>{m.user.full_name}</div>
                <div style={{ color: C.textSub, fontSize: 11 }}>@{m.user.username ?? "—"}</div>
              </div>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 6,
                background: m.role === "admin" ? C.accentSoft : "rgba(255,255,255,0.05)",
                color: m.role === "admin" ? C.accent : C.textSub,
                border: `1px solid ${m.role === "admin" ? `${C.accent}40` : C.border}`,
              }}>{m.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────
export function SettingsPage() {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const { data: groups = [] } = useGroups();
  const { signOut } = useAuth();
  const { theme, setTheme } = useUIStore();

  // Local prefs state (would persist via UserSettings API in production)
  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    pushNotifications: true,
    soundEnabled: true,
    vacationMode: false,
  });
  const setPref = (key: keyof typeof prefs) => (v: boolean) =>
    setPrefs((p) => ({ ...p, [key]: v }));

  const [showDanger, setShowDanger] = useState(false);

  if (!me) return null;

  const initials = me.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
          Settings
        </h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          Manage your profile, preferences, and groups
        </p>
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <Section title="Profile">
        {/* Avatar + name */}
        <div style={{ padding: "18px 18px 14px", display: "flex", alignItems: "center", gap: 16 }}>
          {me.avatar_url ? (
            <img src={me.avatar_url} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `${C.accent}22`, border: `2px solid ${C.accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 600, color: C.accent,
            }}>{initials}</div>
          )}
          <div>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>{me.full_name}</div>
            <div style={{ color: C.textMuted, fontSize: 13 }}>{me.email}</div>
            <div style={{ color: C.green, fontSize: 11, marginTop: 3 }}>
              ● Google account · verified
            </div>
          </div>
        </div>

        <Row first label="Display name" sub="Shown to other members">
          <EditableField
            label="name"
            value={me.full_name}
            placeholder="Your name"
            onSave={(v) => updateMe.mutateAsync({ full_name: v })}
          />
        </Row>

        <Row label="Username" sub="Used in search and mentions">
          <EditableField
            label="username"
            value={me.username ?? ""}
            placeholder="Set a username"
            onSave={(v) => updateMe.mutateAsync({ username: v })}
          />
        </Row>

        <Row last label="Email" sub="From your Google account">
          <span style={{ color: C.textMuted, fontSize: 13 }}>{me.email}</span>
        </Row>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      <Section title="Appearance">
        <Row first last label="Theme" sub="Choose your preferred color scheme">
          <ThemeSelector current={theme} onChange={setTheme} />
        </Row>
      </Section>

      {/* ── Notifications ───────────────────────────────────────────────────── */}
      <Section title="Notifications">
        <Row first label="Email notifications" sub="Receive task reminders by email">
          <Toggle value={prefs.emailNotifications} onChange={setPref("emailNotifications")} />
        </Row>
        <Row label="Push notifications" sub="Browser and mobile push alerts">
          <Toggle value={prefs.pushNotifications} onChange={setPref("pushNotifications")} />
        </Row>
        <Row label="Sound alerts" sub="Play a sound when tasks are completed">
          <Toggle value={prefs.soundEnabled} onChange={setPref("soundEnabled")} />
        </Row>
        <Row last label="Vacation mode" sub="Pause all reminders temporarily">
          <Toggle value={prefs.vacationMode} onChange={setPref("vacationMode")} color={C.amber} />
        </Row>
      </Section>

      {/* ── Groups & Members ────────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <Section title="Your Groups">
          <div style={{ padding: "14px 18px" }}>
            {groups.map((g) => (
              <GroupMembersSection
                key={g.id}
                groupId={g.id}
                groupName={g.name}
                groupColor={g.color}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Account info ────────────────────────────────────────────────────── */}
      <Section title="Account">
        <Row first label="Member since" sub="Account creation date">
          <span style={{ color: C.textMuted, fontSize: 13 }}>
            {new Date(me.created_at).toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
        </Row>
        <Row label="Account status" sub="Your subscription plan">
          <span style={{
            background: C.accentSoft, color: C.accent,
            border: `1px solid ${C.accent}40`,
            borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 500,
          }}>Free plan</span>
        </Row>
        <Row last label="Sign out" sub="Sign out of all devices">
          <button
            onClick={signOut}
            style={{
              padding: "7px 14px", borderRadius: 9,
              border: `1px solid ${C.border}`,
              background: "transparent", color: C.textMuted,
              fontSize: 12, cursor: "pointer",
            }}
          >Sign out</button>
        </Row>
      </Section>

      {/* ── Danger zone ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 12 }}>
          Danger Zone
        </div>
        <div style={{
          background: C.bgCard, border: `1px solid ${C.red}30`,
          borderRadius: 14, padding: "16px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 500 }}>Delete account</div>
              <div style={{ color: C.textSub, fontSize: 11, marginTop: 2 }}>
                Permanently delete your account and all data. This cannot be undone.
              </div>
            </div>
            <button
              onClick={() => setShowDanger((v) => !v)}
              style={{
                padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${C.red}50`,
                background: showDanger ? C.redSoft : "transparent",
                color: C.red, fontSize: 12, flexShrink: 0,
              }}
            >{showDanger ? "Cancel" : "Delete account"}</button>
          </div>

          {showDanger && (
            <div style={{
              marginTop: 14, padding: "14px", borderRadius: 10,
              background: C.redSoft, border: `1px solid ${C.red}30`,
            }}>
              <p style={{ color: C.red, fontSize: 13, margin: "0 0 12px" }}>
                ⚠️ This will permanently delete your account, remove you from all groups, and erase all your data. There is no recovery.
              </p>
              <button
                onClick={signOut} // in production: call DELETE /users/me then sign out
                style={{
                  padding: "8px 16px", borderRadius: 9, cursor: "pointer",
                  border: "none", background: C.red, color: "#fff",
                  fontSize: 13, fontWeight: 500,
                }}
              >Yes, permanently delete my account</button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}
