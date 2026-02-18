import { useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useStreamStore } from "@/stores/stream";

export interface StreamingState {
	id: string;
	content: string;
	reasoning: string;
	chainHash: string;
}

export interface ReasoningPartWithState {
	type: "reasoning";
	text: string;
	state?: "streaming" | "done";
}

export type ToolPartState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

export interface ConvexChainOfThoughtPart {
	type: "reasoning" | "tool";
	index: number;
	text?: string;
	toolName?: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export function messageFingerprint(message: UIMessage): string {
	return JSON.stringify({
		id: message.id,
		role: message.role,
		parts: message.parts,
		metadata: message.metadata ?? null,
	});
}

export function isReasoningPart(part: unknown): part is ReasoningPartWithState {
	return (
		typeof part === "object" &&
		part !== null &&
		"type" in part &&
		(part as { type: string }).type === "reasoning"
	);
}

export function hasStreamingState(part: unknown): boolean {
	return isReasoningPart(part) && part.state === "streaming";
}

export function getReasoningText(part: unknown): string | undefined {
	return isReasoningPart(part) ? part.text : undefined;
}

function sanitizeToolName(toolName: string | undefined): string {
	if (!toolName || toolName.trim().length === 0) return "tool";
	return toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeToolState(
	state: string | undefined,
	isStreaming: boolean,
): ToolPartState {
	if (
		state === "input-streaming" ||
		state === "input-available" ||
		state === "output-available" ||
		state === "output-error"
	) {
		return state;
	}
	return isStreaming ? "input-streaming" : "input-available";
}

export function normalizeMessageParts({
	content,
	reasoning,
	reasoningRequested = false,
	chainOfThoughtParts,
	isStreaming = false,
}: {
	content: string;
	reasoning?: string;
	reasoningRequested?: boolean;
	chainOfThoughtParts?: Array<ConvexChainOfThoughtPart>;
	isStreaming?: boolean;
}): UIMessage["parts"] {
	const parts: UIMessage["parts"] = [];
	const orderedChainParts = [...(chainOfThoughtParts ?? [])].sort((a, b) => a.index - b.index);

	if (orderedChainParts.length > 0) {
		for (const chainPart of orderedChainParts) {
				if (chainPart.type === "reasoning") {
					if (!reasoningRequested) continue;
					const reasoningText = chainPart.text ?? "";
					if (!reasoningText && !isStreaming) continue;
				const reasoningPart: ReasoningPartWithState = {
					type: "reasoning",
					text: reasoningText,
					state: chainPart.state === "streaming" ? "streaming" : "done",
				};
				parts.push(reasoningPart as UIMessage["parts"][number]);
				continue;
			}

			const toolName = sanitizeToolName(chainPart.toolName);
			const toolPart = {
				type: `tool-${toolName}`,
				toolCallId:
					chainPart.toolCallId ?? `${toolName}-${chainPart.index}`,
				state: normalizeToolState(chainPart.state, isStreaming),
				input: chainPart.input,
				output: chainPart.output,
				errorText: chainPart.errorText,
			};
			parts.push(toolPart as UIMessage["parts"][number]);
		}
	} else if (reasoningRequested) {
		const reasoningPart: ReasoningPartWithState = {
			type: "reasoning",
			text: reasoning ?? "",
			state: isStreaming ? "streaming" : "done",
		};
		parts.push(reasoningPart as UIMessage["parts"][number]);
	}

	parts.push({
		type: "text",
		text: content,
		state: isStreaming ? "streaming" : "done",
	});

	return parts;
}

function normalizeStreamingReasoningState(
	parts: UIMessage["parts"],
	reasoningRequested: boolean,
): UIMessage["parts"] {
	const normalizedParts = parts
		.map((part) => {
			if (part.type === "reasoning" && part.state === "streaming") {
				return { ...part, state: "done" as const };
			}
			return part;
		});

	if (reasoningRequested) {
		return normalizedParts;
	}

	return normalizedParts.filter(
		(part) => !(part.type === "reasoning" && !getReasoningText(part)),
	);
}

export function convexMessageToUIMessage(msg: {
	_id: string;
	clientMessageId?: string;
	role: string;
	content: string;
	reasoning?: string;
	chainOfThoughtParts?: Array<ConvexChainOfThoughtPart>;
	status?: string;
	thinkingTimeSec?: number;
	reasoningRequested?: boolean;
	reasoningTokenCount?: number;
	modelId?: string;
	provider?: string;
	reasoningEffort?: string;
	webSearchEnabled?: boolean;
	webSearchUsed?: boolean;
	webSearchCallCount?: number;
	toolCallCount?: number;
	maxSteps?: number;
	createdAt: number;
	tokensPerSecond?: number;
	timeToFirstTokenMs?: number;
	totalDurationMs?: number;
	tokenUsage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}): UIMessage {
	return {
		id: msg.clientMessageId || msg._id,
		role: msg.role as "user" | "assistant",
		metadata: {
			serverMessageId: msg._id,
			clientMessageId: msg.clientMessageId,
			thinkingTimeSec: msg.thinkingTimeSec,
			reasoningRequested: msg.reasoningRequested,
			reasoningTokenCount: msg.reasoningTokenCount,
			modelId: msg.modelId,
			provider: msg.provider,
			reasoningEffort: msg.reasoningEffort,
			webSearchEnabled: msg.webSearchEnabled,
			webSearchUsed: msg.webSearchUsed,
			webSearchCallCount: msg.webSearchCallCount,
			toolCallCount: msg.toolCallCount,
			maxSteps: msg.maxSteps,
			tokensPerSecond: msg.tokensPerSecond,
			timeToFirstTokenMs: msg.timeToFirstTokenMs,
			totalDurationMs: msg.totalDurationMs,
			tokenUsage: msg.tokenUsage,
			resumedFromActiveStream: msg.status === "streaming",
		},
		parts: normalizeMessageParts({
			content: msg.content,
			reasoning: msg.reasoning,
			reasoningRequested: msg.reasoningRequested,
			chainOfThoughtParts: msg.chainOfThoughtParts,
			isStreaming: msg.status === "streaming",
		}),
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActiveStreamJob = Record<string, any> | null | undefined;

export type ConvexMessageRecord = Parameters<typeof convexMessageToUIMessage>[0] & { _id: string };
type MessagesResult = Array<ConvexMessageRecord> | undefined;

export interface StreamingLifecycleParams {
	activeStreamJob: ActiveStreamJob;
	messagesResult: MessagesResult;
	status: ChatStatus;
	setStatus: React.Dispatch<React.SetStateAction<ChatStatus>>;
	setMessages: React.Dispatch<React.SetStateAction<Array<UIMessage>>>;
}

export interface StreamingLifecycleReturn {
	streamingRef: React.MutableRefObject<StreamingState | null>;
	stop: () => void;
}

export function useStreamingLifecycle({
	activeStreamJob,
	messagesResult,
	status,
	setStatus,
	setMessages,
}: StreamingLifecycleParams): StreamingLifecycleReturn {
	const streamingRef = useRef<StreamingState | null>(null);

	useEffect(() => {
		if (!messagesResult || status === "streaming" || status === "submitted") return;
		
		setMessages((prevMessages) => {
			const convexMessages = messagesResult.map(convexMessageToUIMessage);
			let nextMessages = convexMessages;

			if (prevMessages.length === 0) {
				nextMessages = convexMessages;
			} else {
				const lastPrev = prevMessages[prevMessages.length - 1];
				const isLastPrevStreaming = lastPrev.id.startsWith("resume-") || 
					(lastPrev.role === "assistant" && !messagesResult.find(m => m._id === lastPrev.id));
				
				if (isLastPrevStreaming && convexMessages.length > 0) {
					const lastConvex = convexMessages[convexMessages.length - 1];
					if (lastConvex.role === "assistant") {
						nextMessages = [
						...convexMessages.slice(0, -1),
						{ ...lastConvex, id: lastPrev.id }
					];
					}
				}
			}

			if (prevMessages.length === nextMessages.length) {
				let changed = false;
				for (let i = 0; i < prevMessages.length; i++) {
					if (messageFingerprint(prevMessages[i]) !== messageFingerprint(nextMessages[i])) {
						changed = true;
						break;
					}
				}
				if (!changed) return prevMessages;
			}

			return nextMessages;
		});
	}, [messagesResult, status, setMessages]);

	useEffect(() => {
		if (!activeStreamJob) {
			if (status === "streaming" || status === "submitted") {
				if (streamingRef.current) {
					const streamId = streamingRef.current.id;
					setMessages((prev) => {
						const idx = prev.findIndex((m) => m.id === streamId);
						if (idx < 0) return prev;
						const msg = prev[idx];
						const hasStreamingReasoning = msg.parts.some(
							(p) => hasStreamingState(p)
						);
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
				if (prev.find(m => m.id === streamId)) return prev;
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
	}, [activeStreamJob, status, setStatus, setMessages]);

	const stop = useCallback(() => {
		setStatus("ready");
		streamingRef.current = null;
		useStreamStore.getState().completeStream();
	}, [setStatus]);

	return { streamingRef, stop };
}
