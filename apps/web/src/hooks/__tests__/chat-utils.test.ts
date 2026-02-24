import { describe, expect, test } from "vitest";
import {
	messageFingerprint,
	hasStreamingState,
	getUserFriendlyError,
	normalizeMessageParts,
	normalizeStreamingReasoningState,
	convexMessageToUIMessage,
} from "../chat-utils";
import type { UIMessage } from "ai";

function makeTextPart(text: string, state: "streaming" | "done" = "done") {
	return { type: "text" as const, text, state };
}

function makeReasoningPart(text: string, state: "streaming" | "done" = "done") {
	return { type: "reasoning" as const, text, state };
}

describe("messageFingerprint", () => {
	test("returns a JSON string including id, role, parts, and metadata", () => {
		const msg = {
			id: "msg-1",
			role: "user" as const,
			parts: [makeTextPart("hello")],
			metadata: { foo: "bar" },
			content: "",
		} as UIMessage;
		const fp = messageFingerprint(msg);
		expect(fp).toContain("msg-1");
		expect(fp).toContain("user");
		expect(fp).toContain("hello");
		expect(fp).toContain("bar");
	});

	test("uses null for metadata when undefined", () => {
		const msg = {
			id: "msg-2",
			role: "assistant" as const,
			parts: [],
			content: "",
		} as UIMessage;
		const fp = messageFingerprint(msg);
		expect(fp).toContain('"metadata":null');
	});

	test("two identical messages have the same fingerprint", () => {
		const make = () =>
			({
				id: "same",
				role: "user" as const,
				parts: [makeTextPart("hi")],
				content: "",
			}) as UIMessage;
		expect(messageFingerprint(make())).toBe(messageFingerprint(make()));
	});

	test("different content produces different fingerprints", () => {
		const a = { id: "x", role: "user" as const, parts: [makeTextPart("a")], content: "" } as UIMessage;
		const b = { id: "x", role: "user" as const, parts: [makeTextPart("b")], content: "" } as UIMessage;
		expect(messageFingerprint(a)).not.toBe(messageFingerprint(b));
	});
});

describe("hasStreamingState", () => {
	test("returns true for a reasoning part with state=streaming", () => {
		expect(hasStreamingState(makeReasoningPart("text", "streaming"))).toBe(true);
	});

	test("returns false for a reasoning part with state=done", () => {
		expect(hasStreamingState(makeReasoningPart("text", "done"))).toBe(false);
	});

	test("returns false for a text part (not reasoning)", () => {
		expect(hasStreamingState(makeTextPart("text", "streaming"))).toBe(false);
	});

	test("returns false for null", () => {
		expect(hasStreamingState(null)).toBe(false);
	});

	test("returns false for plain object without type", () => {
		expect(hasStreamingState({ state: "streaming" })).toBe(false);
	});
});

describe("getUserFriendlyError", () => {
	test("maps rate limit errors", () => {
		const msg = getUserFriendlyError("Rate limit exceeded");
		expect(msg).toContain("too quickly");
	});

	test("maps too many requests errors", () => {
		const msg = getUserFriendlyError("too many requests");
		expect(msg).toContain("too quickly");
	});

	test("maps unauthorized errors", () => {
		expect(getUserFriendlyError("Unauthorized access")).toContain("Session expired");
	});

	test("maps authentication errors", () => {
		expect(getUserFriendlyError("authentication failed")).toContain("Session expired");
	});

	test("maps not found errors", () => {
		expect(getUserFriendlyError("Not found in database")).toContain("could not be found");
	});

	test("maps timeout errors", () => {
		expect(getUserFriendlyError("Request timeout")).toContain("too long");
	});

	test("maps timed out variant", () => {
		expect(getUserFriendlyError("operation timed out")).toContain("too long");
	});

	test("maps network errors", () => {
		expect(getUserFriendlyError("network error occurred")).toContain("Network error");
	});

	test("maps connection errors", () => {
		expect(getUserFriendlyError("connection refused")).toContain("Network error");
	});

	test("returns generic message for unknown errors", () => {
		expect(getUserFriendlyError("some unknown database error")).toContain("unexpected error");
	});

	test("is case-insensitive", () => {
		expect(getUserFriendlyError("RATE LIMIT")).toContain("too quickly");
	});
});

