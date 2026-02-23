import { describe, expect, test } from "vitest";
import {
	createStreamState,
	usageFromLanguageModelUsage,
	parseToolInput,
	isWebSearchToolName,
	truncateText,
	compactWebSearchOutput,
	searchOutputToContext,
	extractRequestedSearchCount,
	normalizeSearchPrompt,
	buildSearchQueries,
	upsertReasoningPart,
	upsertToolPart,
	getThinkingTimeMs,
	getThinkingTimeSec,
	getReasoningTokenCount,
	getToolMetrics,
	getPersistableChainOfThoughtParts,
	buildOpenRouterOptions,
	UPDATE_INTERVAL,
	MAX_SEARCH_RESULTS_FOR_MODEL,
	MAX_SEARCH_SNIPPET_CHARS,
	MAX_SEARCH_CONTEXT_CHARS,
	MAX_COMBINED_SEARCH_CONTEXT_CHARS,
	MAX_PREFETCH_SEARCHES,
} from "./streamUtils";



// ─── Constants ───────────────────────────────────────────────────────────────

describe("exported constants", () => {
	test("UPDATE_INTERVAL is 5", () => {
		expect(UPDATE_INTERVAL).toBe(5);
	});
	test("MAX_SEARCH_RESULTS_FOR_MODEL is 5", () => {
		expect(MAX_SEARCH_RESULTS_FOR_MODEL).toBe(5);
	});
	test("MAX_SEARCH_SNIPPET_CHARS is 1000", () => {
		expect(MAX_SEARCH_SNIPPET_CHARS).toBe(1000);
	});
	test("MAX_SEARCH_CONTEXT_CHARS is 8000", () => {
		expect(MAX_SEARCH_CONTEXT_CHARS).toBe(8000);
	});
	test("MAX_COMBINED_SEARCH_CONTEXT_CHARS is 12000", () => {
		expect(MAX_COMBINED_SEARCH_CONTEXT_CHARS).toBe(12000);
	});
	test("MAX_PREFETCH_SEARCHES is 5", () => {
		expect(MAX_PREFETCH_SEARCHES).toBe(5);
	});
});

// ─── createStreamState ───────────────────────────────────────────────────────

describe("createStreamState", () => {
	test("returns state with all expected fields initialised", () => {
		const state = createStreamState();
		expect(state.chainOfThoughtParts).toEqual([]);
		expect(state.reasoningPartById).toBeInstanceOf(Map);
		expect(state.toolPartById).toBeInstanceOf(Map);
		expect(state.toolInputBufferById).toBeInstanceOf(Map);
		expect(state.partOrder).toBe(0);
		expect(state.fullContent).toBe("");
		expect(state.fullReasoning).toBe("");
		expect(state.reasoningChunkCount).toBe(0);
		expect(state.reasoningStartTime).toBeNull();
		expect(state.reasoningEndTime).toBeNull();
		expect(state.streamCompletedTime).toBeNull();
		expect(state.firstTextDeltaTime).toBeNull();
		expect(state.pendingUpdateCounter).toBe(0);
		expect(state.usageSummary).toBeNull();
	});

	test("each call returns an independent state object", () => {
		const a = createStreamState();
		const b = createStreamState();
		a.fullContent = "hello";
		expect(b.fullContent).toBe("");
	});
});

// ─── usageFromLanguageModelUsage ─────────────────────────────────────────────

