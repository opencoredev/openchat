import { normalizeUsagePayload } from "./lib/billingUtils";
import type { UsagePayload } from "./lib/billingUtils";

export type { UsagePayload };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SEARCH_RESULTS_FOR_MODEL = 5;
export const MAX_SEARCH_SNIPPET_CHARS = 1000;
export const MAX_SEARCH_CONTEXT_CHARS = 8000;
export const MAX_COMBINED_SEARCH_CONTEXT_CHARS = 12000;
export const MAX_PREFETCH_SEARCHES = 5;

// ---------------------------------------------------------------------------
// Usage helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function parseToolInput(rawInput: string | undefined): unknown {
	if (!rawInput || rawInput.trim().length === 0) return undefined;
	try {
		return JSON.parse(rawInput);
	} catch {
		return rawInput;
	}
}

export function truncateText(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 1))}...`;
}

// ---------------------------------------------------------------------------
// Web search output helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Search query helpers
// ---------------------------------------------------------------------------

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

import type { ChainOfThoughtPart } from "./streamJobs";

export type { ChainOfThoughtPart };

export class StreamStateManager {
	chainOfThoughtParts: ChainOfThoughtPart[] = [];
	fullContent = "";
	fullReasoning = "";
	reasoningChunkCount = 0;
	reasoningStartTime: number | null = null;
	reasoningEndTime: number | null = null;
	firstTextDeltaTime: number | null = null;
	pendingUpdateCounter = 0;
	usageSummary: UsagePayload | null = null;

	private partOrder = 0;
	private reasoningPartById = new Map<string, number>();
	private toolPartById = new Map<string, number>();
	private toolInputBufferById = new Map<string, string>();

	constructor(private readonly reasoningRequested: boolean) {}

	upsertReasoningPart(id: string): ChainOfThoughtPart {
		const existingIndex = this.reasoningPartById.get(id);
		if (existingIndex !== undefined) return this.chainOfThoughtParts[existingIndex]!;
		const newPart: ChainOfThoughtPart = { type: "reasoning", index: this.partOrder++, text: "", state: "streaming" };
		const arrayIndex = this.chainOfThoughtParts.push(newPart) - 1;
		this.reasoningPartById.set(id, arrayIndex);
		return newPart;
	}

	upsertToolPart(toolCallId: string, toolName?: string): ChainOfThoughtPart {
		const existingIndex = this.toolPartById.get(toolCallId);
		if (existingIndex !== undefined) {
			const existing = this.chainOfThoughtParts[existingIndex]!;
			if (toolName) existing.toolName = toolName;
			return existing;
		}
		const newPart: ChainOfThoughtPart = { type: "tool", index: this.partOrder++, toolCallId, toolName, state: "input-streaming" };
		const arrayIndex = this.chainOfThoughtParts.push(newPart) - 1;
		this.toolPartById.set(toolCallId, arrayIndex);
		return newPart;
	}

	processStreamPart(part: { type: string; [key: string]: unknown }): void {
		switch (part.type) {
			case "text-delta": {
				if (this.firstTextDeltaTime === null) this.firstTextDeltaTime = Date.now();
				this.fullContent += part.text as string;
				this.pendingUpdateCounter++;
				break;
			}
			case "reasoning-start": {
				if (!this.reasoningRequested) break;
				const rp = this.upsertReasoningPart(part.id as string);
				rp.state = "streaming";
				this.pendingUpdateCounter++;
				break;
			}
			case "reasoning-delta": {
				if (!this.reasoningRequested) break;
				const rp = this.upsertReasoningPart(part.id as string);
				rp.text = `${rp.text ?? ""}${part.text as string}`;
				rp.state = "streaming";
				this.fullReasoning += part.text as string;
				this.reasoningChunkCount++;
				if (!this.reasoningStartTime) this.reasoningStartTime = Date.now();
				this.reasoningEndTime = Date.now();
				this.pendingUpdateCounter++;
				break;
			}
			case "reasoning-end": {
				if (!this.reasoningRequested) break;
				const rp = this.upsertReasoningPart(part.id as string);
				rp.state = "done";
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-input-start": {
				const tp = this.upsertToolPart(part.id as string, part.toolName as string | undefined);
				tp.state = "input-streaming";
				this.toolInputBufferById.set(part.id as string, "");
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-input-delta": {
				const tp = this.upsertToolPart(part.id as string);
				const prev = this.toolInputBufferById.get(part.id as string) ?? "";
				const next = `${prev}${part.delta as string}`;
				this.toolInputBufferById.set(part.id as string, next);
				tp.input = next;
				tp.state = "input-streaming";
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-input-end": {
				const tp = this.upsertToolPart(part.id as string);
				const parsed = parseToolInput(this.toolInputBufferById.get(part.id as string));
				if (parsed !== undefined) tp.input = parsed;
				if (tp.state !== "output-available" && tp.state !== "output-error") tp.state = "input-available";
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-call": {
				const tp = this.upsertToolPart(part.toolCallId as string, part.toolName as string | undefined);
				tp.toolName = part.toolName as string | undefined;
				tp.toolCallId = part.toolCallId as string;
				tp.input = part.input;
				if (tp.state !== "output-available") tp.state = "input-available";
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-result": {
				const tp = this.upsertToolPart(part.toolCallId as string, part.toolName as string | undefined);
				tp.toolName = part.toolName as string | undefined;
				tp.toolCallId = part.toolCallId as string;
				tp.input = tp.input ?? parseToolInput(this.toolInputBufferById.get(part.toolCallId as string));
				tp.output = part.output;
				tp.state = "output-available";
				this.pendingUpdateCounter++;
				break;
			}
			case "tool-error": {
				const tp = this.upsertToolPart(part.toolCallId as string, part.toolName as string | undefined);
				tp.toolName = part.toolName as string | undefined;
				tp.toolCallId = part.toolCallId as string;
				tp.input = tp.input ?? parseToolInput(this.toolInputBufferById.get(part.toolCallId as string));
				const err = part.error;
				tp.errorText = err instanceof Error ? err.message : typeof err === "string" ? err : "Tool execution failed";
				tp.state = "output-error";
				this.pendingUpdateCounter++;
				break;
			}
			case "finish-step": {
				const usage = part.usage as { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number; outputTokenDetails?: { reasoning?: number; reasoningTokens?: number }; raw?: unknown };
				this.usageSummary = usageFromLanguageModelUsage(usage);
				break;
			}
		}
	}

	getThinkingTimeMs(streamCompletedTime: number | null): number | undefined {
		if (!this.reasoningStartTime) return undefined;
		const end = this.reasoningEndTime ?? streamCompletedTime ?? Date.now();
		return Math.max(0, end - this.reasoningStartTime);
	}

	getThinkingTimeSec(streamCompletedTime: number | null): number | undefined {
		const ms = this.getThinkingTimeMs(streamCompletedTime);
		if (ms === undefined) return undefined;
		if (ms === 0) return 0;
		return Math.max(1, Math.ceil(ms / 1000));
	}

	getReasoningTokenCount(): number | undefined {
		if (!this.usageSummary) return this.reasoningRequested ? 0 : undefined;
		if (typeof this.usageSummary.reasoningTokens === "number") return this.usageSummary.reasoningTokens;
		return this.reasoningRequested ? 0 : undefined;
	}

	getToolMetrics(isWebSearchToolName: (name: string | undefined) => boolean) {
		const toolParts = this.chainOfThoughtParts.filter((p) => p.type === "tool");
		const webSearchCallCount = toolParts.filter((p) => isWebSearchToolName(p.toolName) && p.state === "output-available").length;
		return { toolCallCount: toolParts.length, webSearchCallCount, webSearchUsed: webSearchCallCount > 0 };
	}

	getPersistableChainOfThoughtParts(): ChainOfThoughtPart[] | undefined {
		const parts = this.reasoningRequested
			? this.chainOfThoughtParts
			: this.chainOfThoughtParts.filter((p) => p.type !== "reasoning");
		return parts.length > 0 ? parts : undefined;
	}

	finalizeReasoningParts(): void {
		for (const part of this.chainOfThoughtParts) {
			if (part.type === "reasoning" && part.state === "streaming") {
				part.state = "done";
			}
		}
	}
}

export type OpenRouterOptions = Record<string, unknown>;

export function buildOpenRouterProviderOptions(
	model: string,
	reasoningRequested: boolean,
	reasoningEffort: string | undefined,
	existingOptions?: Record<string, unknown>,
): { openRouterOptions: OpenRouterOptions; maxOutputTokens?: number } {
	const baseOpenRouterOptions = existingOptions ?? {};
	const baseProviderRouting =
		typeof baseOpenRouterOptions.provider === "object" &&
		baseOpenRouterOptions.provider !== null
			? (baseOpenRouterOptions.provider as Record<string, unknown>)
			: {};
	const baseUsageOptions =
		typeof baseOpenRouterOptions.usage === "object" &&
		baseOpenRouterOptions.usage !== null
			? (baseOpenRouterOptions.usage as Record<string, unknown>)
			: {};

	const openRouterOptions: OpenRouterOptions = {
		...baseOpenRouterOptions,
		provider: { ...baseProviderRouting, require_parameters: true },
		usage: { ...baseUsageOptions, include: true },
	};

	let maxOutputTokens: number | undefined;

	if (reasoningRequested) {
		const selectedEffort = (reasoningEffort as "low" | "medium" | "high" | undefined) ?? "medium";
		const isAlwaysReasoning = /deepseek.*r1/i.test(model);
		const isAnthropicOrGemini = /^(anthropic|google)\//i.test(model);
		const effortToMaxTokens: Record<string, number> = { low: 4096, medium: 10000, high: 20000 };
		const reasoningConfig: Record<string, unknown> = { exclude: false };

		if (!isAlwaysReasoning && !isAnthropicOrGemini) {
			reasoningConfig.effort = selectedEffort;
		}

		if (isAnthropicOrGemini) {
			const budgetTokens = effortToMaxTokens[selectedEffort] || 10000;
			reasoningConfig.max_tokens = budgetTokens;
			maxOutputTokens = budgetTokens + 8192;
		} else {
			maxOutputTokens = 16384;
		}

		openRouterOptions.reasoning = reasoningConfig;
	} else {
		openRouterOptions.include_reasoning = false;
		openRouterOptions.reasoning = { exclude: true };
	}

	return { openRouterOptions, maxOutputTokens };
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
