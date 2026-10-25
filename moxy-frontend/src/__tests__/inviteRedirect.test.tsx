// src/__tests__/inviteRedirect.test.tsx
// A new user opening an invite link signs in through Google and must come
// back to /join/<code> — not get dropped on the home page.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));
vi.mock("@/lib/socket", () => ({
  getSocket: () => ({ on() {}, off() {}, emit() {}, connected: false }),
  disconnectSocket() {},
}));
const { joinByInvite } = vi.hoisted(() => ({
  joinByInvite: vi.fn(() => new Promise(() => {})), // stays "Joining…"
}));
vi.mock("@/api/services", async (orig) => ({
  ...(await orig<typeof import("@/api/services")>()),
  groupApi: { joinByInvite, list: async () => [] },
}));

import App from "@/App";
import { useAuthStore } from "@/store";

const user = {
  id: "u1", full_name: "New Person", email: "new@example.com", avatar_url: null,
  username: null, is_active: true, last_seen_at: null, created_at: "2026-01-01T00:00:00Z",
};

describe("invite link after sign-in", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useAuthStore.setState({ user: null, token: null, initialized: false });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
  });

  it("returns to the invite link instead of the home page", async () => {
    // JoinPage stored this before sending the logged-out visitor to /login
    sessionStorage.setItem("moxy_post_login_redirect", "/join/abc123");
    window.history.replaceState(null, "", "/auth/callback");

    await act(async () => root.render(<App />));
    // Supabase finished the code exchange and /me loaded
    await act(async () => useAuthStore.setState({ user, token: "t", initialized: true }));

    expect(window.location.pathname).toBe("/join/abc123");
    expect(joinByInvite).toHaveBeenCalledWith("abc123");
  });

  it("goes home after a normal sign-in", async () => {
    window.history.replaceState(null, "", "/auth/callback");
    await act(async () => root.render(<App />));
    await act(async () => useAuthStore.setState({ user, token: "t", initialized: true }));
    expect(window.location.pathname).toBe("/");
  });
});
