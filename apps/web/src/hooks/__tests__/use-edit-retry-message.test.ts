/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UIMessage } from "ai";
import type { Id } from "@server/convex/_generated/dataModel";
import type { StreamingState } from "../chat-utils";

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		messages: {
			editAndRegenerate: "messages.editAndRegenerate",
			retryMessage: "messages.retryMessage",
		},
		backgroundStream: {
			startStream: "backgroundStream.startStream",
			cleanupStaleJobs: "backgroundStream.cleanupStaleJobs",
		},
	},
}));

const mockEditAndRegenerate = vi.fn();
const mockRetryMessageMut = vi.fn();
const mockStartBackgroundStream = vi.fn();
const mockCleanupStaleJobs = vi.fn();

const mutationMap: Record<string, ReturnType<typeof vi.fn>> = {
	"messages.editAndRegenerate": mockEditAndRegenerate,
	"messages.retryMessage": mockRetryMessageMut,
	"backgroundStream.startStream": mockStartBackgroundStream,
	"backgroundStream.cleanupStaleJobs": mockCleanupStaleJobs,
};

vi.mock("convex/react", () => ({
	useMutation: vi.fn((fn: string) => mutationMap[fn] ?? vi.fn()),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn() },
}));

const mockCompleteStream = vi.fn();

vi.mock("@/stores/stream", () => ({
	useStreamStore: Object.assign(vi.fn(), {
		getState: () => ({ completeStream: mockCompleteStream, setResuming: vi.fn() }),
	}),
}));

let mockProviderState = {
	activeProvider: "openrouter" as string,
	isOverLimit: (): boolean => false,
};

vi.mock("@/stores/provider", () => ({
	useProviderStore: Object.assign(vi.fn(), {
		getState: () => mockProviderState,
	}),
}));

let mockModelState = {
	selectedModelId: "anthropic/claude-3.5-sonnet",
	reasoningEnabled: false,
};

vi.mock("@/stores/model", () => ({
	useModelStore: Object.assign(vi.fn(), {
		getState: () => mockModelState,
	}),
	getModelById: vi.fn(() => undefined),
	getModelCapabilities: vi.fn(() => ({
		supportsTools: false,
		supportsReasoning: false,
		supportsEffortLevels: false,
		alwaysReasons: false,
	})),
}));

import { useEditRetryMessage } from "../use-edit-retry-message";

function makeMsg(id: string, role: "user" | "assistant" = "user", text = "hello"): UIMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text }] as UIMessage["parts"],
		metadata: {},
	};
}

function makeResult(
	id: string,
	clientId?: string,
): { _id: Id<"messages">; clientMessageId?: string } {
	return {
		_id: id as Id<"messages">,
		...(clientId !== undefined ? { clientMessageId: clientId } : {}),
	};
}

type HookParams = Parameters<typeof useEditRetryMessage>[0];

function renderWithParams(overrides: Partial<HookParams> = {}) {
	const setMessages = vi.fn();
	const setStatus = vi.fn();
	const setError = vi.fn();
	const chatIdRef: { current: string | null } = { current: "chat_123" };
	const streamingRef: { current: StreamingState | null } = { current: null };

	const params: HookParams = {
		convexUserId: "user_123" as Id<"users">,
		messages: [makeMsg("msg_1", "user", "original")],
		messagesResult: [makeResult("msg_1")],
		setMessages,
		setStatus,
		setError,
		chatIdRef,
		streamingRef,
		models: [],
		activeProvider: "openrouter",
		webSearchEnabled: false,
		...overrides,
	};

	const { result } = renderHook(() => useEditRetryMessage(params));

	return {
		result,
		setMessages: (overrides.setMessages ?? setMessages) as ReturnType<typeof vi.fn>,
		setStatus: (overrides.setStatus ?? setStatus) as ReturnType<typeof vi.fn>,
		setError: (overrides.setError ?? setError) as ReturnType<typeof vi.fn>,
		chatIdRef: (overrides.chatIdRef ?? chatIdRef) as { current: string | null },
		streamingRef: (overrides.streamingRef ?? streamingRef) as {
			current: StreamingState | null;
		},
	};
}