describe("normalizeMessageParts", () => {
	test("returns a text part for basic content", () => {
		const parts = normalizeMessageParts({ content: "hello world" });
		const textPart = parts.find((p) => p.type === "text");
		expect(textPart).toBeDefined();
		expect((textPart as { text: string }).text).toBe("hello world");
	});

	test("text part has state=done when not streaming", () => {
		const parts = normalizeMessageParts({ content: "done" });
		const textPart = parts.find((p) => p.type === "text") as { state: string } | undefined;
		expect(textPart?.state).toBe("done");
	});

	test("text part has state=streaming when streaming", () => {
		const parts = normalizeMessageParts({ content: "partial", isStreaming: true });
		const textPart = parts.find((p) => p.type === "text") as { state: string } | undefined;
		expect(textPart?.state).toBe("streaming");
	});

	test("adds reasoning part when reasoningRequested and reasoning string provided (no chainParts)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoning: "I thought about it",
			reasoningRequested: true,
		});
		const rPart = parts.find((p) => p.type === "reasoning");
		expect(rPart).toBeDefined();
		expect((rPart as { text: string }).text).toBe("I thought about it");
	});

	test("does not add reasoning part when reasoningRequested is false", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoning: "hidden reasoning",
			reasoningRequested: false,
		});
		expect(parts.find((p) => p.type === "reasoning")).toBeUndefined();
	});

	test("uses chainOfThoughtParts when provided", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: true,
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: "chain reasoning", state: "done" },
			],
		});
		const rPart = parts.find((p) => p.type === "reasoning");
		expect(rPart).toBeDefined();
		expect((rPart as { text: string }).text).toBe("chain reasoning");
	});

	test("skips reasoning chainParts when reasoningRequested is false", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: false,
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: "hidden", state: "done" },
			],
		});
		expect(parts.find((p) => p.type === "reasoning")).toBeUndefined();
	});

	test("includes tool parts from chainOfThoughtParts", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "calculator", toolCallId: "tc1", state: "output-available", input: { expr: "2+2" }, output: 4 },
			],
		});
		const toolPart = parts.find((p) => p.type === "tool-calculator");
		expect(toolPart).toBeDefined();
	});

	test("sorts chainOfThoughtParts by index", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: true,
			chainOfThoughtParts: [
				{ type: "tool", index: 1, toolName: "calc", toolCallId: "tc1", state: "output-available" },
				{ type: "reasoning", index: 0, text: "first", state: "done" },
			],
		});
		expect(parts[0]?.type).toBe("reasoning");
		expect(parts[1]?.type).toBe("tool-calc");
	});

	test("sanitizes tool names with special characters", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "my-tool.v2", toolCallId: "tc1", state: "input-available" },
			],
		});
		const toolPart = parts.find((p) => (p.type as string).startsWith("tool-"));
		expect(toolPart).toBeDefined();
		expect((toolPart as { type: string }).type).toMatch(/^tool-[a-zA-Z0-9_-]+$/);
	});

	test("skips empty reasoning chainPart when not streaming", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: true,
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: "", state: "done" },
			],
		});
		expect(parts.find((p) => p.type === "reasoning")).toBeUndefined();
	});

	test("includes empty reasoning chainPart when streaming", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: true,
			isStreaming: true,
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: "", state: "streaming" },
			],
		});
		expect(parts.find((p) => p.type === "reasoning")).toBeDefined();
	});
});

describe("normalizeStreamingReasoningState", () => {
	test("converts streaming reasoning parts to done", () => {
		const parts = [makeReasoningPart("text", "streaming")] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, true);
		const rPart = result.find((p) => p.type === "reasoning") as { state: string } | undefined;
		expect(rPart?.state).toBe("done");
	});

	test("leaves already-done reasoning parts unchanged", () => {
		const parts = [makeReasoningPart("text", "done")] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, true);
		const rPart = result.find((p) => p.type === "reasoning") as { state: string } | undefined;
		expect(rPart?.state).toBe("done");
	});

	test("filters out empty reasoning parts when reasoningRequested is false", () => {
		const parts = [makeReasoningPart("", "done")] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, false);
		expect(result.find((p) => p.type === "reasoning")).toBeUndefined();
	});

	test("keeps non-empty reasoning parts when reasoningRequested is false", () => {
		const parts = [makeReasoningPart("some thoughts", "done")] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, false);
		expect(result.find((p) => p.type === "reasoning")).toBeDefined();
	});

	test("preserves text parts unchanged", () => {
		const parts = [makeTextPart("hello"), makeReasoningPart("r", "streaming")] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, true);
		expect(result.find((p) => p.type === "text")).toBeDefined();
	});
});

