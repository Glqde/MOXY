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
  const { setUser, setToken, setInitialized, clear } = useAuthStore();

  useEffect(() => {
    // Fires INITIAL_SESSION on subscribe, then SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT
    let loadedUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        loadedUserId = null;
        clear();
        setInitialized();
        return;
      }

      setToken(session.access_token);
      if (session.user.id === loadedUserId) return; // token refresh — profile unchanged
      loadedUserId = session.user.id;

      // Deferred: awaiting Supabase calls inside this callback can deadlock it
      setTimeout(async () => {
        try {
          setUser(await userApi.me());
        } catch {
          loadedUserId = null;
        } finally {
          setInitialized();
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);
}