describe("usageFromLanguageModelUsage", () => {
	test("maps explicit tokens", () => {
		const result = usageFromLanguageModelUsage({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
			reasoningTokens: 20,
		});
		expect(result.promptTokens).toBe(100);
		expect(result.completionTokens).toBe(50);
		expect(result.totalTokens).toBe(150);
		expect(result.reasoningTokens).toBe(20);
	});

	test("falls back to outputTokenDetails.reasoning", () => {
		const result = usageFromLanguageModelUsage({
			inputTokens: 10,
			outputTokens: 5,
			outputTokenDetails: { reasoning: 3 },
		});
		expect(result.reasoningTokens).toBe(3);
	});

	test("falls back to outputTokenDetails.reasoningTokens", () => {
		const result = usageFromLanguageModelUsage({
			inputTokens: 10,
			outputTokens: 5,
			outputTokenDetails: { reasoningTokens: 7 },
		});
		expect(result.reasoningTokens).toBe(7);
	});

	test("uses normalised raw when present", () => {
		const result = usageFromLanguageModelUsage({
			raw: {
				prompt_tokens: 200,
				completion_tokens: 100,
				total_tokens: 300,
			},
		});
		expect(result.promptTokens).toBe(200);
		expect(result.completionTokens).toBe(100);
		expect(result.totalTokens).toBe(300);
	});

	test("explicit values take precedence over raw", () => {
		const result = usageFromLanguageModelUsage({
			inputTokens: 42,
			outputTokens: 13,
			raw: { prompt_tokens: 999, completion_tokens: 999 },
		});
		expect(result.promptTokens).toBe(42);
		expect(result.completionTokens).toBe(13);
	});

	test("handles undefined / missing fields gracefully", () => {
		const result = usageFromLanguageModelUsage({});
		expect(result.promptTokens).toBeUndefined();
		expect(result.completionTokens).toBeUndefined();
		expect(result.totalTokens).toBeUndefined();
		expect(result.reasoningTokens).toBeUndefined();
	});

	test("ignores non-object raw value", () => {
		const result = usageFromLanguageModelUsage({ raw: "string" });
		expect(result.promptTokens).toBeUndefined();
	});
});

// ─── parseToolInput ───────────────────────────────────────────────────────────

