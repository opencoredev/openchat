import { describe, expect, test, beforeEach, vi } from "vitest";
import {
	getModelCapabilities,
	getModelById,
	getCacheStatus,
	clearModelCache,
	cache,
	subscribe,
	notifyListeners,
	CACHE_TTL,
} from "../model-utils";
import type { Model } from "../model-data";

function makeModel(overrides: Partial<Model> = {}): Model {
	return {
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		modelName: "OpenAI",
		providerId: "openai",
		logoId: "openai",
		family: "GPT-4o",
		description: "A great model",
		contextLength: 128000,
		maxOutputTokens: 4096,
		pricing: { input: 2.5, output: 10 },
		modality: "text",
		reasoning: false,
		toolCall: false,
		isPopular: false,
		isFree: false,
		...overrides,
	};
}

describe("getModelCapabilities", () => {
	test("returns all false for a basic model without reasoning or tools", () => {
		const model = makeModel({ reasoning: false, toolCall: false });
		const caps = getModelCapabilities("openai/gpt-4o", model);
		expect(caps.supportsReasoning).toBe(false);
		expect(caps.supportsEffortLevels).toBe(false);
		expect(caps.alwaysReasons).toBe(false);
		expect(caps.supportsTools).toBe(false);
	});

	test("returns supportsReasoning and supportsEffortLevels for o1-style models", () => {
		const model = makeModel({ reasoning: true, toolCall: false });
		const caps = getModelCapabilities("openai/o1", model);
		expect(caps.supportsReasoning).toBe(true);
		expect(caps.supportsEffortLevels).toBe(true);
		expect(caps.alwaysReasons).toBe(false);
	});

	test("deepseek-r1 is detected as alwaysReasons — no effort levels", () => {
		const model = makeModel({ reasoning: true });
		const caps = getModelCapabilities("deepseek/deepseek-r1", model);
		expect(caps.alwaysReasons).toBe(true);
		expect(caps.supportsReasoning).toBe(true);
		expect(caps.supportsEffortLevels).toBe(false);
	});

	test("returns supportsTools when model has toolCall=true", () => {
		const model = makeModel({ toolCall: true });
		const caps = getModelCapabilities("openai/gpt-4o", model);
		expect(caps.supportsTools).toBe(true);
	});

	test("works with null model — treats all capabilities as absent", () => {
		const caps = getModelCapabilities("openai/gpt-4o", null);
		expect(caps.supportsReasoning).toBe(false);
		expect(caps.supportsTools).toBe(false);
	});

	test("works with undefined model", () => {
		const caps = getModelCapabilities("openai/gpt-4o");
		expect(caps.supportsReasoning).toBe(false);
		expect(caps.supportsTools).toBe(false);
	});

	test("deepseek-r1 detection is case-insensitive", () => {
		const caps = getModelCapabilities("deepseek/DeepSeek-R1", makeModel({ reasoning: true }));
		expect(caps.alwaysReasons).toBe(true);
	});

	test("variant of deepseek-r1 is detected", () => {
		const caps = getModelCapabilities("deepseek/deepseek-r1-distill-llama-70b", makeModel({ reasoning: true }));
		expect(caps.alwaysReasons).toBe(true);
		expect(caps.supportsEffortLevels).toBe(false);
	});
});

describe("getModelById", () => {
	const models = [
		makeModel({ id: "openai/gpt-4o", name: "GPT-4o" }),
		makeModel({ id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }),
		makeModel({ id: "google/gemini-pro", name: "Gemini Pro" }),
	];

	test("returns matching model", () => {
		const model = getModelById(models, "anthropic/claude-3-5-sonnet");
		expect(model).toBeDefined();
		expect(model?.name).toBe("Claude 3.5 Sonnet");
	});

	test("returns undefined for unknown id", () => {
		expect(getModelById(models, "unknown/model")).toBeUndefined();
	});

	test("returns undefined for empty list", () => {
		expect(getModelById([], "openai/gpt-4o")).toBeUndefined();
	});

	test("returns first matching model when multiple share same id", () => {
		const dupeList = [
			makeModel({ id: "openai/gpt-4o", name: "First" }),
			makeModel({ id: "openai/gpt-4o", name: "Second" }),
		];
		expect(getModelById(dupeList, "openai/gpt-4o")?.name).toBe("First");
	});
});

