// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the component under test
// ---------------------------------------------------------------------------

// Mock usePersistentChat — the main data hook
const mockUsePersistentChat = vi.fn();
vi.mock("@/hooks/use-persistent-chat", () => ({
	usePersistentChat: (...args: unknown[]) => mockUsePersistentChat(...args),
}));

// Mock usePromptDraft
vi.mock("@/hooks/use-prompt-draft", () => ({
	usePromptDraft: () => ({ clearDraft: vi.fn() }),
}));

// Mock convex/react
vi.mock("convex/react", () => ({
	useQuery: vi.fn(() => null),
	useMutation: vi.fn(() => vi.fn()),
}));

// Mock server API
vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: { getByExternalId: "users:getByExternalId" },
		search: { getSearchAvailability: "search:getSearchAvailability" },
	},
}));

// Mock TanStack Router
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

// Mock auth
vi.mock("@/lib/auth-client", () => ({
	useAuth: () => ({ user: { id: "test-user", name: "Test" }, session: null }),
}));

// Mock model store
vi.mock("@/stores/model", () => ({
	useModelStore: Object.assign(
		vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
			const state = {
				selectedModelId: "test-model",
				reasoningEnabled: false,
				setReasoningEnabled: vi.fn(),
			};
			return selector ? selector(state) : state;
		}),
		{ getState: () => ({ selectedModelId: "test-model", reasoningEnabled: false }) },
	),
	useModels: () => ({ models: [], isLoading: false }),
	getModelById: () => null,
	getModelCapabilities: () => ({
		supportsReasoning: false,
		supportsTools: false,
	}),
}));

// Mock provider store
vi.mock("@/stores/provider", () => ({
	useProviderStore: Object.assign(
		vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
			const state = { activeProvider: "osschat", webSearchEnabled: false };
			return selector ? selector(state) : state;
		}),
		{ getState: () => ({ activeProvider: "osschat", webSearchEnabled: false, isOverLimit: () => false }) },
	),
	useWebSearch: () => ({
		enabled: false,
		toggle: vi.fn(),
		setEnabled: vi.fn(),
		remainingSearches: 10,
		isLimitReached: false,
	}),
}));

// Mock stream store
vi.mock("@/stores/stream", () => ({
	useStreamStore: Object.assign(vi.fn(() => ({})), {
		getState: () => ({ completeStream: vi.fn(), setResuming: vi.fn() }),
	}),
}));

// Mock shortcuts
vi.mock("@/lib/shortcuts", () => ({
	SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE: "shortcut:focus-prompt-toggle",
	SHORTCUT_EVENT_STOP_GENERATION: "shortcut:stop-generation",
}));

// Mock sonner
vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock streamdown — renders children as plain text
vi.mock("streamdown", () => ({
	Streamdown: ({ children }: { children: React.ReactNode }) =>
		React.createElement("div", { "data-testid": "streamdown" }, children),
}));

// Mock StartScreen — simple stub
vi.mock("@/components/chat/start-screen", () => ({
	StartScreen: ({ onPromptSelect }: { onPromptSelect: (p: string) => void }) =>
		React.createElement(
			"div",
			{ "data-testid": "start-screen", onClick: () => onPromptSelect("test") },
			"Welcome! Pick a prompt.",
		),
}));

// Mock message-actions
vi.mock("@/components/message-actions", () => ({
	UserMessageActions: () => null,
	AssistantMessageActions: () => null,
}));

// Mock model-selector
vi.mock("@/components/model-selector", () => ({
	ConnectedModelSelector: () =>
		React.createElement("div", { "data-testid": "model-selector" }, "Model"),
}));

// Mock ai-elements/conversation — provide context so AutoScroll doesn't throw
vi.mock("@/components/ai-elements/conversation", () => {
	const ConversationCtx = React.createContext({
		scrollRef: { current: null },
		isAtBottom: true,
		scrollToBottom: () => {},
	});
	return {
		Conversation: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
			React.createElement(
				ConversationCtx.Provider,
				{
					value: {
						scrollRef: { current: null },
						isAtBottom: true,
						scrollToBottom: () => {},
					},
				},
				React.createElement("div", { "data-testid": "conversation", ...props }, children),
			),
		ConversationContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
			React.createElement("div", { "data-testid": "conversation-content", ...props }, children),
		useConversationScroll: () => ({
			scrollRef: { current: null },
			isAtBottom: true,
			scrollToBottom: vi.fn(),
		}),
	};
});

// Mock ai-elements/message
vi.mock("@/components/ai-elements/message", () => ({
	Message: ({ children, from }: React.PropsWithChildren<{ from: string }>) =>
		React.createElement("div", { "data-testid": `message-${from}` }, children),
	MessageContent: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", { "data-testid": "message-content" }, children),
	MessageResponse: ({ children }: React.PropsWithChildren<{ isStreaming?: boolean }>) =>
		React.createElement("div", { "data-testid": "message-response" }, children),
	MessageFile: ({ filename }: { filename?: string; url?: string; mediaType?: string }) =>
		React.createElement("div", { "data-testid": "message-file" }, filename ?? "file"),
}));

// Mock ai-elements/prompt-input
const mockTextInput = { value: "", setInput: vi.fn() };
const mockAttachments = { add: vi.fn(), items: [] };
const mockController = { textInput: mockTextInput, attachments: mockAttachments };

