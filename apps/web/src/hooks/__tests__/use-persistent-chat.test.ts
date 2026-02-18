// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
	useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: { getByExternalId: "users:getByExternalId" },
		messages: {
			list: "messages:list",
			send: "messages:send",
			editAndRegenerate: "messages:editAndRegenerate",
			retryMessage: "messages:retryMessage",
		},
		chats: { create: "chats:create", fork: "chats:fork" },
		backgroundStream: {
			getActiveStreamJob: "backgroundStream:getActiveStreamJob",
			startStream: "backgroundStream:startStream",
			cleanupStaleJobs: "backgroundStream:cleanupStaleJobs",
		},
	},
}));

const mockUseAuth = vi.fn();
vi.mock("@/lib/auth-client", () => ({
	useAuth: () => mockUseAuth(),
}));

vi.mock("@/stores/model", () => ({
	useModelStore: Object.assign(
		vi.fn(() => ({ selectedModelId: "test-model", reasoningEnabled: false })),
		{ getState: () => ({ selectedModelId: "test-model", reasoningEnabled: false }) },
	),
	getModelById: vi.fn(() => ({ id: "test-model", name: "Test Model" })),
	getModelCapabilities: vi.fn(() => ({ supportsTools: false })),
	useModels: vi.fn(() => ({ models: [] })),
}));

vi.mock("@/stores/provider", () => ({
	useProviderStore: Object.assign(
		vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
			selector({
				activeProvider: "osschat",
				webSearchEnabled: false,
				isOverLimit: () => false,
			}),
		),
		{
			getState: () => ({
				activeProvider: "osschat",
				webSearchEnabled: false,
				isOverLimit: () => false,
			}),
		},
	),
}));

vi.mock("@/stores/stream", () => ({
	useStreamStore: Object.assign(vi.fn(), {
		getState: () => ({
			completeStream: vi.fn(),
			setResuming: vi.fn(),
		}),
	}),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/analytics", () => ({
	analytics: { chatCreated: vi.fn(), messageSent: vi.fn() },
}));

vi.mock("@/lib/title-generation", () => ({
	shouldTriggerAutoTitle: vi.fn(() => false),
}));

import {
	usePersistentChat,
	type UsePersistentChatReturn,
} from "../use-persistent-chat";

const mockMutationFn = vi.fn(async () => ({}));

function setupDefaultMocks(overrides?: {
	user?: { id: string } | null;
	convexUser?: { _id: string } | null | undefined;
	messages?: Array<Record<string, unknown>> | undefined;
	activeStreamJob?: Record<string, unknown> | null | undefined;
}) {
	const user = overrides?.user ?? { id: "ext-user-1" };
	const convexUser = overrides?.convexUser !== undefined ? overrides.convexUser : { _id: "convex-user-1" };
	const messages = overrides?.messages !== undefined ? overrides.messages : undefined;
	const activeStreamJob = overrides?.activeStreamJob !== undefined ? overrides.activeStreamJob : undefined;

	mockUseAuth.mockReturnValue({ user });

	mockUseQuery.mockImplementation((queryName: string, args: unknown) => {
		if (args === "skip") return undefined;
		if (queryName === "users:getByExternalId") return convexUser;
		if (queryName === "messages:list") return messages ?? [];
		if (queryName === "backgroundStream:getActiveStreamJob") return activeStreamJob ?? null;
		return undefined;
	});

	mockUseMutation.mockReturnValue(mockMutationFn);
}

