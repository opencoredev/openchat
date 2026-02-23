/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { Id } from "@server/convex/_generated/dataModel";

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		messages: { list: "messages.list" },
	},
}));

type ConvexMsg = {
	_id: string;
	role: string;
	content: string;
	createdAt: number;
	clientMessageId?: string;
};

let mockMessagesResult: ConvexMsg[] | undefined = undefined;

vi.mock("convex/react", () => ({
	useQuery: vi.fn(() => mockMessagesResult),
	useMutation: vi.fn(() => vi.fn()),
}));

import { useChatMessages } from "../use-chat-messages";
import { convexMessageToUIMessage } from "../chat-utils";

const CONVEX_USER_ID = "user-123" as unknown as Id<"users">;

function makeConvexMsg(
	id: string,
	role: "user" | "assistant" = "user",
	content = "hello",
	clientMessageId?: string,
): ConvexMsg {
	return { _id: id, role, content, createdAt: 1700000000000, clientMessageId };
}

function makeUIMessage(id: string, role: "user" | "assistant" = "user", content = "hello"): UIMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text: content, state: "done" }],
		content: "",
	} as UIMessage;
}

function getLastUpdater(mockFn: ReturnType<typeof vi.fn>): ((prev: UIMessage[]) => UIMessage[]) | null {
	if (mockFn.mock.calls.length === 0) return null;
	return mockFn.mock.calls[mockFn.mock.calls.length - 1][0];
}

beforeEach(() => {
	mockMessagesResult = undefined;
	vi.clearAllMocks();
});

describe("useChatMessages – early return conditions (line 32)", () => {
	it("does not call setMessages when messagesResult is undefined", () => {
		const setMessages = vi.fn();
		mockMessagesResult = undefined;
		renderHook(() =>
			useChatMessages({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "ready",
				setMessages,
			}),
		);
		expect(setMessages).not.toHaveBeenCalled();
	});

	it("does not call setMessages when status is 'streaming'", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [makeConvexMsg("msg-1")];
		renderHook(() =>
			useChatMessages({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "streaming",
				setMessages,
			}),
		);
		expect(setMessages).not.toHaveBeenCalled();
	});

	it("does not call setMessages when status is 'submitted'", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [makeConvexMsg("msg-1")];
		renderHook(() =>
			useChatMessages({
				chatId: "chat-1",
				convexUserId: CONVEX_USER_ID,
				status: "submitted",
				setMessages,
			}),
		);
		expect(setMessages).not.toHaveBeenCalled();
	});
});

describe("useChatMessages – prevMessages.length === 0 (lines 38-39)", () => {
	it("sets nextMessages to convexMessages directly when prevMessages is empty", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [makeConvexMsg("msg-1", "user", "hello")];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages);
		expect(updater).not.toBeNull();
		const result = updater!([]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("msg-1");
		expect(result[0].role).toBe("user");
	});

	it("calls setMessages when messagesResult is an empty array and prevMessages is empty", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		expect(setMessages).toHaveBeenCalled();
		const updater = getLastUpdater(setMessages)!;
		const result = updater([]);
		expect(result).toHaveLength(0);
	});
});

describe("useChatMessages – isLastPrevStreaming via 'resume-' prefix (lines 41-54)", () => {
	it("replaces last convex assistant message id with prev id when last prev starts with 'resume-'", () => {
		const setMessages = vi.fn();
		const convexUser = makeConvexMsg("server-user-1", "user", "hi");
		const convexAssistant = makeConvexMsg("server-asst-1", "assistant", "world");
		mockMessagesResult = [convexUser, convexAssistant];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexUser),
			{ ...makeUIMessage("resume-xyz", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result[result.length - 1].id).toBe("resume-xyz");
	});

	it("does NOT replace id when last convex message is user role (even with resume- prev)", () => {
		const setMessages = vi.fn();
		const convexUser1 = makeConvexMsg("server-user-1", "user", "hi");
		const convexUser2 = makeConvexMsg("server-user-2", "user", "world");
		mockMessagesResult = [convexUser1, convexUser2];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexUser1),
			{ ...makeUIMessage("resume-abc", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result[result.length - 1].id).not.toBe("resume-abc");
	});

	it("preserves parts of the last convex message when replacing id", () => {
		const setMessages = vi.fn();
		const convexUser = makeConvexMsg("server-user-1", "user", "hi");
		const convexAssistant = makeConvexMsg("server-asst-1", "assistant", "response text");
		mockMessagesResult = [convexUser, convexAssistant];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexUser),
			{ ...makeUIMessage("resume-abc", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		const lastMsg = result[result.length - 1];
		expect(lastMsg.id).toBe("resume-abc");
		const textPart = lastMsg.parts.find((p) => p.type === "text");
		expect((textPart as { text?: string } | undefined)?.text).toBe("response text");
	});
});

describe("useChatMessages – isLastPrevStreaming via assistant not in result (lines 41-54)", () => {
	it("replaces id when last prev is assistant with id not found in messagesResult", () => {
		const setMessages = vi.fn();
		const convexUser = makeConvexMsg("server-user-1", "user", "hi");
		const convexAssistant = makeConvexMsg("server-asst-1", "assistant", "world");
		mockMessagesResult = [convexUser, convexAssistant];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexUser),
			{ ...makeUIMessage("local-asst-id", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result[result.length - 1].id).toBe("local-asst-id");
	});

	it("does NOT replace id when last prev assistant id IS found in messagesResult", () => {
		const setMessages = vi.fn();
		const convexUser = makeConvexMsg("server-user-1", "user", "hi");
		const convexAssistant = makeConvexMsg("server-asst-1", "assistant", "world");
		mockMessagesResult = [convexUser, convexAssistant];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexUser),
			{ ...makeUIMessage("server-asst-1", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result[result.length - 1].id).toBe("server-asst-1");
	});

	it("does not treat last user message as streaming even if not in result", () => {
		const setMessages = vi.fn();
		const convexUser = makeConvexMsg("server-user-1", "user", "hi");
		const convexAssistant = makeConvexMsg("server-asst-1", "assistant", "world");
		mockMessagesResult = [convexUser, convexAssistant];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			{ ...makeUIMessage("local-user-id", "user"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result).toHaveLength(2);
		expect(result[result.length - 1].id).toBe("server-asst-1");
	});

	it("does not replace when convexMessages is empty (line 47 guard)", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			{ ...makeUIMessage("resume-abc", "assistant"), parts: [] },
		];
		const result = updater(prevMessages);
		expect(result).toHaveLength(0);
	});
});

