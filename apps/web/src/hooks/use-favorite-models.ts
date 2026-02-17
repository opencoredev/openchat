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

export function useFavoriteModels() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const isInitialized = useRef(false);

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

  useEffect(() => {
    if (serverFavorites !== undefined && !isInitialized.current) {
      setFavorites(new Set(serverFavorites ?? []));
      isInitialized.current = true;
    }
  }, [serverFavorites]);

  const toggleFavorite = useCallback(
    (modelId: string) => {
      if (!convexUserId) return;

      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(modelId)) {
          next.delete(modelId);
        } else {
          next.add(modelId);
        }
        return next;
      });

      toggleFavoriteMutation({ userId: convexUserId, modelId });
    },
    [convexUserId, toggleFavoriteMutation],
  );

  const isFavorite = useCallback(
    (modelId: string) => favorites.has(modelId),
    [favorites],
  );

  const addDefaults = useCallback(() => {
    const newFavorites = new Set([...favorites, ...DEFAULT_FAVORITES]);
    setFavorites(newFavorites);
    if (convexUserId) {
      setFavoritesMutation({ userId: convexUserId, modelIds: Array.from(newFavorites) });
    }
  }, [convexUserId, setFavoritesMutation, favorites]);

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