describe("convexMessageToUIMessage", () => {
	const baseMsg = {
		_id: "server-id-1",
		role: "assistant",
		content: "Hello!",
		createdAt: 1700000000000,
	};

	test("maps _id to serverMessageId metadata", () => {
		const ui = convexMessageToUIMessage(baseMsg);
		expect((ui.metadata as { serverMessageId: string }).serverMessageId).toBe("server-id-1");
	});

	test("uses clientMessageId as id when present", () => {
		const ui = convexMessageToUIMessage({ ...baseMsg, clientMessageId: "client-123" });
		expect(ui.id).toBe("client-123");
	});

	test("uses _id as id when clientMessageId is absent", () => {
		const ui = convexMessageToUIMessage(baseMsg);
		expect(ui.id).toBe("server-id-1");
	});

	test("sets role correctly", () => {
		const ui = convexMessageToUIMessage(baseMsg);
		expect(ui.role).toBe("assistant");
	});

	test("maps reasoning to metadata", () => {
		const ui = convexMessageToUIMessage({
			...baseMsg,
			thinkingTimeSec: 5,
			reasoningRequested: true,
			reasoningTokenCount: 100,
		});
		const meta = ui.metadata as Record<string, unknown>;
		expect(meta.thinkingTimeSec).toBe(5);
		expect(meta.reasoningRequested).toBe(true);
		expect(meta.reasoningTokenCount).toBe(100);
	});

	test("sets resumedFromActiveStream=true when status is streaming", () => {
		const ui = convexMessageToUIMessage({ ...baseMsg, status: "streaming" });
		const meta = ui.metadata as { resumedFromActiveStream: boolean };
		expect(meta.resumedFromActiveStream).toBe(true);
	});

	test("sets resumedFromActiveStream=false when status is not streaming", () => {
		const ui = convexMessageToUIMessage({ ...baseMsg, status: "done" });
		const meta = ui.metadata as { resumedFromActiveStream: boolean };
		expect(meta.resumedFromActiveStream).toBe(false);
	});

	test("includes at least one text part with the content", () => {
		const ui = convexMessageToUIMessage({ ...baseMsg, content: "Test content" });
		const textPart = ui.parts.find((p) => p.type === "text");
		expect(textPart).toBeDefined();
		expect((textPart as { text: string }).text).toBe("Test content");
	});

	test("maps model and provider metadata", () => {
		const ui = convexMessageToUIMessage({
			...baseMsg,
			modelId: "openai/gpt-4o",
			provider: "openrouter",
		});
		const meta = ui.metadata as Record<string, unknown>;
		expect(meta.modelId).toBe("openai/gpt-4o");
		expect(meta.provider).toBe("openrouter");
	});

	test("maps web search metadata", () => {
		const ui = convexMessageToUIMessage({
			...baseMsg,
			webSearchEnabled: true,
			webSearchUsed: true,
			webSearchCallCount: 3,
		});
		const meta = ui.metadata as Record<string, unknown>;
		expect(meta.webSearchEnabled).toBe(true);
		expect(meta.webSearchUsed).toBe(true);
		expect(meta.webSearchCallCount).toBe(3);
	});

	test("maps token usage metadata", () => {
		const ui = convexMessageToUIMessage({
			...baseMsg,
			tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
		});
		const meta = ui.metadata as Record<string, unknown>;
		const usage = meta.tokenUsage as { promptTokens: number };
		expect(usage.promptTokens).toBe(100);
	});
});

describe("chat-utils private function branches", () => {
	test("sanitizeToolName returns 'tool' for empty string (line 97)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "", toolCallId: "tc1", state: "output-available" },
			],
		});
		const toolPart = parts.find((p) => (p as { type: string }).type === "tool-tool") as { type: string } | undefined;
		expect(toolPart).toBeDefined();
	});

	test("reasoning chainPart with undefined text uses empty string (line 136)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoningRequested: true,
			isStreaming: true,
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: undefined as unknown as string, state: "streaming" },
			],
		});
		expect(parts.find((p) => p.type === "reasoning")).toBeDefined();
	});

	test("tool chainPart with undefined toolCallId uses generated id (line 150)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "search", state: "output-available", toolCallId: undefined as unknown as string },
			],
		});
		const toolPart = parts.find((p) => (p as { type: string }).type === "tool-search");
		expect(toolPart).toBeDefined();
	});

	test("reasoning part when reasoningRequested but no chainParts has done state when not streaming (line 162)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoning: "my thoughts",
			reasoningRequested: true,
			isStreaming: false,
		});
		const rPart = parts.find((p) => p.type === "reasoning") as { state: string } | undefined;
		expect(rPart?.state).toBe("done");
	});

	test("reasoning part has streaming state when isStreaming is true (line 162 streaming branch)", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			reasoning: "thinking...",
			reasoningRequested: true,
			isStreaming: true,
		});
		const rPart = parts.find((p) => p.type === "reasoning") as { state: string } | undefined;
		expect(rPart?.state).toBe("streaming");
	});

	test("getReasoningText returns undefined for non-reasoning part when filtered (line 66)", () => {
		const parts = [
			{ type: "text" as const, text: "hello", state: "done" as const },
			{ type: "reasoning" as const, text: "", state: "done" as const },
		] as UIMessage["parts"];
		const result = normalizeStreamingReasoningState(parts, false);
		expect(result.find((p) => p.type === "text")).toBeDefined();
		expect(result.find((p) => p.type === "reasoning")).toBeUndefined();
	});
});

describe("normalizeToolState fallback path (line 113)", () => {
	test("tool part with undefined state gets input-available when not streaming", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "search", toolCallId: "tc1", state: undefined as unknown as string },
			],
		});
		const toolPart = parts.find((p) => (p as { type: string }).type === "tool-search") as { state: string } | undefined;
		expect(toolPart?.state).toBe("input-available");
	});

	test("tool part with undefined state gets input-streaming when streaming", () => {
		const parts = normalizeMessageParts({
			content: "answer",
			isStreaming: true,
			chainOfThoughtParts: [
				{ type: "tool", index: 0, toolName: "search", toolCallId: "tc1", state: undefined as unknown as string },
			],
		});
		const toolPart = parts.find((p) => (p as { type: string }).type === "tool-search") as { state: string } | undefined;
		expect(toolPart?.state).toBe("input-streaming");
	});
});
