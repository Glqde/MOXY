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
  setUser: (user: UserRead | null) => void;
  setToken: (token: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
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
  theme: "dark" | "light";

  setActiveGroup: (id: string | null) => void;
  setActivePage: (page: UIState["activePage"]) => void;
  toggleNotifPanel: () => void;
  closeNotifPanel: () => void;
  toggleCreateTask: () => void;
  toggleCreateGroup: () => void;
  toggleInviteMembers: () => void;
  setTheme: (t: "dark" | "light") => void;
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
      theme: "dark",

      setActiveGroup: (id) => set({ activeGroupId: id, activePage: "dashboard" }),
      setActivePage: (page) => set({ activePage: page }),
      toggleNotifPanel: () => set((s) => ({ showNotifPanel: !s.showNotifPanel })),
      closeNotifPanel: () => set({ showNotifPanel: false }),
      toggleCreateTask: () => set((s) => ({ showCreateTask: !s.showCreateTask })),
      toggleCreateGroup: () => set((s) => ({ showCreateGroup: !s.showCreateGroup })),
      toggleInviteMembers: () => set((s) => ({ showInviteMembers: !s.showInviteMembers })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "moxy-ui",
      partialize: (s) => ({ activeGroupId: s.activeGroupId, theme: s.theme }),
    }
  )
);

// ─── Presence store ───────────────────────────────────────────────────────────
// Tracks which users are online, populated by WebSocket presence events.

interface PresenceState {
  onlineUsers: Set<string>;
  setOnline: (userId: string) => void;
  setOffline: (userId: string) => void;
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
  isOnline: (userId) => get().onlineUsers.has(userId),
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
