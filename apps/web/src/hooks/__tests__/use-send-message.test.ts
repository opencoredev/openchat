/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { Id } from "@server/convex/_generated/dataModel";
import type { StreamingState } from "../chat-utils";
import type { Model } from "@/stores/model";

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		chats: { create: "chats.create" },
		messages: { send: "messages.send" },
		backgroundStream: {
			startStream: "backgroundStream.startStream",
			cleanupStaleJobs: "backgroundStream.cleanupStaleJobs",
		},
	},
}));

const mockCreateChat = vi.fn().mockResolvedValue({ chatId: "chat-abc" });
const mockSendMessages = vi.fn().mockResolvedValue({});
const mockStartBackgroundStream = vi.fn().mockResolvedValue({});
const mockCleanupStaleJobs = vi.fn().mockResolvedValue({});

const mutationMap: Record<string, ReturnType<typeof vi.fn>> = {
	"chats.create": mockCreateChat,
	"messages.send": mockSendMessages,
	"backgroundStream.startStream": mockStartBackgroundStream,
	"backgroundStream.cleanupStaleJobs": mockCleanupStaleJobs,
};

vi.mock("convex/react", () => ({
	useMutation: vi.fn((fn: string) => mutationMap[fn] ?? vi.fn()),
	useQuery: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/analytics", () => ({
	analytics: {
		chatCreated: vi.fn(),
		messageSent: vi.fn(),
	},
}));

vi.mock("@/lib/title-generation", () => ({
	shouldTriggerAutoTitle: vi.fn().mockReturnValue(false),
}));

const mockModelState = {
	selectedModelId: "openai/gpt-4o",
	reasoningEnabled: false,
};

vi.mock("@/stores/model", () => ({
	useModelStore: Object.assign(
		vi.fn((selector: (state: typeof mockModelState) => unknown) => selector(mockModelState)),
		{ getState: () => mockModelState },
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

const mockProviderState = {
	activeProvider: "openrouter" as "openrouter" | "osschat",
	webSearchEnabled: false,
	isOverLimit: () => false,
};

vi.mock("@/stores/provider", () => ({
	useProviderStore: Object.assign(
		vi.fn((selector: (state: typeof mockProviderState) => unknown) => selector(mockProviderState)),
		{ getState: () => mockProviderState },
	),
}));

import { useSendMessage } from "../use-send-message";

function makeParams(overrides: {
	chatIdRef?: { current: string | null };
	setStatus?: ReturnType<typeof vi.fn>;
	setError?: ReturnType<typeof vi.fn>;
	setMessages?: ReturnType<typeof vi.fn>;
} = {}) {
	return {
		convexUserId: "user-123" as unknown as Id<"users">,
		isUserLoading: false,
		user: { id: "user-123" },
		messages: [] as UIMessage[],
		setMessages: vi.fn(),
		messagesResult: [] as ReadonlyArray<{ _id: Id<"messages">; clientMessageId?: string }>,
		setStatus: vi.fn(),
		setError: vi.fn(),
		chatIdRef: { current: "chat-xyz" as string | null },
		streamingRef: { current: null as StreamingState | null },
		onChatCreatedRef: { current: undefined as ((id: string) => void) | undefined },
		setCurrentChatId: vi.fn(),
		models: [] as Model[],
		activeProvider: "openrouter",
		webSearchEnabled: false,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCreateChat.mockResolvedValue({ chatId: "chat-abc" });
	mockSendMessages.mockResolvedValue({});
	mockStartBackgroundStream.mockResolvedValue({});
	mockCleanupStaleJobs.mockResolvedValue({});
});

describe("useSendMessage – error toast dispatch", () => {
	it("shows 'Search limit reached' toast when error includes 'search' and 'limit' (line 237)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("search limit exceeded"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Search limit reached",
			expect.objectContaining({ description: expect.stringContaining("daily web searches") }),
		);
	});

	it("shows 'Web search unavailable' toast when error includes 'web search' and 'unavailable' (line 244)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("web search unavailable right now"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Web search unavailable",
			expect.objectContaining({ description: expect.stringContaining("temporarily unavailable") }),
		);
	});

	it("shows 'Response still in progress' toast when error includes 'stream already in progress' (line 251)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("stream already in progress"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Response still in progress",
			expect.objectContaining({ description: expect.stringContaining("current response") }),
		);
	});

	it("shows 'Response still in progress' toast when error includes 'current request' (line 251 second branch)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("current request is not finished"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Response still in progress",
			expect.objectContaining({ description: expect.stringContaining("current response") }),
		);
	});

	it("shows 'Daily limit reached' toast when error includes 'daily' and 'limit' (line 258)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("daily usage limit reached"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Daily limit reached",
			expect.objectContaining({ description: expect.stringContaining("OpenRouter API key") }),
		);
	});

	it("shows 'Failed to send message' toast for unknown errors (else branch)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("some unknown problem occurred"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith("Failed to send message", expect.anything());
	});

	it("sets status to 'error' when startBackgroundStream throws", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce(new Error("some error"));
		const setStatus = vi.fn();
		const params = makeParams({ setStatus });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		expect(setStatus).toHaveBeenCalledWith("error");
	});

	it("sets error object when startBackgroundStream throws", async () => {
		const boom = new Error("some error");
		mockStartBackgroundStream.mockRejectedValueOnce(boom);
		const setError = vi.fn();
		const params = makeParams({ setError });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		expect(setError).toHaveBeenCalledWith(boom);
	});

	it("wraps non-Error thrown values into an Error (line 232)", async () => {
		mockStartBackgroundStream.mockRejectedValueOnce("string rejection");
		const setError = vi.fn();
		const params = makeParams({ setError });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		expect(setError).toHaveBeenCalledWith(expect.any(Error));
	});
});

