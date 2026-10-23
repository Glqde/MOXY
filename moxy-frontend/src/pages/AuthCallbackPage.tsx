// src/pages/AuthCallbackPage.tsx
// Handles the OAuth redirect from Supabase after Google sign-in.
// Supabase automatically exchanges the code in the URL hash; we redirect
// once the auth store has the user.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);

  // Leave as soon as Supabase has exchanged the code and /me has loaded
  useEffect(() => {
    if (user) navigate("/", { replace: true });
    else if (initialized) navigate("/login", { replace: true });
  }, [user, initialized]);

  return (
    <div style={{
      height: "100vh", background: "#0A0A0F",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: "'SF Pro Display', -apple-system, sans-serif",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: "linear-gradient(135deg, #7C6FFF, #A855F7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, animation: "pulse 1.2s ease infinite",
      }}>⟁</div>
      <div style={{ color: "rgba(240,240,255,0.5)", fontSize: 14 }}>Signing you in…</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