describe("parseToolInput", () => {
	test("returns undefined for undefined input", () => {
		expect(parseToolInput(undefined)).toBeUndefined();
	});

	test("returns undefined for empty string", () => {
		expect(parseToolInput("")).toBeUndefined();
	});

	test("returns undefined for whitespace-only string", () => {
		expect(parseToolInput("   ")).toBeUndefined();
	});

	test("parses valid JSON object", () => {
		expect(parseToolInput('{"key":"value"}')).toEqual({ key: "value" });
	});

	test("parses valid JSON array", () => {
		expect(parseToolInput("[1,2,3]")).toEqual([1, 2, 3]);
	});

	test("returns raw string for invalid JSON", () => {
		expect(parseToolInput("not json")).toBe("not json");
	});

	test("parses nested JSON", () => {
		expect(parseToolInput('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
	});
});

// ─── isWebSearchToolName ──────────────────────────────────────────────────────

describe("isWebSearchToolName", () => {
	test("returns false for undefined", () => {
		expect(isWebSearchToolName(undefined)).toBe(false);
	});

	test("returns false for empty string", () => {
		expect(isWebSearchToolName("")).toBe(false);
	});

	test("returns true for 'webSearch'", () => {
		expect(isWebSearchToolName("webSearch")).toBe(true);
	});

	test("returns true for 'websearch' (lowercase)", () => {
		expect(isWebSearchToolName("websearch")).toBe(true);
	});

	test("returns true for 'WEBSEARCH' (uppercase)", () => {
		expect(isWebSearchToolName("WEBSEARCH")).toBe(true);
	});

	test("returns true for 'web_search'", () => {
		expect(isWebSearchToolName("web_search")).toBe(true);
	});

	test("returns true for 'WEB_SEARCH'", () => {
		expect(isWebSearchToolName("WEB_SEARCH")).toBe(true);
	});

	test("returns false for unrelated tool names", () => {
		expect(isWebSearchToolName("calculator")).toBe(false);
		expect(isWebSearchToolName("code_interpreter")).toBe(false);
	});
});

// ─── truncateText ─────────────────────────────────────────────────────────────

describe("truncateText", () => {
	test("returns original string when within limit", () => {
		expect(truncateText("hello", 10)).toBe("hello");
	});

	test("returns original string at exact limit", () => {
		expect(truncateText("hello", 5)).toBe("hello");
	});

	test("truncates and appends ellipsis when over limit", () => {
		const result = truncateText("hello world", 8);
		expect(result.endsWith("...")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(10);
	});

	test("truncates empty string correctly", () => {
		expect(truncateText("", 5)).toBe("");
	});

	test("handles maxChars of 1", () => {
		const result = truncateText("abcde", 1);
		// slice(0, 0) + "..." → "..."
		expect(result).toBe("...");
	});

	test("handles maxChars of 3 — slices 2 chars then appends ellipsis", () => {
		const result = truncateText("abcde", 3);
		expect(result).toBe("ab...");
	});
});

// ─── compactWebSearchOutput ───────────────────────────────────────────────────

describe("compactWebSearchOutput", () => {
	test("returns non-object output as-is", () => {
		expect(compactWebSearchOutput(null)).toBeNull();
		expect(compactWebSearchOutput("string")).toBe("string");
		expect(compactWebSearchOutput(42)).toBe(42);
	});

	test("returns object without results array as-is", () => {
		const input = { query: "test", success: true };
		expect(compactWebSearchOutput(input)).toEqual(input);
	});

	test("compacts results array", () => {
		const input = {
			success: true,
			query: "climate change",
			results: [
				{
					title: "Result 1",
					url: "https://example.com",
					description: "A description",
					source: "example",
					publication_date: "2024-01-01",
				},
			],
		};
		const output = compactWebSearchOutput(input) as Record<string, unknown>;
		expect(output.success).toBe(true);
		expect(output.query).toBe("climate change");
		const results = output.results as Record<string, unknown>[];
		expect(results).toHaveLength(1);
		expect(results[0]!.title).toBe("Result 1");
		expect(results[0]!.url).toBe("https://example.com");
		expect(results[0]!.snippet).toBeDefined();
	});

	test("uses content field as fallback for description", () => {
		const input = {
			results: [{ title: "T", url: "u", content: "content fallback" }],
		};
		const output = compactWebSearchOutput(input) as Record<string, unknown>;
		const results = output.results as Record<string, unknown>[];
		expect(results[0]!.snippet).toBe("content fallback");
	});

	test("limits results to MAX_SEARCH_RESULTS_FOR_MODEL (5)", () => {
		const results = Array.from({ length: 10 }, (_, i) => ({
			title: `Result ${i}`,
			url: `https://example${i}.com`,
			description: `Description ${i}`,
		}));
		const output = compactWebSearchOutput({ results }) as Record<string, unknown>;
		expect((output.results as unknown[]).length).toBe(5);
	});

	test("filters out null items in results", () => {
		const input = {
			results: [null, { title: "Valid", url: "https://v.com", description: "desc" }, null],
		};
		const output = compactWebSearchOutput(input) as Record<string, unknown>;
		expect((output.results as unknown[]).length).toBe(1);
	});

	test("handles missing fields gracefully", () => {
		const input = { results: [{}] };
		const output = compactWebSearchOutput(input) as Record<string, unknown>;
		const results = output.results as Record<string, unknown>[];
		expect(results[0]!.title).toBeUndefined();
		expect(results[0]!.url).toBeUndefined();
		expect(results[0]!.snippet).toBeUndefined();
	});
});

// ─── searchOutputToContext ─────────────────────────────────────────────────────

describe("searchOutputToContext", () => {
	test("returns empty string for non-object input", () => {
		expect(searchOutputToContext(null)).toBe("");
		expect(searchOutputToContext("string")).toBe("");
	});

	test("returns query header even when results array is absent", () => {
		const result = searchOutputToContext({ query: "test" });
		expect(result).toContain("test");
	});

	test("includes query in output", () => {
		const result = searchOutputToContext({
			query: "climate change",
			results: [],
		});
		expect(result).toContain("climate change");
	});

	test("formats results correctly", () => {
		const result = searchOutputToContext({
			query: "test query",
			results: [
				{ title: "Article 1", url: "https://a.com", snippet: "snippet text" },
			],
		});
		expect(result).toContain("Article 1");
		expect(result).toContain("https://a.com");
		expect(result).toContain("snippet text");
		expect(result).toContain("1.");
	});

	test("handles missing url gracefully", () => {
		const result = searchOutputToContext({
			results: [{ title: "Title", snippet: "text" }],
		});
		expect(result).toContain("Title");
		expect(result).not.toContain("(undefined)");
	});

	test("handles multiple results", () => {
		const result = searchOutputToContext({
			results: [
				{ title: "A", url: "https://a.com", snippet: "snap A" },
				{ title: "B", url: "https://b.com", snippet: "snap B" },
			],
		});
		expect(result).toContain("1.");
		expect(result).toContain("2.");
	});

	test("skips null/non-object items in results", () => {
		const result = searchOutputToContext({
			results: [null, { title: "Valid", url: "https://v.com", snippet: "text" }],
		});
		expect(result).toContain("Valid");
	});
});

// ─── extractRequestedSearchCount ─────────────────────────────────────────────

describe("extractRequestedSearchCount", () => {
	test("returns 1 for plain messages", () => {
		expect(extractRequestedSearchCount("what is the weather")).toBe(1);
	});

	test("extracts numeric digit before 'searches'", () => {
		expect(extractRequestedSearchCount("do 3 searches about climate")).toBe(3);
	});

	test("extracts numeric digit before 'search'", () => {
		expect(extractRequestedSearchCount("run 2 search about AI")).toBe(2);
	});

	test("extracts word 'one'", () => {
		expect(extractRequestedSearchCount("one search about cats")).toBe(1);
	});

	test("extracts word 'two'", () => {
		expect(extractRequestedSearchCount("two searches about dogs")).toBe(2);
	});

	test("extracts word 'three'", () => {
		expect(extractRequestedSearchCount("three searches")).toBe(3);
	});

	test("extracts word 'four'", () => {
		expect(extractRequestedSearchCount("four searches")).toBe(4);
	});

	test("extracts word 'five'", () => {
		expect(extractRequestedSearchCount("five searches")).toBe(5);
	});

	test("caps at MAX_PREFETCH_SEARCHES (5)", () => {
		expect(extractRequestedSearchCount("do 99 searches")).toBe(5);
	});

	test("returns 1 for zero or invalid count", () => {
		// Regex won't match zero as it requires > 0
		expect(extractRequestedSearchCount("do 0 searches")).toBe(1);
	});
});

// ─── normalizeSearchPrompt ────────────────────────────────────────────────────

describe("normalizeSearchPrompt", () => {
	test("strips 'search the web'", () => {
		const result = normalizeSearchPrompt("search the web for climate change");
		expect(result.toLowerCase()).not.toContain("search the web");
		expect(result).toContain("climate change");
	});

	test("strips 'please' and 'can you'", () => {
		const result = normalizeSearchPrompt("please can you find quantum computing");
		expect(result.toLowerCase()).not.toContain("please");
		expect(result.toLowerCase()).not.toContain("can you");
	});

	test("strips leading/trailing punctuation", () => {
		const result = normalizeSearchPrompt(", find dogs ,");
		expect(result.startsWith(",")).toBe(false);
		expect(result.endsWith(",")).toBe(false);
	});

	test("returns trimmed original message when result would be empty", () => {
		// If all content is stripped, returns original
		const msg = "search the web";
		const result = normalizeSearchPrompt(msg);
		expect(result.length).toBeGreaterThan(0);
	});

	test("handles repeated whitespace", () => {
		const result = normalizeSearchPrompt("find   climate   change");
		expect(result).not.toContain("  ");
	});
});

// ─── buildSearchQueries ───────────────────────────────────────────────────────

describe("buildSearchQueries", () => {
	test("returns at least one query", () => {
		const queries = buildSearchQueries("climate change", 1);
		expect(queries.length).toBeGreaterThanOrEqual(1);
	});

	test("first query is the normalised base", () => {
		const queries = buildSearchQueries("what is AI", 1);
		expect(queries[0]).toBeTruthy();
	});

	test("returns exactly count queries when possible", () => {
		const queries = buildSearchQueries("machine learning trends", 3);
		expect(queries.length).toBe(3);
	});

	test("caps at MAX_PREFETCH_SEARCHES (5)", () => {
		const queries = buildSearchQueries("topic", 10);
		expect(queries.length).toBeLessThanOrEqual(5);
	});

	test("does not return duplicate queries", () => {
		const queries = buildSearchQueries("AI overview", 3);
		const unique = new Set(queries.map((q) => q.toLowerCase()));
		expect(unique.size).toBe(queries.length);
	});

	test("handles multi-part message with 'and'", () => {
		const queries = buildSearchQueries("cats and dogs", 2);
		expect(queries.length).toBeGreaterThanOrEqual(1);
	});
});

// ─── upsertReasoningPart ──────────────────────────────────────────────────────

describe("upsertReasoningPart", () => {
	test("creates new reasoning part on first call", () => {
		const state = createStreamState();
		const part = upsertReasoningPart(state, "r1");
		expect(part.type).toBe("reasoning");
		expect(part.state).toBe("streaming");
		expect(part.text).toBe("");
		expect(state.chainOfThoughtParts).toHaveLength(1);
	});

	test("returns existing part on second call with same id", () => {
		const state = createStreamState();
		const a = upsertReasoningPart(state, "r1");
		a.text = "partial";
		const b = upsertReasoningPart(state, "r1");
		expect(b.text).toBe("partial");
		expect(state.chainOfThoughtParts).toHaveLength(1);
	});

	test("increments partOrder for new parts", () => {
		const state = createStreamState();
		const a = upsertReasoningPart(state, "r1");
		const b = upsertReasoningPart(state, "r2");
		expect(b.index).toBeGreaterThan(a.index);
	});

	test("stores reference in reasoningPartById map", () => {
		const state = createStreamState();
		upsertReasoningPart(state, "rX");
		expect(state.reasoningPartById.has("rX")).toBe(true);
	});
});

// ─── upsertToolPart ───────────────────────────────────────────────────────────

describe("upsertToolPart", () => {
	test("creates new tool part on first call", () => {
		const state = createStreamState();
		const part = upsertToolPart(state, "tc1", "calculator");
		expect(part.type).toBe("tool");
		expect(part.toolCallId).toBe("tc1");
		expect(part.toolName).toBe("calculator");
		expect(part.state).toBe("input-streaming");
	});

	test("returns existing part on second call with same id", () => {
		const state = createStreamState();
		const a = upsertToolPart(state, "tc1", "calculator");
		a.input = { expr: "2+2" };
		const b = upsertToolPart(state, "tc1");
		expect(b.input).toEqual({ expr: "2+2" });
		expect(state.chainOfThoughtParts).toHaveLength(1);
	});

	test("updates toolName on existing part when provided", () => {
		const state = createStreamState();
		upsertToolPart(state, "tc1");
		const part = upsertToolPart(state, "tc1", "webSearch");
		expect(part.toolName).toBe("webSearch");
	});

	test("does not overwrite toolName when not provided", () => {
		const state = createStreamState();
		upsertToolPart(state, "tc1", "webSearch");
		const part = upsertToolPart(state, "tc1");
		expect(part.toolName).toBe("webSearch");
	});

	test("stores reference in toolPartById map", () => {
		const state = createStreamState();
		upsertToolPart(state, "tcX", "search");
		expect(state.toolPartById.has("tcX")).toBe(true);
	});

	test("multiple tools can coexist", () => {
		const state = createStreamState();
		upsertToolPart(state, "tc1", "calc");
		upsertToolPart(state, "tc2", "search");
		expect(state.chainOfThoughtParts).toHaveLength(2);
	});
});

// ─── getThinkingTimeMs ────────────────────────────────────────────────────────

describe("getThinkingTimeMs", () => {
	test("returns undefined when no reasoning start time", () => {
		const state = createStreamState();
		expect(getThinkingTimeMs(state)).toBeUndefined();
	});

	test("uses reasoningEndTime when available", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.reasoningEndTime = 2500;
		expect(getThinkingTimeMs(state)).toBe(1500);
	});

	test("uses streamCompletedTime when reasoningEndTime is null", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.streamCompletedTime = 3000;
		expect(getThinkingTimeMs(state)).toBe(2000);
	});

	test("falls back to Date.now() when both end times are null", () => {
		const state = createStreamState();
		state.reasoningStartTime = Date.now() - 500;
		const result = getThinkingTimeMs(state);
		expect(result).toBeGreaterThanOrEqual(0);
	});

	test("returns 0 (not negative) for invalid times", () => {
		const state = createStreamState();
		state.reasoningStartTime = 2000;
		state.reasoningEndTime = 1000; // end before start
		expect(getThinkingTimeMs(state)).toBe(0);
	});
});

// ─── getThinkingTimeSec ───────────────────────────────────────────────────────

describe("getThinkingTimeSec", () => {
	test("returns undefined when no reasoning start time", () => {
		const state = createStreamState();
		expect(getThinkingTimeSec(state)).toBeUndefined();
	});

	test("returns 0 when ms is 0", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.reasoningEndTime = 1000;
		expect(getThinkingTimeSec(state)).toBe(0);
	});

	test("rounds up to at least 1 second", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.reasoningEndTime = 1500; // 500ms
		expect(getThinkingTimeSec(state)).toBe(1);
	});

	test("rounds up for non-integer seconds (2.1s → 3)", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.reasoningEndTime = 3100;
		expect(getThinkingTimeSec(state)).toBe(3);
	});

	test("returns exact seconds for whole-number durations (5s)", () => {
		const state = createStreamState();
		state.reasoningStartTime = 1000;
		state.reasoningEndTime = 6000;
		expect(getThinkingTimeSec(state)).toBe(5);
	});
});