beforeEach(() => {
	mockProviderState = { activeProvider: "openrouter", isOverLimit: () => false };
	mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: false };

	vi.clearAllMocks();

	mockEditAndRegenerate.mockResolvedValue({});
	mockRetryMessageMut.mockResolvedValue({ userContent: "original content" });
	mockStartBackgroundStream.mockResolvedValue({});
	mockCleanupStaleJobs.mockResolvedValue({});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("editMessage", () => {
	describe("early return guards", () => {
		it("does nothing when convexUserId is undefined", async () => {
			const { result, setStatus } = renderWithParams({ convexUserId: undefined });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});

		it("does nothing when chatIdRef.current is null", async () => {
			const chatIdRef = { current: null };
			const { result, setStatus } = renderWithParams({ chatIdRef });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});

		it("does nothing when content is an empty string", async () => {
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});

		it("does nothing when content is whitespace only", async () => {
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "   ");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});
	});

	describe("over-limit guard", () => {
		it("shows toast.error when osschat provider is over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Daily limit reached",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("does not call editAndRegenerate when over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
		});

		it("does not apply limit check when provider is openrouter even if isOverLimit", async () => {
			mockProviderState = { activeProvider: "openrouter", isOverLimit: () => true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalled();
		});
	});

	describe("message not found in messagesResult", () => {
		it("shows toast.error when messagesResult is undefined", async () => {
			const { toast } = await import("sonner");
			const { result } = renderWithParams({ messagesResult: undefined });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(toast.error).toHaveBeenCalled();
		});

		it("shows toast.error when message is not in messagesResult", async () => {
			const { toast } = await import("sonner");
			const { result } = renderWithParams({ messagesResult: [] });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Could not edit message",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("does not call editAndRegenerate when message is not found", async () => {
			const { result } = renderWithParams({ messagesResult: [] });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).not.toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("calls editAndRegenerate with correct chatId, userId, messageId, and trimmed content", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "  new content  ");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalledWith({
				chatId: "chat_123",
				userId: "user_123",
				messageId: "msg_1",
				newContent: "new content",
			});
		});

		it("passes trimmed content to editAndRegenerate, not the raw padded string", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "\t  trimmed  \t");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalledWith(
				expect.objectContaining({ newContent: "trimmed" }),
			);
		});

		it("sets status to 'submitted' then 'streaming' on success", async () => {
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setStatus).toHaveBeenCalledWith("submitted");
			expect(setStatus).toHaveBeenCalledWith("streaming");
		});

		it("calls setError(undefined) before starting", async () => {
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setError).toHaveBeenCalledWith(undefined);
		});

		it("calls cleanupStaleJobs with the userId", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockCleanupStaleJobs).toHaveBeenCalledWith({ userId: "user_123" });
		});

		it("calls startBackgroundStream with correct params", async () => {
			const { result } = renderWithParams({
				activeProvider: "openrouter",
				webSearchEnabled: true,
			});
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({
					chatId: "chat_123",
					userId: "user_123",
					model: "anthropic/claude-3.5-sonnet",
					provider: "openrouter",
					options: expect.objectContaining({
						enableWebSearch: true,
					}),
				}),
			);
		});

		it("calls setMessages twice: once with keptMessages, once with an updater fn", async () => {
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setMessages).toHaveBeenCalledTimes(2);
			expect(typeof setMessages.mock.calls[1][0]).toBe("function");
		});

		it("keptMessages contains the edited message with updated parts", async () => {
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const keptMessages = setMessages.mock.calls[0][0] as UIMessage[];
			expect(keptMessages).toHaveLength(1);
			const textPart = keptMessages[0].parts.find((p) => p.type === "text");
			expect((textPart as { text: string }).text).toBe("new content");
		});

		it("updater function appends a new assistant message", async () => {
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const prev = [makeMsg("msg_1", "user", "new content")];
			const updated = updater(prev);
			expect(updated).toHaveLength(2);
			expect(updated[1].role).toBe("assistant");
		});

		it("sets streamingRef.current on success", async () => {
			const { result, streamingRef } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(streamingRef.current).not.toBeNull();
			expect(streamingRef.current).toMatchObject({
				content: "",
				reasoning: "",
				chainHash: "[]",
			});
		});

		it("calls completeStream on the stream store", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockCompleteStream).toHaveBeenCalled();
		});

		it("finds message by clientMessageId in messagesResult", async () => {
			const messagesResult = [makeResult("server_id_1", "msg_1")];
			const { result } = renderWithParams({ messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalledWith(
				expect.objectContaining({ messageId: "server_id_1" }),
			);
		});

		it("passes messages (user/assistant only) to startBackgroundStream", async () => {
			const messages = [
				makeMsg("msg_1", "user", "original"),
				makeMsg("msg_2", "assistant", "response"),
			];
			const messagesResult = [makeResult("msg_1")];
			const { result } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.messages).toEqual([{ role: "user", content: "new content" }]);
		});
	});

	describe("reasoning parts", () => {
		it("adds reasoning part to initialParts when reasoningEnabled is true", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: true };
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const updated = updater([]);
			const assistantMsg = updated[0];
			const reasoningPart = assistantMsg.parts.find((p) => p.type === "reasoning");
			expect(reasoningPart).toBeDefined();
		});

		it("does not add reasoning part when reasoningEnabled is false", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: false };
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const updated = updater([]);
			const assistantMsg = updated[0];
			const reasoningPart = assistantMsg.parts.find((p) => p.type === "reasoning");
			expect(reasoningPart).toBeUndefined();
		});

		it("sets reasoningEffort 'medium' in startBackgroundStream when reasoning enabled", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.options.reasoningEffort).toBe("medium");
			expect(call.options.enableReasoning).toBe(true);
		});

		it("sets reasoningEffort 'none' in startBackgroundStream when reasoning disabled", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: false };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.options.reasoningEffort).toBe("none");
			expect(call.options.enableReasoning).toBe(false);
		});
	});

	describe("keptMessages map — no-text-part fallback and prior messages (lines 122, 145)", () => {
		it("passes prior messages unchanged when editedIndex > 0", async () => {
			const messages = [
				makeMsg("msg_0", "user", "earlier"),
				makeMsg("msg_1", "user", "original"),
			];
			const messagesResult = [makeResult("msg_0"), makeResult("msg_1")];
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "updated content");
			});
			const keptMessages = setMessages.mock.calls[0][0] as UIMessage[];
			expect(keptMessages).toHaveLength(2);
			expect(keptMessages[0].id).toBe("msg_0");
		});

		it("calls startBackgroundStream when a prior message has no text part", async () => {
			const messages = [
				{
					id: "msg_0",
					role: "assistant" as const,
					parts: [] as UIMessage["parts"],
					metadata: {},
				},
				makeMsg("msg_1", "user", "original"),
			];
			const messagesResult = [makeResult("msg_0"), makeResult("msg_1")];
			const { result } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "updated content");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalled();
		});
	});

	describe("metadata-based findIndex path", () => {
		it("finds edited message by metadata.serverMessageId when m.id does not match messageId", async () => {
			const messages = [
				{
					id: "local-msg-id",
					role: "user" as const,
					parts: [{ type: "text" as const, text: "original" }],
					metadata: { serverMessageId: "msg_1" },
				},
			];
			const messagesResult = [makeResult("msg_1")];
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "updated content");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalledWith(
				expect.objectContaining({ messageId: "msg_1" }),
			);
			expect(setMessages).toHaveBeenCalled();
		});

		it("finds edited message by metadata.clientMessageId when m.id does not match messageId", async () => {
			const messages = [
				{
					id: "local-msg-id",
					role: "user" as const,
					parts: [{ type: "text" as const, text: "original" }],
					metadata: { clientMessageId: "msg_1" },
				},
			];
			const messagesResult = [makeResult("server_msg_2", "msg_1")];
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.editMessage("msg_1", "updated content");
			});
			expect(mockEditAndRegenerate).toHaveBeenCalled();
			expect(setMessages).toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("calls setError with the error when editAndRegenerate throws", async () => {
			const boom = new Error("network failure");
			mockEditAndRegenerate.mockRejectedValueOnce(boom);
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setError).toHaveBeenCalledWith(boom);
		});

		it("calls setStatus('error') when editAndRegenerate throws", async () => {
			mockEditAndRegenerate.mockRejectedValueOnce(new Error("fail"));
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setStatus).toHaveBeenCalledWith("error");
		});

		it("calls toast.error('Failed to edit message') on failure", async () => {
			mockEditAndRegenerate.mockRejectedValueOnce(new Error("fail"));
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to edit message",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("wraps non-Error thrown values into an Error", async () => {
			mockEditAndRegenerate.mockRejectedValueOnce("string error");
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setError).toHaveBeenCalledWith(expect.any(Error));
		});

		it("does not propagate cleanupStaleJobs error and still calls startBackgroundStream", async () => {
			mockCleanupStaleJobs.mockRejectedValueOnce(new Error("cleanup failed"));
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalled();
		});

		it("calls setError and setStatus('error') when edited message is not found in local state", async () => {
			const { result, setError, setStatus } = renderWithParams({ messages: [] });
			await act(async () => {
				await result.current.editMessage("msg_1", "new content");
			});
			expect(setError).toHaveBeenCalledWith(expect.any(Error));
			expect(setStatus).toHaveBeenCalledWith("error");
		});
	});
});

