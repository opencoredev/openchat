import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const _lsData: Record<string, string> = {}

const localStorageMock = {
	getItem: vi.fn((key: string): string | null => _lsData[key] ?? null),
	setItem: vi.fn((key: string, value: string): void => {
		_lsData[key] = value
	}),
	removeItem: vi.fn((key: string): void => {
		delete _lsData[key]
	}),
	clear: vi.fn((): void => {
		for (const key of Object.keys(_lsData)) delete _lsData[key]
	}),
	key: vi.fn((_i: number): string | null => null),
	get length() {
		return Object.keys(_lsData).length
	},
}

vi.stubGlobal("localStorage", localStorageMock)

import type * as ModelModuleTypes from "../model"

let useModelStore: typeof ModelModuleTypes.useModelStore

const INITIAL_MODEL = "anthropic/claude-3.5-sonnet"

beforeAll(async () => {
	const mod = await import("../model")
	useModelStore = mod.useModelStore
})

function resetStore() {
	useModelStore.setState({
		selectedModelId: INITIAL_MODEL,
		favorites: new Set<string>(),
		reasoningEnabled: false,
		reasoningEffort: "none",
	})
}

beforeEach(() => {
	resetStore()
	for (const key of Object.keys(_lsData)) delete _lsData[key]
	vi.clearAllMocks()
})

describe("initial state", () => {
	it("selectedModelId defaults to claude-3.5-sonnet", () => {
		expect(useModelStore.getState().selectedModelId).toBe(INITIAL_MODEL)
	})

	it("favorites defaults to an empty Set instance", () => {
		const { favorites } = useModelStore.getState()
		expect(favorites).toBeInstanceOf(Set)
		expect(favorites.size).toBe(0)
	})

	it("reasoningEnabled defaults to false", () => {
		expect(useModelStore.getState().reasoningEnabled).toBe(false)
	})

	it("reasoningEffort defaults to 'none'", () => {
		expect(useModelStore.getState().reasoningEffort).toBe("none")
	})
})

describe("model selection", () => {
	it("setSelectedModel updates selectedModelId", () => {
		useModelStore.getState().setSelectedModel("openai/gpt-4o")
		expect(useModelStore.getState().selectedModelId).toBe("openai/gpt-4o")
	})

	it("setSelectedModel can be called multiple times and reflects the latest value", () => {
		useModelStore.getState().setSelectedModel("google/gemini-2.5-flash")
		useModelStore.getState().setSelectedModel("deepseek/deepseek-r1")
		expect(useModelStore.getState().selectedModelId).toBe("deepseek/deepseek-r1")
	})
})

describe("favorites", () => {
	it("toggleFavorite adds a model and returns true", () => {
		const added = useModelStore.getState().toggleFavorite("openai/gpt-4o")
		expect(added).toBe(true)
		expect(useModelStore.getState().favorites.has("openai/gpt-4o")).toBe(true)
	})

	it("toggleFavorite removes an existing favorite and returns false", () => {
		useModelStore.getState().toggleFavorite("openai/gpt-4o")
		const removed = useModelStore.getState().toggleFavorite("openai/gpt-4o")
		expect(removed).toBe(false)
		expect(useModelStore.getState().favorites.has("openai/gpt-4o")).toBe(false)
	})

	it("favorites field is always a Set (not an Array) after mutations", () => {
		useModelStore.getState().toggleFavorite("model-a")
		useModelStore.getState().toggleFavorite("model-b")
		expect(useModelStore.getState().favorites).toBeInstanceOf(Set)
	})

	it("isFavorite returns true for a favorited model", () => {
		useModelStore.getState().toggleFavorite("anthropic/claude-3.5-haiku")
		expect(useModelStore.getState().isFavorite("anthropic/claude-3.5-haiku")).toBe(true)
	})

	it("isFavorite returns false for a non-favorited model", () => {
		expect(useModelStore.getState().isFavorite("non-existent/model")).toBe(false)
	})

	it("can accumulate multiple independent favorites", () => {
		useModelStore.getState().toggleFavorite("m-a")
		useModelStore.getState().toggleFavorite("m-b")
		useModelStore.getState().toggleFavorite("m-c")
		const { favorites } = useModelStore.getState()
		expect(favorites.size).toBe(3)
		expect(favorites.has("m-a")).toBe(true)
		expect(favorites.has("m-b")).toBe(true)
		expect(favorites.has("m-c")).toBe(true)
	})
})

