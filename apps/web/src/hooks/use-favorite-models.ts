import { useMutation, useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-client";

const DEFAULT_FAVORITES = [
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.2",
  "openai/gpt-5.2-mini",
  "openai/gpt-5.2-nano",
  "google/gemini-3-flash",
  "google/gemini-3-pro",
  "x-ai/grok-4.1-fast",
];

function serializeFavorites(favorites: Iterable<string>) {
  return JSON.stringify(Array.from(favorites).sort());
}

export function useFavoriteModels() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const isInitialized = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const lastServerSnapshotRef = useRef<string | null>(null);
  const lastLocalSnapshotRef = useRef(serializeFavorites([]));
  const hasPendingOptimisticUpdateRef = useRef(false);

  const convexUser = useQuery(
    api.users.getByExternalId,
    user?.id ? { externalId: user.id } : "skip",
  );

  const convexUserId = convexUser?._id;

  const serverFavorites = useQuery(
    api.users.getFavoriteModels,
    convexUserId ? { userId: convexUserId } : "skip",
  );

  const toggleFavoriteMutation = useMutation(api.users.toggleFavoriteModel);
  const setFavoritesMutation = useMutation(api.users.setFavoriteModels);

  const applyFavorites = useCallback((nextFavorites: Set<string>, markOptimistic = false) => {
    lastLocalSnapshotRef.current = serializeFavorites(nextFavorites);
    hasPendingOptimisticUpdateRef.current = markOptimistic;
    setFavorites(new Set(nextFavorites));
  }, []);

  useEffect(() => {
    if (!convexUserId) {
      activeUserIdRef.current = null;
      lastServerSnapshotRef.current = null;
      isInitialized.current = false;
      applyFavorites(new Set());
      return;
    }

    if (serverFavorites === undefined) {
      if (activeUserIdRef.current !== convexUserId) {
        activeUserIdRef.current = convexUserId;
        lastServerSnapshotRef.current = null;
        isInitialized.current = false;
        applyFavorites(new Set());
      }
      return;
    }

    const serverSet = new Set(serverFavorites ?? []);
    const serverSnapshot = serializeFavorites(serverSet);
    const userChanged = activeUserIdRef.current !== convexUserId;
    const serverSnapshotChanged = serverSnapshot !== lastServerSnapshotRef.current;

    if (
      userChanged ||
      !hasPendingOptimisticUpdateRef.current ||
      serverSnapshot === lastLocalSnapshotRef.current ||
      serverSnapshotChanged
    ) {
      applyFavorites(serverSet);
    }

    activeUserIdRef.current = convexUserId;
    lastServerSnapshotRef.current = serverSnapshot;
    isInitialized.current = true;
  }, [convexUserId, serverFavorites, applyFavorites]);

	const toggleFavorite = useCallback(
		(modelId: string) => {
			if (!convexUserId) return;

			const nextFavorites = new Set(favorites);
			if (nextFavorites.has(modelId)) {
				nextFavorites.delete(modelId);
			} else {
				nextFavorites.add(modelId);
			}

			lastLocalSnapshotRef.current = serializeFavorites(nextFavorites);
			hasPendingOptimisticUpdateRef.current = true;
			setFavorites(nextFavorites);

			toggleFavoriteMutation({ userId: convexUserId, modelId });
		},
		[convexUserId, favorites, toggleFavoriteMutation],
	);

  const isFavorite = useCallback(
    (modelId: string) => favorites.has(modelId),
    [favorites],
  );

  const addDefaults = useCallback(() => {
    const newFavorites = new Set([...favorites, ...DEFAULT_FAVORITES]);
    applyFavorites(newFavorites, true);
    if (convexUserId) {
      setFavoritesMutation({ userId: convexUserId, modelIds: Array.from(newFavorites) });
    }
  }, [applyFavorites, convexUserId, setFavoritesMutation, favorites]);

  const missingDefaults = DEFAULT_FAVORITES.filter((id) => !favorites.has(id));
  const missingDefaultsCount = missingDefaults.length;
  const hasMissingDefaults = missingDefaultsCount > 0;

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    addDefaults,
    hasMissingDefaults,
    missingDefaultsCount,
    isLoading: !isInitialized.current && convexUserId !== undefined,
    isAuthenticated: !!convexUserId,
  };
}
