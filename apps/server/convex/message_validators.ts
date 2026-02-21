import { v } from "convex/values";

// Tool invocation validator - DEPRECATED: used for legacy format
export const toolInvocationValidator = v.object({
	toolName: v.string(),
	toolCallId: v.string(),
	state: v.string(), // "input-streaming" | "input-available" | "output-available" | "output-error"
	input: v.optional(v.any()),
	output: v.optional(v.any()),
	errorText: v.optional(v.string()),
});

// NEW: Unified chain of thought part validator - preserves stream order
export const chainOfThoughtPartValidator = v.object({
	// Part type: "reasoning" for thinking, "tool" for tool calls
	type: v.union(v.literal("reasoning"), v.literal("tool")),
	// Original position in the AI stream (for ordering)
	index: v.number(),
	// For reasoning parts
	text: v.optional(v.string()),
	// For tool parts
	toolName: v.optional(v.string()),
	toolCallId: v.optional(v.string()),
	state: v.optional(v.string()), // "input-streaming" | "input-available" | "output-available" | "output-error"
	input: v.optional(v.any()),
	output: v.optional(v.any()),
	errorText: v.optional(v.string()),
});

// Error metadata validator - for storing AI errors inline in conversation (like T3.chat)
export const errorValidator = v.object({
	code: v.string(), // "rate_limit", "auth_error", "model_error", "network_error", "content_filter", "context_length", "unknown"
	message: v.string(),
	details: v.optional(v.string()),
	provider: v.optional(v.string()),
	retryable: v.optional(v.boolean()),
});

// Message type validator
export const messageTypeValidator = v.optional(
	v.union(v.literal("text"), v.literal("error"), v.literal("system"))
);

// Return type for list query - excludes redundant fields to reduce bandwidth
export const messageDoc = v.object({
	_id: v.id("messages"),
	clientMessageId: v.optional(v.string()),
	role: v.string(),
	content: v.string(),
	modelId: v.optional(v.string()),
	provider: v.optional(v.string()),
	reasoningEffort: v.optional(v.string()),
	webSearchEnabled: v.optional(v.boolean()),
	webSearchUsed: v.optional(v.boolean()),
	webSearchCallCount: v.optional(v.number()),
	toolCallCount: v.optional(v.number()),
	maxSteps: v.optional(v.number()),
	// DEPRECATED: Use chainOfThoughtParts instead
	reasoning: v.optional(v.string()),
	thinkingTimeMs: v.optional(v.number()),
	thinkingTimeSec: v.optional(v.number()),
	reasoningCharCount: v.optional(v.number()),
	reasoningChunkCount: v.optional(v.number()),
	reasoningTokenCount: v.optional(v.number()),
	// REASONING REDACTED: Whether reasoning was requested for this message
	// Used to show "redacted" state when provider doesn't return reasoning data
	reasoningRequested: v.optional(v.boolean()),
	// DEPRECATED: Use chainOfThoughtParts instead
	// Tool invocations that occurred during message generation
	toolInvocations: v.optional(v.array(toolInvocationValidator)),
	// NEW: Unified chain of thought parts - preserves exact stream order
	chainOfThoughtParts: v.optional(v.array(chainOfThoughtPartValidator)),
	// STREAM RECONNECTION: Include status and streamId to support reconnecting to active streams
	status: v.optional(v.string()),
	streamId: v.optional(v.string()),
	attachments: v.optional(
		v.array(
			v.object({
				storageId: v.id("_storage"),
				filename: v.string(),
				contentType: v.string(),
				size: v.number(),
				uploadedAt: v.number(),
				url: v.optional(v.string()),
			})
		)
	),
	// ERROR HANDLING: Error metadata for failed AI responses (displayed inline like T3.chat)
	error: v.optional(errorValidator),
	// Message type: "text" (default), "error", "system"
	messageType: messageTypeValidator,
	createdAt: v.number(),
	deletedAt: v.optional(v.number()),
	tokenUsage: v.optional(
		v.object({
			promptTokens: v.number(),
			completionTokens: v.number(),
			totalTokens: v.number(),
		})
	),
	tokensPerSecond: v.optional(v.number()),
	timeToFirstTokenMs: v.optional(v.number()),
	totalDurationMs: v.optional(v.number()),
});

// Type for tool invocation data (DEPRECATED)
export type ToolInvocationData = {
	toolName: string;
	toolCallId: string;
	state: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

// NEW: Type for chain of thought part
export type ChainOfThoughtPartData = {
	type: "reasoning" | "tool";
	index: number;
	text?: string;
	toolName?: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

// Type for error metadata
export type ErrorData = {
	code: string;
	message: string;
	details?: string;
	provider?: string;
	retryable?: boolean;
};

// Type for message type
export type MessageType = "text" | "error" | "system";
