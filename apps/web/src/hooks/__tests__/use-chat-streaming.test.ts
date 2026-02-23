/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { Id } from "@server/convex/_generated/dataModel";
import type { StreamingState } from "../chat-utils";

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		backgroundStream: { getActiveStreamJob: "backgroundStream.getActiveStreamJob" },
	},
}));

type StreamJob = {
	messageId: string;
	status: string;
	content?: string;
	reasoning?: string;
	reasoningRequested?: boolean;
	options?: {
		enableReasoning?: boolean;
		enableWebSearch?: boolean;
		reasoningEffort?: string;
	};
	chainOfThoughtParts?: unknown[];
	thinkingTimeSec?: number;
	reasoningTokenCount?: number;
	model?: string;
	provider?: string;
	webSearchUsed?: boolean;
	webSearchCallCount?: number;
	toolCallCount?: number;
};

let mockActiveStreamJob: StreamJob | null | undefined = null;

vi.mock("convex/react", () => ({
	useQuery: vi.fn(() => mockActiveStreamJob),
	useMutation: vi.fn(() => vi.fn()),
}));

const mockCompleteStream = vi.fn();
const mockSetResuming = vi.fn();

vi.mock("@/stores/stream", () => ({
	useStreamStore: Object.assign(vi.fn(), {
		getState: () => ({
			completeStream: mockCompleteStream,
			setResuming: mockSetResuming,
		}),
	}),
}));

import { useChatStreaming } from "../use-chat-streaming";

const CONVEX_USER_ID = "user-123" as unknown as Id<"users">;

function makeStreamJob(overrides: Partial<StreamJob> = {}): StreamJob {
	return {
		messageId: "stream-msg-1",
		status: "running",
		content: "",
		reasoning: "",
		reasoningRequested: false,
		options: {},
		chainOfThoughtParts: [],
		...overrides,
	};
}

function makeStreamingRef(init: StreamingState | null = null) {
	return { current: init };
}

function makeAssistantMsg(id: string, parts: UIMessage["parts"] = []): UIMessage {
	return { id, role: "assistant", parts, content: "" } as UIMessage;
}

function getLastSetMessagesUpdater(
	setMessages: ReturnType<typeof vi.fn>,
): ((prev: UIMessage[]) => UIMessage[]) | null {
	if (setMessages.mock.calls.length === 0) return null;
	return setMessages.mock.calls[setMessages.mock.calls.length - 1][0];
}

beforeEach(() => {
	mockActiveStreamJob = null;
	vi.clearAllMocks();
	mockCompleteStream.mockReset();
	mockSetResuming.mockReset();
});

describe("useChatStreaming – no active job, status streaming/submitted (lines 40-62)", () => {
	it("calls setStatus('ready') and completeStream when no job and status=streaming, streamingRef=null", () => {
		const setStatus = vi.fn();
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef(null);
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus,
				setMessages,
				streamingRef,
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("ready");
		expect(mockCompleteStream).toHaveBeenCalled();
		expect(setMessages).not.toHaveBeenCalled();
	});

	it("sets streamingRef.current to null during finalization", () => {
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(streamingRef.current).toBeNull();
	});

	it("calls setMessages when streamingRef.current is set and message has streaming reasoning", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(setMessages).toHaveBeenCalled();
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const prevMsg = makeAssistantMsg("s1", [
			{ type: "reasoning", text: "thinking...", state: "streaming" } as UIMessage["parts"][number],
		]);
		const result = updater([prevMsg]);
		const reasoningPart = result[0].parts.find((p) => p.type === "reasoning") as
			| { state?: string }
			| undefined;
		expect(reasoningPart?.state).toBe("done");
	});

	it("setMessages updater returns prev unchanged when streamId not found in messages", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [makeAssistantMsg("other-id")];
		const result = updater(prevMessages);
		expect(result).toBe(prevMessages);
	});

	it("setMessages updater returns prev unchanged when message has no streaming reasoning", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const prevMsg = makeAssistantMsg("s1", [
			{ type: "text", text: "done text", state: "done" } as UIMessage["parts"][number],
		]);
		const result = updater([prevMsg]);
		expect(result).toStrictEqual([prevMsg]);
	});

	it("calls setStatus('ready') when status=submitted and no active job", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "submitted",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("ready");
		expect(mockCompleteStream).toHaveBeenCalled();
	});

	it("does NOT call setStatus when status=ready and no active job", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = null;
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(setStatus).not.toHaveBeenCalled();
		expect(mockCompleteStream).not.toHaveBeenCalled();
	});
});

