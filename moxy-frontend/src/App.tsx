// src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthInitializer } from "@/hooks/useAuth";
import { useAuthStore } from "@/store";
import { LoginPage } from "@/pages/LoginPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { JoinPage } from "@/pages/JoinPage";
import { AppShell } from "@/components/layout/AppShell";
import { ToastContainer } from "@/components/ui/ToastContainer";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
    mutations: { retry: false },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// After login, check if user was trying to reach a deep link (e.g. /join/:code)
function PostLoginRedirect() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!user) return;
    const redirect = sessionStorage.getItem("moxy_post_login_redirect");
    if (redirect) {
      sessionStorage.removeItem("moxy_post_login_redirect");
      navigate(redirect, { replace: true });
    }
  }, [user]);
  return null;
}

function Root() {
  useAuthInitializer();
  return (
    <>
      <PostLoginRedirect />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Root />
        <ToastContainer />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