describe("cache management", () => {
	beforeEach(() => {
		clearModelCache();
	});

	test("clearModelCache resets to empty state", () => {
		cache.models = [makeModel()];
		cache.timestamp = Date.now();
		clearModelCache();
		expect(cache.models).toBeNull();
		expect(cache.timestamp).toBe(0);
		expect(cache.loading).toBe(false);
		expect(cache.error).toBeNull();
	});

	test("getCacheStatus reports no data when cache is empty", () => {
		const status = getCacheStatus();
		expect(status.hasData).toBe(false);
		expect(status.modelCount).toBe(0);
		expect(status.isStale).toBe(true);
		expect(status.isLoading).toBe(false);
	});

	test("getCacheStatus reflects loaded models", () => {
		cache.models = [makeModel(), makeModel({ id: "openai/gpt-3.5" })];
		cache.timestamp = Date.now();
		const status = getCacheStatus();
		expect(status.hasData).toBe(true);
		expect(status.modelCount).toBe(2);
		expect(status.isStale).toBe(false);
	});

	test("getCacheStatus reports stale when cache is older than CACHE_TTL", () => {
		cache.models = [makeModel()];
		cache.timestamp = Date.now() - (CACHE_TTL + 1000);
		const status = getCacheStatus();
		expect(status.isStale).toBe(true);
	});

	test("getCacheStatus reflects loading state", () => {
		cache.loading = true;
		const status = getCacheStatus();
		expect(status.isLoading).toBe(true);
		cache.loading = false;
	});

	test("getCacheStatus age is null when no timestamp", () => {
		const status = getCacheStatus();
		expect(status.age).toBeNull();
	});

	test("getCacheStatus age is approximately correct for recent cache", () => {
		cache.models = [makeModel()];
		cache.timestamp = Date.now() - 5000;
		const status = getCacheStatus();
		expect(status.age).toBeGreaterThanOrEqual(5000);
	});
});

describe("subscribe / notifyListeners", () => {
	test("listener is called when notifyListeners is invoked", () => {
		const fn = vi.fn();
		const unsub = subscribe(fn);
		notifyListeners();
		expect(fn).toHaveBeenCalledTimes(1);
		unsub();
	});

	test("unsubscribed listener is not called", () => {
		const fn = vi.fn();
		const unsub = subscribe(fn);
		unsub();
		notifyListeners();
		expect(fn).not.toHaveBeenCalled();
	});

	test("multiple listeners are all called", () => {
		const a = vi.fn();
		const b = vi.fn();
		const unsubA = subscribe(a);
		const unsubB = subscribe(b);
		notifyListeners();
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		unsubA();
		unsubB();
	});

	test("clearModelCache notifies listeners", () => {
		const fn = vi.fn();
		const unsub = subscribe(fn);
		clearModelCache();
		expect(fn).toHaveBeenCalled();
		unsub();
	});
});

describe("CACHE_TTL constant", () => {
	test("is 4 hours in milliseconds", () => {
		expect(CACHE_TTL).toBe(4 * 60 * 60 * 1000);
	});
});

describe("localStorage initialization", () => {
	test("loads cached models from localStorage on module init when data is present", async () => {
		const cachedModels = [makeModel({ id: "cached/model-fresh" })];
		const cachedTimestamp = Date.now();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(JSON.stringify({ models: cachedModels, timestamp: cachedTimestamp })),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});

		vi.resetModules();
		const freshMod = await import("../model-utils");

		expect(freshMod.cache.models).not.toBeNull();
		expect(freshMod.cache.models?.[0].id).toBe("cached/model-fresh");
		expect(freshMod.cache.timestamp).toBe(cachedTimestamp);

		vi.resetModules();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});

	test("handles invalid localStorage JSON gracefully on module init", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue("not-valid-json{{"),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});

		vi.resetModules();
		const freshMod = await import("../model-utils");

		expect(freshMod.cache.models).toBeNull();

		vi.resetModules();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});
});

