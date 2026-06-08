// src/components/layout/AppShell.tsx
import { useGroups } from "@/hooks/useQueries";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore, useUIStore } from "@/store";
import { useColors } from "@/lib/theme";
import { Sidebar } from "./Sidebar";
import { DashboardPage } from "@/pages/DashboardPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { NotifPanel } from "@/components/notifications/NotifPanel";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateGroupModal } from "@/components/modals/CreateGroupModal";
import { InviteMembersModal } from "@/components/modals/InviteMembersModal";

export function AppShell() {
  const token = useAuthStore((s) => s.token);
  const {
    activePage, activeGroupId,
    showNotifPanel, showCreateTask, showCreateGroup, showInviteMembers,
    toggleInviteMembers,
  } = useUIStore();

  const C = useColors();

  const { data: groups = [] } = useGroups();
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const groupIds = groups.map((g) => g.id);

  const { isConnected } = useSocket({
    groupIds,
    enabled: !!token && groupIds.length > 0,
  });

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
        {activePage === "analytics" && <AnalyticsPage />}
        {activePage === "activity"  && <ActivityPage />}
        {activePage === "settings"  && <SettingsPage />}
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