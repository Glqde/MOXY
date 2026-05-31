// src/__tests__/store.test.ts
// Unit tests for Zustand stores — pure logic, no rendering needed.

import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore, usePresenceStore, useToastStore } from "@/store";

// ── UIStore ───────────────────────────────────────────────────────────────────
describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      activeGroupId: null,
      activePage: "dashboard",
      showNotifPanel: false,
      showCreateTask: false,
      showCreateGroup: false,
      theme: "dark",
    });
  });

  it("sets active group and navigates to dashboard", () => {
    const { setActiveGroup } = useUIStore.getState();
    setActiveGroup("group-123");
    const state = useUIStore.getState();
    expect(state.activeGroupId).toBe("group-123");
    expect(state.activePage).toBe("dashboard");
  });

  it("toggles notification panel", () => {
    const { toggleNotifPanel } = useUIStore.getState();
    expect(useUIStore.getState().showNotifPanel).toBe(false);
    toggleNotifPanel();
    expect(useUIStore.getState().showNotifPanel).toBe(true);
    toggleNotifPanel();
    expect(useUIStore.getState().showNotifPanel).toBe(false);
  });

  it("changes page independently of group", () => {
    useUIStore.getState().setActivePage("analytics");
    expect(useUIStore.getState().activePage).toBe("analytics");
    expect(useUIStore.getState().activeGroupId).toBeNull();
  });
});

// ── PresenceStore ─────────────────────────────────────────────────────────────
describe("usePresenceStore", () => {
  beforeEach(() => {
    usePresenceStore.setState({ onlineUsers: new Set() });
  });

  it("marks user online and offline", () => {
    const { setOnline, setOffline, isOnline } = usePresenceStore.getState();
    expect(isOnline("user-1")).toBe(false);
    setOnline("user-1");
    expect(usePresenceStore.getState().isOnline("user-1")).toBe(true);
    setOffline("user-1");
    expect(usePresenceStore.getState().isOnline("user-1")).toBe(false);
  });

  it("tracks multiple users independently", () => {
    const { setOnline, isOnline } = usePresenceStore.getState();
    setOnline("user-1");
    setOnline("user-2");
    expect(usePresenceStore.getState().isOnline("user-1")).toBe(true);
    expect(usePresenceStore.getState().isOnline("user-2")).toBe(true);
    expect(usePresenceStore.getState().isOnline("user-3")).toBe(false);
  });
});

// ── ToastStore ────────────────────────────────────────────────────────────────
describe("useToastStore", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("adds and removes toasts", () => {
    const { addToast, removeToast } = useToastStore.getState();
    addToast({ emoji: "✅", title: "Done!", type: "success" });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("Done!");
    removeToast(toasts[0].id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("assigns unique IDs to each toast", () => {
    const { addToast } = useToastStore.getState();
    addToast({ title: "First" });
    addToast({ title: "Second" });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0].id).not.toBe(toasts[1].id);
  });
});
