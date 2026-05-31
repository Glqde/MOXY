// src/pages/AuthCallbackPage.tsx
// Handles the OAuth redirect from Supabase after Google sign-in.
// Supabase automatically exchanges the code in the URL hash.
// We just wait briefly then redirect to the app.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Give Supabase JS a moment to process the auth code from the URL
    const timer = setTimeout(() => navigate("/", { replace: true }), 1200);
    return () => clearTimeout(timer);
  }, []);

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
