/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { Model } from "@/stores/model";
import {
	useUniqueProviders,
	useFilteredModels,
	useFlatList,
} from "../use-model-filter";

function makeModel(overrides: Partial<Model> & { id: string; providerId: string }): Model {
	return {
		name: overrides.id,
		provider: overrides.providerId,
		modelName: overrides.id,
		logoId: overrides.providerId,
		isPopular: false,
		family: undefined,
		...overrides,
	} as Model;
}

describe("useUniqueProviders", () => {
	it("returns empty array for no models", () => {
		const { result } = renderHook(() => useUniqueProviders([]));
		expect(result.current).toEqual([]);
	});

	it("returns one provider per unique providerId", () => {
		const models = [
			makeModel({ id: "model-1", providerId: "openai" }),
			makeModel({ id: "model-2", providerId: "anthropic" }),
		];
		const { result } = renderHook(() => useUniqueProviders(models));
		expect(result.current).toHaveLength(2);
	});

	it("increments count for duplicate providerId (line 31)", () => {
		const models = [
			makeModel({ id: "gpt-4", providerId: "openai" }),
			makeModel({ id: "gpt-3.5", providerId: "openai" }),
		];
		const { result } = renderHook(() => useUniqueProviders(models));
		expect(result.current).toHaveLength(1);
		expect(result.current[0].count).toBe(2);
	});

	it("sorts providers by model count descending", () => {
		const models = [
			makeModel({ id: "a-1", providerId: "small" }),
			makeModel({ id: "b-1", providerId: "big" }),
			makeModel({ id: "b-2", providerId: "big" }),
			makeModel({ id: "b-3", providerId: "big" }),
		];
		const { result } = renderHook(() => useUniqueProviders(models));
		expect(result.current[0].id).toBe("big");
		expect(result.current[0].count).toBe(3);
	});
});

describe("useFilteredModels", () => {
	const models = [
		makeModel({ id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai", family: "gpt" }),
		makeModel({ id: "claude-3", name: "Claude 3", provider: "Anthropic", providerId: "anthropic", family: "claude", isPopular: true }),
		makeModel({ id: "llama-3", name: "Llama 3", provider: "Meta", providerId: "meta", family: "llama" }),
	];

	it("returns all models when query is empty and no filters", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "", null, false, new Set()),
		);
		expect(result.current).toHaveLength(3);
	});

	it("filters by search query matching name", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "gpt", null, false, new Set()),
		);
		expect(result.current).toHaveLength(1);
		expect(result.current[0].id).toBe("gpt-4o");
	});

	it("filters by search query matching family", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "llama", null, false, new Set()),
		);
		expect(result.current).toHaveLength(1);
		expect(result.current[0].id).toBe("llama-3");
	});

	it("filters favorites when showFavoritesOnly is true (line 69)", () => {
		const favorites = new Set(["claude-3"]);
		const { result } = renderHook(() =>
			useFilteredModels(models, "", null, true, favorites),
		);
		expect(result.current).toHaveLength(1);
		expect(result.current[0].id).toBe("claude-3");
	});

	it("returns empty array when showFavoritesOnly and no favorites match", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "", null, true, new Set()),
		);
		expect(result.current).toHaveLength(0);
	});

	it("filters by selectedProvider (line 73)", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "", "anthropic", false, new Set()),
		);
		expect(result.current).toHaveLength(1);
		expect(result.current[0].id).toBe("claude-3");
	});

	it("returns empty when selectedProvider matches no models", () => {
		const { result } = renderHook(() =>
			useFilteredModels(models, "", "unknown-provider", false, new Set()),
		);
		expect(result.current).toHaveLength(0);
	});
});

describe("useFlatList", () => {
	it("returns empty array for no models", () => {
		const { result } = renderHook(() => useFlatList([]));
		expect(result.current).toEqual([]);
	});

	it("puts popular models first", () => {
		const models = [
			makeModel({ id: "regular", providerId: "p1", isPopular: false }),
			makeModel({ id: "popular", providerId: "p2", isPopular: true }),
		];
		const { result } = renderHook(() => useFlatList(models));
		expect(result.current[0].id).toBe("popular");
		expect(result.current[1].id).toBe("regular");
	});
});
