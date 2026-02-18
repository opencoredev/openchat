import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Model } from "@/stores/model";

const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
	getItem: (key: string) => _store[key] ?? null,
	setItem: (key: string, value: string) => {
		_store[key] = String(value);
	},
	removeItem: (key: string) => {
		delete _store[key];
	},
	clear: () => {
		for (const k in _store) delete _store[k];
	},
	get length() {
		return Object.keys(_store).length;
	},
	key: (i: number) => Object.keys(_store)[i] ?? null,
});

const { useModelStore, getModelCapabilities, getModelById } = await import(
	"@/stores/model"
);

const sampleModels: Array<Model> = [
	{
		id: "anthropic/claude-3.5-sonnet",
		name: "Claude 3.5 Sonnet",
		provider: "Anthropic",
		modelName: "Claude",
		providerId: "anthropic",
		logoId: "anthropic",
		family: "Claude 3.5",
		reasoning: false,
		toolCall: true,
		isPopular: true,
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		modelName: "GPT",
		providerId: "openai",
		logoId: "openai",
		family: "GPT-4o",
		reasoning: false,
		toolCall: true,
		isPopular: true,
	},
	{
		id: "deepseek/deepseek-r1",
		name: "DeepSeek R1",
		provider: "DeepSeek",
		modelName: "DeepSeek",
		providerId: "deepseek",
		logoId: "deepseek",
		family: "DeepSeek R1",
		reasoning: true,
		toolCall: false,
		isPopular: false,
	},
	{
		id: "anthropic/claude-3.7-sonnet",
		name: "Claude 3.7 Sonnet",
		provider: "Anthropic",
		modelName: "Claude",
		providerId: "anthropic",
		logoId: "anthropic",
		family: "Claude 3.7",
		reasoning: true,
		toolCall: true,
		isPopular: true,
	},
	{
		id: "google/gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		provider: "Google",
		modelName: "Gemini",
		providerId: "google",
		logoId: "google",
		family: "Gemini 2.5",
		reasoning: false,
		toolCall: false,
		isPopular: true,
		isFree: true,
	},
];

function resetStore() {
	useModelStore.setState({
		selectedModelId: "anthropic/claude-3.5-sonnet",
		favorites: new Set<string>(),
		reasoningEnabled: false,
		reasoningEffort: "none",
	});
}

describe("Model Store", () => {
	beforeEach(() => {
		resetStore();
	});

	describe("default state", () => {
		it("initializes with correct defaults", () => {
			const state = useModelStore.getState();

			expect(state.selectedModelId).toBe("anthropic/claude-3.5-sonnet");
			expect(state.favorites).toBeInstanceOf(Set);
			expect(state.favorites.size).toBe(0);
			expect(state.reasoningEnabled).toBe(false);
			expect(state.reasoningEffort).toBe("none");
		});
	});

	describe("setSelectedModel", () => {
		it("updates the selected model ID", () => {
			useModelStore.getState().setSelectedModel("openai/gpt-4o");
			expect(useModelStore.getState().selectedModelId).toBe("openai/gpt-4o");
		});

		it("accepts any model ID string", () => {
			useModelStore.getState().setSelectedModel("deepseek/deepseek-r1");
			expect(useModelStore.getState().selectedModelId).toBe(
				"deepseek/deepseek-r1",
			);

			useModelStore.getState().setSelectedModel("google/gemini-2.5-flash");
			expect(useModelStore.getState().selectedModelId).toBe(
				"google/gemini-2.5-flash",
			);
		});
	});

	describe("favorites", () => {
		it("toggleFavorite adds a model and returns true", () => {
			const added = useModelStore.getState().toggleFavorite("openai/gpt-4o");

			expect(added).toBe(true);
			expect(useModelStore.getState().isFavorite("openai/gpt-4o")).toBe(true);
		});

		it("toggleFavorite removes a favorited model and returns false", () => {
			useModelStore.getState().toggleFavorite("openai/gpt-4o");
			const removed = useModelStore.getState().toggleFavorite("openai/gpt-4o");

			expect(removed).toBe(false);
			expect(useModelStore.getState().isFavorite("openai/gpt-4o")).toBe(false);
		});

		it("tracks multiple favorites independently", () => {
			useModelStore.getState().toggleFavorite("openai/gpt-4o");
			useModelStore.getState().toggleFavorite("anthropic/claude-3.5-sonnet");

			const state = useModelStore.getState();
			expect(state.favorites.size).toBe(2);
			expect(state.isFavorite("openai/gpt-4o")).toBe(true);
			expect(state.isFavorite("anthropic/claude-3.5-sonnet")).toBe(true);
			expect(state.isFavorite("deepseek/deepseek-r1")).toBe(false);
		});

		it("removing one favorite does not affect others", () => {
			useModelStore.getState().toggleFavorite("openai/gpt-4o");
			useModelStore.getState().toggleFavorite("anthropic/claude-3.5-sonnet");
			useModelStore.getState().toggleFavorite("openai/gpt-4o");

			expect(useModelStore.getState().isFavorite("openai/gpt-4o")).toBe(false);
			expect(
				useModelStore.getState().isFavorite("anthropic/claude-3.5-sonnet"),
			).toBe(true);
		});
	});

	describe("reasoning controls", () => {
		it("setReasoningEnabled(true) enables reasoning with medium effort", () => {
			useModelStore.getState().setReasoningEnabled(true);

			const state = useModelStore.getState();
			expect(state.reasoningEnabled).toBe(true);
			expect(state.reasoningEffort).toBe("medium");
		});

		it("setReasoningEnabled(false) disables reasoning and resets effort", () => {
			useModelStore.getState().setReasoningEnabled(true);
			useModelStore.getState().setReasoningEnabled(false);

			const state = useModelStore.getState();
			expect(state.reasoningEnabled).toBe(false);
			expect(state.reasoningEffort).toBe("none");
		});

		it("toggleReasoning flips the reasoning state", () => {
			expect(useModelStore.getState().reasoningEnabled).toBe(false);

			useModelStore.getState().toggleReasoning();
			expect(useModelStore.getState().reasoningEnabled).toBe(true);
			expect(useModelStore.getState().reasoningEffort).toBe("medium");

			useModelStore.getState().toggleReasoning();
			expect(useModelStore.getState().reasoningEnabled).toBe(false);
			expect(useModelStore.getState().reasoningEffort).toBe("none");
		});

		it("setReasoningEffort syncs reasoningEnabled flag", () => {
			useModelStore.getState().setReasoningEffort("high");
			expect(useModelStore.getState().reasoningEnabled).toBe(true);
			expect(useModelStore.getState().reasoningEffort).toBe("high");

			useModelStore.getState().setReasoningEffort("low");
			expect(useModelStore.getState().reasoningEnabled).toBe(true);
			expect(useModelStore.getState().reasoningEffort).toBe("low");

			useModelStore.getState().setReasoningEffort("none");
			expect(useModelStore.getState().reasoningEnabled).toBe(false);
			expect(useModelStore.getState().reasoningEffort).toBe("none");
		});
	});
});

