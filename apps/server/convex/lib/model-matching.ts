export interface AAModel {
	slug: string;
	model_creator: {
		slug: string;
		name: string;
	};
	evaluations: Record<string, number | null>;
}

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

export const MANUAL_OVERRIDES: Record<string, string> = {
	"claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
	"claude-3-7-sonnet": "anthropic/claude-3.7-sonnet",
	"claude-3-5-haiku": "anthropic/claude-3.5-haiku",
	"claude-sonnet-4": "anthropic/claude-sonnet-4",
	"deepseek-v3": "deepseek/deepseek-chat",
	"deepseek-v3-0324": "deepseek/deepseek-chat-v3.1",
	"deepseek-r1": "deepseek/deepseek-r1",
	"llama-3-3-70b": "meta-llama/llama-3.3-70b-instruct",
	"gpt-4o": "openai/gpt-4o",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"o3-mini": "openai/o3-mini",
	"grok-3": "x-ai/grok-3",
	"mistral-large-2411": "mistralai/mistral-large-2411",
	"qwen-2-5-72b-instruct": "qwen/qwen-2.5-72b-instruct",
	"gemini-2-5-flash": "google/gemini-2.5-flash",
	"gemini-2-5-pro": "google/gemini-2.5-pro",
	"gemini-2-0-flash": "google/gemini-2.0-flash-001",
	"gpt-4-1": "openai/gpt-4.1",
	"gpt-4-1-mini": "openai/gpt-4.1-mini",
};

function normalizeModelId(modelId: string): string {
	const [creatorSlug = "", modelSlug = ""] = modelId.split("/");
	return `${normalizeSlug(creatorSlug)}/${normalizeSlug(modelSlug)}`;
}

function canonicalizeSlug(slug: string): string {
	return slug
		.toLowerCase()
		.trim()
		.replace(/[._\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function matchAAtoOpenRouterWithIds(
	aaSlug: string,
	aaCreatorSlug: string,
	openRouterIds: Set<string>,
): string | null {
	const manualOverride = MANUAL_OVERRIDES[canonicalizeSlug(aaSlug)];
	if (manualOverride && openRouterIds.has(manualOverride)) {
		return manualOverride;
	}

	const exactMatch = `${aaCreatorSlug.toLowerCase()}/${aaSlug.toLowerCase()}`;
	if (openRouterIds.has(exactMatch)) {
		return exactMatch;
	}

	const normalizedMatch = `${normalizeSlug(aaCreatorSlug)}/${normalizeSlug(aaSlug)}`;
	for (const openRouterId of openRouterIds) {
		if (normalizeModelId(openRouterId) === normalizedMatch) {
			return openRouterId;
		}
	}

	return null;
}

export function normalizeSlug(slug: string): string {
	const normalized = canonicalizeSlug(slug);
	return normalized.replace(/(?:-\d{3,4})+$/, "");
}

export function matchAAtoOpenRouter(aaSlug: string, aaCreatorSlug: string): string | null {
	return matchAAtoOpenRouterWithIds(aaSlug, aaCreatorSlug, POPULAR_MODEL_IDS);
}

export function buildMatchingMap(
	aaModels: AAModel[],
	openRouterIds: string[],
): Map<string, string> {
	const matchingMap = new Map<string, string>();
	const openRouterIdsSet = new Set(openRouterIds);

	for (const model of aaModels) {
		const matchedOpenRouterId = matchAAtoOpenRouterWithIds(
			model.slug,
			model.model_creator.slug,
			openRouterIdsSet,
		);

		if (matchedOpenRouterId) {
			matchingMap.set(model.slug, matchedOpenRouterId);
		}
	}

	return matchingMap;
}
