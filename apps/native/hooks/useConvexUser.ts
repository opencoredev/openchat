import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { useAuthStore } from "../stores/auth";

export function useConvexUser(): {
  convexUserId: Id<"users"> | null;
  convexUser: {
    _id: Id<"users">;
    name?: string;
    email?: string;
    avatarUrl?: string;
    hasOpenRouterKey: boolean;
  } | null;
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
  }, [
    isAuthenticated,
    sessionData?.userId,
    sessionData?.email,
    sessionData?.name,
    sessionData?.image,
    ensureUser,
  ]);

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
