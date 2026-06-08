// src/components/modals/InviteMembersModal.tsx
import { useState, useEffect } from "react";
import { Modal, useFormStyles } from "@/components/ui/Modal";
import { useColors } from "@/lib/theme";
import {
  useSearchUsers,
  useGroupMembers,
  useGroups,
} from "@/hooks/useQueries";
import { groupApi } from "@/api/services";
import { useToastStore } from "@/store";
import type { GroupRead, UserPublic } from "@/types";

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Avatar({ user, size = 34 }: { user: UserPublic; size?: number }) {
  const C = useColors();
  const initials = user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return user.avatar_url ? (
    <img
      src={user.avatar_url} alt={user.full_name}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: C.accentSoft, border: `1.5px solid ${C.accent}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 600, color: C.accent,
    }}>{initials}</div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const C = useColors();
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "9px 0", border: "none", cursor: "pointer",
      background: "transparent",
      color: active ? C.accent : C.textMuted,
      fontSize: 13, fontWeight: active ? 600 : 400,
      borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

interface Props {
  group: GroupRead;
  onClose: () => void;
}

export function InviteMembersModal({ group, onClose }: Props) {
  const C = useColors();
  const F = useFormStyles();
  const [tab, setTab] = useState<"search" | "link" | "join">("search");
  const { addToast } = useToastStore.getState();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query);
  const { data: searchResults = [], isFetching } = useSearchUsers(debouncedQuery);
  const { data: members = [], refetch: refetchMembers } = useGroupMembers(group.id);
  const memberIds = new Set(members.map((m) => m.user.id));

  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const handleInvite = async (user: UserPublic) => {
    setInviting(user.id);
    try {
      await groupApi.invite(group.id, user.id);
      setInvited((s) => new Set([...s, user.id]));
      refetchMembers();
      addToast({ emoji: "👋", title: `${user.full_name} added to ${group.name}` });
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "Could not invite user";
      addToast({ emoji: "❌", title: msg, type: "error" });
    } finally {
      setInviting(null);
    }
  };

  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteCode, setInviteCode] = useState(group.invite_code);
  const inviteLink = inviteCode ? `${window.location.origin}/join/${inviteCode}` : null;

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast({ emoji: "📋", title: "Invite link copied!" });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const { invite_code } = await groupApi.regenerateInvite(group.id);
      setInviteCode(invite_code);
      addToast({ emoji: "🔄", title: "Invite link regenerated" });
    } catch {
      addToast({ emoji: "❌", title: "Failed to regenerate link", type: "error" });
    } finally {
      setRegenerating(false);
    }
  };

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const { data: myGroups = [], refetch: refetchGroups } = useGroups();

  const handleJoin = async () => {
    const code = joinCode.trim().split("/").pop() ?? "";
    if (!code) return;
    setJoining(true);
    try {
      const joined = await groupApi.joinByInvite(code);
      refetchGroups();
      addToast({ emoji: joined.icon, title: `Joined ${joined.name}!` });
      onClose();
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "Invalid invite code";
      addToast({ emoji: "❌", title: msg, type: "error" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <Modal title={`Invite to ${group.name}`} onClose={onClose} width={460}>
      <div style={{
        display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20, marginTop: -4,
      }}>
        <Tab label="Search users" active={tab === "search"} onClick={() => setTab("search")} />
        <Tab label="Invite link"  active={tab === "link"}   onClick={() => setTab("link")} />
        <Tab label="Join a group" active={tab === "join"}   onClick={() => setTab("join")} />
      </div>

      {/* ── Tab 1: Search ───────────────────────────────────────────────── */}
      {tab === "search" && (
        <div>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: C.textMuted, fontSize: 14, pointerEvents: "none",
            }}>🔍</span>
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              style={{ ...F.input, paddingLeft: 36 }}
            />
            {isFetching && (
              <span style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                color: C.textMuted, fontSize: 12,
              }}>…</span>
            )}
          </div>

          {members.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>
                Already in this group
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map((m) => (
                  <div key={m.user.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: C.bgElevated, border: `1px solid ${C.border}`,
                    borderRadius: 20, padding: "4px 10px 4px 6px",
                  }}>
                    <Avatar user={m.user} size={20} />
                    <span style={{ color: C.textMuted, fontSize: 12 }}>{m.user.full_name.split(" ")[0]}</span>
                    {m.role === "admin" && <span style={{ color: C.accent, fontSize: 10 }}>★</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {debouncedQuery.length >= 2 && (
            <div>
              <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>
                {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}` : "No results"}
              </div>
              {searchResults.length === 0 && !isFetching && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.textMuted, fontSize: 13 }}>
                  No users found for "{debouncedQuery}"
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {searchResults.map((user) => {
                  const isMember  = memberIds.has(user.id);
                  const isInvited = invited.has(user.id);
                  const isInviting = inviting === user.id;
                  return (
                    <div key={user.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", borderRadius: 10,
                      background: C.bgElevated,
                      border: `1px solid ${isInvited ? `${C.green}40` : C.border}`,
                      transition: "border-color 0.2s",
                    }}>
                      <Avatar user={user} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{user.full_name}</div>
                        <div style={{ color: C.textSub, fontSize: 11, marginTop: 1 }}>
                          {user.username ? `@${user.username}` : ""}
                        </div>
                      </div>
                      {isMember ? (
                        <span style={{ color: C.textSub, fontSize: 12 }}>Already in group</span>
                      ) : isInvited ? (
                        <span style={{ color: C.green, fontSize: 12 }}>✓ Added</span>
                      ) : (
                        <button
                          onClick={() => handleInvite(user)}
                          disabled={!!isInviting}
                          style={{
                            padding: "6px 14px", borderRadius: 8, border: "none",
                            background: C.accent, color: "#fff",
                            fontSize: 12, fontWeight: 500, cursor: "pointer",
                            opacity: isInviting ? 0.6 : 1, transition: "opacity 0.15s",
                          }}
                        >{isInviting ? "Adding…" : "Add"}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {debouncedQuery.length < 2 && members.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: C.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
              <div style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>Find people to invite</div>
              <div style={{ fontSize: 13 }}>Search by name or email address</div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Invite link ─────────────────────────────────────────── */}
      {tab === "link" && (
        <div>
          <div style={{
            padding: "16px", borderRadius: 12,
            background: C.bgElevated, border: `1px solid ${C.border}`, marginBottom: 16,
          }}>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
              Anyone with this link can join <strong style={{ color: C.text }}>{group.name}</strong>
            </div>
            {inviteLink ? (
              <>
                <div style={{
                  background: C.bgBase, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "10px 12px",
                  color: C.textMuted, fontSize: 12,
                  fontFamily: "monospace", wordBreak: "break-all", marginBottom: 12,
                }}>{inviteLink}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleCopy} style={{
                    flex: 1, padding: "10px", borderRadius: 9, border: "none",
                    background: copied ? C.greenSoft : C.accent,
                    color: copied ? C.green : "#fff",
                    fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.2s",
                  }}>{copied ? "✓ Copied!" : "📋 Copy link"}</button>
                  <button onClick={handleRegenerate} disabled={regenerating} style={{
                    padding: "10px 14px", borderRadius: 9,
                    border: `1px solid ${C.border}`,
                    background: "transparent", color: C.textMuted,
                    fontSize: 12, cursor: "pointer", opacity: regenerating ? 0.5 : 1,
                  }}>{regenerating ? "…" : "↺ New link"}</button>
                </div>
              </>
            ) : (
              <div>
                <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>
                  This group doesn't have an invite link yet.
                </div>
                <button onClick={handleRegenerate} disabled={regenerating} style={{
                  width: "100%", padding: "10px", borderRadius: 9, border: "none",
                  background: C.accent, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}>{regenerating ? "Generating…" : "Generate invite link"}</button>
              </div>
            )}
          </div>

          {inviteLink && (
            <div>
              <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 10 }}>
                Share via
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "WhatsApp", color: "#25D366", emoji: "💬",
                    href: `https://wa.me/?text=${encodeURIComponent(`Join our group on MOXY: ${inviteLink}`)}` },
                  { label: "Telegram", color: "#2AABEE", emoji: "✈️",
                    href: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("Join our group on MOXY!")}` },
                  { label: "Email", color: C.accent, emoji: "📧",
                    href: `mailto:?subject=${encodeURIComponent("Join me on MOXY")}&body=${encodeURIComponent(`Join our group on MOXY:\n\n${inviteLink}`)}` },
                ].map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{
                    flex: 1, padding: "10px 8px", borderRadius: 9,
                    border: `1px solid ${C.border}`,
                    background: `${s.color}12`, color: s.color,
                    fontSize: 12, fontWeight: 500, textDecoration: "none",
                    textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>{s.emoji} {s.label}</a>
                ))}
              </div>
            </div>
          )}

          <div style={{
            marginTop: 16, padding: "10px 12px", borderRadius: 9,
            background: C.amberSoft, border: `1px solid ${C.amber}30`,
            color: C.amber, fontSize: 12,
          }}>
            ⚠️ Anyone with this link can join the group. Regenerate it to invalidate the old one.
          </div>
        </div>
      )}

      {/* ── Tab 3: Join by code ────────────────────────────────────────── */}
      {tab === "join" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>
              Paste an invite link or code to join a group you were invited to.
            </div>
            <label style={F.label}>Invite link or code</label>
            <input
              autoFocus value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
              placeholder="https://moxy.app/join/abc123 or just abc123"
              style={{ ...F.input, marginBottom: 12 }}
            />
            <button
              onClick={handleJoin} disabled={joining || !joinCode.trim()}
              style={{
                width: "100%", padding: "11px", borderRadius: 10, border: "none",
                background: joinCode.trim() ? C.accent : C.accentSoft,
                color: joinCode.trim() ? "#fff" : C.textMuted,
                fontSize: 14, fontWeight: 500,
                cursor: joinCode.trim() ? "pointer" : "default", transition: "all 0.15s",
              }}
            >{joining ? "Joining…" : "Join group"}</button>
          </div>

          {myGroups.length > 0 && (
            <div>
              <div style={{ color: C.textSub, fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 10 }}>
                Your current groups
              </div>
              {myGroups.map((g) => (
                <div key={g.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 9,
                  background: C.bgElevated, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 18 }}>{g.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13 }}>{g.name}</div>
                    <div style={{ color: C.textSub, fontSize: 11 }}>{g.member_count} members</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}