describe("getModelCapabilities", () => {
	it("detects reasoning-capable model with effort levels", () => {
		const caps = getModelCapabilities(
			"anthropic/claude-3.7-sonnet",
			sampleModels[3],
		);

		expect(caps.supportsReasoning).toBe(true);
		expect(caps.supportsEffortLevels).toBe(true);
		expect(caps.alwaysReasons).toBe(false);
	});

	it("detects non-reasoning model", () => {
		const caps = getModelCapabilities("openai/gpt-4o", sampleModels[1]);

		expect(caps.supportsReasoning).toBe(false);
		expect(caps.supportsEffortLevels).toBe(false);
		expect(caps.alwaysReasons).toBe(false);
	});

	it("detects always-reasoning model without effort control", () => {
		const caps = getModelCapabilities(
			"deepseek/deepseek-r1",
			sampleModels[2],
		);

		expect(caps.supportsReasoning).toBe(true);
		expect(caps.supportsEffortLevels).toBe(false);
		expect(caps.alwaysReasons).toBe(true);
	});

	it("detects tool call support", () => {
		const withTools = getModelCapabilities(
			"anthropic/claude-3.5-sonnet",
			sampleModels[0],
		);
		expect(withTools.supportsTools).toBe(true);

		const noTools = getModelCapabilities(
			"deepseek/deepseek-r1",
			sampleModels[2],
		);
		expect(noTools.supportsTools).toBe(false);
	});

	it("handles null model gracefully", () => {
		const caps = getModelCapabilities("unknown/model", null);

		expect(caps.supportsReasoning).toBe(false);
		expect(caps.supportsEffortLevels).toBe(false);
		expect(caps.alwaysReasons).toBe(false);
		expect(caps.supportsTools).toBe(false);
	});
});

describe("getModelById", () => {
	it("finds a model by its ID", () => {
		const model = getModelById(sampleModels, "openai/gpt-4o");

		expect(model).toBeDefined();
		expect(model!.name).toBe("GPT-4o");
		expect(model!.provider).toBe("OpenAI");
	});

	it("returns undefined for a non-existent model ID", () => {
		const model = getModelById(sampleModels, "nonexistent/model");
		expect(model).toBeUndefined();
	});

	it("returns correct model when multiple exist from same provider", () => {
		const sonnet35 = getModelById(
			sampleModels,
			"anthropic/claude-3.5-sonnet",
		);
		const sonnet37 = getModelById(
			sampleModels,
			"anthropic/claude-3.7-sonnet",
		);

		expect(sonnet35).toBeDefined();
		expect(sonnet37).toBeDefined();
		expect(sonnet35!.family).toBe("Claude 3.5");
		expect(sonnet37!.family).toBe("Claude 3.7");
	});
});
