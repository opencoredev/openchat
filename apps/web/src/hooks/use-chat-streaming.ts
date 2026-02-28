import { useCallback, useEffect, useRef as useReactRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useStreamStore } from "@/stores/stream";
import { useCompareStore } from "@/stores/compare";
import {
	normalizeMessageParts,
	normalizeStreamingReasoningState,
	hasStreamingState,
	type ChatStatus,
	type ConvexChainOfThoughtPart,
	type StreamingState,
} from "./chat-utils";

interface UseChatStreamingParams {
	chatId: string | undefined;
	convexUserId: Id<"users"> | undefined;
	status: ChatStatus;
	setStatus: (s: ChatStatus) => void;
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>;
	streamingRef: MutableRefObject<StreamingState | null>;
}

/** Helper: update a single message in the messages array from a stream job */
function updateMessageFromJob(
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>,
	job: {
		messageId: string;
		content: string;
		reasoning?: string;
		reasoningRequested?: boolean;
		options?: { enableReasoning?: boolean; reasoningEffort?: string; enableWebSearch?: boolean };
		chainOfThoughtParts?: Array<ConvexChainOfThoughtPart>;
		thinkingTimeSec?: number;
		reasoningTokenCount?: number;
		model: string;
		provider: string;
		webSearchUsed?: boolean;
		webSearchCallCount?: number;
		toolCallCount?: number;
		status: string;
	},
	isRunning: boolean,
	compareGroup?: string,
) {
	const streamId = job.messageId;
	const jobContent = job.content || "";
	const jobReasoning = job.reasoning || "";
	const jobReasoningRequested =
		job.reasoningRequested === true || job.options?.enableReasoning === true;
	const jobChainParts =
		(job.chainOfThoughtParts as Array<ConvexChainOfThoughtPart> | undefined) ?? [];

	const parts = normalizeMessageParts({
		content: jobContent,
		reasoning: jobReasoning,
		reasoningRequested: jobReasoningRequested,
		chainOfThoughtParts: jobChainParts,
		isStreaming: isRunning,
	});

	const metadata = {
		thinkingTimeSec: job.thinkingTimeSec,
		reasoningRequested: jobReasoningRequested,
		reasoningTokenCount: job.reasoningTokenCount,
		modelId: job.model,
		provider: job.provider,
		reasoningEffort: job.options?.reasoningEffort,
		webSearchEnabled: job.options?.enableWebSearch,
		webSearchUsed: job.webSearchUsed,
		webSearchCallCount: job.webSearchCallCount,
		toolCallCount: job.toolCallCount,
		resumedFromActiveStream: true,
		...(compareGroup ? { compareGroup } : {}),
	};

	setMessages((prev) => {
		const idx = prev.findIndex((m) => m.id === streamId);
		if (idx < 0) {
			// Add the message if it doesn't exist yet
			return [
				...prev,
				{
					id: streamId,
					role: "assistant" as const,
					parts,
					metadata,
				},
			];
		}
		// Update existing message
		const previousHash = JSON.stringify(prev[idx].parts);
		const nextHash = JSON.stringify(parts);
		if (previousHash === nextHash) return prev;

		const updated = [...prev];
		updated[idx] = { ...updated[idx], parts, metadata };
		return updated;
	});
}