// ─── getReasoningTokenCount ───────────────────────────────────────────────────

describe("getReasoningTokenCount", () => {
	test("returns 0 when no usage and reasoning requested", () => {
		const state = createStreamState();
		expect(getReasoningTokenCount(state, true)).toBe(0);
	});

	test("returns undefined when no usage and reasoning not requested", () => {
		const state = createStreamState();
		expect(getReasoningTokenCount(state, false)).toBeUndefined();
	});

	test("returns reasoningTokens from usage when present", () => {
		const state = createStreamState();
		state.usageSummary = {
			promptTokens: 100,
			completionTokens: 50,
			totalTokens: 150,
			reasoningTokens: 25,
		};
		expect(getReasoningTokenCount(state, true)).toBe(25);
	});

	test("returns 0 when usage exists but no reasoningTokens and reasoning requested", () => {
		const state = createStreamState();
		state.usageSummary = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
		expect(getReasoningTokenCount(state, true)).toBe(0);
	});

	test("returns undefined when usage exists but no reasoningTokens and reasoning not requested", () => {
		const state = createStreamState();
		state.usageSummary = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
		expect(getReasoningTokenCount(state, false)).toBeUndefined();
	});
});

// ─── getToolMetrics ───────────────────────────────────────────────────────────

describe("getToolMetrics", () => {
	test("returns zeros for empty state", () => {
		const state = createStreamState();
		const metrics = getToolMetrics(state);
		expect(metrics.toolCallCount).toBe(0);
		expect(metrics.webSearchCallCount).toBe(0);
		expect(metrics.webSearchUsed).toBe(false);
	});

	test("counts tool parts", () => {
		const state = createStreamState();
		upsertToolPart(state, "tc1", "calculator");
		upsertToolPart(state, "tc2", "calculator");
		const metrics = getToolMetrics(state);
		expect(metrics.toolCallCount).toBe(2);
	});

	test("counts web search calls with output-available state", () => {
		const state = createStreamState();
		const part = upsertToolPart(state, "ws1", "webSearch");
		part.state = "output-available";
		const metrics = getToolMetrics(state);
		expect(metrics.webSearchCallCount).toBe(1);
		expect(metrics.webSearchUsed).toBe(true);
	});

	test("does not count web search with non-completed state", () => {
		const state = createStreamState();
		const part = upsertToolPart(state, "ws1", "webSearch");
		part.state = "output-error";
		const metrics = getToolMetrics(state);
		expect(metrics.webSearchCallCount).toBe(0);
		expect(metrics.webSearchUsed).toBe(false);
	});

	test("does not count reasoning parts as tool calls", () => {
		const state = createStreamState();
		upsertReasoningPart(state, "r1");
		const metrics = getToolMetrics(state);
		expect(metrics.toolCallCount).toBe(0);
	});

	test("counts multiple web searches", () => {
		const state = createStreamState();
		const ws1 = upsertToolPart(state, "ws1", "webSearch");
		ws1.state = "output-available";
		const ws2 = upsertToolPart(state, "ws2", "web_search");
		ws2.state = "output-available";
		const metrics = getToolMetrics(state);
		expect(metrics.webSearchCallCount).toBe(2);
	});
});

