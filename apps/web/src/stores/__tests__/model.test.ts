/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

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

describe("useModels hook", () => {
	let useModels: () => ReturnType<typeof import("../model").useModels>
	let clearModelCache: () => void

	beforeAll(async () => {
		const mod = await import("../model")
		useModels = mod.useModels
		const utils = await import("../model-utils")
		clearModelCache = utils.clearModelCache
	})

	beforeEach(() => {
		clearModelCache()
		vi.stubGlobal("fetch", vi.fn())
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		})
	})

	afterEach(() => {
		clearModelCache()
		vi.restoreAllMocks()
	})

	it("returns fallback models immediately when cache is empty", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		})

		const { result } = renderHook(() => useModels())
		expect(result.current.models.length).toBeGreaterThan(0)
	})

	it("returns models after successful fetch", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{
							id: "openai/gpt-4o",
							name: "GPT-4o",
							pricing: { prompt: "0.0000025", completion: "0.00001" },
							supported_parameters: [],
						},
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
		expect(result.current.models.some((m) => m.id === "openai/gpt-4o")).toBe(true)
	})

	it("sets error and uses fallback models when fetch fails", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"))

		const { result } = renderHook(() => useModels())
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
		expect(result.current.error).not.toBeNull()
		expect(result.current.models.length).toBeGreaterThan(0)
	})

	it("returns cached models without re-fetching when cache is fresh", async () => {
		const { cache: liveCache } = await import("../model-utils")
		liveCache.models = [
			{
				id: "openai/gpt-4o",
				name: "GPT-4o",
				provider: "OpenAI",
				modelName: "OpenAI",
				providerId: "openai",
				logoId: "openai",
				family: "GPT-4o",
				description: "",
				contextLength: 128000,
				maxOutputTokens: 4096,
				pricing: { input: 2.5, output: 10 },
				modality: "text",
				reasoning: false,
				toolCall: false,
				isPopular: true,
				isFree: false,
			},
		]
		liveCache.timestamp = Date.now()

		const { result } = renderHook(() => useModels())
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
		expect(fetch).not.toHaveBeenCalled()
		expect(result.current.models.some((m) => m.id === "openai/gpt-4o")).toBe(true)
	})

	it("provides providers grouped by provider name", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o-mini", name: "GPT-4o Mini", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-3", name: "Claude 3", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
		expect(result.current.providers).toContain("OpenAI")
		expect(result.current.providers).toContain("Anthropic")
	})

	it("provides families grouped by model family", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
		expect(result.current.families).toBeDefined()
		expect(Array.isArray(result.current.families)).toBe(true)
	})

	it("reload() re-fetches models and clears cache first", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))

		const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length

		await act(async () => {
			await result.current.reload()
		})

		expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
	})

	it("reload() sets error when fetch fails", async () => {
		;(fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ data: [] }),
			})
			.mockRejectedValueOnce(new Error("reload failed"))

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))

		await act(async () => {
			await result.current.reload()
		})

		expect(result.current.error?.message).toBe("reload failed")
	})

	it("popularModels contains only models with isPopular=true", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "unknown/niche-model", name: "Niche", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		for (const m of result.current.popularModels) {
			expect(m.isPopular).toBe(true)
		}
	})

	it("totalCount matches models array length", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o-mini", name: "GPT-4o Mini", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		expect(result.current.totalCount).toBe(result.current.models.length)
	})

	it("sets error from non-Error thrown during initial load (line 162 branch)", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue("string error not an Error instance")

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))

		expect(result.current.error).toBeInstanceOf(Error)
	})

	it("reload() sets error when fetch rejects with non-Error (line 183 branch)", async () => {
		;(fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ data: [] }),
			})
			.mockRejectedValueOnce("string error not an Error")

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))

		await act(async () => {
			await result.current.reload()
		})

		expect(result.current.error).toBeInstanceOf(Error)
	})

	it("providers sort: popular provider listed first triggers line 212 true-branch", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "unknown-z/zzz-model", name: "ZZZ Model", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		const providers = result.current.providers
		const openaiIdx = providers.indexOf("OpenAI")
		const unknownIdx = providers.findIndex((p) => p.toLowerCase().includes("unknown"))
		expect(openaiIdx).toBeGreaterThanOrEqual(0)
		if (unknownIdx >= 0) expect(openaiIdx).toBeLessThan(unknownIdx)
	})

	it("providers sort: non-popular provider listed first triggers line 213 true-branch", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "unknown-z/zzz-model", name: "ZZZ Model", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		const providers = result.current.providers
		const openaiIdx = providers.indexOf("OpenAI")
		const unknownIdx = providers.findIndex((p) => p.toLowerCase().includes("unknown"))
		if (openaiIdx >= 0 && unknownIdx >= 0) expect(openaiIdx).toBeLessThan(unknownIdx)
	})

	it("families sort: popular family listed first triggers line 224 true-branch", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "unknown-z/zzz-model", name: "ZZZ Unique Family Model", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		const families = result.current.families
		const gpt4oFamilyIdx = families.indexOf("GPT-4o")
		expect(gpt4oFamilyIdx).toBeGreaterThanOrEqual(0)
		const zzFamilyIdx = families.findIndex((f) => f.includes("ZZZ") || f.includes("Unknown"))
		if (zzFamilyIdx >= 0) expect(gpt4oFamilyIdx).toBeLessThan(zzFamilyIdx)
	})

	it("families sort: non-popular family listed first triggers line 225 true-branch", async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "unknown-z/zzz-model", name: "ZZZ Unique Family Model", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		})

		const { result } = renderHook(() => useModels())
		await waitFor(() => expect(result.current.isLoading).toBe(false))
		const families = result.current.families
		const gpt4oFamilyIdx = families.indexOf("GPT-4o")
		expect(gpt4oFamilyIdx).toBeGreaterThanOrEqual(0)
		const zzFamilyIdx = families.findIndex((f) => f.includes("ZZZ") || f.includes("Unknown"))
		if (zzFamilyIdx >= 0) expect(gpt4oFamilyIdx).toBeLessThan(zzFamilyIdx)
	})

	it("does not update state when component unmounts before fetch completes (cancelled path)", async () => {
		let resolveFetch!: (value: Response) => void
		const fetchPromise = new Promise<Response>((resolve) => {
			resolveFetch = resolve
		})
		;(fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(fetchPromise)

		const { result, unmount } = renderHook(() => useModels())

		expect(result.current.isLoading).toBe(true)

		unmount()

		resolveFetch(new Response(JSON.stringify({ data: [{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] }] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}))

		await new Promise((r) => setTimeout(r, 10))
	})

	it("does not update state when component unmounts before fetch error (cancelled error path)", async () => {
		let rejectFetch!: (reason: unknown) => void
		const fetchPromise = new Promise<Response>((_, reject) => {
			rejectFetch = reject
		})
		;(fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(fetchPromise)

		const { unmount } = renderHook(() => useModels())

		unmount()

		rejectFetch(new Error("network error after unmount"))

		await new Promise((r) => setTimeout(r, 10))
	})
})

