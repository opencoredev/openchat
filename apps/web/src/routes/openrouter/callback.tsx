/**
 * OpenRouter OAuth Callback Route
 *
 * Handles the OAuth callback from OpenRouter after user authorization.
 * Exchanges the authorization code for an API key and stores it.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useEffectOnDeps, useMountEffect } from "@/hooks/use-mount-effect";
import { useOpenRouterKey } from "../../stores/openrouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute("/openrouter/callback")({
  head: () => ({
    meta: [
      { title: "Connecting OpenRouter - osschat" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OpenRouterCallbackPage,
});

// ============================================================================
// Component
// ============================================================================

type CallbackStatus = "processing" | "success" | "error";

function OpenRouterCallbackPage() {
  const navigate = useNavigate();
  const { handleCallback } = useOpenRouterKey();

  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const processedRef = useRef(false);

  // Prevent hydration mismatch by only running client-side logic after mount
  useMountEffect(() => {
    setMounted(true);
  });

  // Handle the OAuth callback (with guard against double-execution from Strict Mode)
  useEffectOnDeps(() => {
    if (!mounted || processedRef.current) return;
    processedRef.current = true;

    async function processCallback() {
      // Parse URL parameters
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");

      // Check for error from OpenRouter
      if (errorParam) {
        setError(decodeURIComponent(errorParam));
        setStatus("error");
        return;
      }

      // Validate required parameters
      if (!code) {
        setError("Missing authorization code. Please try again.");
        setStatus("error");
        return;
      }

      try {
        // Exchange code for API key
        const success = await handleCallback(code, state);

        if (success) {
          setStatus("success");
          // Redirect to home after a brief delay to show success message
          setTimeout(() => {
            navigate({ to: "/" });
          }, 1500);
        } else {
          setStatus("error");
          setError("Failed to complete authentication. Please try again.");
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed.");
      }
    }

    processCallback();
  }, [mounted, handleCallback, navigate]);

  // Show loading state during SSR and initial mount
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>OpenRouter</CardTitle>
            <CardDescription>Processing authentication...</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <LoadingSpinner />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Processing state
  if (status === "processing") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Connecting to OpenRouter</CardTitle>
            <CardDescription>Please wait while we complete your authentication...</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <LoadingSpinner />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (status === "success") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-green-600 dark:text-green-400">
              Connected Successfully
            </CardTitle>
            <CardDescription>
              Your OpenRouter account has been connected. Redirecting...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <SuccessIcon />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  const displayError = error || "An unexpected error occurred.";

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-destructive">Connection Failed</CardTitle>
          <CardDescription>{displayError}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <ErrorIcon />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Go Home
            </Button>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function LoadingSpinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg
      className="h-12 w-12 text-green-600 dark:text-green-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="h-12 w-12 text-destructive"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}
