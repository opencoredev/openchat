import { useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useStreamStore } from "@/stores/stream";
import {
	normalizeMessageParts,
	normalizeStreamingReasoningState,
	hasStreamingState,
	type ChatStatus,
	type ConvexChainOfThoughtPart,
	type StreamingState,
} from "./chat-utils";

function getPartFingerprint(part: UIMessage["parts"][number]) {
	if (part.type === "text" || part.type === "reasoning") {
		return JSON.stringify([part.type, part.text, "state" in part ? part.state ?? "" : ""]);
	}

	if (part.type === "file") {
		return JSON.stringify([part.type, part.filename, part.mediaType ?? "", part.url ?? ""]);
	}

	if (typeof part.type === "string" && part.type.startsWith("tool-")) {
		return JSON.stringify(part);
	}

	return JSON.stringify(part);
}

function areMessagePartsEqual(
	left: UIMessage["parts"],
	right: UIMessage["parts"],
) {
	if (left.length !== right.length) return false;

	for (let index = 0; index < left.length; index += 1) {
		if (getPartFingerprint(left[index]) !== getPartFingerprint(right[index])) {
			return false;
		}
	}

	return true;
}

interface UseChatStreamingParams {
	chatId: string | undefined;
	convexUserId: Id<"users"> | undefined;
	status: ChatStatus;
	setStatus: (s: ChatStatus) => void;
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>;
	streamingRef: MutableRefObject<StreamingState | null>;
}

export function useChatStreaming({
	chatId,
	convexUserId,
	status,
	setStatus,
	setMessages,
	streamingRef,
}: UseChatStreamingParams) {
	const activeStreamJob = useQuery(
		api.backgroundStream.getActiveStreamJob,
		chatId && convexUserId ? { chatId: chatId as Id<"chats">, userId: convexUserId } : "skip",
	);

	useEffect(() => {
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
				if (areMessagePartsEqual(prev[idx].parts, parts)) return prev;

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
	}, [activeStreamJob, status, setStatus, setMessages, streamingRef]);

	const stop = useCallback(() => {
		setStatus("ready");
		streamingRef.current = null;
		useStreamStore.getState().completeStream();
	}, [setStatus, streamingRef]);

	return {
		activeStreamJob,
		stop,
		isResuming: status === "streaming" && !!activeStreamJob,
		resumedContent: streamingRef.current?.content || "",
	};
}
