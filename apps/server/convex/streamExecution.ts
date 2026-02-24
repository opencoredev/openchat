import { stepCountIs, streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createLogger } from "./lib/logger";

const logger = createLogger("streamExecution");
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
import {
	UPDATE_INTERVAL,
	createStreamState,
	usageFromLanguageModelUsage,
	parseToolInput,
	upsertReasoningPart,
	upsertToolPart,
	getThinkingTimeMs,
	getThinkingTimeSec,
	getReasoningTokenCount,
	getToolMetrics,
	getPersistableChainOfThoughtParts,
	buildOpenRouterOptions,
} from "./streamUtils";
import { executePrefetchedSearches } from "./streamWebSearch";

export const executeStream = internalAction({
	args: {
		jobId: v.id("streamJobs"),
	},
	handler: async (ctx, args) => {
		const job = await ctx.runQuery(internal.backgroundStream.getJobInternal, {
			jobId: args.jobId,
		});

		if (!job) return;

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

		const state = createStreamState();

		const latestUserMessage =
			[...job.messages]
				.reverse()
				.find((message: { role: string; content: string }) => message.role === "user")
				?.content ?? "";

		const persistProgress = async (force = false) => {
			if (!force && state.pendingUpdateCounter < UPDATE_INTERVAL) return;
			state.pendingUpdateCounter = 0;
			const toolMetrics = getToolMetrics(state);
			await ctx.runMutation(internal.backgroundStream.updateStreamContent, {
				jobId: args.jobId,
				content: state.fullContent,
				reasoning: reasoningRequested ? state.fullReasoning || undefined : undefined,
				chainOfThoughtParts: getPersistableChainOfThoughtParts(state, reasoningRequested),
				thinkingTimeMs: getThinkingTimeMs(state),
				thinkingTimeSec: getThinkingTimeSec(state),
				reasoningCharCount: reasoningRequested ? state.fullReasoning.length : undefined,
				reasoningChunkCount: reasoningRequested ? state.reasoningChunkCount : undefined,
				reasoningTokenCount: getReasoningTokenCount(state, reasoningRequested),
				reasoningRequested,
				webSearchUsed: toolMetrics.webSearchUsed,
				webSearchCallCount: toolMetrics.webSearchCallCount,
				toolCallCount: toolMetrics.toolCallCount,
			});
		};

		const timeoutMs = 5 * 60 * 1000;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const openRouter = createOpenRouter({ apiKey });
			const aiModel = openRouter(job.model);

			const { openRouterOptions, maxOutputTokens } = buildOpenRouterOptions(
				reasoningRequested,
				job.model,
				job.options?.reasoningEffort,
			);

			const streamOptions: Parameters<typeof streamText>[0] = {
				model: aiModel as Parameters<typeof streamText>[0]["model"],
				messages: job.messages.map((message: { role: string; content: string }) => ({
					role: message.role as "user" | "assistant" | "system",
					content: message.content,
				})),
				abortSignal: controller.signal,
				maxOutputTokens,
				providerOptions: {
					openrouter: openRouterOptions,
				},
			};

			const webSearchRequested = Boolean(job.options?.enableWebSearch);
			const supportsToolCalls = job.options?.supportsToolCalls !== false;
			const valyuApiKey = VALYU_API_KEY ?? null;
			let webSearchMode: "none" | "tool" | "unavailable" = "none";
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
				} else if (supportsToolCalls && valyuApiKey) {
					webSearchMode = "tool";
				} else {
					webSearchMode = "unavailable";
					webSearchUnavailableReason = !valyuApiKey
						? "Web search is not configured on the server."
						: "This model does not support tool calls required for web search.";
				}
			}

			if (webSearchMode === "unavailable") {
				const unavailableToolPart = upsertToolPart(
					state,
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

			if (webSearchMode === "tool" && valyuApiKey) {
				const contextChunks = await executePrefetchedSearches(
					ctx,
					job.userId,
					latestUserMessage,
					availableSearches,
					valyuApiKey,
					state,
					persistProgress,
				);

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
				switch (part.type) {
				case "text-delta": {
					if (state.firstTextDeltaTime === null) {
						state.firstTextDeltaTime = Date.now();
					}
					state.fullContent += part.text;
					state.pendingUpdateCounter++;
					break;
				}
				case "reasoning-start": {
					if (!reasoningRequested) break;
					const reasoningPart = upsertReasoningPart(state, part.id);
					reasoningPart.state = "streaming";
					state.pendingUpdateCounter++;
					break;
				}
				case "reasoning-delta": {
					if (!reasoningRequested) break;
					const reasoningPart = upsertReasoningPart(state, part.id);
					reasoningPart.text = `${reasoningPart.text ?? ""}${part.text}`;
					reasoningPart.state = "streaming";
					state.fullReasoning += part.text;
					state.reasoningChunkCount++;
					if (!state.reasoningStartTime) state.reasoningStartTime = Date.now();
					state.reasoningEndTime = Date.now();
					state.pendingUpdateCounter++;
					break;
				}
				case "reasoning-end": {
					if (!reasoningRequested) break;
					const reasoningPart = upsertReasoningPart(state, part.id);
					reasoningPart.state = "done";
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-input-start": {
					const toolPart = upsertToolPart(state, part.id, part.toolName);
					toolPart.state = "input-streaming";
					state.toolInputBufferById.set(part.id, "");
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-input-delta": {
					const toolPart = upsertToolPart(state, part.id);
					const prev = state.toolInputBufferById.get(part.id) ?? "";
					const next = `${prev}${part.delta}`;
					state.toolInputBufferById.set(part.id, next);
					toolPart.input = next;
					toolPart.state = "input-streaming";
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-input-end": {
					const toolPart = upsertToolPart(state, part.id);
					const parsedInput = parseToolInput(state.toolInputBufferById.get(part.id));
					if (parsedInput !== undefined) {
						toolPart.input = parsedInput;
					}
					if (toolPart.state !== "output-available" && toolPart.state !== "output-error") {
						toolPart.state = "input-available";
					}
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-call": {
					const toolPart = upsertToolPart(state, part.toolCallId, part.toolName);
					toolPart.toolName = part.toolName;
					toolPart.toolCallId = part.toolCallId;
					toolPart.input = part.input;
					if (toolPart.state !== "output-available") {
						toolPart.state = "input-available";
					}
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-result": {
					const toolPart = upsertToolPart(state, part.toolCallId, part.toolName);
					toolPart.toolName = part.toolName;
					toolPart.toolCallId = part.toolCallId;
					toolPart.input = toolPart.input ?? parseToolInput(state.toolInputBufferById.get(part.toolCallId));
					toolPart.output = part.output;
					toolPart.state = "output-available";
					state.pendingUpdateCounter++;
					break;
				}
				case "tool-error": {
					const toolPart = upsertToolPart(state, part.toolCallId, part.toolName);
					toolPart.toolName = part.toolName;
					toolPart.toolCallId = part.toolCallId;
					toolPart.input = toolPart.input ?? parseToolInput(state.toolInputBufferById.get(part.toolCallId));
					const errorText =
						part.error instanceof Error
							? part.error.message
							: typeof part.error === "string"
								? part.error
								: "Tool execution failed";
					toolPart.errorText = errorText;
					toolPart.state = "output-error";
					state.pendingUpdateCounter++;
					break;
				}
				case "finish-step": {
					state.usageSummary = usageFromLanguageModelUsage({
						inputTokens: part.usage.inputTokens,
						outputTokens: part.usage.outputTokens,
						totalTokens: part.usage.totalTokens,
						reasoningTokens: part.usage.reasoningTokens,
						outputTokenDetails: part.usage.outputTokenDetails,
						raw: part.usage.raw,
					});
					break;
				}
				default:
					break;
				}

				await persistProgress();
			}

			state.streamCompletedTime = Date.now();
			for (const chainPart of state.chainOfThoughtParts) {
				if (chainPart.type === "reasoning" && chainPart.state === "streaming") {
					chainPart.state = "done";
				}
			}
			await persistProgress(true);

			const totalUsage = await result.totalUsage;
			if (totalUsage) {
				state.usageSummary = usageFromLanguageModelUsage({
					inputTokens: totalUsage.inputTokens,
					outputTokens: totalUsage.outputTokens,
					totalTokens: totalUsage.totalTokens,
					reasoningTokens: totalUsage.reasoningTokens,
					outputTokenDetails: totalUsage.outputTokenDetails,
					raw: totalUsage.raw,
				});
			}

			const totalDurationMs = state.streamCompletedTime - job.createdAt;
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
						} catch (usageError) {
							void logger.warn("incrementAiUsage failed", {
								jobId: args.jobId,
								attempt,
								error:
									usageError instanceof Error ? usageError.message : "Unknown error",
							});
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

			const thinkingTimeMs = getThinkingTimeMs(state);
			const thinkingTimeSec = getThinkingTimeSec(state);
			const toolMetrics = getToolMetrics(state);

			await ctx.runMutation(internal.backgroundStream.completeStream, {
				jobId: args.jobId,
				content: state.fullContent,
				reasoning: reasoningRequested ? state.fullReasoning || undefined : undefined,
				chainOfThoughtParts: getPersistableChainOfThoughtParts(state, reasoningRequested),
				thinkingTimeMs,
				thinkingTimeSec,
				reasoningCharCount: reasoningRequested ? state.fullReasoning.length : undefined,
				reasoningChunkCount: reasoningRequested ? state.reasoningChunkCount : undefined,
				reasoningTokenCount: getReasoningTokenCount(state, reasoningRequested),
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
					void logger.error("Upstash refund adjustment failed", adjustError);
				}
			}
			await ctx.runMutation(internal.backgroundStream.failStream, {
				jobId: args.jobId,
				error: "An error occurred while processing your request.",
				partialContent: state.fullContent,
			});
		} finally {
			clearTimeout(timeoutId);
		}
	},
});
