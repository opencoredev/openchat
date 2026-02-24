/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UIMessage } from "ai";
import type { Id } from "@server/convex/_generated/dataModel";

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		chatFork: { fork: "chatFork.fork" },
		backgroundStream: {
			startStream: "backgroundStream.startStream",
			cleanupStaleJobs: "backgroundStream.cleanupStaleJobs",
		},
	},
}));

const mockForkChatMut = vi.fn();
const mockStartBackgroundStream = vi.fn();
const mockCleanupStaleJobs = vi.fn();

const mutationMap: Record<string, ReturnType<typeof vi.fn>> = {
	"chatFork.fork": mockForkChatMut,
	"backgroundStream.startStream": mockStartBackgroundStream,
	"backgroundStream.cleanupStaleJobs": mockCleanupStaleJobs,
};

vi.mock("convex/react", () => ({
	useMutation: vi.fn((fn: string) => mutationMap[fn] ?? vi.fn()),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn() },
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

import { useForkMessage } from "../use-fork-message";

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

type HookParams = Parameters<typeof useForkMessage>[0];

function renderWithParams(overrides: Partial<HookParams> = {}) {
	const chatIdRef: { current: string | null } = { current: "chat_123" };

	const params: HookParams = {
		convexUserId: "user_123" as Id<"users">,
		messages: [makeMsg("msg_1", "user", "hello")],
		messagesResult: [makeResult("msg_1")],
		chatIdRef,
		models: [],
		activeProvider: "openrouter",
		webSearchEnabled: false,
		...overrides,
	};

	const { result } = renderHook(() => useForkMessage(params));
	return { result, chatIdRef: (overrides.chatIdRef ?? chatIdRef) as { current: string | null } };
}

beforeEach(() => {
	mockProviderState = { activeProvider: "openrouter", isOverLimit: () => false };
	mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: false };

	vi.clearAllMocks();

	mockForkChatMut.mockResolvedValue({ newChatId: "new-chat-456" });
	mockStartBackgroundStream.mockResolvedValue({});
	mockCleanupStaleJobs.mockResolvedValue({});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("forkMessage", () => {
	describe("early return guards", () => {
		it("returns undefined when convexUserId is undefined", async () => {
			const { result } = renderWithParams({ convexUserId: undefined });
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
			expect(mockForkChatMut).not.toHaveBeenCalled();
		});

		it("returns undefined when chatIdRef.current is null", async () => {
			const chatIdRef = { current: null };
			const { result } = renderWithParams({ chatIdRef });
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
			expect(mockForkChatMut).not.toHaveBeenCalled();
		});
	});

	describe("over-limit guard", () => {
		it("shows toast.error and returns undefined when osschat provider is over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
			expect(toast.error).toHaveBeenCalledWith(
				"Daily limit reached",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("does not call forkChatMut when over limit", async () => {
			mockProviderState = { activeProvider: "osschat", isOverLimit: () => true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockForkChatMut).not.toHaveBeenCalled();
		});
	});

	describe("message not found in local messages", () => {
		it("shows toast.error and returns undefined when message is not in local messages", async () => {
			const { toast } = await import("sonner");
			const { result } = renderWithParams({ messages: [] });
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("non-existent-msg");
			});
			expect(returnVal).toBeUndefined();
			expect(toast.error).toHaveBeenCalledWith(
				"Could not branch off",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("does not call forkChatMut when forkIdx is negative", async () => {
			const { result } = renderWithParams({ messages: [] });
			await act(async () => {
				await result.current.forkMessage("non-existent-msg");
			});
			expect(mockForkChatMut).not.toHaveBeenCalled();
		});
	});

	describe("forkMessageDoc not found in messagesResult", () => {
		it("shows toast.error and returns undefined when forkMessageDoc is absent", async () => {
			const { toast } = await import("sonner");
			const { result } = renderWithParams({ messagesResult: [] });
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
			expect(toast.error).toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("calls forkChatMut with chatId, userId, and messageId", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockForkChatMut).toHaveBeenCalledWith({
				chatId: "chat_123",
				userId: "user_123",
				messageId: "msg_1",
			});
		});

		it("returns the newChatId from forkChatMut", async () => {
			mockForkChatMut.mockResolvedValueOnce({ newChatId: "forked-chat-789" });
			const { result } = renderWithParams();
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBe("forked-chat-789");
		});

		it("calls cleanupStaleJobs with userId", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockCleanupStaleJobs).toHaveBeenCalledWith({ userId: "user_123" });
		});

		it("calls startBackgroundStream with newChatId from fork, not original chatId", async () => {
			mockForkChatMut.mockResolvedValueOnce({ newChatId: "forked-chat-789" });
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({ chatId: "forked-chat-789" }),
			);
		});

		it("calls startBackgroundStream with userId, model, and provider", async () => {
			const { result } = renderWithParams({ activeProvider: "openrouter" });
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user_123",
					model: "anthropic/claude-3.5-sonnet",
					provider: "openrouter",
				}),
			);
		});

		it("passes messages up to and including the fork index", async () => {
			const messages = [
				makeMsg("msg_1", "user", "first"),
				makeMsg("msg_2", "assistant", "second"),
				makeMsg("msg_3", "user", "third"),
			];
			const messagesResult = [makeResult("msg_1"), makeResult("msg_2"), makeResult("msg_3")];
			const { result } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.forkMessage("msg_2");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.messages).toEqual([
				{ role: "user", content: "first" },
				{ role: "assistant", content: "second" },
			]);
		});

		it("does not propagate cleanupStaleJobs rejection", async () => {
			mockCleanupStaleJobs.mockRejectedValueOnce(new Error("cleanup failed"));
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalled();
		});

		it("passes webSearchEnabled option to startBackgroundStream", async () => {
			const { result } = renderWithParams({ webSearchEnabled: true });
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({ enableWebSearch: true }),
				}),
			);
		});
	});

	describe("model override", () => {
		it("uses overrideModelId when provided", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1", "openai/gpt-4o");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({ model: "openai/gpt-4o" }),
			);
		});

		it("uses selectedModelId from model store when no overrideModelId", async () => {
			mockModelState = { selectedModelId: "meta-llama/llama-3", reasoningEnabled: false };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(mockStartBackgroundStream).toHaveBeenCalledWith(
				expect.objectContaining({ model: "meta-llama/llama-3" }),
			);
		});
	});

	describe("reasoning options", () => {
		it("sets reasoningEffort 'medium' when reasoningEnabled is true", async () => {
			mockModelState = { selectedModelId: "anthropic/claude-3.5-sonnet", reasoningEnabled: true };
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.options.reasoningEffort).toBe("medium");
			expect(call.options.enableReasoning).toBe(true);
		});

		it("sets reasoningEffort 'none' when reasoningEnabled is false", async () => {
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.options.reasoningEffort).toBe("none");
			expect(call.options.enableReasoning).toBe(false);
		});
	});

	describe("message with no text part (line 83 fallback)", () => {
		it("uses empty string for message content when message has no text part", async () => {
			const messages = [
				{
					id: "msg_1",
					role: "user" as const,
					parts: [] as UIMessage["parts"],
					metadata: {},
				},
			];
			const messagesResult = [makeResult("msg_1")];
			const { result } = renderWithParams({ messages, messagesResult });
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			const call = mockStartBackgroundStream.mock.calls[0][0];
			expect(call.messages).toEqual([{ role: "user", content: "" }]);
		});
	});

	describe("error handling", () => {
		it("returns undefined when forkChatMut throws", async () => {
			mockForkChatMut.mockRejectedValueOnce(new Error("fork failed"));
			const { result } = renderWithParams();
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
		});

		it("shows toast.error('Failed to branch off') when forkChatMut throws", async () => {
			mockForkChatMut.mockRejectedValueOnce(new Error("fork failed"));
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			await act(async () => {
				await result.current.forkMessage("msg_1");
			});
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to branch off",
				expect.objectContaining({ description: expect.any(String) }),
			);
		});

		it("wraps non-Error thrown values into an Error (line 124)", async () => {
			mockForkChatMut.mockRejectedValueOnce("string rejection");
			const { toast } = await import("sonner");
			const { result } = renderWithParams();
			let returnVal: string | undefined;
			await act(async () => {
				returnVal = await result.current.forkMessage("msg_1");
			});
			expect(returnVal).toBeUndefined();
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to branch off",
				expect.objectContaining({ description: "Unknown error" }),
			);
		});
	});
});