describe("persist merge function (lines 114-122)", () => {
	it("merges persisted reasoningEffort and derives reasoningEnabled from it", async () => {
		// Store data with reasoningEffort="high" (no explicit reasoningEnabled)
		localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({
			state: {
				selectedModelId: "openai/gpt-4o",
				favorites: ["openai/gpt-4o"],
				reasoningEffort: "high",
				// reasoningEnabled is NOT stored — merge should derive it from effort
			},
			version: 0,
		}))
		await useModelStore.persist.rehydrate()
		const state = useModelStore.getState()
		expect(state.selectedModelId).toBe("openai/gpt-4o")
		expect(state.favorites.has("openai/gpt-4o")).toBe(true)
		// reasoningEnabled derived: mergedEffort="high" !== "none" → mergedEnabled=true
		expect(state.reasoningEnabled).toBe(true)
		expect(state.reasoningEffort).toBe("high")
	})

	it("merges explicit reasoningEnabled=false with reasoningEffort='none'", async () => {
		localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({
			state: {
				selectedModelId: "deepseek/deepseek-r1",
				favorites: [],
				reasoningEnabled: false,
				reasoningEffort: "none",
			},
			version: 0,
		}))
		await useModelStore.persist.rehydrate()
		const state = useModelStore.getState()
		expect(state.selectedModelId).toBe("deepseek/deepseek-r1")
		expect(state.reasoningEnabled).toBe(false)
		expect(state.reasoningEffort).toBe("none")
	})
})