describe("useChatMessages – fingerprint comparison early return (lines 58-66)", () => {
	it("returns the same prevMessages reference when fingerprints are identical", () => {
		const setMessages = vi.fn();
		const convexMsg = makeConvexMsg("msg-1", "user", "hello");
		mockMessagesResult = [convexMsg];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const uiMsg = convexMessageToUIMessage(convexMsg);
		const prevMessages: UIMessage[] = [uiMsg];
		const result = updater(prevMessages);
		expect(result).toBe(prevMessages);
	});

	it("returns new array when same length but fingerprints differ (content changed)", () => {
		const setMessages = vi.fn();
		const convexMsg = makeConvexMsg("msg-1", "user", "updated content");
		mockMessagesResult = [convexMsg];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "old content", state: "done" }],
				content: "",
			} as UIMessage,
		];
		const result = updater(prevMessages);
		expect(result).not.toBe(prevMessages);
		const textPart = result[0].parts.find((p) => p.type === "text");
		expect((textPart as { text?: string } | undefined)?.text).toBe("updated content");
	});

	it("skips fingerprint check when lengths differ and returns nextMessages", () => {
		const setMessages = vi.fn();
		const convexMsg1 = makeConvexMsg("msg-1", "user", "hello");
		const convexMsg2 = makeConvexMsg("msg-2", "assistant", "world");
		mockMessagesResult = [convexMsg1, convexMsg2];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [convexMessageToUIMessage(convexMsg1)];
		const result = updater(prevMessages);
		expect(result).toHaveLength(2);
	});

	it("returns prevMessages unchanged when multiple messages all have same fingerprints", () => {
		const setMessages = vi.fn();
		const convexMsg1 = makeConvexMsg("msg-1", "user", "hello");
		const convexMsg2 = makeConvexMsg("msg-2", "assistant", "world");
		mockMessagesResult = [convexMsg1, convexMsg2];
		renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		const updater = getLastUpdater(setMessages)!;
		const prevMessages: UIMessage[] = [
			convexMessageToUIMessage(convexMsg1),
			convexMessageToUIMessage(convexMsg2),
		];
		const result = updater(prevMessages);
		expect(result).toBe(prevMessages);
	});
});

describe("useChatMessages – return values", () => {
	it("returns isLoadingMessages=false when chatId is undefined", () => {
		const setMessages = vi.fn();
		const { result } = renderHook(() =>
			useChatMessages({ chatId: undefined, convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		expect(result.current.isLoadingMessages).toBe(false);
	});

	it("returns isLoadingMessages=true when chatId given but messagesResult is undefined", () => {
		const setMessages = vi.fn();
		mockMessagesResult = undefined;
		const { result } = renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		expect(result.current.isLoadingMessages).toBe(true);
	});

	it("returns isLoadingMessages=false when messagesResult is loaded", () => {
		const setMessages = vi.fn();
		mockMessagesResult = [];
		const { result } = renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		expect(result.current.isLoadingMessages).toBe(false);
	});

	it("exposes messagesResult returned by useQuery", () => {
		const setMessages = vi.fn();
		const msgs = [makeConvexMsg("msg-1")];
		mockMessagesResult = msgs;
		const { result } = renderHook(() =>
			useChatMessages({ chatId: "chat-1", convexUserId: CONVEX_USER_ID, status: "ready", setMessages }),
		);
		expect(result.current.messagesResult).toBe(msgs);
	});
});