describe("usePersistentChat", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutationFn.mockReset().mockResolvedValue({});
		setupDefaultMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("initial state (no chatId)", () => {
		it("returns the expected shape with correct defaults for a new chat", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			const hook: UsePersistentChatReturn = result.current;

			expect(hook).toHaveProperty("messages");
			expect(hook).toHaveProperty("sendMessage");
			expect(hook).toHaveProperty("editMessage");
			expect(hook).toHaveProperty("retryMessage");
			expect(hook).toHaveProperty("forkMessage");
			expect(hook).toHaveProperty("status");
			expect(hook).toHaveProperty("error");
			expect(hook).toHaveProperty("stop");
			expect(hook).toHaveProperty("isNewChat");
			expect(hook).toHaveProperty("isLoadingMessages");
			expect(hook).toHaveProperty("isUserLoading");
			expect(hook).toHaveProperty("chatId");
			expect(hook).toHaveProperty("isResuming");
			expect(hook).toHaveProperty("resumedContent");

			expect(hook.messages).toEqual([]);
			expect(hook.status).toBe("ready");
			expect(hook.error).toBeUndefined();
			expect(hook.isNewChat).toBe(true);
			expect(hook.chatId).toBeNull();
			expect(hook.isResuming).toBe(false);
			expect(hook.resumedContent).toBe("");
		});

		it("marks isNewChat=false when chatId is provided", () => {
			const { result } = renderHook(() =>
				usePersistentChat({ chatId: "chat-123" }),
			);
			expect(result.current.isNewChat).toBe(false);
			expect(result.current.chatId).toBe("chat-123");
		});
	});

	describe("sendMessage", () => {
		it("is a function", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(typeof result.current.sendMessage).toBe("function");
		});

		it("does nothing for empty text", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.sendMessage({ text: "" });
			});

			expect(result.current.status).toBe("ready");
		});

		it("does nothing for whitespace-only text", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.sendMessage({ text: "   " });
			});

			expect(result.current.status).toBe("ready");
		});

		it("shows toast when user is not authenticated", async () => {
			const { toast } = await import("sonner");
			setupDefaultMocks({ user: null, convexUser: null });
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.sendMessage({ text: "hello" });
			});

			expect(result.current.status).toBe("ready");
			expect(toast.error).toHaveBeenCalled();
		});

		it("transitions to submitted/streaming state on valid send", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });

			const createChatMock = vi.fn().mockResolvedValue({ chatId: "new-chat-id" });
			const startStreamMock = vi.fn().mockResolvedValue({});
			const sendMessagesMock = vi.fn().mockResolvedValue({});
			const cleanupMock = vi.fn().mockResolvedValue({});

			let mutCallCount = 0;
			mockUseMutation.mockImplementation(() => {
				mutCallCount++;
				switch (mutCallCount) {
					case 1: return createChatMock;
					case 2: return sendMessagesMock;
					case 6: return startStreamMock;
					case 7: return cleanupMock;
					default: return vi.fn().mockResolvedValue({});
				}
			});

			const onChatCreated = vi.fn();
			const { result } = renderHook(() =>
				usePersistentChat({ onChatCreated }),
			);

			await act(async () => {
				await result.current.sendMessage({ text: "Hello world" });
			});

			expect(createChatMock).toHaveBeenCalled();
			expect(result.current.messages.length).toBeGreaterThanOrEqual(1);

			const userMsg = result.current.messages.find((m) => m.role === "user");
			expect(userMsg).toBeDefined();
			expect(userMsg!.parts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "text", text: "Hello world" }),
				]),
			);

			expect(onChatCreated).toHaveBeenCalledWith("new-chat-id");
		});
	});

	describe("editMessage", () => {
		it("is a function", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(typeof result.current.editMessage).toBe("function");
		});

		it("does nothing without a chatId", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.editMessage("msg-1", "updated text");
			});

			expect(result.current.status).toBe("ready");
		});
	});

	describe("retryMessage", () => {
		it("is a function", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(typeof result.current.retryMessage).toBe("function");
		});

		it("does nothing without a chatId", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.retryMessage("msg-1");
			});

			expect(result.current.status).toBe("ready");
		});
	});

	describe("streaming state", () => {
		it("status is ready by default", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(result.current.status).toBe("ready");
		});

		it("stop() resets status to ready", async () => {
			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				result.current.stop();
			});

			expect(result.current.status).toBe("ready");
		});

		it("isResuming is false when no active stream job", () => {
			setupDefaultMocks({ activeStreamJob: null });
			const { result } = renderHook(() =>
				usePersistentChat({ chatId: "chat-1" }),
			);
			expect(result.current.isResuming).toBe(false);
		});
	});

	describe("error state", () => {
		it("error is undefined by default", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(result.current.error).toBeUndefined();
		});

		it("sets error status when sendMessage fails", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });

			const createChatMock = vi.fn().mockResolvedValue({ chatId: "new-chat-id" });
			const startStreamMock = vi.fn().mockRejectedValue(new Error("stream error"));
			const sendMessagesMock = vi.fn().mockResolvedValue({});
			const cleanupMock = vi.fn().mockResolvedValue({});

			let mutCallCount = 0;
			mockUseMutation.mockImplementation(() => {
				mutCallCount++;
				switch (mutCallCount) {
					case 1: return createChatMock;
					case 2: return sendMessagesMock;
					case 6: return startStreamMock;
					case 7: return cleanupMock;
					default: return vi.fn().mockResolvedValue({});
				}
			});

			const { result } = renderHook(() => usePersistentChat({}));

			await act(async () => {
				await result.current.sendMessage({ text: "hello" });
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toBeDefined();
			expect(result.current.error?.message).toBe("stream error");
		});
	});

	describe("messages from Convex", () => {
		it("exposes messages from the query result", async () => {
			const convexMessages = [
				{
					_id: "msg-1",
					role: "user",
					content: "Hello",
					createdAt: Date.now(),
				},
				{
					_id: "msg-2",
					role: "assistant",
					content: "Hi there!",
					createdAt: Date.now(),
				},
			];
			setupDefaultMocks({ messages: convexMessages });

			const { result } = renderHook(() =>
				usePersistentChat({ chatId: "chat-123" }),
			);

			await act(async () => {
				await new Promise((r) => setTimeout(r, 0));
			});

			expect(result.current.messages.length).toBe(2);
			expect(result.current.messages[0].role).toBe("user");
			expect(result.current.messages[1].role).toBe("assistant");

			const userTextPart = result.current.messages[0].parts.find(
				(p) => p.type === "text",
			);
			expect(userTextPart).toBeDefined();
		});

		it("isLoadingMessages is true when chatId is set but messages are undefined", () => {
			setupDefaultMocks({ messages: undefined });
			mockUseQuery.mockImplementation((queryName: string, args: unknown) => {
				if (args === "skip") return undefined;
				if (queryName === "users:getByExternalId") return { _id: "convex-user-1" };
				if (queryName === "messages:list") return undefined;
				if (queryName === "backgroundStream:getActiveStreamJob") return null;
				return undefined;
			});

			const { result } = renderHook(() =>
				usePersistentChat({ chatId: "chat-123" }),
			);
			expect(result.current.isLoadingMessages).toBe(true);
		});

		it("isLoadingMessages is false for new chats", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(result.current.isLoadingMessages).toBe(false);
		});
	});

	describe("forkMessage", () => {
		it("is a function", () => {
			const { result } = renderHook(() => usePersistentChat({}));
			expect(typeof result.current.forkMessage).toBe("function");
		});

		it("returns undefined without a chatId", async () => {
			setupDefaultMocks({ convexUser: { _id: "convex-user-1" } });
			const { result } = renderHook(() => usePersistentChat({}));

			let forkResult: string | undefined;
			await act(async () => {
				forkResult = await result.current.forkMessage("msg-1");
			});

			expect(forkResult).toBeUndefined();
		});
	});

	describe("isUserLoading", () => {
		it("is true when user.id exists but convexUser is undefined (loading)", () => {
			setupDefaultMocks({ user: { id: "ext-1" }, convexUser: undefined });
			mockUseQuery.mockImplementation((queryName: string, args: unknown) => {
				if (args === "skip") return undefined;
				if (queryName === "users:getByExternalId") return undefined;
				if (queryName === "messages:list") return [];
				if (queryName === "backgroundStream:getActiveStreamJob") return null;
				return undefined;
			});

			const { result } = renderHook(() => usePersistentChat({}));
			expect(result.current.isUserLoading).toBe(true);
		});

		it("is false when user is fully loaded", () => {
			setupDefaultMocks({
				user: { id: "ext-1" },
				convexUser: { _id: "convex-1" },
			});

			const { result } = renderHook(() => usePersistentChat({}));
			expect(result.current.isUserLoading).toBe(false);
		});
	});
});