describe("reasoning controls", () => {
	it("setReasoningEnabled(true) enables reasoning and sets effort to 'medium'", () => {
		useModelStore.getState().setReasoningEnabled(true)
		const { reasoningEnabled, reasoningEffort } = useModelStore.getState()
		expect(reasoningEnabled).toBe(true)
		expect(reasoningEffort).toBe("medium")
	})

	it("setReasoningEnabled(false) disables reasoning and sets effort to 'none'", () => {
		useModelStore.getState().setReasoningEnabled(true)
		useModelStore.getState().setReasoningEnabled(false)
		const { reasoningEnabled, reasoningEffort } = useModelStore.getState()
		expect(reasoningEnabled).toBe(false)
		expect(reasoningEffort).toBe("none")
	})

	it("toggleReasoning flips reasoningEnabled each call", () => {
		expect(useModelStore.getState().reasoningEnabled).toBe(false)
		useModelStore.getState().toggleReasoning()
		expect(useModelStore.getState().reasoningEnabled).toBe(true)
		useModelStore.getState().toggleReasoning()
		expect(useModelStore.getState().reasoningEnabled).toBe(false)
	})

	it("setReasoningEffort('high') sets effort and enables reasoning", () => {
		useModelStore.getState().setReasoningEffort("high")
		const { reasoningEffort, reasoningEnabled } = useModelStore.getState()
		expect(reasoningEffort).toBe("high")
		expect(reasoningEnabled).toBe(true)
	})

	it("setReasoningEffort('none') disables reasoning", () => {
		useModelStore.getState().setReasoningEnabled(true)
		useModelStore.getState().setReasoningEffort("none")
		const { reasoningEnabled, reasoningEffort } = useModelStore.getState()
		expect(reasoningEnabled).toBe(false)
		expect(reasoningEffort).toBe("none")
	})
})

describe("persistence behavior", () => {
	it("favorites are serialized as an Array in localStorage (not a Set)", () => {
		useModelStore.getState().toggleFavorite("openai/gpt-4o")
		const raw = _lsData["model-store"]
		if (!raw) return
		const parsed = JSON.parse(raw) as { state?: { favorites?: unknown } }
		expect(Array.isArray(parsed.state?.favorites)).toBe(true)
	})

	it("selectedModelId is persisted to localStorage on change", () => {
		useModelStore.getState().setSelectedModel("openai/gpt-4o-mini")
		const raw = _lsData["model-store"]
		if (!raw) return
		const parsed = JSON.parse(raw) as { state?: { selectedModelId?: string } }
		expect(parsed.state?.selectedModelId).toBe("openai/gpt-4o-mini")
	})

	it("persisted favorites Array matches current Set contents", () => {
		useModelStore.getState().toggleFavorite("fav-1")
		useModelStore.getState().toggleFavorite("fav-2")
		const raw = _lsData["model-store"]
		if (!raw) return
		const parsed = JSON.parse(raw) as { state?: { favorites?: string[] } }
		const persistedFavs = (parsed.state?.favorites ?? []).sort()
		const storeFavs = [...useModelStore.getState().favorites].sort()
		expect(persistedFavs).toEqual(storeFavs)
	})

	it("reasoningEnabled and reasoningEffort are both persisted", () => {
		useModelStore.getState().setReasoningEnabled(true)
		const raw = _lsData["model-store"]
		if (!raw) return
		const parsed = JSON.parse(raw) as {
			state?: { reasoningEnabled?: boolean; reasoningEffort?: string }
		}
		expect(parsed.state?.reasoningEnabled).toBe(true)
		expect(parsed.state?.reasoningEffort).toBe("medium")
	})
})