describe("useChatStreaming – job completed or error (lines 65-71)", () => {
	it("calls setStatus('ready') and completeStream when job.status=completed and streaming", () => {
		const setStatus = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ status: "completed" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus,
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("ready");
		expect(mockCompleteStream).toHaveBeenCalled();
		expect(streamingRef.current).toBeNull();
	});

	it("calls setStatus('ready') and completeStream when job.status=error and streaming", () => {
		const setStatus = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ status: "error" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus,
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("ready");
		expect(mockCompleteStream).toHaveBeenCalled();
	});

	it("does NOT call setStatus when job.status=completed but status=ready", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = makeStreamJob({ status: "completed" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(setStatus).not.toHaveBeenCalled();
		expect(mockCompleteStream).not.toHaveBeenCalled();
	});

	it("does NOT call setStatus when job.status=completed but status=submitted", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = makeStreamJob({ status: "completed" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "submitted",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(setStatus).not.toHaveBeenCalled();
	});
});

describe("useChatStreaming – running job, new stream (lines 85-128)", () => {
	it("calls setStatus('streaming') and setResuming when status is ready", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = makeStreamJob({ messageId: "stream-1" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("streaming");
		expect(mockSetResuming).toHaveBeenCalled();
	});

	it("does NOT call setStatus or setResuming when already streaming", () => {
		const setStatus = vi.fn();
		mockActiveStreamJob = makeStreamJob({ messageId: "stream-1" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus,
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef({ id: "stream-1", content: "", reasoning: "", chainHash: "[]" }),
			}),
		);
		expect(setStatus).not.toHaveBeenCalled();
		expect(mockSetResuming).not.toHaveBeenCalled();
	});

	it("adds new message to prev when streamingRef is null (line 90)", () => {
		const setMessages = vi.fn();
		mockActiveStreamJob = makeStreamJob({ messageId: "stream-1", content: "hello" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef: makeStreamingRef(null),
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const result = updater([]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("stream-1");
		expect(result[0].role).toBe("assistant");
	});

	it("does not add duplicate message when message already exists in prev", () => {
		const setMessages = vi.fn();
		mockActiveStreamJob = makeStreamJob({ messageId: "stream-1" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef: makeStreamingRef(null),
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const existing = makeAssistantMsg("stream-1");
		const result = updater([existing]);
		expect(result).toStrictEqual([existing]);
	});

	it("replaces streamingRef and adds message when streamId changed", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "old-stream", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ messageId: "new-stream" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(streamingRef.current?.id).toBe("new-stream");
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const result = updater([]);
		expect(result[0].id).toBe("new-stream");
	});

	it("sets streamingRef.current with job data when adding new stream", () => {
		const streamingRef = makeStreamingRef(null);
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "hi", reasoning: "think" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(streamingRef.current?.id).toBe("s1");
		expect(streamingRef.current?.content).toBe("hi");
		expect(streamingRef.current?.reasoning).toBe("think");
	});
});

describe("useChatStreaming – content/reasoning update (lines 134-170)", () => {
	it("updates message parts when content changes (line 134)", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "old", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "new content" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(streamingRef.current?.content).toBe("new content");
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const prevMsg = makeAssistantMsg("s1", [
			{ type: "text", text: "old", state: "streaming" } as UIMessage["parts"][number],
		]);
		const result = updater([prevMsg]);
		expect(result).not.toBe([prevMsg] as unknown);
		const textPart = result[0].parts.find((p) => p.type === "text") as
			| { text?: string }
			| undefined;
		expect(textPart?.text).toBe("new content");
	});

	it("updates message parts when reasoning changes", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "old reason", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "", reasoning: "new reason", reasoningRequested: true });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(streamingRef.current?.reasoning).toBe("new reason");
	});

	it("updates streamingRef.chainHash when chainOfThoughtParts change", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({
			messageId: "s1",
			content: "",
			chainOfThoughtParts: [{ type: "tool", index: 0, toolName: "search" }],
		});
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(streamingRef.current?.chainHash).not.toBe("[]");
	});

	it("setMessages updater returns prev unchanged when message id not found", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "old", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "new" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [makeAssistantMsg("other-id")];
		const result = updater(prevMessages);
		expect(result).toBe(prevMessages);
	});

	it("setMessages updater returns prev when parts hash is unchanged", () => {
		const setMessages = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "same", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "new-text" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		const updater = getLastSetMessagesUpdater(setMessages)!;
		const parts: UIMessage["parts"] = [
			{ type: "text", text: "new-text", state: "streaming" } as UIMessage["parts"][number],
		];
		const prevMsg = makeAssistantMsg("s1", parts);
		const result = updater([prevMsg]);
		expect(result).toStrictEqual([prevMsg]);
	});

	it("does NOT trigger content update branch when content/reasoning/chainHash are all unchanged", () => {
		const setMessages = vi.fn();
		const chainHash = JSON.stringify([]);
		const streamingRef = makeStreamingRef({ id: "s1", content: "same", reasoning: "", chainHash });
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "same" });
		renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages,
				streamingRef,
			}),
		);
		expect(setMessages).not.toHaveBeenCalled();
	});
});

describe("useChatStreaming – stop() and return values", () => {
	it("stop() calls setStatus('ready'), nullifies streamingRef, and completes stream", () => {
		const setStatus = vi.fn();
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		mockActiveStreamJob = null;
		const { result } = renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setStatus,
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		act(() => {
			result.current.stop();
		});
		expect(setStatus).toHaveBeenCalledWith("ready");
		expect(streamingRef.current).toBeNull();
		expect(mockCompleteStream).toHaveBeenCalled();
	});

	it("isResuming is true when status=streaming and activeStreamJob exists", () => {
		mockActiveStreamJob = makeStreamJob({ messageId: "s1" });
		const streamingRef = makeStreamingRef({ id: "s1", content: "", reasoning: "", chainHash: "[]" });
		const { result } = renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(result.current.isResuming).toBe(true);
	});

	it("isResuming is false when activeStreamJob is null", () => {
		mockActiveStreamJob = null;
		const { result } = renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(result.current.isResuming).toBe(false);
	});

	it("resumedContent reflects streamingRef.current.content", () => {
		mockActiveStreamJob = makeStreamJob({ messageId: "s1", content: "streamed text" });
		const streamingRef = makeStreamingRef({ id: "s1", content: "streamed text", reasoning: "", chainHash: "[]" });
		const { result } = renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef,
			}),
		);
		expect(result.current.resumedContent).toBe("streamed text");
	});

	it("resumedContent is empty string when streamingRef.current is null", () => {
		mockActiveStreamJob = null;
		const { result } = renderHook(() =>
			useChatStreaming({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setStatus: vi.fn(),
				setMessages: vi.fn(),
				streamingRef: makeStreamingRef(null),
			}),
		);
		expect(result.current.resumedContent).toBe("");
	});
});
