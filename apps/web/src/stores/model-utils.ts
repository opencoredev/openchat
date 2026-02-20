/**
 * Model utilities — cache management, transform, fetch, and helper functions.
 */

import type { Model, ModelCapabilities, OpenRouterModel } from "./model-data";
import { POPULAR_MODEL_IDS, PROVIDER_INFO, PROVIDER_PRIORITY, getFallbackModels } from "./model-data";

// ============================================================================
// Cache with localStorage persistence
// ============================================================================

interface ModelCache {
	models: Array<Model> | null;
	timestamp: number;
	loading: boolean;
	error: Error | null;
	promise: Promise<Array<Model>> | null;
}

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
const STORAGE_KEY = "openchat-models-cache";

function loadFromStorage(): { models: Array<Model> | null; timestamp: number } {
	if (typeof window === "undefined") return { models: null, timestamp: 0 };
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (parsed.models && parsed.timestamp) {
				return { models: parsed.models, timestamp: parsed.timestamp };
			}
		}
	} catch (e) {
		console.warn("Failed to load models from localStorage:", e);
	}
	return { models: null, timestamp: 0 };
}

function saveToStorage(models: Array<Model>, timestamp: number) {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ models, timestamp }));
	} catch (e) {
		console.warn("Failed to save models to localStorage:", e);
	}
}

const stored = loadFromStorage();

