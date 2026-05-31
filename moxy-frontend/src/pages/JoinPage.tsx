// src/pages/JoinPage.tsx
// Handles deep-link invite URLs: /join/:code
// If unauthenticated → redirect to login, then come back here.
// If authenticated → call join API, redirect to dashboard.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { groupApi } from "@/api/services";
import { useAuthStore, useUIStore, useToastStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/hooks/useQueries";

export function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { setActiveGroup, setActivePage } = useUIStore();
  const { addToast } = useToastStore.getState();
  const qc = useQueryClient();

  const [status, setStatus] = useState<"joining" | "success" | "error">("joining");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!user) {
      // Save intended destination, redirect to login
      sessionStorage.setItem("moxy_post_login_redirect", `/join/${code}`);
      navigate("/login", { replace: true });
      return;
    }

    if (!code) {
      navigate("/", { replace: true });
      return;
    }

    const join = async () => {
      try {
        const group = await groupApi.joinByInvite(code);
        await qc.invalidateQueries({ queryKey: QK.groups });
        setActiveGroup(group.id);
        setActivePage("dashboard");
        addToast({ emoji: group.icon, title: `Joined ${group.name}!`, sub: "Welcome to the group" });
        setStatus("success");
        setTimeout(() => navigate("/", { replace: true }), 800);
      } catch (e: unknown) {
        const msg = (e as { message?: string }).message ?? "Invalid or expired invite link";
        setErrorMsg(msg);
        setStatus("error");
      }
    };

    join();
  }, [user, code]);

  const styles = {
    page: {
      height: "100vh", background: "#0A0A0F",
      display: "flex", flexDirection: "column" as const,
      alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: "'SF Pro Display', -apple-system, sans-serif",
      padding: "0 24px",
    },
    logo: {
      width: 56, height: 56, borderRadius: 16,
      background: "linear-gradient(135deg, #7C6FFF, #A855F7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 28, boxShadow: "0 0 32px rgba(124,111,255,0.4)",
    },
    title: { color: "#F0F0FF", fontSize: 20, fontWeight: 600, textAlign: "center" as const },
    sub:   { color: "rgba(240,240,255,0.45)", fontSize: 14, textAlign: "center" as const },
  };

  return (
    <div style={styles.page}>
      <div style={styles.logo}>⟁</div>

      {status === "joining" && (
        <>
          <div style={styles.title}>Joining group…</div>
          <div style={styles.sub}>Verifying your invite link</div>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "3px solid rgba(124,111,255,0.2)",
            borderTopColor: "#7C6FFF",
            animation: "spin 0.8s linear infinite",
          }} />
        </>
      )}

      {status === "success" && (
        <>
          <div style={{ fontSize: 36 }}>🎉</div>
          <div style={styles.title}>You're in!</div>
          <div style={styles.sub}>Redirecting to your dashboard…</div>
        </>
      )}

      {status === "error" && (
        <>
          <div style={{ fontSize: 36 }}>😕</div>
          <div style={styles.title}>Couldn't join group</div>
          <div style={{ ...styles.sub, maxWidth: 320 }}>{errorMsg}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: "#7C6FFF", color: "#fff",
                fontSize: 14, fontWeight: 500, cursor: "pointer",
              }}
            >Go to Dashboard</button>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
