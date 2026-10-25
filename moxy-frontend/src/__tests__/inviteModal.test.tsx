// src/__tests__/inviteModal.test.tsx
// Adding people and managing the invite link are admin-only on the server,
// so the Invite window only offers those controls to admins.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { members, searchResults } = vi.hoisted(() => ({
  members: { current: [] as unknown[] },
  searchResults: { current: [] as unknown[] },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));
vi.mock("@/hooks/useQueries", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useQueries")>()),
  useGroupMembers: () => ({ data: members.current, refetch: vi.fn() }),
  useSearchUsers: () => ({ data: searchResults.current, isFetching: false }),
}));

import { InviteMembersModal } from "@/components/modals/InviteMembersModal";
import { useAuthStore } from "@/store";

const me = { id: "me", full_name: "Manit Manoj", avatar_url: null, username: null };
const other = { id: "o1", full_name: "Asha Rao", avatar_url: null, username: "asha" };
const group = {
  id: "g1", name: "Flat", description: null, icon: "🏠", color: "#7C6FFF",
  is_private: false, vacation_mode: false, invite_code: null, member_count: 1, created_at: "",
};

describe("InviteMembersModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (role: "admin" | "member", inviteCode: string | null = null) => {
    members.current = [{ user: me, role, joined_at: "", notification_muted: false, online: true }];
    searchResults.current = [other];
    useAuthStore.setState({ user: { ...me, email: "m@x.com", is_active: true, last_seen_at: null, created_at: "" } });
    await act(async () => root.render(
      <QueryClientProvider client={new QueryClient()}>
        <InviteMembersModal group={{ ...group, invite_code: inviteCode }} onClose={() => {}} />
      </QueryClientProvider>
    ));
    // type a search so results render (debounced 350ms)
    const input = document.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "asha");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  };

  const buttons = () => [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
  const openLinkTab = async () => {
    const tab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Invite link")!;
    await act(async () => tab.click());
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("admins can add people and create a link", async () => {
    await render("admin");
    expect(buttons()).toContain("Add");
    await openLinkTab();
    expect(buttons()).toContain("Generate invite link");
  });

  it("members see results but no Add button, and are told why", async () => {
    await render("member");
    expect(document.body.textContent).toContain("Asha Rao");
    expect(buttons()).not.toContain("Add");
    expect(document.body.textContent).toContain("Only group admins can add people");
    await openLinkTab();
    expect(buttons()).not.toContain("Generate invite link");
    expect(document.body.textContent).toContain("ask an admin");
  });

  it("members can still copy an existing link but not replace it", async () => {
    await render("member", "abc123");
    await openLinkTab();
    expect(buttons()).toContain("📋 Copy link");
    expect(buttons()).not.toContain("↺ New link");
  });
});