vi.mock("@/components/ai-elements/prompt-input", () => ({
	PromptInputProvider: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", { "data-testid": "prompt-provider" }, children),
	PromptInput: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", { "data-testid": "prompt-input" }, children),
	PromptInputTextarea: React.forwardRef(
		(props: Record<string, unknown>, ref: React.Ref<HTMLTextAreaElement>) =>
			React.createElement("textarea", {
				...props,
				ref,
				"data-testid": "prompt-textarea",
			}),
	),
	PromptInputAttachments: (_props: { children: (a: unknown) => React.ReactNode }) =>
		React.createElement("div", null),
	PromptInputAttachment: () => null,
	PromptInputFooter: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	PromptInputTools: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	usePromptInputController: () => mockController,
}));

// Mock ai-elements/chain-of-thought
vi.mock("@/components/ai-elements/chain-of-thought", () => ({
	ChainOfThought: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	ChainOfThoughtContent: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	ChainOfThoughtHeader: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	ChainOfThoughtStep: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
}));

// Mock ai-elements/reasoning
vi.mock("@/components/ai-elements/reasoning", () => ({
	Reasoning: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	ReasoningContent: ({ children }: React.PropsWithChildren) =>
		React.createElement("div", null, children),
	ReasoningTrigger: () => null,
}));

// ---------------------------------------------------------------------------
// Import after all mocks
// ---------------------------------------------------------------------------
import { ChatInterface } from "../chat-interface";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default return value for usePersistentChat mock */
function defaultChatHook(overrides: Record<string, unknown> = {}) {
	return {
		messages: [],
		sendMessage: vi.fn(),
		editMessage: vi.fn(),
		retryMessage: vi.fn(),
		forkMessage: vi.fn(),
		status: "ready" as const,
		error: undefined,
		stop: vi.fn(),
		isNewChat: true,
		isLoadingMessages: false,
		isUserLoading: false,
		chatId: null,
		isResuming: false,
		resumedContent: "",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockTextInput.value = "";
	// Default: return empty new-chat state
	mockUsePersistentChat.mockReturnValue(defaultChatHook());
});

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatInterface", () => {
	it("renders without crashing", () => {
		const { container } = render(<ChatInterface />);
		expect(container).toBeTruthy();
	});

	it("shows start screen when there are no messages and chat is new", () => {
		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({ messages: [], isNewChat: true }),
		);

		render(<ChatInterface />);

		expect(screen.getByTestId("start-screen")).toBeTruthy();
		expect(screen.getByText("Welcome! Pick a prompt.")).toBeTruthy();
	});

	it("renders user and assistant messages when provided", () => {
		const messages = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Hello world" }],
				metadata: {},
			},
			{
				id: "msg-2",
				role: "assistant",
				parts: [{ type: "text", text: "Hi there!" }],
				metadata: {},
			},
		];

		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({ messages, isNewChat: false }),
		);

		render(<ChatInterface chatId="chat-123" />);

		// Should NOT show start screen
		expect(screen.queryByTestId("start-screen")).toBeNull();

		// Should render both messages
		expect(screen.getByTestId("message-user")).toBeTruthy();
		expect(screen.getByTestId("message-assistant")).toBeTruthy();

		// Should render message text
		expect(screen.getByText("Hello world")).toBeTruthy();
		expect(screen.getByText("Hi there!")).toBeTruthy();
	});

	it("shows loading indicator when streaming and last message is from user", () => {
		const messages = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Tell me a joke" }],
				metadata: {},
			},
		];

		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({
				messages,
				isNewChat: false,
				status: "streaming",
			}),
		);

		render(<ChatInterface chatId="chat-123" />);

		// The loading indicator renders 3 bouncing dots (spans with animate-bounce)
		const dots = document.querySelectorAll(".animate-bounce");
		expect(dots.length).toBe(3);
	});

	it("does not show loading indicator when streaming but last message is assistant", () => {
		const messages = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Hello" }],
				metadata: {},
			},
			{
				id: "msg-2",
				role: "assistant",
				parts: [{ type: "text", text: "Responding..." }],
				metadata: {},
			},
		];

		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({
				messages,
				isNewChat: false,
				status: "streaming",
			}),
		);

		render(<ChatInterface chatId="chat-123" />);

		const dots = document.querySelectorAll(".animate-bounce");
		expect(dots.length).toBe(0);
	});

	it("renders inline error message when message has error type", () => {
		const messages = [
			{
				id: "msg-err",
				role: "assistant",
				parts: [],
				messageType: "error",
				error: {
					code: "rate_limit",
					message: "Too many requests, slow down.",
					retryable: true,
				},
				metadata: {},
			},
		];

		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({
				messages,
				isNewChat: false,
			}),
		);

		render(<ChatInterface chatId="chat-123" />);

		// Error title derived from code
		expect(screen.getByText("Rate Limit Exceeded")).toBeTruthy();
		expect(screen.getByText("Too many requests, slow down.")).toBeTruthy();
	});

	it("shows empty state (nothing) when messages are empty and not a new chat", () => {
		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({ messages: [], isNewChat: false }),
		);

		render(<ChatInterface chatId="chat-existing" />);

		// No start screen (isNewChat=false), no messages → empty conversation area
		expect(screen.queryByTestId("start-screen")).toBeNull();
		const dots = document.querySelectorAll(".animate-bounce");
		expect(dots.length).toBe(0);
	});

	it("renders the prompt input area", () => {
		render(<ChatInterface />);

		expect(screen.getByTestId("prompt-textarea")).toBeTruthy();
	});

	it("shows stop button when loading", () => {
		mockUsePersistentChat.mockReturnValue(
			defaultChatHook({ status: "streaming" }),
		);

		render(<ChatInterface />);

		const stopButton = screen.getByLabelText("Stop generating");
		expect(stopButton).toBeTruthy();
	});
});
