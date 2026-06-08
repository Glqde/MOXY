// src/hooks/useAuth.ts
// Wraps Supabase auth — handles session, Google OAuth, and syncs to Zustand.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store";
import { userApi } from "@/api/services";

export function useAuth() {
  const { user, token, setUser, setToken, clear } = useAuthStore();

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
  await supabase.auth.signOut();
  clear();
  window.location.href = "/"; // force full reload to login page
  };

  return { user, token, isAuthenticated: !!user, signInWithGoogle, signOut };
}

/**
 * Top-level hook — must be mounted once at the app root.
 * Subscribes to Supabase auth state changes and keeps the store in sync.
 */
export function useAuthInitializer() {
  const { setUser, setToken, clear } = useAuthStore();

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setToken(data.session.access_token);
        try {
          const me = await userApi.me();
          setUser(me);
        } catch {
          // Token might be expired — listener below will handle refresh
        }
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (session) {
            setToken(session.access_token);
            const me = await userApi.me();
            setUser(me);
          }
        } else if (event === "SIGNED_OUT") {
          clear();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);
}
