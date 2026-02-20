import { useEffect, useState, useMemo } from "react";
import type { Model } from "@/stores/model";

export type UniqueProvider = {
	id: string;
	name: string;
	modelName: string;
	logoId: string;
	count: number;
};

export function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	return isMobile;
}

export function useUniqueProviders(models: Model[]): UniqueProvider[] {
	return useMemo(() => {
		const providerMap = new Map<string, UniqueProvider>();
		for (const model of models) {
			const existing = providerMap.get(model.providerId);
			if (existing) {
				existing.count++;
			} else {
				providerMap.set(model.providerId, {
					id: model.providerId,
					name: model.provider,
					modelName: model.modelName,
					logoId: model.logoId,
					count: 1,
				});
			}
		}
		return Array.from(providerMap.values()).sort((a, b) => b.count - a.count);
	}, [models]);
}

export function useFilteredModels(
	models: Model[],
	deferredQuery: string,
	selectedProvider: string | null,
	showFavoritesOnly: boolean,
	favorites: Set<string>,
): Model[] {
	return useMemo(() => {
		if (deferredQuery.trim()) {
			const q = deferredQuery.toLowerCase().replace(/[-_\s]/g, "");
			const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "");
			return models.filter(
				(model) =>
					normalize(model.name).includes(q) ||
					normalize(model.provider).includes(q) ||
					normalize(model.id).includes(q) ||
					(model.family && normalize(model.family).includes(q)),
			);
		}

		let result = models;

		if (showFavoritesOnly) {
			result = result.filter((m) => favorites.has(m.id));
		}

		if (selectedProvider) {
			result = result.filter((m) => m.providerId === selectedProvider);
		}

		return result;
	}, [models, deferredQuery, selectedProvider, showFavoritesOnly, favorites]);
}

export function useFlatList(filteredModels: Model[]): Model[] {
	return useMemo(() => {
		const popularModels = filteredModels.filter((m) => m.isPopular);
		const otherModels = filteredModels.filter((m) => !m.isPopular);
		return [...popularModels, ...otherModels];
	}, [filteredModels]);
}