describe("retryMessage", () => {
	describe("early return guards", () => {
		it("does nothing when convexUserId is undefined", async () => {
			const { result, setStatus } = renderWithParams({ convexUserId: undefined });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});

		it("does nothing when chatIdRef.current is null", async () => {
			const chatIdRef = { current: null };
			const { result, setStatus } = renderWithParams({ chatIdRef });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).not.toHaveBeenCalled();
			expect(setStatus).not.toHaveBeenCalled();
		});
	});

	describe("over-limit guard", () => {
		it("shows toast.error when osschat provider is over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(toast.error).toHaveBeenCalled();
		});

		it("does not call retryMessageMut when over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).not.toHaveBeenCalled();
		});
	});

	describe("message not found in messagesResult", () => {
		it("shows toast.error when message is not in messagesResult", async () => {
			const { toast } = await import("sonner");
			const { result } = renderWithParams({ messagesResult: [] });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Could not retry message",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("does not call retryMessageMut when message is not found", async () => {
			const { result } = renderWithParams({ messagesResult: [] });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).not.toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("calls retryMessageMut with correct chatId, userId, and messageId", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).toHaveBeenCalledWith({
				chatId: "chat_123",
				userId: "user_123",
				messageId: "msg_1",
			});
		});

		it("uses result.userContent for the kept message content", async () => {
			mockRetryMessageMut.mockResolvedValueOnce({ userContent: "server content" });
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			const keptMessages = setMessages.mock.calls[0][0] as UIMessage[];
			const textPart = keptMessages[0].parts.find((p) => p.type === "text");
			expect((textPart as { text: string }).text).toBe("server content");
		});

		it("calls cleanupStaleJobs with userId", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockCleanupStaleJobs).toHaveBeenCalledWith({ userId: "user_123" });
		});

		it("calls startBackgroundStream with correct params", async () => {
			const { result } = renderWithParams({ activeProvider: "openrouter" });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({
					chatId: "chat_123",
					userId: "user_123",
					model: "anthropic/claude-3.5-sonnet",
					provider: "openrouter",
				}),
			);
		});

		it("sets status to 'submitted' then 'streaming' on success", async () => {
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setStatus).toHaveBeenCalledWith("submitted");
			expect(setStatus).toHaveBeenCalledWith("streaming");
		});

		it("calls setError(undefined) before starting", async () => {
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setError).toHaveBeenCalledWith(undefined);
		});

		it("sets streamingRef.current with the new assistant message id", async () => {
			const { result, streamingRef } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(streamingRef.current).not.toBeNull();
			expect(streamingRef.current).toMatchObject({
				content: "",
				reasoning: "",
				chainHash: "[]",
			});
		});

		it("calls setMessages twice: with keptMessages then updater fn", async () => {
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setMessages).toHaveBeenCalledTimes(2);
			expect(typeof setMessages.mock.calls[1][0]).toBe("function");
		});

		it("updater function appends assistant message with role 'assistant'", async () => {
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const updated = updater([]);
			expect(updated[0].role).toBe("assistant");
		});

		it("does not propagate cleanupStaleJobs error", async () => {
			mockCleanupStaleJobs.mockRejectedValueOnce(new Error("cleanup failed"));
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalled();
		});
	});

	describe("model override", () => {
		it("uses overrideModelId when provided", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1", "openai/gpt-4o");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({ model: "openai/gpt-4o" }),
			);
		});

		it("uses selectedModelId from store when overrideModelId is not provided", async () => {
			mockModelState = { selectedModelId: "meta-llama/llama-3", reasoningEnabled: false };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({ model: "meta-llama/llama-3" }),
			);
		});
	});

	describe("reasoning parts", () => {
		it("adds reasoning part when reasoningEnabled is true", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: true };
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const updated = updater([]);
			const reasoningPart = updated[0].parts.find((p) => p.type === "reasoning");
			expect(reasoningPart).toBeDefined();
		});

		it("does not add reasoning part when reasoningEnabled is false", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: false };
			const { result, setMessages } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			const updater = setMessages.mock.calls[1][0] as (prev: UIMessage[]) => UIMessage[];
			const updated = updater([]);
			const reasoningPart = updated[0].parts.find((p) => p.type === "reasoning");
			expect(reasoningPart).toBeUndefined();
		});
	});

	describe("keptMessages map — prior messages and no-text-part fallback (lines 288-311)", () => {
		it("passes prior messages unchanged when retriedIndex > 0", async () => {
			const messages = [
				makeMsg("msg_0", "user", "earlier"),
				makeMsg("msg_1", "user", "original"),
			];
			const messagesResult = [makeResult("msg_0"), makeResult("msg_1")];
			mockRetryMessageMut.mockResolvedValue({ userContent: "updated" });
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			const keptMessages = setMessages.mock.calls[0][0] as UIMessage[];
			expect(keptMessages).toHaveLength(2);
			expect(keptMessages[0].id).toBe("msg_0");
		});

		it("calls startBackgroundStream when a prior message has no text part (line 311 fallback)", async () => {
			const messages = [
				{
					id: "msg_0",
					role: "assistant" as const,
					parts: [] as UIMessage["parts"],
					metadata: {},
				},
				makeMsg("msg_1", "user", "original"),
			];
			const messagesResult = [makeResult("msg_0"), makeResult("msg_1")];
			mockRetryMessageMut.mockResolvedValue({ userContent: "original" });
			const { result } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalled();
		});
	});

	describe("metadata-based findIndex path", () => {
		it("finds retried message by metadata.serverMessageId when m.id does not match messageId", async () => {
			const messages = [
				{
					id: "local-retry-id",
					role: "user" as const,
					parts: [{ type: "text" as const, text: "original" }],
					metadata: { serverMessageId: "msg_1" },
				},
			];
			const messagesResult = [makeResult("msg_1")];
			mockRetryMessageMut.mockResolvedValue({ userContent: "original" });
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).toHaveBeenCalledWith(
				expect.objectContaining({ messageId: "msg_1" }),
			);
			expect(setMessages).toHaveBeenCalled();
		});

		it("finds retried message by metadata.clientMessageId when m.id does not match messageId", async () => {
			const messages = [
				{
					id: "local-retry-id",
					role: "user" as const,
					parts: [{ type: "text" as const, text: "original" }],
					metadata: { clientMessageId: "msg_1" },
				},
			];
			const messagesResult = [makeResult("server_retry_2", "msg_1")];
			mockRetryMessageMut.mockResolvedValue({ userContent: "original" });
			const { result, setMessages } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(mockRetryMessageMut).toHaveBeenCalled();
			expect(setMessages).toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("calls setError when retryMessageMut throws", async () => {
			const boom = new Error("mutation error");
			mockRetryMessageMut.mockRejectedValueOnce(boom);
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setError).toHaveBeenCalledWith(boom);
		});

		it("calls setStatus('error') when retryMessageMut throws", async () => {
			mockRetryMessageMut.mockRejectedValueOnce(new Error("fail"));
			const { result, setStatus } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setStatus).toHaveBeenCalledWith("error");
		});

		it("calls toast.error('Failed to retry message') on failure", async () => {
			mockRetryMessageMut.mockRejectedValueOnce(new Error("fail"));
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to retry message",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("calls setError and setStatus('error') when retried message not in local state", async () => {
			const { result, setError, setStatus } = renderWithParams({ messages: [] });
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setError).toHaveBeenCalledWith(expect.any(Error));
			expect(setStatus).toHaveBeenCalledWith("error");
		});

		it("wraps non-Error thrown values into an Error in retry (line 365)", async () => {
			mockRetryMessageMut.mockRejectedValueOnce("string rejection");
			const { result, setError } = renderWithParams();
			await act(async () => {
				await result.current.retryMessage("msg_1");
			});
			expect(setError).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});
