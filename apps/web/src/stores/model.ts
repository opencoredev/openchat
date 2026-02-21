import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { analytics } from "@/lib/analytics";

export type { Model, ModelCapabilities, ReasoningEffort } from "./model-data";
export { getCacheStatus, getModelById, getModelCapabilities, prefetchModels } from "./model-utils";

import type { Model } from "./model-data";
import { CACHE_TTL, cache, fetchAllModels, getFallbackModels, reloadModels, subscribe } from "./model-utils";

type ReasoningEffort = "none" | "low" | "medium" | "high";

interface ModelState {
	selectedModelId: string;
	setSelectedModel: (modelId: string) => void;
	favorites: Set<string>;
	toggleFavorite: (modelId: string) => boolean;
	isFavorite: (modelId: string) => boolean;
	reasoningEnabled: boolean;
	setReasoningEnabled: (enabled: boolean) => void;
	toggleReasoning: () => void;
	reasoningEffort: ReasoningEffort;
	setReasoningEffort: (effort: ReasoningEffort) => void;
}

export const useModelStore = create<ModelState>()(
	devtools(
		persist(
			(set, get) => ({
				selectedModelId: "anthropic/claude-3.5-sonnet",

				setSelectedModel: (modelId) => {
					analytics.modelSwitched(modelId);
					set({ selectedModelId: modelId }, false, "model/select");
				},

				favorites: new Set<string>(),

				toggleFavorite: (modelId) => {
					const isFav = get().favorites.has(modelId);
					set(
						(state) => {
							const newFavs = new Set(state.favorites);
							if (isFav) newFavs.delete(modelId);
							else newFavs.add(modelId);
							return { favorites: newFavs };
						},
						false,
						"model/toggleFavorite",
					);
					return !isFav;
				},

				isFavorite: (modelId) => get().favorites.has(modelId),

				reasoningEnabled: false,

				setReasoningEnabled: (enabled) => {
					analytics.thinkingModeChanged(enabled ? "enabled" : "disabled");
					set(
						{
							reasoningEnabled: enabled,
							reasoningEffort: enabled ? "medium" : "none",
						},
						false,
						"model/reasoningEnabled",
					);
				},

				toggleReasoning: () => {
					const enabled = !get().reasoningEnabled;
					analytics.thinkingModeChanged(enabled ? "enabled" : "disabled");
					set(
						{
							reasoningEnabled: enabled,
							reasoningEffort: enabled ? "medium" : "none",
						},
						false,
						"model/toggleReasoning",
					);
				},

				reasoningEffort: "none" as ReasoningEffort,

				setReasoningEffort: (effort) => {
					analytics.thinkingModeChanged(effort);
					set(
						{
							reasoningEffort: effort,
							reasoningEnabled: effort !== "none",
						},
						false,
						"model/reasoningEffort",
					);
				},
			}),
			{
				name: "model-store",
				partialize: (state) => ({
					selectedModelId: state.selectedModelId,
					favorites: Array.from(state.favorites),
					reasoningEnabled: state.reasoningEnabled,
					reasoningEffort: state.reasoningEffort,
				}),
				merge: (persisted, current) => {
					const data = persisted as {
						selectedModelId?: string;
						favorites?: Array<string>;
						reasoningEnabled?: boolean;
						reasoningEffort?: ReasoningEffort;
					};

					const mergedEffort = data.reasoningEffort ?? current.reasoningEffort;
					const mergedEnabled = data.reasoningEnabled ?? (mergedEffort !== "none");

					return {
						...current,
						selectedModelId: data.selectedModelId ?? current.selectedModelId,
						favorites: new Set(data.favorites ?? []),
						reasoningEnabled: mergedEnabled,
						reasoningEffort: mergedEnabled ? mergedEffort : "none",
					};
				},
			},
		),
		{ name: "model-store" },
	),
);

export function useModels() {
	const [, forceUpdate] = useState(0);

	useEffect(() => {
		return subscribe(() => forceUpdate((n) => n + 1));
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			if (cache.models && Date.now() - cache.timestamp < CACHE_TTL) {
				return;
			}
			try {
				await fetchAllModels();
			} catch {
				if (cancelled) return;
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const reload = useCallback(async () => {
		try {
			await reloadModels();
		} catch {
		}
	}, []);

	const models = cache.models || getFallbackModels();
	const isLoading = cache.loading || !cache.models;
	const error = cache.error;

	const modelsByProvider = useMemo(() => {
		const groups: Record<string, Array<Model>> = {};
		for (const model of models) {
			(groups[model.provider] ??= []).push(model);
		}
		return groups;
	}, [models]);

	const modelsByFamily = useMemo(() => {
		const groups: Record<string, Array<Model>> = {};
		for (const model of models) {
			const key = model.family || model.provider;
			(groups[key] ??= []).push(model);
		}
		return groups;
	}, [models]);

	const providers = useMemo(() => {
		return Object.keys(modelsByProvider).sort((a, b) => {
			const aModels = modelsByProvider[a];
			const bModels = modelsByProvider[b];
			const aHasPopular = aModels.some((m) => m.isPopular);
			const bHasPopular = bModels.some((m) => m.isPopular);
			if (aHasPopular && !bHasPopular) return -1;
			if (!aHasPopular && bHasPopular) return 1;
			return bModels.length - aModels.length;
		});
	}, [modelsByProvider]);

	const families = useMemo(() => {
		return Object.keys(modelsByFamily).sort((a, b) => {
			const aModels = modelsByFamily[a];
			const bModels = modelsByFamily[b];
			const aHasPopular = aModels.some((m) => m.isPopular);
			const bHasPopular = bModels.some((m) => m.isPopular);
			if (aHasPopular && !bHasPopular) return -1;
			if (!aHasPopular && bHasPopular) return 1;
			return bModels.length - aModels.length;
		});
	}, [modelsByFamily]);

	const popularModels = useMemo(() => models.filter((m) => m.isPopular), [models]);

	return {
		models,
		modelsByProvider,
		modelsByFamily,
		providers,
		families,
		popularModels,
		isLoading,
		error,
		reload,
		totalCount: models.length,
	};
}
