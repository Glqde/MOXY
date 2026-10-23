// src/__tests__/notifications.test.ts
// Sound + desktop notification gating.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUIStore } from "@/store";

// Minimal Web Audio fake: counts oscillators started
let started = 0;
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator() {
    return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n, start: () => { started++; }, stop: () => {} };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: (n: unknown) => n,
    };
  }
}

describe("playSound", () => {
  beforeEach(() => {
    started = 0;
    vi.resetModules();
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  it("plays a three-note chime for completions and two notes for undos", async () => {
    (await import("@/store")).useUIStore.setState({ soundEnabled: true });
    const { playSound } = await import("@/lib/sounds");
    playSound("complete");
    expect(started).toBe(3);
    playSound("undo");
    expect(started).toBe(5);
  });

  it("has distinct sounds for creating and deleting", async () => {
    (await import("@/store")).useUIStore.setState({ soundEnabled: true });
    const { playSound } = await import("@/lib/sounds");
    playSound("create");
    playSound("delete");
    expect(started).toBe(4);
  });

  it("stays silent when sound alerts are off", async () => {
    (await import("@/store")).useUIStore.setState({ soundEnabled: false });
    const { playSound } = await import("@/lib/sounds");
    playSound("complete");
    expect(started).toBe(0);
  });
});

describe("notifyDesktop", () => {
  const shown: string[] = [];
  class FakeNotification {
    static permission = "granted";
    onclick: (() => void) | null = null;
    constructor(title: string) { shown.push(title); }
    close() {}
  }

  // Same module instances the code under test sees (the sound tests reset the cache)
  let store: typeof useUIStore;
  beforeEach(async () => {
    shown.length = 0;
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    store = (await import("@/store")).useUIStore;
    store.setState({ desktopNotifications: true });
  });

  const setVisibility = (v: "visible" | "hidden") =>
    Object.defineProperty(document, "visibilityState", { value: v, configurable: true });

  it("shows a notification when the tab is in the background", async () => {
    setVisibility("hidden");
    const { notifyDesktop } = await import("@/lib/desktopNotify");
    notifyDesktop("Asha completed Dishes", "MOXY");
    expect(shown).toEqual(["Asha completed Dishes"]);
  });

  it("skips it while the tab is visible — the in-app popup covers that", async () => {
    setVisibility("visible");
    const { notifyDesktop } = await import("@/lib/desktopNotify");
    notifyDesktop("Asha completed Dishes", "MOXY");
    expect(shown).toEqual([]);
  });

  it("skips it when the setting is off or permission isn't granted", async () => {
    setVisibility("hidden");
    const { notifyDesktop } = await import("@/lib/desktopNotify");
    store.setState({ desktopNotifications: false });
    notifyDesktop("a", "b");
    store.setState({ desktopNotifications: true });
    FakeNotification.permission = "denied";
    notifyDesktop("c", "d");
    FakeNotification.permission = "granted";
    expect(shown).toEqual([]);
  });
});
