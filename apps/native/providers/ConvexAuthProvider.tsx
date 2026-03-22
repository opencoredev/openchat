import React, { useCallback, useMemo } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { convexClient } from "../lib/convex";
import { useAuthStore } from "../stores/auth";
import { fetchConvexToken } from "../lib/auth";

function useConvexAuth() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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