describe("useSendMessage – input validation", () => {
	it("does nothing when message text is empty", async () => {
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "" });
		});
		expect(mockStartBackgroundStream).not.toHaveBeenCalled();
	});

	it("does nothing when message text is whitespace only", async () => {
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "   " });
		});
		expect(mockStartBackgroundStream).not.toHaveBeenCalled();
	});

	it("shows toast when convexUserId is undefined and user is null", async () => {
		const paramsBase = makeParams();
		const params = {
			...paramsBase,
			convexUserId: undefined,
			user: null,
			isUserLoading: false,
		};
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalled();
		expect(mockStartBackgroundStream).not.toHaveBeenCalled();
	});

	it("shows 'Please wait' toast when convexUserId is undefined and user is loading", async () => {
		const paramsBase = makeParams();
		const params = {
			...paramsBase,
			convexUserId: undefined,
			user: { id: "user-123" },
			isUserLoading: true,
		};
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith("Please wait", expect.anything());
	});

	it("shows 'Account sync failed' toast when convexUserId is undefined and user has id but not loading", async () => {
		const paramsBase = makeParams();
		const params = {
			...paramsBase,
			convexUserId: undefined,
			user: { id: "user-exists" },
			isUserLoading: false,
		};
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith("Account sync failed");
	});

	it("shows 'Failed to create chat' toast when createChat throws", async () => {
		mockCreateChat.mockRejectedValueOnce(new Error("DB error"));
		const params = makeParams({ chatIdRef: { current: null } });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith("Failed to create chat");
		expect(mockStartBackgroundStream).not.toHaveBeenCalled();
	});

	it("shows 'Message may not be saved' toast when sendMessages rejects", async () => {
		mockSendMessages.mockRejectedValueOnce(new Error("persist error"));
		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		const { toast } = await import("sonner");
		expect(toast.error).toHaveBeenCalledWith(
			"Message may not be saved",
			expect.objectContaining({ description: expect.stringContaining("persist") }),
		);
	});

	it("creates a new chat when chatIdRef.current is null", async () => {
		const params = makeParams({ chatIdRef: { current: null } });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		expect(mockCreateChat).toHaveBeenCalledWith({ userId: "user-123", title: "New Chat" });
	});

	it("skips createChat when chatIdRef.current already has an id", async () => {
		const params = makeParams({ chatIdRef: { current: "existing-chat" } });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		expect(mockCreateChat).not.toHaveBeenCalled();
	});
});

