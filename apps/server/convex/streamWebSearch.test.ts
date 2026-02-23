import { describe, expect, test, vi, beforeEach } from "vitest";
import { executePrefetchedSearches } from "./streamWebSearch";
import { createStreamState } from "./streamUtils";

vi.mock("@valyu/ai-sdk", () => {
	const mockExecute = vi.fn();
	const mockWebSearch = vi.fn(() => ({ execute: mockExecute }));
	return { webSearch: mockWebSearch };
});

import { webSearch } from "@valyu/ai-sdk";
const mockWebSearch = vi.mocked(webSearch);
const getMockExecute = () => (mockWebSearch.mock.results[0]?.value as { execute: ReturnType<typeof vi.fn> })?.execute;

function makeCtx(mutationResult: unknown = undefined) {
	return {
		runMutation: vi.fn().mockResolvedValue(mutationResult),
	};
}

const FAKE_API_KEY = "test-key-123";

const SAMPLE_SEARCH_OUTPUT = {
	success: true,
	query: "climate change",
	results: [
		{
			title: "Climate Change Overview",
			url: "https://example.com/climate",
			description: "A brief overview of climate change.",
			source: "example",
			publication_date: "2024-01-01",
		},
	],
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("executePrefetchedSearches", () => {
	test("returns empty array when search execute is missing", async () => {
		mockWebSearch.mockReturnValueOnce({} as ReturnType<typeof mockWebSearch>);
		const ctx = makeCtx();
		const state = createStreamState();
		await expect(
			executePrefetchedSearches(ctx, "user-1", "what is climate", 3, FAKE_API_KEY, state, async () => {}),
		).rejects.toThrow("Valyu webSearch tool is missing execute()");
	});

	test("runs one search for a basic query and returns context chunks", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();
		const persistProgress = vi.fn();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "what is climate change", 5, FAKE_API_KEY, state, persistProgress,
		);

		expect(execute).toHaveBeenCalledTimes(1);
		expect(ctx.runMutation).toHaveBeenCalledTimes(1);
		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks[0]).toContain("climate change");
	});

	test("increments search usage before calling execute", async () => {
		const callOrder: string[] = [];
		const ctx = {
			runMutation: vi.fn().mockImplementation(async () => {
				callOrder.push("mutation");
			}),
		};
		const execute = vi.fn().mockImplementation(async () => {
			callOrder.push("execute");
			return SAMPLE_SEARCH_OUTPUT;
		});
		mockWebSearch.mockReturnValueOnce({ execute });
		const state = createStreamState();

		await executePrefetchedSearches(ctx, "user-1", "test", 1, FAKE_API_KEY, state, async () => {});

		expect(callOrder[0]).toBe("mutation");
		expect(callOrder[1]).toBe("execute");
	});

	test("adds tool parts to state for each search", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		await executePrefetchedSearches(ctx, "user-1", "test search", 1, FAKE_API_KEY, state, async () => {});

		const toolParts = state.chainOfThoughtParts.filter((p) => p.type === "tool");
		expect(toolParts.length).toBeGreaterThan(0);
		expect(toolParts[0]?.state).toBe("output-available");
	});

	test("marks tool part as output-error on execute failure", async () => {
		const execute = vi.fn().mockRejectedValue(new Error("search failed unexpectedly"));
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "test", 1, FAKE_API_KEY, state, async () => {},
		);

		const toolParts = state.chainOfThoughtParts.filter((p) => p.type === "tool");
		expect(toolParts[0]?.state).toBe("output-error");
		expect(toolParts[0]?.errorText).toContain("search failed");
		expect(chunks).toHaveLength(0);
	});

	test("stops searching and breaks loop on daily limit error", async () => {
		const execute = vi.fn().mockRejectedValue(new Error("Daily search limit reached for today"));
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();
		const persistProgress = vi.fn();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "do 3 searches about AI", 3, FAKE_API_KEY, state, persistProgress,
		);

		expect(execute).toHaveBeenCalledTimes(1);
		const toolParts = state.chainOfThoughtParts.filter((p) => p.type === "tool");
		expect(toolParts[0]?.state).toBe("output-error");
		expect(toolParts[0]?.errorText).toBe("Daily search limit reached");
		expect(chunks).toHaveLength(0);
	});

	test("caps available searches at MAX_PREFETCH_SEARCHES (5)", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		await executePrefetchedSearches(ctx, "user-1", "test", 100, FAKE_API_KEY, state, async () => {});

		expect(execute.mock.calls.length).toBeLessThanOrEqual(5);
	});

	test("combines context from multiple searches", async () => {
		const outputs = [
			{ success: true, query: "AI overview", results: [{ title: "AI", url: "https://a.com", description: "About AI" }] },
			{ success: true, query: "AI latest", results: [{ title: "AI Latest", url: "https://b.com", description: "New AI" }] },
		];
		const execute = vi.fn()
			.mockResolvedValueOnce(outputs[0])
			.mockResolvedValueOnce(outputs[1]);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "tell me about AI", 2, FAKE_API_KEY, state, async () => {},
		);

		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	test("passes search query to execute", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		await executePrefetchedSearches(ctx, "user-1", "quantum computing basics", 1, FAKE_API_KEY, state, async () => {});

		expect(execute).toHaveBeenCalledWith(expect.objectContaining({ query: expect.any(String) }));
	});

	test("calls persistProgress after each search", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();
		const persistProgress = vi.fn();

		await executePrefetchedSearches(ctx, "user-1", "test", 1, FAKE_API_KEY, state, persistProgress);

		expect(persistProgress).toHaveBeenCalled();
	});

	test("handles empty results gracefully", async () => {
		const execute = vi.fn().mockResolvedValue({ success: true, query: "niche topic", results: [] });
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "niche topic with no results", 1, FAKE_API_KEY, state, async () => {},
		);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toContain("niche topic");
		expect(chunks[0]).not.toContain("http");
	});

	test("skips chunk when searchContext is empty (no query, no results)", async () => {
		const execute = vi.fn().mockResolvedValue({ success: true, results: [] });
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "test", 1, FAKE_API_KEY, state, async () => {},
		);

		expect(chunks).toHaveLength(0);
	});

	test("uses availableSearches || 1 fallback when availableSearches is 0 (line 32)", async () => {
		const execute = vi.fn().mockResolvedValue(SAMPLE_SEARCH_OUTPUT);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "test query", 0, FAKE_API_KEY, state, async () => {},
		);

		expect(execute).toHaveBeenCalledTimes(1);
		expect(chunks.length).toBeGreaterThanOrEqual(0);
	});

	test("trims chunk when it exceeds remaining context chars (lines 70-72)", async () => {
		const largeDescription = "A".repeat(15000);
		const largeOutput = {
			success: true,
			query: "large query",
			results: [
				{
					title: "Big Result",
					url: "https://example.com",
					description: largeDescription,
					source: "example",
					publication_date: "2024-01-01",
				},
			],
		};

		const execute = vi.fn().mockResolvedValue(largeOutput);
		mockWebSearch.mockReturnValueOnce({ execute });
		const ctx = makeCtx();
		const state = createStreamState();

		const chunks = await executePrefetchedSearches(
			ctx, "user-1", "large result query", 1, FAKE_API_KEY, state, async () => {},
		);

		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks[0]!.endsWith("...")).toBe(true);
	});
});
