import { webSearch } from "@valyu/ai-sdk";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
	compactWebSearchOutput,
	searchOutputToContext,
	extractRequestedSearchCount,
	buildSearchQueries,
	upsertToolPart,
	MAX_SEARCH_RESULTS_FOR_MODEL,
	MAX_COMBINED_SEARCH_CONTEXT_CHARS,
	MAX_PREFETCH_SEARCHES,
} from "./streamUtils";
import type { StreamState } from "./streamUtils";

export async function executePrefetchedSearches(
	ctx: {
		runMutation: (
			fn: typeof internal.search.incrementSearchUsageInternal,
			args: { userId: Id<"users"> },
		) => Promise<unknown>;
	},
	userId: Id<"users">,
	latestUserMessage: string,
	availableSearches: number,
	VALYU_API_KEY: string,
	state: StreamState,
	persistProgress: (force?: boolean) => Promise<void>,
): Promise<string[]> {
	const valyuWebSearch = webSearch({
		apiKey: VALYU_API_KEY,
		searchType: "web",
		maxNumResults: MAX_SEARCH_RESULTS_FOR_MODEL,
	});
	const requestedSearchCount = extractRequestedSearchCount(latestUserMessage);
	const targetSearchCount = Math.max(
		1,
		Math.min(requestedSearchCount, availableSearches || 1, MAX_PREFETCH_SEARCHES),
	);
	const searchQueries = buildSearchQueries(latestUserMessage, targetSearchCount);
	const contextChunks: string[] = [];
	let remainingContextChars = MAX_COMBINED_SEARCH_CONTEXT_CHARS;
	const execute = (valyuWebSearch as { execute?: (...args: unknown[]) => Promise<unknown> }).execute;
	if (!execute) {
		throw new Error("Valyu webSearch tool is missing execute()");
	}

	for (let index = 0; index < searchQueries.length; index++) {
		const searchQuery = searchQueries[index]!;
		const toolCallId = `web-search-${Date.now()}-${index}`;
		const toolPart = upsertToolPart(state, toolCallId, "webSearch");
		toolPart.input = { query: searchQuery };
		toolPart.state = "input-available";
		state.pendingUpdateCounter++;

		try {
			// Increment FIRST — this mutation is serializable in Convex,
			// so it will throw if the limit is already reached.
			// This prevents the TOCTOU race where two concurrent requests
			// could both pass the initial check and exceed the limit.
			await ctx.runMutation(internal.search.incrementSearchUsageInternal, {
				userId,
			});

			const rawOutput = await execute({ query: searchQuery });
			const compactOutput = compactWebSearchOutput(rawOutput);
			toolPart.output = compactOutput;
			toolPart.state = "output-available";
			state.pendingUpdateCounter++;

			const searchContext = searchOutputToContext(compactOutput);
			if (searchContext) {
				const chunk = `Search ${index + 1}: ${searchQuery}\n${searchContext}`;
				if (remainingContextChars > 0) {
					const trimmedChunk =
						chunk.length > remainingContextChars
							? `${chunk.slice(0, Math.max(0, remainingContextChars - 1))}...`
							: chunk;
					contextChunks.push(trimmedChunk);
					remainingContextChars -= trimmedChunk.length;
				}
			}
		} catch (error) {
			const errorText =
				error instanceof Error ? error.message : "Web search failed";
			if (errorText.includes("Daily search limit reached")) {
				toolPart.errorText = "Daily search limit reached";
				toolPart.state = "output-error";
				state.pendingUpdateCounter++;
				await persistProgress(true);
				break;
			}
			toolPart.errorText = errorText;
			toolPart.state = "output-error";
			state.pendingUpdateCounter++;
		}

		await persistProgress(true);
	}

	return contextChunks;
}