export function useChatStreaming({
	chatId,
	convexUserId,
	status,
	setStatus,
	setMessages,
	streamingRef,
}: UseChatStreamingParams) {
	const activeCompareGroup = useCompareStore((s) => s.activeCompareGroup);

	// Single-stream query (standard mode)
	const activeStreamJob = useQuery(
		api.backgroundStream.getActiveStreamJob,
		chatId && convexUserId && !activeCompareGroup
			? { chatId: chatId as Id<"chats">, userId: convexUserId }
			: "skip",
	);

	// Compare-stream query (multi-model mode)
	const compareStreamJobs = useQuery(
		api.backgroundStream.getActiveCompareStreamJobs,
		chatId && convexUserId && activeCompareGroup
			? {
					chatId: chatId as Id<"chats">,
					userId: convexUserId,
					compareGroup: activeCompareGroup,
				}
			: "skip",
	);

	// Track previous compare job states to detect changes
	const prevCompareHashRef = useReactRef<string>("");

	// --- Compare mode streaming ---
	useEffect(() => {
		if (!activeCompareGroup || !compareStreamJobs) return;

		const allDone = compareStreamJobs.every(
			(j) => j.status === "completed" || j.status === "error",
		);

		if (compareStreamJobs.length === 0) {
			// No jobs found yet, may still be pending
			return;
		}

		if (allDone) {
			if (status === "streaming" || status === "submitted") {
				setStatus("ready");
				streamingRef.current = null;
				useStreamStore.getState().completeStream();
				useCompareStore.getState().setActiveCompareGroup(null);
			}
			return;
		}

		if (status !== "streaming" && status !== "submitted") {
			setStatus("streaming");
			useStreamStore.getState().setResuming();
		}

		const jobsHash = JSON.stringify(
			compareStreamJobs.map((j) => ({
				id: j.messageId,
				content: j.content,
				reasoning: j.reasoning,
				chain: j.chainOfThoughtParts,
				status: j.status,
			})),
		);

		if (prevCompareHashRef.current === jobsHash) return;
		prevCompareHashRef.current = jobsHash;

		for (const job of compareStreamJobs) {
			const isRunning = job.status === "running" || job.status === "pending";
			updateMessageFromJob(setMessages, job, isRunning, activeCompareGroup);
		}

		// Track the first stream for the streamingRef
		const firstRunning = compareStreamJobs.find(
			(j) => j.status === "running" || j.status === "pending",
		);
		if (firstRunning) {
			streamingRef.current = {
				id: firstRunning.messageId,
				content: firstRunning.content || "",
				reasoning: firstRunning.reasoning || "",
				chainHash: JSON.stringify(firstRunning.chainOfThoughtParts ?? []),
			};
		}
	}, [
		activeCompareGroup,
		compareStreamJobs,
		status,
		setStatus,
		setMessages,
		streamingRef,
	]);

	// --- Standard single-stream mode ---
	useEffect(() => {
		if (activeCompareGroup) return; // Skip when in compare mode

		if (!activeStreamJob) {
			if (status === "streaming" || status === "submitted") {
				if (streamingRef.current) {
					const streamId = streamingRef.current.id;
					setMessages((prev) => {
						const idx = prev.findIndex((m) => m.id === streamId);
						if (idx < 0) return prev;
						const msg = prev[idx];
						const hasStreamingReasoning = msg.parts.some((p) => hasStreamingState(p));
						if (!hasStreamingReasoning) return prev;
						const metadata = msg.metadata as { reasoningRequested?: unknown } | undefined;
						const reasoningRequested = metadata?.reasoningRequested === true;
						const parts = normalizeStreamingReasoningState(msg.parts, reasoningRequested);
						const updated = [...prev];
						updated[idx] = { ...updated[idx], parts };
						return updated;
					});
				}
				setStatus("ready");
				streamingRef.current = null;
				useStreamStore.getState().completeStream();
			}
			return;
		}

		if (activeStreamJob.status === "completed" || activeStreamJob.status === "error") {
			if (status === "streaming") {
				setStatus("ready");
				streamingRef.current = null;
				useStreamStore.getState().completeStream();
			}
			return;
		}

		const streamId = activeStreamJob.messageId;
		const jobContent = activeStreamJob.content || "";
		const jobReasoning = activeStreamJob.reasoning || "";
		const jobReasoningRequested =
			activeStreamJob.reasoningRequested === true ||
			activeStreamJob.options?.enableReasoning === true;
		const jobChainParts =
			(activeStreamJob.chainOfThoughtParts as Array<ConvexChainOfThoughtPart> | undefined) ?? [];
		const jobChainHash = JSON.stringify(jobChainParts);
		const isJobRunning = true;

		if (status !== "streaming" && status !== "submitted") {
			setStatus("streaming");
			useStreamStore.getState().setResuming();
		}

		if (!streamingRef.current || streamingRef.current.id !== streamId) {
			streamingRef.current = {
				id: streamId,
				content: jobContent,
				reasoning: jobReasoning,
				chainHash: jobChainHash,
			};

			setMessages((prev) => {
				if (prev.find((m) => m.id === streamId)) return prev;
				const parts = normalizeMessageParts({
					content: jobContent,
					reasoning: jobReasoning,
					reasoningRequested: jobReasoningRequested,
					chainOfThoughtParts: jobChainParts,
					isStreaming: isJobRunning,
				});
				return [
					...prev,
					{
						id: streamId,
						role: "assistant" as const,
						parts,
						metadata: {
							thinkingTimeSec: activeStreamJob.thinkingTimeSec,
							reasoningRequested: jobReasoningRequested,
							reasoningTokenCount: activeStreamJob.reasoningTokenCount,
							modelId: activeStreamJob.model,
							provider: activeStreamJob.provider,
							reasoningEffort: activeStreamJob.options?.reasoningEffort,
							webSearchEnabled: activeStreamJob.options?.enableWebSearch,
							webSearchUsed: activeStreamJob.webSearchUsed,
							webSearchCallCount: activeStreamJob.webSearchCallCount,
							toolCallCount: activeStreamJob.toolCallCount,
							resumedFromActiveStream: true,
						},
					},
				];
			});
		} else if (
			streamingRef.current.content !== jobContent ||
			streamingRef.current.reasoning !== jobReasoning ||
			streamingRef.current.chainHash !== jobChainHash
		) {
			streamingRef.current.content = jobContent;
			streamingRef.current.reasoning = jobReasoning;
			streamingRef.current.chainHash = jobChainHash;

			setMessages((prev) => {
				const idx = prev.findIndex((m) => m.id === streamId);
				if (idx < 0) return prev;
				const parts = normalizeMessageParts({
					content: jobContent,
					reasoning: jobReasoning,
					reasoningRequested: jobReasoningRequested,
					chainOfThoughtParts: jobChainParts,
					isStreaming: isJobRunning,
				});
				const previousHash = JSON.stringify(prev[idx].parts);
				const nextHash = JSON.stringify(parts);
				if (previousHash === nextHash) return prev;

				const updated = [...prev];
				updated[idx] = {
					...updated[idx],
					parts,
					metadata: {
						thinkingTimeSec: activeStreamJob.thinkingTimeSec,
						reasoningRequested: jobReasoningRequested,
						reasoningTokenCount: activeStreamJob.reasoningTokenCount,
						modelId: activeStreamJob.model,
						provider: activeStreamJob.provider,
						reasoningEffort: activeStreamJob.options?.reasoningEffort,
						webSearchEnabled: activeStreamJob.options?.enableWebSearch,
						webSearchUsed: activeStreamJob.webSearchUsed,
						webSearchCallCount: activeStreamJob.webSearchCallCount,
						toolCallCount: activeStreamJob.toolCallCount,
						resumedFromActiveStream: true,
					},
				};
				return updated;
			});
		}
	}, [activeCompareGroup, activeStreamJob, status, setStatus, setMessages, streamingRef]);

	const stop = useCallback(() => {
		setStatus("ready");
		streamingRef.current = null;
		useStreamStore.getState().completeStream();
		useCompareStore.getState().setActiveCompareGroup(null);
	}, [setStatus, streamingRef]);

	return {
		activeStreamJob,
		stop,
		isResuming: status === "streaming" && (!!activeStreamJob || (compareStreamJobs?.length ?? 0) > 0),
		resumedContent: streamingRef.current?.content || "",
	};
}