// ─── getPersistableChainOfThoughtParts ───────────────────────────────────────

describe("getPersistableChainOfThoughtParts", () => {
	test("returns undefined for empty chain", () => {
		const state = createStreamState();
		expect(getPersistableChainOfThoughtParts(state, true)).toBeUndefined();
	});

	test("returns all parts when reasoning requested", () => {
		const state = createStreamState();
		upsertReasoningPart(state, "r1");
		upsertToolPart(state, "tc1", "calc");
		const parts = getPersistableChainOfThoughtParts(state, true);
		expect(parts).toHaveLength(2);
	});

	test("filters out reasoning parts when reasoning not requested", () => {
		const state = createStreamState();
		upsertReasoningPart(state, "r1");
		upsertToolPart(state, "tc1", "calc");
		const parts = getPersistableChainOfThoughtParts(state, false);
		expect(parts).toHaveLength(1);
		expect(parts![0]!.type).toBe("tool");
	});

	test("returns undefined when only reasoning parts exist and reasoning not requested", () => {
		const state = createStreamState();
		upsertReasoningPart(state, "r1");
		const parts = getPersistableChainOfThoughtParts(state, false);
		expect(parts).toBeUndefined();
	});
});

// ─── buildOpenRouterOptions ───────────────────────────────────────────────────

