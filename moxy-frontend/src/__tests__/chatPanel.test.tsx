// src/__tests__/chatPanel.test.tsx
// Rendering and sending in a group's chat.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { api, emit } = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    send: vi.fn(),
    remove: vi.fn(async () => ({})),
    markRead: vi.fn(async () => ({})),
  },
  emit: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));
vi.mock("@/lib/socket", () => ({ getSocket: () => ({ emit }) }));
vi.mock("@/api/services", async (orig) => ({
  ...(await orig<typeof import("@/api/services")>()),
  chatApi: api,
}));

import { ChatPanel } from "@/components/chat/ChatPanel";
import { useTypingStore } from "@/store";

const me = { id: "me", full_name: "Manit Manoj", avatar_url: null, username: null };
const asha = { id: "asha", full_name: "Asha Rao", avatar_url: null, username: null };
const msg = (id: string, user: typeof me, body: string, kind: "text" | "system" = "text", min = 0) => ({
  id, group_id: "g1", kind, body, user, created_at: new Date(Date.UTC(2026, 9, 25, 10, min)).toISOString(),
});

describe("ChatPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (iAmAdmin = false) => {
    await act(async () => root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatPanel groupId="g1" groupColor="#7C6FFF" myId="me" iAmAdmin={iAmAdmin} />
      </QueryClientProvider>
    ));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  };
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const deleteButtons = () => document.querySelectorAll('[aria-label="Delete message"]').length;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    api.list.mockResolvedValue([
      msg("1", asha, "hi team", "text", 0),
      msg("2", asha, "anyone free?", "text", 1),
      msg("3", me, "completed 🍽️ Dishes", "system", 2),
      msg("4", me, "on it", "text", 3),
    ]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useTypingStore.setState({ typing: {} });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows messages, task lines, and marks the chat read", async () => {
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("hi team");
    expect(text).toContain("Manit completed 🍽️ Dishes");
    expect(text).toContain("You ·"); // own message header
    expect(text.match(/Asha Rao ·/g)?.length).toBe(1); // consecutive messages share one header
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(api.markRead).toHaveBeenCalledWith("g1");
  });

  it("members can delete only their own messages; admins can delete any", async () => {
    await render(false);
    expect(deleteButtons()).toBe(1);
    act(() => root.unmount());
    root = createRoot(container);
    await render(true);
    expect(deleteButtons()).toBe(3); // every text message, never task lines
  });

  it("Enter sends the trimmed draft, then clears it", async () => {
    api.send.mockResolvedValue(msg("5", me, "see you", "text", 4));
    await render();
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(box, "  see you  ");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(emit).toHaveBeenCalledWith("typing", { group_id: "g1" });
    await act(async () => {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(api.send).toHaveBeenCalledWith("g1", "see you");
    expect(container.textContent).toContain("see you");
    expect(box.value).toBe("");
  });

  it("a second message typed while the first is sending isn't lost", async () => {
    let finishFirst!: (m: unknown) => void;
    api.send
      .mockImplementationOnce(() => new Promise((r) => { finishFirst = r; }))
      .mockResolvedValueOnce(msg("6", me, "two", "text", 5));
    await render();
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    const typeAndEnter = async (text: string) => {
      await act(async () => {
        setter.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
    };
    await typeAndEnter("one");
    await typeAndEnter("two"); // first send still in flight
    await flush();
    expect(api.send).toHaveBeenCalledTimes(1); // queued behind the first, in order
    await act(async () => { finishFirst(msg("5", me, "one", "text", 4)); });
    await flush();
    expect(api.send.mock.calls.map((c) => c[1])).toEqual(["one", "two"]);
    expect(container.textContent).toMatch(/one[\s\S]*two/);
    expect(box.value).toBe("");
  });

  it("shows who is typing (but not yourself)", async () => {
    await render();
    await act(async () => {
      useTypingStore.getState().setTyping("g1", "asha", "Asha Rao");
      useTypingStore.getState().setTyping("g1", "me", "Manit Manoj");
    });
    expect(container.textContent).toContain("Asha is typing…");
    expect(container.textContent).not.toContain("Manit is typing");
  });
});
