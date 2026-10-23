// src/components/layout/AppShell.tsx
import { lazy, Suspense } from "react";
import { useGroups } from "@/hooks/useQueries";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore, useUIStore } from "@/store";
import { useColors } from "@/lib/theme";
import { Sidebar } from "./Sidebar";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotifPanel } from "@/components/notifications/NotifPanel";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateGroupModal } from "@/components/modals/CreateGroupModal";
import { InviteMembersModal } from "@/components/modals/InviteMembersModal";

// Secondary pages load on first visit, keeping them out of the initial bundle
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
const ActivityPage = lazy(() => import("@/pages/ActivityPage").then((m) => ({ default: m.ActivityPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

export function AppShell() {
  const userId = useAuthStore((s) => s.user?.id);
  const {
    activePage, activeGroupId,
    showNotifPanel, showCreateTask, showCreateGroup, showInviteMembers,
    toggleInviteMembers,
  } = useUIStore();

  const C = useColors();

  const { data: groups = [] } = useGroups();
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const groupIds = groups.map((g) => g.id);

  const { isConnected } = useSocket({ groupIds, enabled: !!userId });

  return (
    <div style={{
      display: "flex", height: "100vh", background: C.bgBase,
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: "hidden", position: "relative", color: C.text,
      transition: "background 0.2s, color 0.2s",
    }}>
      {import.meta.env.DEV && (
        <div style={{
          position: "fixed", bottom: 8, right: 12, fontSize: 10, zIndex: 999,
          color: isConnected ? "#22C55E" : "#EF4444", opacity: 0.5,
          pointerEvents: "none",
        }}>
          {isConnected ? "● WS connected" : "○ WS disconnected"}
        </div>
      )}

      <Sidebar groups={groups} />

      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden", background: C.bgBase, transition: "background 0.2s" }}>
        {activePage === "dashboard" && <DashboardPage />}
        <Suspense fallback={null}>
          {activePage === "analytics" && <AnalyticsPage />}
          {activePage === "activity"  && <ActivityPage />}
          {activePage === "settings"  && <SettingsPage />}
        </Suspense>
        {showNotifPanel && <NotifPanel />}
      </div>

      {showCreateTask && activeGroupId && <CreateTaskModal groupId={activeGroupId} />}
      {showCreateGroup && <CreateGroupModal />}
      {showInviteMembers && activeGroup && (
        <InviteMembersModal group={activeGroup} onClose={toggleInviteMembers} />
      )}
    </div>
  );
}