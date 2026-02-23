import { normalizeUsagePayload } from "./lib/billingUtils";
import type { UsagePayload } from "./lib/billingUtils";
import type { JSONValue } from "ai";

export const UPDATE_INTERVAL = 5;
export const MAX_SEARCH_RESULTS_FOR_MODEL = 5;
export const MAX_SEARCH_SNIPPET_CHARS = 1000;
export const MAX_SEARCH_CONTEXT_CHARS = 8000;
export const MAX_COMBINED_SEARCH_CONTEXT_CHARS = 12000;
export const MAX_PREFETCH_SEARCHES = 5;

export type ChainOfThoughtPart = {
	type: "reasoning" | "tool";
	index: number;
	text?: string;
	toolName?: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

export type StreamState = {
	chainOfThoughtParts: ChainOfThoughtPart[];
	reasoningPartById: Map<string, number>;
	toolPartById: Map<string, number>;
	toolInputBufferById: Map<string, string>;
	partOrder: number;
	fullContent: string;
	fullReasoning: string;
	reasoningChunkCount: number;
	reasoningStartTime: number | null;
	reasoningEndTime: number | null;
	streamCompletedTime: number | null;
	firstTextDeltaTime: number | null;
	pendingUpdateCounter: number;
	usageSummary: UsagePayload | null;
};

export function createStreamState(): StreamState {
	return {
		chainOfThoughtParts: [],
		reasoningPartById: new Map(),
		toolPartById: new Map(),
		toolInputBufferById: new Map(),
		partOrder: 0,
		fullContent: "",
		fullReasoning: "",
		reasoningChunkCount: 0,
		reasoningStartTime: null,
		reasoningEndTime: null,
		streamCompletedTime: null,
		firstTextDeltaTime: null,
		pendingUpdateCounter: 0,
		usageSummary: null,
	};
}

export function usageFromLanguageModelUsage(usage: {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
	outputTokenDetails?: {
		reasoning?: number;
		reasoningTokens?: number;
	};
	raw?: unknown;
}): UsagePayload {
	const normalizedRaw =
		usage.raw && typeof usage.raw === "object"
			? normalizeUsagePayload(usage.raw as Record<string, unknown>)
			: null;

	return {
		promptTokens: usage.inputTokens ?? normalizedRaw?.promptTokens,
		completionTokens: usage.outputTokens ?? normalizedRaw?.completionTokens,
		totalTokens: usage.totalTokens ?? normalizedRaw?.totalTokens,
		totalCostUsd: normalizedRaw?.totalCostUsd,
		reasoningTokens:
			usage.reasoningTokens ??
			usage.outputTokenDetails?.reasoningTokens ??
			usage.outputTokenDetails?.reasoning ??
			normalizedRaw?.reasoningTokens,
	};
}

export function parseToolInput(rawInput: string | undefined): unknown {
	if (!rawInput || rawInput.trim().length === 0) return undefined;
	try {
		return JSON.parse(rawInput);
	} catch {
		return rawInput;
	}
}

export function isWebSearchToolName(toolName: string | undefined): boolean {
	if (!toolName) return false;
	const normalized = toolName.toLowerCase();
	return normalized === "websearch" || normalized === "web_search";
}

export function truncateText(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 1))}...`;
}

export function compactWebSearchOutput(output: unknown): unknown {
	if (!output || typeof output !== "object") return output;
	const raw = output as Record<string, unknown>;
	const rawResults = Array.isArray(raw.results) ? raw.results : null;
	if (!rawResults) return output;

	const compactResults = rawResults
		.slice(0, MAX_SEARCH_RESULTS_FOR_MODEL)
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const result = item as Record<string, unknown>;
			const title = typeof result.title === "string" ? result.title : undefined;
			const url = typeof result.url === "string" ? result.url : undefined;
			const description =
				typeof result.description === "string"
					? result.description
					: typeof result.content === "string"
						? result.content
						: undefined;
			const snippet = description
				? truncateText(description.replace(/\s+/g, " ").trim(), MAX_SEARCH_SNIPPET_CHARS)
				: undefined;
			return {
				title,
				url,
				snippet,
				source: typeof result.source === "string" ? result.source : undefined,
				publicationDate:
					typeof result.publication_date === "string"
						? result.publication_date
						: undefined,
			};
		})
		.filter((value): value is NonNullable<typeof value> => value !== null);

	return {
		success: raw.success === true,
		query: typeof raw.query === "string" ? raw.query : undefined,
		results: compactResults,
	};
}

export function searchOutputToContext(output: unknown): string {
	if (!output || typeof output !== "object") return "";
	const raw = output as Record<string, unknown>;
	const query = typeof raw.query === "string" ? raw.query : "";
	const results = Array.isArray(raw.results) ? raw.results : [];
	const lines: string[] = [];

	if (query) {
		lines.push(`Query: ${query}`);
	}

	let rank = 1;
	for (const item of results) {
		if (!item || typeof item !== "object") continue;
		const result = item as Record<string, unknown>;
		const title = typeof result.title === "string" ? result.title : "Untitled";
		const url = typeof result.url === "string" ? result.url : "";
		const snippet = typeof result.snippet === "string" ? result.snippet : "";
		lines.push(`${rank}. ${title}${url ? ` (${url})` : ""}`);
		if (snippet) {
			lines.push(`   ${truncateText(snippet.replace(/\s+/g, " ").trim(), 400)}`);
		}
		rank++;
	}

	return truncateText(lines.join("\n"), MAX_SEARCH_CONTEXT_CHARS);
}

export function extractRequestedSearchCount(userMessage: string): number {
	const lower = userMessage.toLowerCase();
	const numeric = lower.match(/\b(\d{1,2})\s*(?:x\s*)?search(?:es)?\b/);
	if (numeric) {
		const parsed = Number.parseInt(numeric[1] ?? "1", 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.min(MAX_PREFETCH_SEARCHES, parsed);
		}
	}

	const wordMap: Record<string, number> = {
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
	};
	for (const [word, value] of Object.entries(wordMap)) {
		if (new RegExp(`\\b${word}\\s+search(?:es)?\\b`, "i").test(lower)) {
			return value;
		}
	}

	return 1;
}

export function normalizeSearchPrompt(userMessage: string): string {
	const stripped = userMessage
		.replace(/\bsearch(?:\s+the)?\s+web\b/gi, " ")
		.replace(/\b(?:please|can you|could you|hey|assistant)\b/gi, " ")
		.replace(/\b(?:do|run|make)\s+\d+\s+search(?:es)?\b/gi, " ")
		.replace(/\b(?:do|run|make)\s+(?:one|two|three|four|five)\s+search(?:es)?\b/gi, " ")
		.replace(/\b(?:with|using)\s+\d+\s+search(?:es)?\b/gi, " ")
		.replace(/\b(?:with|using)\s+(?:one|two|three|four|five)\s+search(?:es)?\b/gi, " ")
		.replace(/\bsearch(?:es)?\b/gi, " ")
		.replace(/\b(?:do|perform|run)\s+multiple\s+search(?:es)?\b/gi, " ")
		.replace(/\s+/g, " ")
		.replace(/\b(?:and|or|then)\s*$/i, "")
		.replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
		.trim();

	if (stripped.length > 0) return stripped;
	return userMessage.replace(/\s+/g, " ").trim();
}

export function buildSearchQueries(userMessage: string, count: number): string[] {
	const base = normalizeSearchPrompt(userMessage);
	const candidates: string[] = [];
	const seen = new Set<string>();
	const push = (value: string) => {
		const query = value.replace(/\s+/g, " ").trim();
		if (!query) return;
		const key = query.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		candidates.push(query);
	};

	push(base);
	const splitSegments = base
		.split(/\band\b|,|;/gi)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length >= 4);
	for (const segment of splitSegments) {
		push(`${segment} overview`);
	}

	const fallbackVariants = [
		base,
		`${base} overview`,
		`${base} latest research`,
		`${base} expert guide`,
		`${base} facts and examples`,
		`${base} statistics`,
		`${base} best sources`,
	];
	for (const variant of fallbackVariants) {
		push(variant);
	}

	const targetCount = Math.max(1, Math.min(count, MAX_PREFETCH_SEARCHES));
	if (candidates.length < targetCount) {
		for (let i = candidates.length; i < targetCount; i++) {
			push(`${base} topic ${i + 1}`);
		}
	}

	return candidates.slice(0, targetCount);
}

export function upsertReasoningPart(state: StreamState, id: string): ChainOfThoughtPart {
	const existingIndex = state.reasoningPartById.get(id);
	if (existingIndex !== undefined) {
		return state.chainOfThoughtParts[existingIndex]!;
	}

	const newPart: ChainOfThoughtPart = {
		type: "reasoning",
		index: state.partOrder++,
		text: "",
		state: "streaming",
	};
	const arrayIndex = state.chainOfThoughtParts.push(newPart) - 1;
	state.reasoningPartById.set(id, arrayIndex);
	return newPart;
}

export function upsertToolPart(
	state: StreamState,
	toolCallId: string,
	toolName?: string,
): ChainOfThoughtPart {
	const existingIndex = state.toolPartById.get(toolCallId);
	if (existingIndex !== undefined) {
		const existing = state.chainOfThoughtParts[existingIndex]!;
		if (toolName) existing.toolName = toolName;
		return existing;
	}

	const newPart: ChainOfThoughtPart = {
		type: "tool",
		index: state.partOrder++,
		toolCallId,
		toolName,
		state: "input-streaming",
	};
	const arrayIndex = state.chainOfThoughtParts.push(newPart) - 1;
	state.toolPartById.set(toolCallId, arrayIndex);
	return newPart;
}

export function getThinkingTimeMs(state: StreamState): number | undefined {
	if (!state.reasoningStartTime) return undefined;
	const end = state.reasoningEndTime ?? state.streamCompletedTime ?? Date.now();
	return Math.max(0, end - state.reasoningStartTime);
}

export function getThinkingTimeSec(state: StreamState): number | undefined {
	const ms = getThinkingTimeMs(state);
	if (ms === undefined) return undefined;
	if (ms === 0) return 0;
	return Math.max(1, Math.ceil(ms / 1000));
}

export function getReasoningTokenCount(
	state: StreamState,
	reasoningRequested: boolean,
): number | undefined {
	if (!state.usageSummary) return reasoningRequested ? 0 : undefined;
	if (typeof state.usageSummary.reasoningTokens === "number") {
		return state.usageSummary.reasoningTokens;
	}
	return reasoningRequested ? 0 : undefined;
}

export function getToolMetrics(state: StreamState): {
	toolCallCount: number;
	webSearchCallCount: number;
	webSearchUsed: boolean;
} {
	const toolParts = state.chainOfThoughtParts.filter((part) => part.type === "tool");
	const toolBasedWebSearchCallCount = toolParts.filter(
		(part) => isWebSearchToolName(part.toolName) && part.state === "output-available",
	).length;
	return {
		toolCallCount: toolParts.length,
		webSearchCallCount: toolBasedWebSearchCallCount,
		webSearchUsed: toolBasedWebSearchCallCount > 0,
	};
}

export function getPersistableChainOfThoughtParts(
	state: StreamState,
	reasoningRequested: boolean,
): ChainOfThoughtPart[] | undefined {
	const persistedParts = reasoningRequested
		? state.chainOfThoughtParts
		: state.chainOfThoughtParts.filter((part) => part.type !== "reasoning");
	return persistedParts.length > 0 ? persistedParts : undefined;
}

export function buildOpenRouterOptions(
	reasoningRequested: boolean,
	model: string,
	reasoningEffort?: string,
): {
	openRouterOptions: Record<string, JSONValue>;
	maxOutputTokens?: number;
} {
	const baseOptions: Record<string, JSONValue> = {
		provider: { require_parameters: true },
		usage: { include: true },
	};

	if (!reasoningRequested) {
		return {
			openRouterOptions: {
				...baseOptions,
				include_reasoning: false,
				reasoning: { exclude: true },
			},
		};
	}

	const selectedEffort = (reasoningEffort as "low" | "medium" | "high" | undefined) ?? "medium";
	const isAlwaysReasoning = /deepseek.*r1/i.test(model);
	const isAnthropicOrGemini = /^(anthropic|google)\//i.test(model);
	const effortToMaxTokens: Record<string, number> = {
		low: 4096,
		medium: 10000,
		high: 20000,
	};
	const reasoningConfig: Record<string, JSONValue> = { exclude: false };
	let maxOutputTokens: number | undefined;

	// OpenRouter supports effort="none|low|medium|high". When reasoning is requested,
	// pass a concrete effort for models that allow it. Models that always reason (e.g. R1)
	// ignore effort controls, so we only request visible reasoning content.
	// IMPORTANT: OpenRouter rejects payloads that include both `effort` and `max_tokens`.
	// We send exactly one of them.
	if (!isAlwaysReasoning && !isAnthropicOrGemini) {
		reasoningConfig.effort = selectedEffort;
	}

	if (isAnthropicOrGemini) {
		const budgetTokens = effortToMaxTokens[selectedEffort] ?? 10000;
		reasoningConfig.max_tokens = budgetTokens;
		maxOutputTokens = budgetTokens + 8192;
	} else {
		maxOutputTokens = 16384;
	}

	return {
		openRouterOptions: {
			...baseOptions,
			reasoning: reasoningConfig,
		},
		maxOutputTokens,
	};
}
