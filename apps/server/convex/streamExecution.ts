import { stepCountIs, streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { webSearch } from "@valyu/ai-sdk";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
	DAILY_AI_LIMIT_CENTS,
	getCurrentDateKey,
	calculateUsageCents,
} from "./lib/billingUtils";
import {
	adjustDailyUsageInUpstash,
	incrementDailyUsageInUpstash,
	reserveDailyUsageInUpstash,
} from "./lib/upstashUsage";
import { decryptSecret } from "./lib/crypto";
import { isWebSearchToolName, type ChainOfThoughtPart } from "./streamJobs";
import { createLogger } from "./lib/logger";
import {
	usageFromLanguageModelUsage,
	compactWebSearchOutput,
	searchOutputToContext,
	extractRequestedSearchCount,
	buildSearchQueries,
	buildOpenRouterProviderOptions,
	StreamStateManager,
	MAX_SEARCH_RESULTS_FOR_MODEL,
	MAX_COMBINED_SEARCH_CONTEXT_CHARS,
	MAX_PREFETCH_SEARCHES,
} from "./streamUtils";
import type { UsagePayload } from "./streamUtils";

const logger = createLogger("streamExecution");

const UPDATE_INTERVAL = 5;

export const executeStream = internalAction({
	args: {
		jobId: v.id("streamJobs"),
	},
	handler: async (ctx, args) => {
		const job = await ctx.runQuery(internal.backgroundStream.getJobInternal, {
			jobId: args.jobId,
		});

		if (!job) {
			return;
		}

		let reservedUsageCents = 0;
		let reservedDateKey: string | null = null;

		if (job.provider === "osschat") {
			const currentDate = getCurrentDateKey();
			const reservedTotal = await reserveDailyUsageInUpstash(job.userId, currentDate, 1);
			if (reservedTotal !== null) {
				reservedUsageCents = 1;
				reservedDateKey = currentDate;
				if (reservedTotal > DAILY_AI_LIMIT_CENTS) {
					await adjustDailyUsageInUpstash(job.userId, currentDate, -reservedUsageCents);
					await ctx.runMutation(internal.backgroundStream.failStream, {
						jobId: args.jobId,
						error: "Daily usage limit reached. Connect your OpenRouter account to continue.",
					});
					return;
				}
			} else {
				await ctx.runMutation(internal.backgroundStream.failStream, {
					jobId: args.jobId,
					error: "Usage tracking temporarily unavailable. Please retry shortly.",
				});
				return;
			}
		}

		await ctx.runMutation(internal.backgroundStream.updateStreamContent, {
			jobId: args.jobId,
			content: "",
			status: "running",
			chainOfThoughtParts: [],
		});

		const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
		const VALYU_API_KEY = process.env.VALYU_API_KEY;

		let apiKey: string | null = null;
		if (job.provider === "osschat") {
			apiKey = OPENROUTER_API_KEY ?? null;
		} else {
			const encryptedKey = await ctx.runQuery(internal.users.getOpenRouterKeyInternal, {
				userId: job.userId,
			});
			apiKey = encryptedKey ? await decryptSecret(encryptedKey) : null;
		}

		if (!apiKey) {
			await ctx.runMutation(internal.backgroundStream.failStream, {
				jobId: args.jobId,
				error: "No API key available",
			});
			return;
		}

		const reasoningRequested =
			job.options?.enableReasoning === true ||
			(job.options?.enableReasoning === undefined &&
				Boolean(job.options?.reasoningEffort && job.options.reasoningEffort !== "none"));

		const state = new StreamStateManager(reasoningRequested);
		let streamCompletedTime: number | null = null;

		const latestUserMessage =
			[...job.messages]
				.reverse()
				.find((message: { role: string; content: string }) => message.role === "user")
				?.content ?? "";

		let webSearchMode: "none" | "tool" | "unavailable" = "none";

		const persistProgress = async (force = false) => {
			if (!force && state.pendingUpdateCounter < UPDATE_INTERVAL) return;
			state.pendingUpdateCounter = 0;
			const toolMetrics = state.getToolMetrics(isWebSearchToolName);
			await ctx.runMutation(internal.backgroundStream.updateStreamContent, {
				jobId: args.jobId,
				content: state.fullContent,
				reasoning: reasoningRequested ? state.fullReasoning || undefined : undefined,
				chainOfThoughtParts: state.getPersistableChainOfThoughtParts(),
				thinkingTimeMs: state.getThinkingTimeMs(streamCompletedTime),
				thinkingTimeSec: state.getThinkingTimeSec(streamCompletedTime),
				reasoningCharCount: reasoningRequested ? state.fullReasoning.length : undefined,
				reasoningChunkCount: reasoningRequested ? state.reasoningChunkCount : undefined,
				reasoningTokenCount: state.getReasoningTokenCount(),
				reasoningRequested,
				webSearchUsed: toolMetrics.webSearchUsed,
				webSearchCallCount: toolMetrics.webSearchCallCount,
				toolCallCount: toolMetrics.toolCallCount,
			});
		};

		try {
			const timeoutMs = 5 * 60 * 1000;
			const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

				const openRouter = createOpenRouter({ apiKey });
				const aiModel = openRouter(job.model);

			const streamOptions: Parameters<typeof streamText>[0] = {
				model: aiModel as Parameters<typeof streamText>[0]["model"],
				messages: job.messages.map((message: { role: string; content: string }) => ({
					role: message.role as "user" | "assistant" | "system",
					content: message.content,
				})),
				abortSignal: controller.signal,
			};

		const { openRouterOptions, maxOutputTokens } = buildOpenRouterProviderOptions(
			job.model,
			reasoningRequested,
			job.options?.reasoningEffort,
			streamOptions.providerOptions?.openrouter as Record<string, unknown> | undefined,
		);
		if (maxOutputTokens !== undefined) {
			streamOptions.maxOutputTokens = maxOutputTokens;
		}
		streamOptions.providerOptions = {
			...streamOptions.providerOptions,
			openrouter: openRouterOptions as Record<string, any>,
		};

			const webSearchRequested = Boolean(job.options?.enableWebSearch);
			const supportsToolCalls = job.options?.supportsToolCalls !== false;
			let webSearchUnavailableReason: string | null = null;
			let availableSearches = 0;

			if (webSearchRequested) {
				const searchLimit = await ctx.runQuery(internal.search.checkSearchLimitInternal, {
					userId: job.userId,
				});
				availableSearches = searchLimit.remaining;
				if (!searchLimit.canSearch) {
					webSearchMode = "unavailable";
					webSearchUnavailableReason = "Daily search limit reached. Please try again tomorrow.";
				} else if (supportsToolCalls && VALYU_API_KEY) {
					webSearchMode = "tool";
				} else {
					webSearchMode = "unavailable";
					webSearchUnavailableReason = !VALYU_API_KEY
						? "Web search is not configured on the server."
						: "This model does not support tool calls required for web search.";
				}
			}

		if (webSearchMode === "unavailable") {
			const unavailableToolPart = state.upsertToolPart(
				`web-search-unavailable-${Date.now()}`,
				"webSearch",
			);
			unavailableToolPart.state = "output-error";
			unavailableToolPart.errorText = webSearchUnavailableReason ?? "Web search is unavailable.";
			state.pendingUpdateCounter++;
			streamOptions.messages = [
				{
					role: "system",
					content:
						"Web search is unavailable for this request. Do not claim live web access; answer using existing knowledge only.",
				},
				...(streamOptions.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>),
			];
		}

		if (webSearchMode === "tool") {
			const valyuWebSearch = webSearch({
				apiKey: VALYU_API_KEY!,
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
				const toolPart = state.upsertToolPart(toolCallId, "webSearch");
				toolPart.input = { query: searchQuery };
				toolPart.state = "input-available";
				state.pendingUpdateCounter++;

				try {
					await ctx.runMutation(internal.search.incrementSearchUsageInternal, {
						userId: job.userId,
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

			if (contextChunks.length > 0) {
				streamOptions.messages = [
					{
						role: "system",
						content:
							"Use the following web search results for up-to-date facts. Cite source URLs in your answer when making factual claims.",
					},
					{
						role: "system",
						content: `Web search results:\n${contextChunks.join("\n\n")}`,
					},
					...(streamOptions.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>),
				];
			}
		}
				const configuredMaxSteps =
					typeof job.options?.maxSteps === "number"
						&& Number.isFinite(job.options.maxSteps)
						&& job.options.maxSteps > 0
						? Math.floor(job.options.maxSteps)
						: undefined;
				const stepLimit = Math.max(1, Math.min(configuredMaxSteps ?? 1, 10));
				streamOptions.stopWhen = stepCountIs(stepLimit);

		const result = streamText(streamOptions);

		for await (const part of result.fullStream) {
			state.processStreamPart(part as { type: string; [key: string]: unknown });
			await persistProgress();
		}

		streamCompletedTime = Date.now();
		state.finalizeReasoningParts();
		await persistProgress(true);

		const totalUsage = await result.totalUsage;
		if (totalUsage) {
			state.usageSummary = usageFromLanguageModelUsage(totalUsage);
		}

		clearTimeout(timeoutId);

		const totalDurationMs = streamCompletedTime - job.createdAt;
		const timeToFirstTokenMs = state.firstTextDeltaTime
			? state.firstTextDeltaTime - job.createdAt
			: undefined;
		const completionTokens = state.usageSummary?.completionTokens ?? 0;
		const tokensPerSecond =
			totalDurationMs > 0 && completionTokens > 0
				? Math.round((completionTokens / (totalDurationMs / 1000)) * 100) / 100
				: undefined;

		if (job.provider === "osschat") {
			const usageCents = calculateUsageCents(
				state.usageSummary,
				job.messages,
				state.fullContent,
			);
			if (usageCents && usageCents > 0) {
				for (let attempt = 0; attempt < 2; attempt++) {
					try {
						await ctx.runMutation(internal.users.incrementAiUsage, {
							userId: job.userId,
							usageCents,
						});
						break;
					} catch {
						if (attempt === 1) break;
					}
				}

				if (reservedDateKey && reservedUsageCents > 0) {
					const adjustment = Math.ceil(usageCents) - reservedUsageCents;
					if (adjustment !== 0) {
						await adjustDailyUsageInUpstash(job.userId, reservedDateKey, adjustment);
					}
					reservedUsageCents = 0;
					reservedDateKey = null;
				} else {
					await incrementDailyUsageInUpstash(
						job.userId,
						getCurrentDateKey(),
						usageCents,
					);
				}
			} else if (reservedDateKey && reservedUsageCents > 0) {
				await adjustDailyUsageInUpstash(job.userId, reservedDateKey, -reservedUsageCents);
				reservedUsageCents = 0;
				reservedDateKey = null;
			}
		}

		const thinkingTimeMs = state.getThinkingTimeMs(streamCompletedTime);
		const thinkingTimeSec = state.getThinkingTimeSec(streamCompletedTime);
		const toolMetrics = state.getToolMetrics(isWebSearchToolName);

		await ctx.runMutation(internal.backgroundStream.completeStream, {
			jobId: args.jobId,
			content: state.fullContent,
			reasoning: reasoningRequested ? state.fullReasoning || undefined : undefined,
			chainOfThoughtParts: state.getPersistableChainOfThoughtParts(),
			thinkingTimeMs,
			thinkingTimeSec,
			reasoningCharCount: reasoningRequested ? state.fullReasoning.length : undefined,
			reasoningChunkCount: reasoningRequested ? state.reasoningChunkCount : undefined,
			reasoningTokenCount: state.getReasoningTokenCount(),
			reasoningRequested,
			webSearchUsed: toolMetrics.webSearchUsed,
			webSearchCallCount: toolMetrics.webSearchCallCount,
			toolCallCount: toolMetrics.toolCallCount,
			tokensPerSecond,
			timeToFirstTokenMs,
			totalDurationMs,
			tokenUsage: state.usageSummary
				? {
						promptTokens: state.usageSummary.promptTokens ?? 0,
						completionTokens: state.usageSummary.completionTokens ?? 0,
						totalTokens: state.usageSummary.totalTokens ?? 0,
					}
				: undefined,
		});
	} catch (error) {
		void logger.error("executeStream failed", error, { jobId: args.jobId });
		if (reservedDateKey && reservedUsageCents > 0) {
			try {
				await adjustDailyUsageInUpstash(job.userId, reservedDateKey, -reservedUsageCents);
			} catch (adjustError) {
				void logger.warn("Upstash refund adjustment failed", { error: String(adjustError) });
			}
		}
		await ctx.runMutation(internal.backgroundStream.failStream, {
			jobId: args.jobId,
			error: "An error occurred while processing your request.",
			partialContent: state.fullContent,
		});
	}
	},
});
