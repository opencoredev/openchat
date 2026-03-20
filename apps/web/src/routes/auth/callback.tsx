import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useEffectOnDeps } from "@/hooks/use-mount-effect";
import { useAuth } from "../../lib/auth-client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Completing sign in - osschat" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffectOnDeps(() => {
    // Check URL for error params
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(errorParam);
      return;
    }

    // crossDomainClient handles token exchange automatically
    // Wait for session to be established, then redirect
    if (!loading && isAuthenticated) {
      navigate({ to: "/" });
      return;
    }

    // If not authenticated after loading completes, wait a bit and retry
    // (token exchange might take a moment)
    if (!loading && !isAuthenticated && attempts < 10) {
      const timer = setTimeout(() => {
        setAttempts((a) => a + 1);
      }, 500);
      return () => clearTimeout(timer);
    }

    // After 10 attempts (5 seconds), give up
    if (attempts >= 10 && !isAuthenticated) {
      setError("Authentication failed. Please try again.");
    }
  }, [loading, isAuthenticated, navigate, attempts]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => navigate({ to: "/auth/sign-in" })}
            className="text-primary underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-muted-foreground">Completing sign in...</div>
      </div>
    </div>
  );
}
