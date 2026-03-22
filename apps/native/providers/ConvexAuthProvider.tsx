import React, { useCallback, useMemo } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { convexClient } from "../lib/convex";
import { useAuthStore } from "../stores/auth";
import { fetchConvexToken } from "../lib/auth";

/**
 * Bridges our local auth store with ConvexProviderWithAuth.
 *
 * ConvexProviderWithAuth calls `fetchAccessToken` whenever it needs a fresh JWT
 * to authenticate Convex queries/mutations/subscriptions.  We retrieve the
 * stored Better Auth session token, exchange it for a Convex JWT, and return it.
 */
function useConvexAuth() {
  const { sessionToken, isAuthenticated } = useAuthStore();

  const fetchAccessToken = useCallback(async () => {
    if (!isAuthenticated || !sessionToken) return null;
    return fetchConvexToken(sessionToken);
  }, [isAuthenticated, sessionToken]);

  return useMemo(
    () => ({ isLoading: false, isAuthenticated, fetchAccessToken }),
    [isAuthenticated, fetchAccessToken]
  );
}

export function ConvexAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
