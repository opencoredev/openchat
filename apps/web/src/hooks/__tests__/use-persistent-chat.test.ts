/**
 * Safety-net tests for usePersistentChat hook.
 * These capture current behavior so refactoring doesn't silently break things.
 *
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: @server/convex/_generated/api
// ---------------------------------------------------------------------------
vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: { getByExternalId: "users.getByExternalId" },
		messages: {
			list: "messages.list",
			send: "messages.send",
			editAndRegenerate: "messages.editAndRegenerate",
			retryMessage: "messages.retryMessage",
		},
		chats: { create: "chats.create" },
		chatFork: { fork: "chatFork.fork" },
		backgroundStream: {
			getActiveStreamJob: "backgroundStream.getActiveStreamJob",
			startStream: "backgroundStream.startStream",
			cleanupStaleJobs: "backgroundStream.cleanupStaleJobs",
		},
	},
}));

// ---------------------------------------------------------------------------
// Mutation mocks (declared here so tests can inspect / re-configure them)
// ---------------------------------------------------------------------------
const mockCreateChat = vi.fn().mockResolvedValue({ chatId: "chat-123" });
const mockSendMessages = vi.fn().mockResolvedValue({});
const mockEditAndRegenerate = vi.fn().mockResolvedValue({});
const mockRetryMessage = vi.fn().mockResolvedValue({ userContent: "hello" });
const mockForkChat = vi.fn().mockResolvedValue({ newChatId: "new-chat-456" });
const mockStartBackgroundStream = vi.fn().mockResolvedValue({});
const mockCleanupStaleJobs = vi.fn().mockResolvedValue({});

const mutationMap: Record<string, ReturnType<typeof vi.fn>> = {
	"chats.create": mockCreateChat,
	"messages.send": mockSendMessages,
	"messages.editAndRegenerate": mockEditAndRegenerate,
	"messages.retryMessage": mockRetryMessage,
	"chatFork.fork": mockForkChat,
	"backgroundStream.startStream": mockStartBackgroundStream,
	"backgroundStream.cleanupStaleJobs": mockCleanupStaleJobs,
};

// ---------------------------------------------------------------------------
// Query mocks
// ---------------------------------------------------------------------------
let mockConvexUser: unknown = { _id: "convex-user-id" };
let mockMessagesResult: unknown = undefined;
let mockActiveStreamJob: unknown = null;

vi.mock("convex/react", () => ({
	useMutation: vi.fn((fn: string) => mutationMap[fn] ?? vi.fn()),
	useQuery: vi.fn((fn: string) => {
		if (fn === "users.getByExternalId") return mockConvexUser;
		if (fn === "messages.list") return mockMessagesResult;
		if (fn === "backgroundStream.getActiveStreamJob") return mockActiveStreamJob;
		return undefined;
	}),
}));

// ---------------------------------------------------------------------------
// Mock: auth
// ---------------------------------------------------------------------------
let mockAuthUser: { id: string } | null = { id: "user-id-1" };

vi.mock("@/lib/auth-client", () => ({
	useAuth: () => ({ user: mockAuthUser }),
}));

let mockConvexUserState = {
	convexUser: { _id: "convex-user-id" },
	convexUserId: "convex-user-id",
	isLoading: false,
};

vi.mock("@/lib/convex-user", () => ({
	useConvexUser: () => mockConvexUserState,
}));

// ---------------------------------------------------------------------------
// Mock: sonner
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Mock: analytics
// ---------------------------------------------------------------------------
vi.mock("@/lib/analytics", () => ({
	analytics: {
		chatCreated: vi.fn(),
		messageSent: vi.fn(),
		searchToggled: vi.fn(),
		thinkingModeChanged: vi.fn(),
		modelSwitched: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Mock: title-generation
// ---------------------------------------------------------------------------
vi.mock("@/lib/title-generation", () => ({
	shouldTriggerAutoTitle: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Mock: @/stores/stream
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock: @/stores/provider
// ---------------------------------------------------------------------------
let mockProviderState = {
	activeProvider: "openrouter" as "openrouter" | "osschat",
	webSearchEnabled: false,
	isOverLimit: () => false,
};

vi.mock("@/stores/provider", () => ({
	useProviderStore: Object.assign(
		vi.fn((selector: (state: typeof mockProviderState) => unknown) =>
			selector(mockProviderState),
		),
		{
			getState: () => mockProviderState,
		},
	),
}));

// ---------------------------------------------------------------------------
// Mock: @/stores/model
// ---------------------------------------------------------------------------
const mockModelState = {
	selectedModelId: "anthropic/claude-3.5-sonnet",
	reasoningEnabled: false,
};

vi.mock("@/stores/model", () => ({
	useModelStore: Object.assign(
		vi.fn((selector: (state: typeof mockModelState) => unknown) =>
			selector(mockModelState),
		),
		{
			getState: () => mockModelState,
		},
	),
	useModels: vi.fn(() => ({ models: [] })),
	getModelById: vi.fn(() => undefined),
	getModelCapabilities: vi.fn(() => ({
		supportsReasoning: false,
		supportsEffortLevels: false,
		alwaysReasons: false,
		supportsTools: false,
	})),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------
import { usePersistentChat } from "../use-persistent-chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderChat(options: { chatId?: string; onChatCreated?: (id: string) => void } = {}) {
	return renderHook(() => usePersistentChat(options));
}

async function tick() {
	await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
	mockAuthUser = { id: "user-id-1" };
	mockConvexUser = { _id: "convex-user-id" };
	mockConvexUserState = {
		convexUser: { _id: "convex-user-id" },
		convexUserId: "convex-user-id",
		isLoading: false,
	};
	mockMessagesResult = undefined;
	mockActiveStreamJob = null;
	mockProviderState = {
		activeProvider: "openrouter",
		webSearchEnabled: false,
		isOverLimit: () => false,
	};

	vi.clearAllMocks();

	// Re-attach getState after clearAllMocks clears the mock implementation.
	// We re-import the mocked module to restore the spy state; easier to just
	// reset individual fn implementations.
	mockCreateChat.mockResolvedValue({ chatId: "chat-123" });
	mockSendMessages.mockResolvedValue({});
	mockEditAndRegenerate.mockResolvedValue({});
	mockRetryMessage.mockResolvedValue({ userContent: "hello" });
	mockForkChat.mockResolvedValue({ newChatId: "new-chat-456" });
	mockStartBackgroundStream.mockResolvedValue({});
	mockCleanupStaleJobs.mockResolvedValue({});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("initial state shape", () => {
	it("returns empty messages array on mount", () => {
		const { result } = renderChat();
		expect(result.current.messages).toEqual([]);
	});

	it("returns status='ready' on mount", () => {
		const { result } = renderChat();
		expect(result.current.status).toBe("ready");
	});

	it("returns error=undefined on mount", () => {
		const { result } = renderChat();
		expect(result.current.error).toBeUndefined();
	});

	it("isNewChat is true when no chatId provided", () => {
		const { result } = renderChat();
		expect(result.current.isNewChat).toBe(true);
	});

	it("isNewChat is false when chatId is provided", () => {
		const { result } = renderChat({ chatId: "existing-chat" });
		expect(result.current.isNewChat).toBe(false);
	});

	it("chatId is null when no chatId prop given", () => {
		const { result } = renderChat();
		expect(result.current.chatId).toBeNull();
	});

	it("chatId matches prop when chatId provided", () => {
		const { result } = renderChat({ chatId: "existing-chat" });
		expect(result.current.chatId).toBe("existing-chat");
	});

	it("exposes sendMessage, editMessage, retryMessage, forkMessage, stop as functions", () => {
		const { result } = renderChat();
		expect(typeof result.current.sendMessage).toBe("function");
		expect(typeof result.current.editMessage).toBe("function");
		expect(typeof result.current.retryMessage).toBe("function");
		expect(typeof result.current.forkMessage).toBe("function");
		expect(typeof result.current.stop).toBe("function");
	});
});

// ---------------------------------------------------------------------------

describe("user loading state", () => {
	it("isUserLoading is true when user exists but convex user is undefined", () => {
		mockAuthUser = { id: "user-id-1" };
		mockConvexUser = undefined;
		mockConvexUserState = {
			convexUser: undefined,
			convexUserId: undefined,
			isLoading: true,
		};

		const { result } = renderChat();
		expect(result.current.isUserLoading).toBe(true);
	});

	it("isUserLoading is false when user is null (not logged in)", () => {
		mockAuthUser = null;
		mockConvexUser = undefined;
		mockConvexUserState = {
			convexUser: undefined,
			convexUserId: undefined,
			isLoading: false,
		};

		const { result } = renderChat();
		expect(result.current.isUserLoading).toBe(false);
	});

	it("isUserLoading is false when convex user is loaded", () => {
		mockAuthUser = { id: "user-id-1" };
		mockConvexUser = { _id: "convex-user-id" };
		mockConvexUserState = {
			convexUser: { _id: "convex-user-id" },
			convexUserId: "convex-user-id",
			isLoading: false,
		};

		const { result } = renderChat();
		expect(result.current.isUserLoading).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe("sendMessage validation", () => {
	it("does nothing when message text is empty string", async () => {
		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "" });
		});
		expect(mockCreateChat).not.toHaveBeenCalled();
		expect(result.current.status).toBe("ready");
	});

	it("does nothing when message text is whitespace only", async () => {
		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "   " });
		});
		expect(mockCreateChat).not.toHaveBeenCalled();
		expect(result.current.status).toBe("ready");
	});

	it("shows toast when no convexUserId (user null)", async () => {
		mockAuthUser = null;
		mockConvexUser = null;
		mockConvexUserState = {
			convexUser: null,
			convexUserId: undefined,
			isLoading: false,
		};
		const { toast } = await import("sonner");

		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(toast.error).toHaveBeenCalled();
		expect(mockCreateChat).not.toHaveBeenCalled();
	});

	it("creates a new chat when no chatId prop and sends a message", async () => {
		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello world" });
		});
		expect(mockCreateChat).toHaveBeenCalledWith({
			userId: "convex-user-id",
			title: "New Chat",
		});
	});

	it("calls onChatCreated callback after chat creation", async () => {
		const onChatCreated = vi.fn();
		const { result } = renderChat({ onChatCreated });
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(onChatCreated).toHaveBeenCalledWith("chat-123");
	});

	it("sets status to streaming after successful send (with active job)", async () => {
		mockActiveStreamJob = {
			messageId: "stream-msg-1",
			status: "running",
			content: "",
			reasoning: "",
		};
		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(result.current.status).toBe("streaming");
	});

	it("sets status to error when startBackgroundStream throws", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("stream failed"));

		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(result.current.status).toBe("error");
	});
});

// ---------------------------------------------------------------------------

describe("error tracking", () => {
	it("error is undefined initially", () => {
		const { result } = renderChat();
		expect(result.current.error).toBeUndefined();
	});

	it("error is set when startBackgroundStream throws", async () => {
		const boom = new Error("Network error");
		mockStartBackgroundStream.mockRejectedValueOnce(boom);

		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(result.current.error).toBeTruthy();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("error is cleared on next sendMessage attempt", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("boom"));

		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "First" });
		});
		expect(result.current.error).toBeTruthy();

		// restore to succeed
		mockStartBackgroundStream.mockResolvedValue({});
		await act(async () => {
			await result.current.sendMessage({ text: "Second" });
		});
		expect(result.current.error).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------

describe("edit / retry guards", () => {
	it("editMessage does nothing when no chatId (chatIdRef is null)", async () => {
		// No chatId prop → chatIdRef.current stays null
		const { result } = renderChat();
		await act(async () => {
			await result.current.editMessage("msg-1", "new content");
		});
		expect(mockEditAndRegenerate).not.toHaveBeenCalled();
		expect(result.current.status).toBe("ready");
	});

	it("retryMessage does nothing when no chatId (chatIdRef is null)", async () => {
		const { result } = renderChat();
		await act(async () => {
			await result.current.retryMessage("msg-1");
		});
		expect(mockRetryMessage).not.toHaveBeenCalled();
		expect(result.current.status).toBe("ready");
	});

	it("editMessage shows toast when message is not in messagesResult", async () => {
		mockMessagesResult = []; // empty — no message to edit
		const { toast } = await import("sonner");

		const { result } = renderChat({ chatId: "chat-123" });
		await act(async () => {
			await result.current.editMessage("msg-1", "new content");
		});
		expect(toast.error).toHaveBeenCalled();
		expect(mockEditAndRegenerate).not.toHaveBeenCalled();
	});

	it("retryMessage shows toast when message is not in messagesResult", async () => {
		mockMessagesResult = []; // empty — message not synced
		const { toast } = await import("sonner");

		const { result } = renderChat({ chatId: "chat-123" });
		await act(async () => {
			await result.current.retryMessage("msg-1");
		});
		expect(toast.error).toHaveBeenCalled();
		expect(mockRetryMessage).not.toHaveBeenCalled();
	});

	it("editMessage does nothing when new content is whitespace only", async () => {
		const { result } = renderChat({ chatId: "chat-123" });
		await act(async () => {
			await result.current.editMessage("msg-1", "   ");
		});
		expect(mockEditAndRegenerate).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------

describe("streaming state", () => {
	it("isResuming is false when status is ready", () => {
		const { result } = renderChat({ chatId: "chat-123" });
		expect(result.current.isResuming).toBe(false);
	});

	it("stop() resets status to ready", async () => {
		mockActiveStreamJob = {
			messageId: "stream-msg-2",
			status: "running",
			content: "",
			reasoning: "",
		};
		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(result.current.status).toBe("streaming");

		mockActiveStreamJob = null;
		act(() => {
			result.current.stop();
		});
		expect(result.current.status).toBe("ready");
	});

	it("stop() calls completeStream on stream store", async () => {
		const { result } = renderChat();
		act(() => {
			result.current.stop();
		});
		expect(mockCompleteStream).toHaveBeenCalled();
	});

	it("resumedContent is empty string initially", () => {
		const { result } = renderChat();
		expect(result.current.resumedContent).toBe("");
	});
});

// ---------------------------------------------------------------------------

describe("message loading state", () => {
	it("isLoadingMessages is false when no chatId provided", () => {
		const { result } = renderChat();
		expect(result.current.isLoadingMessages).toBe(false);
	});

	it("isLoadingMessages is true when chatId is given but messagesResult is undefined", () => {
		mockMessagesResult = undefined;
		const { result } = renderChat({ chatId: "chat-123" });
		expect(result.current.isLoadingMessages).toBe(true);
	});

	it("isLoadingMessages is false when messagesResult is loaded (array)", async () => {
		mockMessagesResult = [];
		const { result } = renderChat({ chatId: "chat-123" });
		await act(async () => {
			await tick();
		});
		expect(result.current.isLoadingMessages).toBe(false);
	});

	it("messages are populated from Convex result via useEffect", async () => {
		mockMessagesResult = [
			{
				_id: "server-msg-1",
				clientMessageId: "client-msg-1",
				role: "user",
				content: "Hello from Convex",
				createdAt: Date.now(),
			},
		];

		const { result } = renderChat({ chatId: "chat-123" });
		await act(async () => {
			await tick();
		});

		expect(result.current.messages.length).toBe(1);
		expect(result.current.messages[0].role).toBe("user");
	});
});

// ---------------------------------------------------------------------------

describe("forkMessage", () => {
	it("returns undefined when no chatId (chatIdRef is null)", async () => {
		const { result } = renderChat();
		let returnVal: string | undefined;
		await act(async () => {
			returnVal = await result.current.forkMessage("msg-1");
		});
		expect(returnVal).toBeUndefined();
		expect(mockForkChat).not.toHaveBeenCalled();
	});

	it("returns undefined when message not found in local messages", async () => {
		// messages is empty, so forkIdx < 0
		const { result } = renderChat({ chatId: "chat-123" });
		let returnVal: string | undefined;
		await act(async () => {
			returnVal = await result.current.forkMessage("non-existent-msg");
		});
		expect(returnVal).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------

describe("over-limit guard", () => {
	it("sendMessage shows toast and aborts when osschat provider is over limit", async () => {
		mockProviderState = {
			activeProvider: "osschat",
			webSearchEnabled: false,
			isOverLimit: () => true,
		};
		const { toast } = await import("sonner");

		const { result } = renderChat();
		await act(async () => {
			await result.current.sendMessage({ text: "Hello" });
		});
		expect(toast.error).toHaveBeenCalled();
		expect(mockStartBackgroundStream).not.toHaveBeenCalled();
	});
});