describe("fetchAllModels", () => {
	let fetchAllModels: typeof import("../model-utils").fetchAllModels;
	let mod: typeof import("../model-utils");

	const mockModelData = [
		{
			id: "openai/gpt-4o",
			name: "GPT-4o",
			description: "A great model",
			context_length: 128000,
			top_provider: { max_completion_tokens: 4096 },
			pricing: { prompt: "0.0000025", completion: "0.00001" },
			architecture: { modality: "text" },
			supported_parameters: ["tools", "tool_choice"],
		},
		{
			id: "anthropic/claude-3.5-sonnet",
			name: "Claude 3.5 Sonnet",
			description: "Claude by Anthropic",
			context_length: 200000,
			pricing: { prompt: "0.000003", completion: "0.000015" },
			supported_parameters: ["reasoning"],
		},
	];

	beforeEach(async () => {
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		mod = await import("../model-utils");
		fetchAllModels = mod.fetchAllModels;
		mod.clearModelCache();
	});



	test("saves models to localStorage after successful fetch", async () => {
		const setItemMock = vi.fn();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: setItemMock,
			removeItem: vi.fn(),
		});
		mod.clearModelCache();

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] }],
				}),
		});

		await fetchAllModels();
		expect(setItemMock).toHaveBeenCalled();
	});

	test("handles localStorage setItem error gracefully", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn().mockImplementation(() => { throw new Error("QuotaExceededError"); }),
			removeItem: vi.fn(),
		});
		mod.clearModelCache();

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		await expect(fetchAllModels()).resolves.not.toThrow();
	});

	test("fetches models from API and returns transformed list", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ data: mockModelData }),
		});

		const models = await fetchAllModels();
		expect(models.length).toBe(2);
		expect(models.some((m) => m.id === "openai/gpt-4o")).toBe(true);
		expect(models.some((m) => m.id === "anthropic/claude-3.5-sonnet")).toBe(true);
	});

	test("returns cached models without fetching again within TTL", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: mockModelData }),
		});

		await fetchAllModels();
		const callCount = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
		await fetchAllModels();
		expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
	});

	test("throws and sets error when API returns non-ok response", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
		});

		await expect(fetchAllModels()).rejects.toThrow("Models API error: 500");
		expect(mod.cache.error).not.toBeNull();
	});

	test("throws and sets error when fetch throws network error", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network failure"));

		await expect(fetchAllModels()).rejects.toThrow("network failure");
		expect(mod.cache.error).not.toBeNull();
	});

	test("deduplicates concurrent requests — cache.promise is set after first call", async () => {
		let resolveResponse: (value: unknown) => void;
		const responsePromise = new Promise((res) => { resolveResponse = res; });

		(fetch as ReturnType<typeof vi.fn>).mockReturnValue(
			responsePromise.then(() => ({
				ok: true,
				json: () => Promise.resolve({ data: [] }),
			})),
		);

		fetchAllModels();
		expect(mod.cache.promise).not.toBeNull();
		fetchAllModels();
		expect(fetch).toHaveBeenCalledTimes(1);

		resolveResponse!(undefined);
		await mod.cache.promise;
	});

	test("sets loading=true during fetch, loading=false after", async () => {
		let resolveResponse: (value: unknown) => void;
		const responsePromise = new Promise((res) => { resolveResponse = res; });
		(fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			responsePromise.then(() => ({
				ok: true,
				json: () => Promise.resolve({ data: [] }),
			})),
		);

		const promise = fetchAllModels();
		expect(mod.cache.loading).toBe(true);
		resolveResponse!(undefined);
		await promise;
		expect(mod.cache.loading).toBe(false);
	});

	test("notifies listeners on fetch start and completion", async () => {
		const listener = vi.fn();
		const unsub = mod.subscribe(listener);

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		await fetchAllModels();
		expect(listener).toHaveBeenCalled();
		unsub();
	});

	test("filters out models with empty id", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
						{ id: "", name: "Empty ID" },
						{ name: "No ID" },
					],
				}),
		});

		const models = await fetchAllModels();
		expect(models.length).toBe(1);
		expect(models[0].id).toBe("openai/gpt-4o");
	});

	test("uses model id as name when raw.name is absent (lines 150, 155)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/mystery-model", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		expect(models.length).toBe(1);
		expect(models[0].name).toBe("openai/mystery-model");
	});

	test("handles missing data.data field gracefully (line 194)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({}),
		});

		const models = await fetchAllModels();
		expect(models).toEqual([]);
	});

	test("covers extractFamily for claude, gpt, gemini, o1/o3/o4 model names (lines 77-95)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "anthropic/claude-3.5-sonnet", name: "claude-3.5-sonnet", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-3.7-sonnet", name: "claude-3.7-sonnet", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-sonnet-4", name: "claude-sonnet-4", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-opus-4", name: "claude-opus-4", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-haiku-4", name: "claude-haiku-4", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-2", name: "claude-2", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o", name: "gpt-4o", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4.1", name: "gpt-4.1", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4-turbo", name: "gpt-4-turbo", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-5", name: "gpt-5", pricing: {}, supported_parameters: [] },
						{ id: "openai/o1-preview", name: "o1-preview", pricing: {}, supported_parameters: [] },
						{ id: "openai/o3", name: "OpenAI O3", pricing: {}, supported_parameters: [] },
						{ id: "openai/o4-mini", name: "o4-mini", pricing: {}, supported_parameters: [] },
						{ id: "google/gemini-2.5-pro", name: "gemini-2.5-pro", pricing: {}, supported_parameters: [] },
						{ id: "google/gemini-2.0-flash", name: "gemini-2.0-flash", pricing: {}, supported_parameters: [] },
						{ id: "google/gemini-3-ultra", name: "gemini-3-ultra", pricing: {}, supported_parameters: [] },
						{ id: "google/gemini-pro", name: "gemini-pro", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		const findFamily = (id: string) => models.find((m) => m.id === id)?.family;

		expect(findFamily("anthropic/claude-3.5-sonnet")).toBe("Claude 3.5");
		expect(findFamily("anthropic/claude-3.7-sonnet")).toBe("Claude 3.7");
		expect(findFamily("anthropic/claude-sonnet-4")).toBe("Claude 4");
		expect(findFamily("anthropic/claude-opus-4")).toBe("Claude 4");
		expect(findFamily("anthropic/claude-haiku-4")).toBe("Claude 4");
		expect(findFamily("anthropic/claude-2")).toBe("Claude");
		expect(findFamily("openai/gpt-4o")).toBe("GPT-4o");
		expect(findFamily("openai/gpt-4.1")).toBe("GPT-4.1");
		expect(findFamily("openai/gpt-4-turbo")).toBe("GPT-4");
		expect(findFamily("openai/gpt-5")).toBe("GPT-5");
		expect(findFamily("openai/o1-preview")).toBe("o1");
		expect(findFamily("openai/o3")).toBe("o3");
		expect(findFamily("openai/o4-mini")).toBe("o4");
		expect(findFamily("google/gemini-2.5-pro")).toBe("Gemini 2.5");
		expect(findFamily("google/gemini-2.0-flash")).toBe("Gemini 2.0");
		expect(findFamily("google/gemini-3-ultra")).toBe("Gemini 3");
		expect(findFamily("google/gemini-pro")).toBe("Gemini");
	});

	test("covers extractFamily for llama, mistral, deepseek, grok, qwen model names (lines 97-128)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "meta-llama/llama-3.3-70b", name: "Llama-3.3-70B-Instruct", pricing: {}, supported_parameters: [] },
						{ id: "meta-llama/llama-3.2-8b", name: "Llama-3.2-8B-Instruct", pricing: {}, supported_parameters: [] },
						{ id: "meta-llama/llama-3.1-8b", name: "Llama-3.1-8B-Instruct", pricing: {}, supported_parameters: [] },
						{ id: "meta-llama/llama-4-scout", name: "Llama-4-Scout", pricing: {}, supported_parameters: [] },
						{ id: "meta-llama/llama-3-70b", name: "Llama 3 70B", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/mistral-large-2411", name: "Mistral-Large-2411", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/mistral-small-3.1", name: "Mistral-Small-3.1", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/mistral-medium-3", name: "Mistral-Medium-3", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/codestral-2501", name: "Codestral-2501", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/mixtral-8x7b", name: "Mixtral-8x7B", pricing: {}, supported_parameters: [] },
						{ id: "mistralai/mistral-7b", name: "Mistral 7B", pricing: {}, supported_parameters: [] },
						{ id: "deepseek/deepseek-r1", name: "deepseek-r1", pricing: {}, supported_parameters: [] },
						{ id: "deepseek/deepseek-v3", name: "deepseek-v3", pricing: {}, supported_parameters: [] },
						{ id: "deepseek/deepseek-chat", name: "deepseek-chat", pricing: {}, supported_parameters: [] },
						{ id: "x-ai/grok-4", name: "grok-4", pricing: {}, supported_parameters: [] },
						{ id: "x-ai/grok-3", name: "grok-3", pricing: {}, supported_parameters: [] },
						{ id: "x-ai/grok-2", name: "grok-2", pricing: {}, supported_parameters: [] },
						{ id: "qwen/qwen-2.5-72b", name: "qwen-2.5-72b", pricing: {}, supported_parameters: [] },
						{ id: "qwen/qwen-2-72b", name: "qwen-2-72b", pricing: {}, supported_parameters: [] },
						{ id: "qwen/qwen3-30b", name: "qwen3-30b", pricing: {}, supported_parameters: [] },
						{ id: "qwen/qwen-14b", name: "qwen-14b", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		const findFamily = (id: string) => models.find((m) => m.id === id)?.family;
		expect(findFamily("meta-llama/llama-3.3-70b")).toBe("Llama 3.3");
		expect(findFamily("meta-llama/llama-3.2-8b")).toBe("Llama 3.2");
		expect(findFamily("meta-llama/llama-3.1-8b")).toBe("Llama 3.1");
		expect(findFamily("meta-llama/llama-4-scout")).toBe("Llama 4");
		expect(findFamily("meta-llama/llama-3-70b")).toBe("Llama");
		expect(findFamily("mistralai/mistral-large-2411")).toBe("Mistral Large");
		expect(findFamily("mistralai/mistral-small-3.1")).toBe("Mistral Small");
		expect(findFamily("mistralai/mistral-medium-3")).toBe("Mistral Medium");
		expect(findFamily("mistralai/codestral-2501")).toBe("Codestral");
		expect(findFamily("mistralai/mixtral-8x7b")).toBe("Mixtral");
		expect(findFamily("mistralai/mistral-7b")).toBe("Mistral");
		expect(findFamily("deepseek/deepseek-r1")).toBe("DeepSeek R1");
		expect(findFamily("deepseek/deepseek-v3")).toBe("DeepSeek V3");
		expect(findFamily("deepseek/deepseek-chat")).toBe("DeepSeek");
		expect(findFamily("x-ai/grok-4")).toBe("Grok 4");
		expect(findFamily("x-ai/grok-3")).toBe("Grok 3");
		expect(findFamily("x-ai/grok-2")).toBe("Grok");
		expect(findFamily("qwen/qwen-2.5-72b")).toBe("Qwen 2.5");
		expect(findFamily("qwen/qwen-2-72b")).toBe("Qwen 2");
		expect(findFamily("qwen/qwen3-30b")).toBe("Qwen 3");
		expect(findFamily("qwen/qwen-14b")).toBe("Qwen");
	});

	test("model with id containing -r1 is detected as reasoning (line 138-ish)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "some-provider/some-model-r1", name: "Some R1 Model", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		expect(models[0].reasoning).toBe(true);
	});

	test("both providers in PROVIDER_PRIORITY sorts by priority index (line 207 non-999 branch)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "google/gemini-pro", name: "Gemini Pro", pricing: {}, supported_parameters: [] },
						{ id: "anthropic/claude-haiku", name: "Claude Haiku", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		const anthropicIdx = models.findIndex((m) => m.id === "anthropic/claude-haiku");
		const googleIdx = models.findIndex((m) => m.id === "google/gemini-pro");
		expect(anthropicIdx).toBeLessThan(googleIdx);
	});

	test("supportsTools is false when supported_parameters is absent (line 138-140 false branch)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-test", name: "GPT Test", pricing: {} },
					],
				}),
		});

		const models = await fetchAllModels();
		expect(models[0].toolCall).toBe(false);
	});

	test("model id without slash falls back to unknown provider (line 128 || branch)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "no-slash-model", name: "No Slash", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		expect(models[0].providerId).toBe("no-slash-model");
	});

	test("unknown provider gets priority 999 when sorting two non-popular models", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "unknown-provider/zzz", name: "ZZZ Model", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4-turbo", name: "GPT-4 Turbo", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		const openaiIdx = models.findIndex((m) => m.id === "openai/gpt-4-turbo");
		const unknownIdx = models.findIndex((m) => m.id === "unknown-provider/zzz");
		expect(openaiIdx).toBeLessThan(unknownIdx);
	});

	test("wraps non-Error thrown from fetch in Error object (line 222)", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce("string error");

		await expect(fetchAllModels()).rejects.toBeInstanceOf(Error);
		expect(mod.cache.error).toBeInstanceOf(Error);
		expect(mod.cache.error?.message).toBe("Failed to fetch models");
	});

	test("popular models sort before unpopular ones", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "unknown/zzz-model", name: "ZZZ Model", pricing: {}, supported_parameters: [] },
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		const models = await fetchAllModels();
		const gpt4oIndex = models.findIndex((m) => m.id === "openai/gpt-4o");
		const zzzIndex = models.findIndex((m) => m.id === "unknown/zzz-model");
		expect(gpt4oIndex).toBeLessThan(zzzIndex);
	});
});

