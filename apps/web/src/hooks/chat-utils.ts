import type { UIMessage } from "ai";

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface ChatFileAttachment {
	type: "file";
	mediaType: string;
	filename?: string;
	url: string;
}

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

export function messageFingerprint(message: UIMessage): string {
	return JSON.stringify({
		id: message.id,
		role: message.role,
		parts: message.parts,
		metadata: message.metadata ?? null,
	});
}

function isReasoningPart(part: unknown): part is ReasoningPartWithState {
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

function getReasoningText(part: unknown): string | undefined {
	return isReasoningPart(part) ? part.text : undefined;
}

/**
 * Maps internal error messages to user-friendly descriptions.
 * This prevents exposing implementation details like API structures,
 * database field names, or third-party service error formats.
 */
export function getUserFriendlyError(message: string): string {
	const lowerMessage = message.toLowerCase();

	if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
		return "You're sending messages too quickly. Please wait a moment.";
	}
	if (lowerMessage.includes("unauthorized") || lowerMessage.includes("authentication")) {
		return "Session expired. Please refresh the page.";
	}
	if (lowerMessage.includes("not found")) {
		return "The requested resource could not be found.";
	}
	if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
		return "The request took too long. Please try again.";
	}
	if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
		return "Network error. Please check your connection and try again.";
	}

	return "An unexpected error occurred. Please try again.";
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
				toolCallId: chainPart.toolCallId ?? `${toolName}-${chainPart.index}`,
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

export function normalizeStreamingReasoningState(
	parts: UIMessage["parts"],
	reasoningRequested: boolean,
): UIMessage["parts"] {
	const normalizedParts = parts.map((part) => {
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
	compareGroup?: string;
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
			compareGroup: msg.compareGroup,
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
