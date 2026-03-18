import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProviderWithAuth, useMutation, useQuery } from "convex/react";
import { Toaster } from "sonner";
import { api } from "@server/convex/_generated/api";
import { convexClient } from "../lib/convex";
import { StableAuthProvider, authClient, useAuth, type InitialAuthUser } from "../lib/auth-client";
import { prefetchModels } from "../stores/model";
import { useProviderStore } from "../stores/provider";
import { useOpenRouterStore } from "../stores/openrouter";
import { ThemeProvider } from "./theme-provider";
import { PostHogProvider } from "./posthog";

if (typeof window !== "undefined") {
  const schedulePrefetch = () => {
    const connection = (navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }).connection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && /2g/.test(connection.effectiveType)) return;

    const run = () => prefetchModels();
    const requestIdle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;

    if (typeof requestIdle === "function") {
      requestIdle(run, { timeout: 2000 });
    } else {
      setTimeout(run, 1500);
    }
  };

  if (document.readyState === "complete") {
    schedulePrefetch();
  } else {
    window.addEventListener("load", schedulePrefetch, { once: true });
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: InitialAuthUser;
}

function useStableConvexAuth() {
  const { isAuthenticated, loading } = useAuth();

  const fetchAccessToken = useCallback(async () => {
    if (!isAuthenticated) return null;
    try {
      const result = await authClient.convex.token();
      return result.data?.token || null;
    } catch {
      return null;
    }
  }, [isAuthenticated]);

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken]
  );
}

/**
 * Component that syncs Better Auth users to Convex users table.
 * This is CRITICAL - without this, convexUserId will be undefined
 * and message sending will silently fail.
 */
function UserSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const ensureUser = useMutation(api.users.ensure);
  const syncedUserIdRef = useRef<string | null>(null);
  const syncingUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      syncedUserIdRef.current = null;
      syncingUserIdRef.current = null;
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const userId = user?.id;

    // Only sync once when user is authenticated and we have user data
    if (
      loading ||
      !isAuthenticated ||
      !userId ||
      syncedUserIdRef.current === userId ||
      syncingUserIdRef.current === userId
    ) {
      return;
    }

    syncingUserIdRef.current = userId;

    // Sync Better Auth user to Convex users table
    ensureUser({
      externalId: userId,
      email: user.email,
      name: user.name,
      avatarUrl: user.image ?? undefined,
    })
      .then(() => {
        syncedUserIdRef.current = userId;
        if (syncingUserIdRef.current === userId) {
          syncingUserIdRef.current = null;
        }
      })
      .catch((error) => {
        console.error("[UserSync] Failed to sync user to Convex:", error);
        // Reset so we can retry on next render
        if (syncingUserIdRef.current === userId) {
          syncingUserIdRef.current = null;
        }
      });
  }, [loading, isAuthenticated, user?.id, user?.email, user?.name, user?.image, ensureUser]);

  return <>{children}</>;
}

function UsageSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const syncUsage = useProviderStore((s) => s.syncUsage);
  const resetDailyUsage = useProviderStore((s) => s.resetDailyUsage);
  const convexUser = useQuery(
    api.users.getByExternalId,
    !loading && isAuthenticated && user?.id ? { externalId: user.id } : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      resetDailyUsage();
      return;
    }
    if (!convexUser) return;
    const today = new Date().toISOString().split("T")[0];
    const serverDate = convexUser.aiUsageDate ?? today;
    const serverUsage =
      serverDate === today ? (convexUser.aiUsageCents ?? 0) : 0;
    syncUsage(serverUsage, today);
  }, [
    convexUser,
    isAuthenticated,
    resetDailyUsage,
    syncUsage,
    user?.id,
  ]);

  return <>{children}</>;
}

/**
 * Component that checks OpenRouter API key status from the server.
 * This syncs the hasApiKey state without exposing the actual key to the client.
 */
function OpenRouterKeyStatusProvider({ children }: { children: React.ReactNode }) {
	const { user, isAuthenticated, loading } = useAuth();
	const initialize = useOpenRouterStore((s) => s.initialize);
	const checkedUserIdRef = useRef<string | null>(null);
	const checkingUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      checkedUserIdRef.current = null;
      checkingUserIdRef.current = null;
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const userId = user?.id;

    // Only check once when user is authenticated
    if (
      loading ||
      !isAuthenticated ||
      !userId ||
      checkedUserIdRef.current === userId ||
      checkingUserIdRef.current === userId
    ) {
      return;
    }

    checkingUserIdRef.current = userId;
    
		initialize()
			.then(() => {
				checkedUserIdRef.current = userId;
        if (checkingUserIdRef.current === userId) {
          checkingUserIdRef.current = null;
        }
			})
      .catch((error: unknown) => {
        console.error("[OpenRouterKeyStatus] Failed to check API key status:", error);
        // Reset so we can retry on next render
        if (checkingUserIdRef.current === userId) {
          checkingUserIdRef.current = null;
        }
      });
	}, [loading, isAuthenticated, user?.id, initialize]);

  return <>{children}</>;
}

function ConvexAuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convexClient!} useAuth={useStableConvexAuth}>
      <UserSyncProvider>
        <UsageSyncProvider>
          <OpenRouterKeyStatusProvider>{children}</OpenRouterKeyStatusProvider>
        </UsageSyncProvider>
      </UserSyncProvider>
    </ConvexProviderWithAuth>
  );
}

export function Providers({ children, initialUser }: ProvidersProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const content = (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="bottom-right" theme="system" />
      </QueryClientProvider>
    </ThemeProvider>
  );

  if (!isClient || !convexClient) {
    return <PostHogProvider>{content}</PostHogProvider>;
  }

  return (
    <PostHogProvider>
      <StableAuthProvider initialUser={initialUser}>
        <ConvexAuthWrapper>{content}</ConvexAuthWrapper>
      </StableAuthProvider>
    </PostHogProvider>
  );
}
