// src/components/chat/ChatPanel.tsx
// A group's chat: history (loads older on demand), live messages, typing
// indicator and composer. Realtime events land in the query cache via
// useSocket, so this component only reads and sends.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatApi } from "@/api/services";
import { QK, addChatMessage, removeChatMessage, useChatMessages } from "@/hooks/useQueries";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getSocket } from "@/lib/socket";
import { useColors } from "@/lib/theme";
import { useToastStore, useTypingStore } from "@/store";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import type { ChatMessage } from "@/types";

interface Props {
  groupId: string;
  groupColor: string;
  myId: string | undefined;
  iAmAdmin: boolean;
}

const GROUP_WINDOW_MS = 5 * 60_000; // consecutive messages within 5 min share a header
const TYPING_THROTTLE_MS = 2500;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function ChatPanel({ groupId, groupColor, myId, iAmAdmin }: Props) {
  const C = useColors();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useChatMessages(groupId);

  // pages[0] is newest; show oldest → newest
  const messages = useMemo(() => (data ? [...data.pages].reverse().flat() : []), [data]);

  // ── Scrolling ────────────────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prependAnchor = useRef<number | null>(null); // scrollHeight before loading older

  const onScroll = () => {
    const el = listRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependAnchor.current !== null) {
      // Older messages were added on top: keep the same message in view
      el.scrollTop += el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    } else if (nearBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const loadOlder = async () => {
    prependAnchor.current = listRef.current?.scrollHeight ?? null;
    await fetchNextPage();
  };

  // ── Read state: viewing the chat marks it read ──────────────────────────
  useEffect(() => {
    if (!messages.length) return;
    qc.setQueryData<Record<string, number>>(QK.chatUnread, (u) => (u ? { ...u, [groupId]: 0 } : u));
    const t = setTimeout(() => chatApi.markRead(groupId).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [groupId, messages.length]);

  // ── Typing indicator ─────────────────────────────────────────────────────
  const typingInGroup = useTypingStore((s) => s.typing[groupId]);
  const [now, setNow] = useState(Date.now());
  const typers = Object.entries(typingInGroup ?? {})
    .filter(([uid, t]) => uid !== myId && t.until > now)
    .map(([, t]) => t.name.split(" ")[0]);
  useEffect(() => {
    if (!typers.length) return;
    const i = setInterval(() => setNow(Date.now()), 1000); // let entries expire
    return () => clearInterval(i);
  }, [typers.length]);
  useEffect(() => setNow(Date.now()), [typingInGroup]);

  const typingText =
    typers.length === 0 ? "" :
    typers.length === 1 ? `${typers[0]} is typing…` :
    typers.length === 2 ? `${typers[0]} and ${typers[1]} are typing…` :
    "Several people are typing…";

  // ── Composer ─────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const lastTypingSent = useRef(0);
  const sendQueue = useRef<Promise<void>>(Promise.resolve()); // keeps quick sends in order

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (value.trim() && Date.now() - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = Date.now();
      getSocket().emit("typing", { group_id: groupId });
    }
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    // Clear now so the next message can be typed while this one is in flight
    setDraft("");
    lastTypingSent.current = 0;
    sendQueue.current = sendQueue.current.then(async () => {
      try {
        const message = await chatApi.send(groupId, body);
        nearBottom.current = true;
        addChatMessage(qc, message);
      } catch (e: unknown) {
        setDraft((d) => d || body); // give the text back unless they've started a new one
        const msg = (e as { message?: string }).message ?? "Couldn't send message";
        useToastStore.getState().addToast({ emoji: "❌", title: msg, type: "error" });
      }
    });
  };

  const remove = async (m: ChatMessage) => {
    const ok = await confirmAction({ title: "Delete this message?", message: "It will be removed for everyone.", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await chatApi.remove(groupId, m.id);
      removeChatMessage(qc, groupId, m.id);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "Couldn't delete message";
      useToastStore.getState().addToast({ emoji: "❌", title: msg, type: "error" });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
    }}>
      <div ref={listRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 10px" : "16px 18px" }}>
        {hasNextPage && (
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <button onClick={loadOlder} disabled={isFetchingNextPage} style={{
              padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.border}`,
              background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer",
            }}>{isFetchingNextPage ? "Loading…" : "Load earlier messages"}</button>
          </div>
        )}

        {isLoading && <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, padding: 24 }}>Loading chat…</div>}

        {!isLoading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: C.textMuted, padding: "48px 12px" }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>💬</div>
            <div style={{ color: C.text, fontSize: 14, marginBottom: 4 }}>No messages yet</div>
            <div style={{ fontSize: 13 }}>Say hi to your group</div>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const name = m.user?.full_name ?? "A former member";

          if (m.kind === "system") {
            return (
              <div key={m.id} style={{ textAlign: "center", color: C.textSub, fontSize: 12, margin: "10px 0" }}>
                {name.split(" ")[0]} {m.body} · {timeOf(m.created_at)}
              </div>
            );
          }

          const mine = m.user?.id === myId;
          const startsRun = !prev || prev.kind !== "text" || prev.user?.id !== m.user?.id
            || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_WINDOW_MS;
          const deletable = mine || iAmAdmin;

          return (
            <div key={m.id} className="moxy-msg" style={{
              display: "flex", gap: 8, alignItems: "flex-end",
              flexDirection: mine ? "row-reverse" : "row",
              marginTop: startsRun ? 12 : 3,
            }}>
              {!mine && (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  visibility: startsRun ? "visible" : "hidden",
                  background: `${groupColor}22`, border: `1.5px solid ${groupColor}44`, color: groupColor,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600,
                }}>{initials(name)}</div>
              )}
              <div style={{ maxWidth: isMobile ? "78%" : "65%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                {startsRun && (
                  <div style={{ color: C.textSub, fontSize: 11, marginBottom: 3, padding: "0 4px" }}>
                    {mine ? "You" : name} · {timeOf(m.created_at)}
                  </div>
                )}
                <div style={{
                  padding: "8px 12px", borderRadius: 14, fontSize: 14, lineHeight: 1.4,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: mine ? groupColor : C.bgElevated,
                  color: mine ? "#fff" : C.text,
                  borderBottomRightRadius: mine ? 4 : 14,
                  borderBottomLeftRadius: mine ? 14 : 4,
                }}>{m.body}</div>
              </div>
              {deletable && (
                <button
                  className="moxy-msg-delete"
                  aria-label="Delete message"
                  title="Delete message"
                  onClick={() => remove(m)}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    color: C.textSub, fontSize: 14, padding: 4,
                    opacity: isMobile ? 0.6 : undefined, // no hover on touch screens
                  }}
                >🗑</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 18, padding: "0 16px", color: C.textMuted, fontSize: 11, fontStyle: "italic" }}>
        {typingText}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "8px 10px 10px", borderTop: `1px solid ${C.border}` }}>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message your group…"
          aria-label="Message"
          maxLength={2000}
          rows={Math.min(4, draft.split("\n").length)}
          style={{
            flex: 1, resize: "none", padding: "10px 12px", borderRadius: 10,
            background: C.bgElevated, border: `1px solid ${C.border}`, color: C.text,
            fontSize: 14, fontFamily: "inherit", outline: "none",
          }}
        />
        <button onClick={send} disabled={!draft.trim()} style={{
          padding: "0 16px", borderRadius: 10, border: "none",
          background: groupColor, color: "#fff", fontSize: 13, fontWeight: 500,
          cursor: draft.trim() ? "pointer" : "default", opacity: draft.trim() ? 1 : 0.5,
        }}>Send</button>
      </div>

      {/* Delete buttons appear on hover (desktop) */}
      <style>{`
        @media (hover: hover) {
          .moxy-msg .moxy-msg-delete { opacity: 0; transition: opacity 0.15s; }
          .moxy-msg:hover .moxy-msg-delete { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
