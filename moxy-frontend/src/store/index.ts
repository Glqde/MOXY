// src/store/index.ts
// Zustand store — only truly global state lives here.
// Server state (tasks, groups, notifications) lives in TanStack Query.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserRead } from "@/types";

// ─── Auth store ───────────────────────────────────────────────────────────────

interface AuthState {
  user: UserRead | null;
  token: string | null;
  initialized: boolean; // false until the stored session has been checked
  setUser: (user: UserRead | null) => void;
  setToken: (token: string | null) => void;
  setInitialized: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      initialized: false,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setInitialized: () => set({ initialized: true }),
      clear: () => set({ user: null, token: null }),
    }),
    {
      name: "moxy-auth",
      storage: createJSONStorage(() => sessionStorage), // clears on tab close
      partialize: (s) => ({ token: s.token }),         // don't persist user object
    }
  )
);

// ─── UI store ─────────────────────────────────────────────────────────────────

interface UIState {
  activeGroupId: string | null;
  activePage: "dashboard" | "analytics" | "activity" | "settings";
  showNotifPanel: boolean;
  showCreateTask: boolean;
  showCreateGroup: boolean;
  showInviteMembers: boolean;
  showMobileNav: boolean; // slide-out sidebar on phones
  groupTab: "tasks" | "chat";
  theme: "dark" | "light";
  soundEnabled: boolean;
  desktopNotifications: boolean;

  setActiveGroup: (id: string | null) => void;
  setActivePage: (page: UIState["activePage"]) => void;
  toggleNotifPanel: () => void;
  closeNotifPanel: () => void;
  toggleCreateTask: () => void;
  toggleCreateGroup: () => void;
  toggleInviteMembers: () => void;
  setMobileNav: (open: boolean) => void;
  setGroupTab: (tab: "tasks" | "chat") => void;
  setTheme: (t: "dark" | "light") => void;
  setSoundEnabled: (on: boolean) => void;
  setDesktopNotifications: (on: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeGroupId: null,
      activePage: "dashboard",
      showNotifPanel: false,
      showCreateTask: false,
      showCreateGroup: false,
      showInviteMembers: false,
      showMobileNav: false,
      groupTab: "tasks",
      theme: "dark",
      soundEnabled: true,
      desktopNotifications: false, // needs browser permission first

      // Navigating also closes the phone slide-out menu
      setActiveGroup: (id) => set({ activeGroupId: id, activePage: "dashboard", showMobileNav: false, groupTab: "tasks" }),
      setActivePage: (page) => set({ activePage: page, showMobileNav: false }),
      toggleNotifPanel: () => set((s) => ({ showNotifPanel: !s.showNotifPanel })),
      closeNotifPanel: () => set({ showNotifPanel: false }),
      toggleCreateTask: () => set((s) => ({ showCreateTask: !s.showCreateTask })),
      toggleCreateGroup: () => set((s) => ({ showCreateGroup: !s.showCreateGroup })),
      toggleInviteMembers: () => set((s) => ({ showInviteMembers: !s.showInviteMembers })),
      setMobileNav: (showMobileNav) => set({ showMobileNav }),
      setGroupTab: (groupTab) => set({ groupTab }),
      setTheme: (theme) => set({ theme }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setDesktopNotifications: (desktopNotifications) => set({ desktopNotifications }),
    }),
    {
      name: "moxy-ui",
      partialize: (s) => ({
        activeGroupId: s.activeGroupId,
        theme: s.theme,
        soundEnabled: s.soundEnabled,
        desktopNotifications: s.desktopNotifications,
      }),
    }
  )
);

// ─── Presence store ───────────────────────────────────────────────────────────
// Tracks which users are online: seeded from the members API, then kept
// current by WebSocket presence events.

interface PresenceState {
  onlineUsers: Set<string>;
  setOnline: (userId: string) => void;
  setOffline: (userId: string) => void;
  setMany: (statuses: Record<string, boolean>) => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  onlineUsers: new Set(),
  setOnline: (userId) =>
    set((s) => ({ onlineUsers: new Set([...s.onlineUsers, userId]) })),
  setOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),
  setMany: (statuses) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      for (const [userId, online] of Object.entries(statuses)) {
        if (online) next.add(userId);
        else next.delete(userId);
      }
      return { onlineUsers: next };
    }),
  isOnline: (userId) => get().onlineUsers.has(userId),
}));

// ─── Typing store ────────────────────────────────────────────────────────────
// Who's typing in each group's chat; entries expire a few seconds after the
// last "typing" signal.

interface TypingState {
  typing: Record<string, Record<string, { name: string; until: number }>>; // group → user → info
  setTyping: (groupId: string, userId: string, name: string) => void;
  clearTyping: (groupId: string, userId: string) => void;
}

export const useTypingStore = create<TypingState>()((set) => ({
  typing: {},
  setTyping: (groupId, userId, name) =>
    set((s) => ({
      typing: { ...s.typing, [groupId]: { ...s.typing[groupId], [userId]: { name, until: Date.now() + 4000 } } },
    })),
  clearTyping: (groupId, userId) =>
    set((s) => {
      const group = { ...s.typing[groupId] };
      delete group[userId];
      return { typing: { ...s.typing, [groupId]: group } };
    }),
}));

// ─── Toast store ─────────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  emoji?: string;
  title: string;
  sub?: string;
  type?: "success" | "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (t) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 3500);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