export let cache: ModelCache = {
	models: stored.models,
	timestamp: stored.timestamp,
	loading: false,
	error: null,
	promise: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyListeners() {
	listeners.forEach((fn) => fn());
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

// ============================================================================
// Transform OpenRouter model to our format
// ============================================================================

function extractFamily(id: string, name: string): string | undefined {
	const lower = name.toLowerCase();

	if (lower.includes("claude-3.5")) return "Claude 3.5";
	if (lower.includes("claude-3.7")) return "Claude 3.7";
	if (lower.includes("claude-sonnet-4") || lower.includes("claude sonnet 4")) return "Claude 4";
	if (lower.includes("claude-opus-4") || lower.includes("claude opus 4")) return "Claude 4";
	if (lower.includes("claude-haiku-4") || lower.includes("claude haiku 4")) return "Claude 4";
	if (lower.includes("claude")) return "Claude";

	if (lower.includes("gpt-4o")) return "GPT-4o";
	if (lower.includes("gpt-4.1")) return "GPT-4.1";
	if (lower.includes("gpt-4")) return "GPT-4";
	if (lower.includes("gpt-5")) return "GPT-5";
	if (lower.includes("o1-") || lower.includes("o1 ")) return "o1";
	if (lower.includes("o3-") || lower.includes("o3 ") || id.includes("/o3")) return "o3";
	if (lower.includes("o4-") || lower.includes("o4 ")) return "o4";

	if (lower.includes("gemini-2.5")) return "Gemini 2.5";
	if (lower.includes("gemini-2.0")) return "Gemini 2.0";
	if (lower.includes("gemini-3")) return "Gemini 3";
	if (lower.includes("gemini")) return "Gemini";

	if (lower.includes("llama-3.3")) return "Llama 3.3";
	if (lower.includes("llama-3.2")) return "Llama 3.2";
	if (lower.includes("llama-3.1")) return "Llama 3.1";
	if (lower.includes("llama-4")) return "Llama 4";
	if (lower.includes("llama")) return "Llama";

	if (lower.includes("mistral-large")) return "Mistral Large";
	if (lower.includes("mistral-small")) return "Mistral Small";
	if (lower.includes("mistral-medium")) return "Mistral Medium";
	if (lower.includes("codestral")) return "Codestral";
	if (lower.includes("mixtral")) return "Mixtral";
	if (lower.includes("mistral")) return "Mistral";

	if (lower.includes("deepseek-r1")) return "DeepSeek R1";
	if (lower.includes("deepseek-v3")) return "DeepSeek V3";
	if (lower.includes("deepseek")) return "DeepSeek";

	if (lower.includes("grok-4")) return "Grok 4";
	if (lower.includes("grok-3")) return "Grok 3";
	if (lower.includes("grok")) return "Grok";

	if (lower.includes("qwen-2.5")) return "Qwen 2.5";
	if (lower.includes("qwen-2")) return "Qwen 2";
	if (lower.includes("qwen3")) return "Qwen 3";
	if (lower.includes("qwen")) return "Qwen";

	return undefined;
}

function transformModel(raw: OpenRouterModel): Model {
	const id = raw.id;
	const providerSlug = id.split("/")[0] || "unknown";
	const info = PROVIDER_INFO[providerSlug] || {
		name: providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1).replace(/-/g, " "),
		logoId: providerSlug,
	};

	const inputPrice = parseFloat(raw.pricing?.prompt || "0") * 1_000_000;
	const outputPrice = parseFloat(raw.pricing?.completion || "0") * 1_000_000;
	const isFree = id.endsWith(":free") || (inputPrice === 0 && outputPrice === 0);

	const supportsTools = raw.supported_parameters
		? raw.supported_parameters.includes("tools") || raw.supported_parameters.includes("tool_choice")
		: false;
	const supportsReasoning =
		raw.supported_parameters?.includes("reasoning") ||
		raw.supported_parameters?.includes("include_reasoning") ||
		id.includes("-r1") ||
		id.includes("/o1") ||
		id.includes("/o3");

	return {
		id,
		name: raw.name || id,
		provider: info.name,
		modelName: info.modelName || info.name,
		providerId: providerSlug,
		logoId: info.logoId,
		family: extractFamily(id, raw.name || ""),
		description: raw.description,
		contextLength: raw.context_length,
		maxOutputTokens: raw.top_provider?.max_completion_tokens,
		pricing: { input: inputPrice, output: outputPrice },
		modality: raw.architecture?.modality,
		reasoning: supportsReasoning,
		toolCall: supportsTools,
		isPopular: POPULAR_MODEL_IDS.has(id),
		isFree,
	};
}

// ============================================================================
// Fetch ALL models from OpenRouter
// ============================================================================

export async function fetchAllModels(): Promise<Array<Model>> {
	if (cache.models && Date.now() - cache.timestamp < CACHE_TTL) {
		return cache.models;
	}

	if (cache.promise) return cache.promise;

	cache.loading = true;
	cache.error = null;
	notifyListeners();

	cache.promise = (async () => {
		try {
			const response = await fetch("/api/models", {
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Models API error: ${response.status}`);
			}

			const data = await response.json();
			const rawModels = data.data || [];

			const models: Array<Model> = (rawModels as Array<OpenRouterModel>)
				.filter((m): m is OpenRouterModel & { id: string } => !!m.id && typeof m.id === "string")
				.map(transformModel)
				.sort((a: Model, b: Model) => {
					if (a.isPopular && !b.isPopular) return -1;
					if (!a.isPopular && b.isPopular) return 1;

					const aSlug = a.id.split("/")[0];
					const bSlug = b.id.split("/")[0];
					const aPriority = PROVIDER_PRIORITY.indexOf(aSlug);
					const bPriority = PROVIDER_PRIORITY.indexOf(bSlug);
					const aP = aPriority === -1 ? 999 : aPriority;
					const bP = bPriority === -1 ? 999 : bPriority;
					if (aP !== bP) return aP - bP;

					return a.name.localeCompare(b.name);
				});

			cache.models = models;
			cache.timestamp = Date.now();
			cache.error = null;

			saveToStorage(models, cache.timestamp);

			return models;
		} catch (e) {
			cache.error = e instanceof Error ? e : new Error("Failed to fetch models");
			throw cache.error;
		} finally {
			cache.loading = false;
			cache.promise = null;
			notifyListeners();
		}
	})();

	return cache.promise;
}

export function clearModelCache() {
	cache = {
		models: null,
		timestamp: 0,
		loading: false,
		error: null,
		promise: null,
	};
	notifyListeners();
}

export async function reloadModels(): Promise<Array<Model>> {
	clearModelCache();
	return fetchAllModels();
}

// ============================================================================
// Dynamic Model Capabilities (API-driven, no hardcoded model lists)
// ============================================================================

export function getModelCapabilities(modelId: string, model?: Model | null): ModelCapabilities {
	const supportsReasoning = model?.reasoning === true;
	const alwaysReasons = /deepseek.*r1/i.test(modelId);
	const supportsEffort = supportsReasoning && !alwaysReasons;
	const supportsTools = model?.toolCall === true;

	return {
		supportsReasoning,
		supportsEffortLevels: supportsEffort,
		alwaysReasons,
		supportsTools,
	};
}

// ============================================================================
// Exported helpers
// ============================================================================

export function getModelById(modelList: Array<Model>, id: string): Model | undefined {
	return modelList.find((m) => m.id === id);
}

export function prefetchModels() {
	fetchAllModels().catch(() => {});
}

export function getCacheStatus() {
	return {
		hasData: !!cache.models,
		modelCount: cache.models?.length || 0,
		timestamp: cache.timestamp,
		age: cache.timestamp ? Date.now() - cache.timestamp : null,
		isStale: cache.timestamp ? Date.now() - cache.timestamp > CACHE_TTL : true,
		isLoading: cache.loading,
	};
}

export { getFallbackModels, CACHE_TTL };