describe("useSendMessage – reasoning part (lines 175-180)", () => {
	it("adds reasoning part as first part when reasoningEnabled is true", async () => {
		mockModelState.reasoningEnabled = true;
		const setMessages = vi.fn();
		const params = makeParams({ setMessages });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		type Msg = { role: string; parts: { type: string }[] };
		type Updater = (prev: Msg[]) => Msg[];
		const calls = setMessages.mock.calls as Array<[Updater | Msg[]]>;
		const assistantAddCall = calls.find(
			(c) => typeof c[0] === "function" && (c[0] as Updater)([]).some((m) => m.role === "assistant"),
		);
		expect(assistantAddCall).toBeDefined();
		const msgs = (assistantAddCall![0] as Updater)([]);
		const assistantMsg = msgs.find((m) => m.role === "assistant");
		expect(assistantMsg).toBeDefined();
		expect(assistantMsg!.parts[0].type).toBe("reasoning");
		mockModelState.reasoningEnabled = false;
	});

	it("does not add reasoning part when reasoningEnabled is false", async () => {
		mockModelState.reasoningEnabled = false;
		const setMessages = vi.fn();
		const params = makeParams({ setMessages });
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello" });
		});
		type Msg = { role: string; parts: { type: string }[] };
		type Updater = (prev: Msg[]) => Msg[];
		const calls = setMessages.mock.calls as Array<[Updater | Msg[]]>;
		const assistantAddCall = calls.find(
			(c) => typeof c[0] === "function" && (c[0] as Updater)([]).some((m) => m.role === "assistant"),
		);
		if (assistantAddCall) {
			const msgs = (assistantAddCall[0] as Updater)([]);
			const assistantMsg = msgs.find((m) => m.role === "assistant");
			if (assistantMsg) {
				expect(assistantMsg.parts[0].type).not.toBe("reasoning");
			}
		}
	});
});

describe("useSendMessage – auto-title fetch (lines 207-228)", () => {
	it("fires auto-title fetch when shouldTriggerAutoTitle returns true", async () => {
		const { shouldTriggerAutoTitle } = await import("@/lib/title-generation");
		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const mockFetch = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", mockFetch);

		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello world" });
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const titleCall = mockFetch.mock.calls.find((c: string[]) =>
			String(c[0]).includes("generate-title"),
		);
		expect(titleCall).toBeDefined();

		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(false);
	});

	it("handles non-ok auto-title response without throwing", async () => {
		const { shouldTriggerAutoTitle } = await import("@/lib/title-generation");
		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "server error" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello world" });
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(false);
	});

	it("handles auto-title fetch throwing without propagating error", async () => {
		const { shouldTriggerAutoTitle } = await import("@/lib/title-generation");
		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const mockFetch = vi.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("network error"));
		vi.stubGlobal("fetch", mockFetch);

		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello world" });
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(false);
	});

	it("does not fire auto-title when shouldTriggerAutoTitle returns false", async () => {
		const { shouldTriggerAutoTitle } = await import("@/lib/title-generation");
		(shouldTriggerAutoTitle as ReturnType<typeof vi.fn>).mockReturnValue(false);

		const mockFetch = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", mockFetch);

		const params = makeParams();
		const { result } = renderHook(() => useSendMessage(params));
		await act(async () => {
			await result.current.sendMessage({ text: "hello world" });
		});

		const titleCall = mockFetch.mock.calls.find((c: string[]) =>
			String(c[0]).includes("generate-title"),
		);
		expect(titleCall).toBeUndefined();
	});
});
