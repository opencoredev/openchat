import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { useAuthStore } from "../stores/auth";

/**
 * Resolves the Convex user ID for the currently authenticated Better Auth user.
 *
 * Flow:
 *   1. Read the Better Auth session from the auth store.
 *   2. Call api.users.getByExternalId — this is a real-time subscription so it
 *      stays fresh automatically.
 *   3. If the user doesn't exist yet in Convex, call api.users.ensure to create
 *      (or update) their record.
 *
 * Returns the Convex user ID once resolved, or null while loading / unauthenticated.
 */
export function useConvexUser(): {
  convexUserId: Id<"users"> | null;
  convexUser: { _id: Id<"users">; name?: string; email?: string; avatarUrl?: string; hasOpenRouterKey: boolean } | null;
  isLoading: boolean;
} {
  const { sessionData, isAuthenticated } = useAuthStore();
  const ensureUser = useMutation(api.users.ensure);
  const syncedRef = useRef<string | null>(null);

  const convexUser = useQuery(
    api.users.getByExternalId,
    isAuthenticated && sessionData?.userId
      ? { externalId: sessionData.userId }
      : "skip"
  );

  // Sync user to Convex on first auth
  useEffect(() => {
    if (!isAuthenticated || !sessionData?.userId) {
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === sessionData.userId) return;
    syncedRef.current = sessionData.userId;

    ensureUser({
      externalId: sessionData.userId,
      email: sessionData.email,
      name: sessionData.name,
      avatarUrl: sessionData.image ?? undefined,
    }).catch((err: unknown) => {
      console.error("[useConvexUser] ensure failed:", err);
      syncedRef.current = null;
    });
  }, [isAuthenticated, sessionData?.userId, sessionData?.email, sessionData?.name, sessionData?.image, ensureUser]);

  return {
    convexUserId: convexUser?._id ?? null,
    convexUser: convexUser
      ? {
          _id: convexUser._id,
          name: convexUser.name,
          email: convexUser.email,
          avatarUrl: convexUser.avatarUrl,
          hasOpenRouterKey: convexUser.hasOpenRouterKey,
        }
      : null,
    isLoading: convexUser === undefined,
  };
}
