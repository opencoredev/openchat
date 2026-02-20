/**
 * Model data — static types, constants, provider info, and fallback models.
 */

// ============================================================================
// Types
// ============================================================================

/** Raw model data from OpenRouter API */
export interface OpenRouterModel {
	id: string;
	name?: string;
	description?: string;
	context_length?: number;
	pricing?: {
		prompt?: string;
		completion?: string;
	};
	top_provider?: {
		max_completion_tokens?: number;
	};
	architecture?: {
		modality?: string;
	};
	supported_parameters?: Array<string>;
}

export interface Model {
	id: string;
	name: string;
	provider: string; // Provider/company name (e.g., "Anthropic", "Meta Llama")
	modelName: string; // Model/product name for filters (e.g., "Claude", "Llama")
	providerId: string; // Provider slug from model ID (e.g., "meta-llama", "qwen")
	logoId: string; // Logo slug for models.dev (e.g., "llama", "alibaba")
	family?: string; // Model family (e.g., "claude-3.5")
	description?: string;
	contextLength?: number;
	maxOutputTokens?: number;
	pricing?: { input: number; output: number };
	modality?: string;
	reasoning?: boolean;
	toolCall?: boolean;
	isPopular?: boolean;
	isFree?: boolean;
}

export interface ModelCapabilities {
	supportsReasoning: boolean;
	supportsEffortLevels: boolean;
	alwaysReasons: boolean;
	supportsTools: boolean;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high";

// ============================================================================
// Provider mapping for display names and logo IDs
// ============================================================================

export const PROVIDER_INFO: Partial<Record<string, { name: string; modelName?: string; logoId: string }>> = {
	openai: { name: "OpenAI", modelName: "GPT", logoId: "openai" },
	anthropic: { name: "Anthropic", modelName: "Claude", logoId: "anthropic" },
	google: { name: "Google", modelName: "Gemini", logoId: "google" },
	"meta-llama": { name: "Meta Llama", modelName: "Llama", logoId: "llama" },
	mistralai: { name: "Mistral", logoId: "mistral" },
	deepseek: { name: "DeepSeek", logoId: "deepseek" },
	"x-ai": { name: "xAI", modelName: "Grok", logoId: "xai" },
	cohere: { name: "Cohere", logoId: "cohere" },
	perplexity: { name: "Perplexity", logoId: "perplexity" },
	qwen: { name: "Qwen", logoId: "alibaba" },
	nvidia: { name: "NVIDIA", logoId: "nvidia" },
	microsoft: { name: "Microsoft", modelName: "Phi", logoId: "azure" },
	amazon: { name: "Amazon", modelName: "Nova", logoId: "amazon-bedrock" },
	ai21: { name: "AI21", logoId: "ai21" },
	together: { name: "Together", logoId: "togetherai" },
	"fireworks-ai": { name: "Fireworks", logoId: "fireworks-ai" },
	groq: { name: "Groq", logoId: "groq" },
	databricks: { name: "Databricks", logoId: "databricks" },
	inflection: { name: "Inflection", logoId: "inflection" },
	nous: { name: "Nous", logoId: "nous" },
	nousresearch: { name: "NousResearch", logoId: "nous" },
	openchat: { name: "OpenChat", logoId: "openchat" },
	teknium: { name: "Teknium", logoId: "teknium" },
	cognitivecomputations: { name: "Cognitive", logoId: "cognitive" },
	neversleep: { name: "NeverSleep", logoId: "neversleep" },
	sao10k: { name: "Sao10k", logoId: "sao10k" },
	thedrummer: { name: "TheDrummer", logoId: "thedrummer" },
	"eva-unit-01": { name: "Eva", logoId: "eva" },
	liquid: { name: "Liquid", logoId: "liquid" },
	"bytedance-seed": { name: "ByteDance", logoId: "bytedance" },
	minimax: { name: "MiniMax", logoId: "minimax" },
	moonshotai: { name: "Moonshot", logoId: "moonshotai" },
	zhipuai: { name: "Zhipu", logoId: "zhipuai" },
	thudm: { name: "THUDM", logoId: "thudm" },
	featherless: { name: "Featherless", logoId: "featherless" },
	infermatic: { name: "Infermatic", logoId: "infermatic" },
	aetherwiing: { name: "AetherWiing", logoId: "aetherwiing" },
	"all-hands": { name: "All Hands", logoId: "all-hands" },
	rekaai: { name: "Reka", logoId: "rekaai" },
	sophosympatheia: { name: "Sophos", logoId: "sophos" },
	undi95: { name: "Undi95", logoId: "undi95" },
	mancer: { name: "Mancer", logoId: "mancer" },
	lynn: { name: "Lynn", logoId: "lynn" },
	pygmalionai: { name: "Pygmalion", logoId: "pygmalionai" },
	jondurbin: { name: "Jon Durbin", logoId: "jondurbin" },
	gryphe: { name: "Gryphe", logoId: "gryphe" },
	arliai: { name: "ArliAI", logoId: "arliai" },
	openrouter: { name: "OpenRouter", logoId: "openrouter" },
	allenai: { name: "Allen AI", logoId: "allenai" },
};

// Popular models - shown at top
export const POPULAR_MODEL_IDS = new Set([
	"anthropic/claude-sonnet-4",
	"anthropic/claude-3.5-sonnet",
	"anthropic/claude-3.7-sonnet",
	"anthropic/claude-3.5-haiku",
	"openai/gpt-4o",
	"openai/gpt-4o-mini",
	"openai/gpt-4.1",
	"openai/gpt-4.1-mini",
	"openai/o3-mini",
	"google/gemini-2.5-flash",
	"google/gemini-2.5-pro",
	"google/gemini-2.0-flash-001",
	"deepseek/deepseek-chat",
	"deepseek/deepseek-chat-v3.1",
	"deepseek/deepseek-r1",
	"meta-llama/llama-3.3-70b-instruct",
	"x-ai/grok-3",
	"mistralai/mistral-large-2411",
	"qwen/qwen-2.5-72b-instruct",
]);

// Provider priority for sorting
export const PROVIDER_PRIORITY = [
	"anthropic",
	"openai",
	"google",
	"deepseek",
	"meta-llama",
	"x-ai",
	"mistralai",
	"qwen",
	"cohere",
	"perplexity",
];

// ============================================================================
// Fallback models (shown when API is unavailable)
// ============================================================================

export function getFallbackModels(): Array<Model> {
	return [
		{
			id: "anthropic/claude-3.5-sonnet",
			name: "Claude 3.5 Sonnet",
			provider: "Anthropic",
			modelName: "Claude",
			providerId: "anthropic",
			logoId: "anthropic",
			family: "Claude 3.5",
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
			isPopular: true,
		},
		{
			id: "openai/gpt-4o-mini",
			name: "GPT-4o Mini",
			provider: "OpenAI",
			modelName: "GPT",
			providerId: "openai",
			logoId: "openai",
			family: "GPT-4o",
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
			isPopular: true,
		},
		{
			id: "deepseek/deepseek-chat",
			name: "DeepSeek Chat",
			provider: "DeepSeek",
			modelName: "DeepSeek",
			providerId: "deepseek",
			logoId: "deepseek",
			family: "DeepSeek",
			isPopular: true,
		},
		{
			id: "meta-llama/llama-3.3-70b-instruct",
			name: "Llama 3.3 70B",
			provider: "Meta Llama",
			modelName: "Llama",
			providerId: "meta-llama",
			logoId: "llama",
			family: "Llama 3.3",
			isPopular: true,
		},
	];
}