describe("reloadModels", () => {
	beforeEach(() => {
		clearModelCache();
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});

	test("clears cache and re-fetches models", async () => {
		const mod = await import("../model-utils");
		const { reloadModels: reload } = mod;

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {}, supported_parameters: [] },
					],
				}),
		});

		mod.cache.models = [makeModel({ id: "old/model" })];
		mod.cache.timestamp = Date.now();

		const models = await reload();
		expect(mod.cache.models).not.toBeNull();
		expect(models.some((m) => m.id === "openai/gpt-4o")).toBe(true);
		expect(fetch).toHaveBeenCalled();
	});
});

describe("prefetchModels", () => {
	let modRef: typeof import("../model-utils");

	beforeEach(async () => {
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		modRef = await import("../model-utils");
		modRef.clearModelCache();
	});

	test("calls fetchAllModels and swallows errors silently", async () => {
		const { prefetchModels: prefetch } = modRef;

		(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network error"));

		await expect(Promise.resolve(prefetch())).resolves.not.toThrow();
	});

	test("succeeds silently when fetch works", async () => {
		const { prefetchModels: prefetch } = modRef;

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		await new Promise<void>((resolve) => {
			prefetch();
			setTimeout(resolve, 10);
		});

		expect(fetch).toHaveBeenCalled();
	});
});
