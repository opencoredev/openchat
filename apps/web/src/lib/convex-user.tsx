import { createContext, useContext, useMemo } from "react";
import { useQuery } from "convex/react";
import type { Id } from "@server/convex/_generated/dataModel";
import { api } from "@server/convex/_generated/api";
import { useAuth } from "./auth-client";

export interface ConvexUserRecord {
  _id: Id<"users">;
  externalId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  hasOpenRouterKey: boolean;
  fileUploadCount: number;
  aiUsageCents?: number;
  aiUsageDate?: string;
  hasProfile: boolean;
}

interface ConvexUserContextValue {
  convexUser: ConvexUserRecord | null | undefined;
  convexUserId: Id<"users"> | undefined;
  isLoading: boolean;
}

const ConvexUserContext = createContext<ConvexUserContextValue>({
  convexUser: undefined,
  convexUserId: undefined,
  isLoading: true,
});

export function ConvexUserProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const convexUser = useQuery(
    api.users.getByExternalId,
    user?.id && isAuthenticated ? { externalId: user.id } : "skip",
  ) as ConvexUserRecord | null | undefined;

  const value = useMemo<ConvexUserContextValue>(
    () => ({
      convexUser,
      convexUserId: convexUser?._id,
      isLoading: !!(user?.id && isAuthenticated && convexUser === undefined),
    }),
    [convexUser, isAuthenticated, user?.id],
  );

  return <ConvexUserContext.Provider value={value}>{children}</ConvexUserContext.Provider>;
}

export function useConvexUser() {
  return useContext(ConvexUserContext);
}
