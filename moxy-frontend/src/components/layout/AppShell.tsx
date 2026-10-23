// src/components/layout/AppShell.tsx
import { lazy, Suspense, useEffect } from "react";
import { useGroups, useUnreadCount } from "@/hooks/useQueries";
import { useSocket } from "@/hooks/useSocket";
import { useIsMobile } from "@/hooks/useIsMobile";
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
    toggleInviteMembers, showMobileNav, setMobileNav, toggleNotifPanel,
  } = useUIStore();

  const C = useColors();
  const isMobile = useIsMobile();
  const { data: unreadCount = 0 } = useUnreadCount();

  // Close the slide-out menu once the user picks something from it
  useEffect(() => {
    setMobileNav(false);
  }, [activeGroupId, activePage, showCreateGroup, isMobile]);

  const { data: groups = [] } = useGroups();
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const groupIds = groups.map((g) => g.id);

  const { isConnected } = useSocket({ groupIds, enabled: !!userId });

  const pageTitle =
    activePage === "dashboard"
      ? (activeGroup ? `${activeGroup.icon} ${activeGroup.name}` : "MOXY")
      : activePage[0].toUpperCase() + activePage.slice(1);

  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      // dvh: on phones 100vh includes the area under the browser toolbar
      height: "100dvh", background: C.bgBase,
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

      {isMobile ? (
        <>
          {/* Top bar replaces the sidebar on phones */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            height: 52, padding: "0 8px 0 4px",
            background: C.bgCard, borderBottom: `1px solid ${C.border}`,
          }}>
            <button
              aria-label="Open menu"
              onClick={() => setMobileNav(true)}
              style={{
                width: 44, height: 44, background: "none", border: "none",
                color: C.text, fontSize: 22, cursor: "pointer",
              }}
            >☰</button>
            <div style={{
              flex: 1, minWidth: 0, color: C.text, fontSize: 16, fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{pageTitle}</div>
            <button
              aria-label="Notifications"
              onClick={toggleNotifPanel}
              style={{
                position: "relative", width: 44, height: 44, background: "none",
                border: "none", fontSize: 18, cursor: "pointer",
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 4,
                  background: C.red, color: "#fff", fontSize: 10, fontWeight: 600,
                  borderRadius: 10, padding: "1px 5px",
                }}>{unreadCount}</span>
              )}
            </button>
          </div>

          {/* Slide-out sidebar */}
          <div
            onClick={() => setMobileNav(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 900,
              background: "rgba(0,0,0,0.55)",
              opacity: showMobileNav ? 1 : 0,
              pointerEvents: showMobileNav ? "auto" : "none",
              transition: "opacity 0.2s",
            }}
          />
          <div style={{
            position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 901,
            transform: showMobileNav ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.22s ease",
            boxShadow: showMobileNav ? "8px 0 32px rgba(0,0,0,0.5)" : "none",
          }}>
            <Sidebar groups={groups} width={280} />
          </div>
        </>
      ) : (
        <Sidebar groups={groups} />
      )}

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