describe("buildOpenRouterOptions", () => {
	test("returns include_reasoning: false when not requested", () => {
		const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(false, "openai/gpt-4o");
		expect(openRouterOptions.include_reasoning).toBe(false);
		expect((openRouterOptions.reasoning as Record<string, unknown>).exclude).toBe(true);
		expect(maxOutputTokens).toBeUndefined();
	});

	test("returns effort config for non-always-reasoning, non-anthropic models", () => {
		const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(
			true,
			"openai/o1",
			"medium",
		);
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.effort).toBe("medium");
		expect(maxOutputTokens).toBe(16384);
	});

	test("returns effort 'medium' by default", () => {
		const { openRouterOptions } = buildOpenRouterOptions(true, "openai/o1");
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.effort).toBe("medium");
	});

	test("returns effort 'low' when specified", () => {
		const { openRouterOptions } = buildOpenRouterOptions(true, "openai/o1", "low");
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.effort).toBe("low");
	});

	test("handles DeepSeek R1 (always reasoning) — no effort param", () => {
		const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(
			true,
			"deepseek/deepseek-r1",
			"high",
		);
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.effort).toBeUndefined();
		expect(maxOutputTokens).toBe(16384);
	});

	test("handles Anthropic model — uses max_tokens budget", () => {
		const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(
			true,
			"anthropic/claude-3-7-sonnet",
			"low",
		);
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.max_tokens).toBe(4096);
		expect(reasoning.effort).toBeUndefined();
		expect(maxOutputTokens).toBe(4096 + 8192);
	});

	test("handles Google model — uses max_tokens budget", () => {
		const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(
			true,
			"google/gemini-2.0-flash-thinking",
			"high",
		);
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.max_tokens).toBe(20000);
		expect(maxOutputTokens).toBe(20000 + 8192);
	});

	test("always includes provider and usage in options", () => {
		const { openRouterOptions } = buildOpenRouterOptions(false, "openai/gpt-4o");
		expect(openRouterOptions.provider).toBeDefined();
		expect(openRouterOptions.usage).toBeDefined();
	});

	test("exclude is false when reasoning is requested", () => {
		const { openRouterOptions } = buildOpenRouterOptions(true, "openai/o1");
		const reasoning = openRouterOptions.reasoning as Record<string, unknown>;
		expect(reasoning.exclude).toBe(false);
	});
});
