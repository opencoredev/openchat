// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/hooks/use-persistent-chat', () => ({
	usePersistentChat: vi.fn(),
}))

vi.mock('convex/react', () => ({
	useQuery: vi.fn(() => null),
	useMutation: vi.fn(() => vi.fn()),
}))

vi.mock('@server/convex/_generated/api', () => ({
	api: {
		users: { getByExternalId: 'users:getByExternalId' },
		search: { getSearchAvailability: 'search:getSearchAvailability' },
	},
}))

vi.mock('@tanstack/react-router', () => ({
	useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('@/stores/model', () => ({
	useModelStore: vi.fn((selector?: (s: any) => any) => {
		const state = {
			selectedModelId: 'openai/gpt-4o',
			reasoningEnabled: false,
			setReasoningEnabled: vi.fn(),
		}
		return selector ? selector(state) : state
	}),
	useModels: vi.fn(() => ({ models: [], isLoading: false })),
	getModelById: vi.fn(() => null),
	getModelCapabilities: vi.fn(() => ({
		supportsReasoning: false,
		supportsTools: false,
	})),
}))

vi.mock('@/stores/provider', () => ({
	useWebSearch: vi.fn(() => ({
		enabled: false,
		toggle: vi.fn(),
		setEnabled: vi.fn(),
		remainingSearches: 10,
		isLimitReached: false,
	})),
	useProviderStore: vi.fn((selector?: (s: any) => any) => {
		const state = { activeProvider: 'osschat', webSearchEnabled: false }
		return selector ? selector(state) : state
	}),
}))

vi.mock('@/hooks/use-prompt-draft', () => ({
	usePromptDraft: vi.fn(() => ({ clearDraft: vi.fn() })),
}))

vi.mock('@/lib/auth-client', () => ({
	useAuth: vi.fn(() => ({ user: null, isAuthenticated: false, loading: false })),
}))

// Conversation: deliberately NOT spreading unknown props to avoid React DOM warnings
vi.mock('../ai-elements/conversation', () => ({
	Conversation: ({ children, className }: any) => (
		<div data-testid="conversation" className={className}>
			{children}
		</div>
	),
	ConversationContent: ({ children, className }: any) => (
		<div data-testid="conversation-content" className={className}>
			{children}
		</div>
	),
	useConversationScroll: vi.fn(() => ({
		scrollToBottom: vi.fn(),
		isAtBottom: true,
	})),
}))

vi.mock('../ai-elements/message', () => ({
	Message: ({ children, from }: any) => (
		<div data-testid="message" data-from={from}>
			{children}
		</div>
	),
	MessageContent: ({ children }: any) => (
		<div data-testid="message-content">{children}</div>
	),
	MessageFile: () => <div data-testid="message-file" />,
	MessageResponse: ({ children }: any) => (
		<div data-testid="message-response">{children}</div>
	),
}))

// PromptInputProvider MUST render children – otherwise the inner content won't appear
vi.mock('../ai-elements/prompt-input', () => ({
	PromptInput: ({ children, onSubmit }: any) => (
		<form data-testid="prompt-input" onSubmit={onSubmit}>
			{children}
		</form>
	),
	PromptInputAttachment: () => null,
	PromptInputAttachments: ({ children }: any) => (
		<div>{typeof children === 'function' ? null : children}</div>
	),
	PromptInputFooter: ({ children }: any) => (
		<div data-testid="prompt-footer">{children}</div>
	),
	PromptInputProvider: ({ children }: any) => (
		<div data-testid="prompt-input-provider">{children}</div>
	),
	PromptInputTextarea: ({ placeholder, disabled }: any) => (
		<textarea
			data-testid="prompt-textarea"
			placeholder={placeholder}
			disabled={disabled}
		/>
	),
	PromptInputTools: ({ children }: any) => <div>{children}</div>,
	usePromptInputController: vi.fn(() => ({
		textInput: { value: '', setInput: vi.fn() },
		attachments: { add: vi.fn() },
	})),
}))

vi.mock('../model-selector', () => ({
	ConnectedModelSelector: () => <div data-testid="model-selector" />,
}))

vi.mock('../start-screen', () => ({
	StartScreen: ({ onPromptSelect }: any) => (
		<div
			data-testid="start-screen"
			onClick={() => onPromptSelect('test prompt')}
		>
			Start Screen
		</div>
	),
}))

vi.mock('@/components/message-actions', () => ({
	UserMessageActions: () => <div data-testid="user-message-actions" />,
	AssistantMessageActions: () => <div data-testid="assistant-message-actions" />,
}))

vi.mock('@/components/ai-elements/chain-of-thought', () => ({
	ChainOfThought: ({ children }: any) => (
		<div data-testid="chain-of-thought">{children}</div>
	),
	ChainOfThoughtContent: ({ children }: any) => <div>{children}</div>,
	ChainOfThoughtHeader: ({ children }: any) => <div>{children}</div>,
	ChainOfThoughtStep: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ai-elements/reasoning', () => ({
	Reasoning: ({ children }: any) => (
		<div data-testid="reasoning">{children}</div>
	),
	ReasoningContent: ({ children }: any) => <div>{children}</div>,
	ReasoningTrigger: () => <button>Reasoning</button>,
}))

vi.mock('@/lib/shortcuts', () => ({
	SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE: 'focus-prompt-toggle',
	SHORTCUT_EVENT_STOP_GENERATION: 'stop-generation',
}))

vi.mock('streamdown', () => ({
	Streamdown: ({ children }: any) => <span>{children}</span>,
}))

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('../ui/button', () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock('lucide-react', () => ({
	ArrowUpIcon: () => <svg data-testid="arrow-up-icon" />,
	BrainIcon: () => <svg />,
	GlobeIcon: () => <svg />,
	Loader2Icon: () => <svg />,
	PaperclipIcon: () => <svg />,
	SearchIcon: () => <svg />,
	SquareIcon: () => <svg data-testid="square-icon" />,
	XIcon: () => <svg />,
}))

import { ChatInterface } from '../chat-interface'
import { usePersistentChat } from '@/hooks/use-persistent-chat'

function makeDefaultState() {
	return {
		messages: [] as any[],
		sendMessage: vi.fn().mockResolvedValue(undefined),
		editMessage: vi.fn().mockResolvedValue(undefined),
		retryMessage: vi.fn().mockResolvedValue(undefined),
		forkMessage: vi.fn().mockResolvedValue(undefined),
		status: 'ready' as const,
		error: undefined,
		stop: vi.fn(),
		isNewChat: true,
		isLoadingMessages: false,
		isUserLoading: false,
		chatId: null,
		isResuming: false,
		resumedContent: '',
	}
}

describe('ChatInterface', () => {
	beforeEach(() => {
		vi.mocked(usePersistentChat).mockReturnValue(makeDefaultState())
	})

	afterEach(() => {
		cleanup()
		vi.clearAllMocks()
	})

	it('renders without crashing', () => {
		render(<ChatInterface />)
		expect(document.body).toBeTruthy()
	})

	it('shows start screen when isNewChat is true and messages are empty', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: true,
			messages: [],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('start-screen')).toBeTruthy()
	})

	it('does not show start screen when not a new chat', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [],
		})
		render(<ChatInterface />)
		expect(screen.queryByTestId('start-screen')).toBeNull()
	})

	it('renders user messages in the conversation', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [
				{
					id: 'msg-1',
					role: 'user',
					parts: [{ type: 'text', text: 'Hello, world!' }],
				},
			],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('message')).toBeTruthy()
		expect(screen.getByText('Hello, world!')).toBeTruthy()
	})

	it('shows loading dots when streaming and last message is from user', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			status: 'streaming',
			messages: [
				{
					id: 'msg-1',
					role: 'user',
					parts: [{ type: 'text', text: 'Waiting for reply' }],
				},
			],
		})
		render(<ChatInterface />)
		const dots = document.querySelectorAll('.animate-bounce')
		expect(dots.length).toBeGreaterThan(0)
	})

	it('does not show loading dots when last message is from assistant', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			status: 'streaming',
			messages: [
				{
					id: 'msg-1',
					role: 'user',
					parts: [{ type: 'text', text: 'Hi' }],
				},
				{
					id: 'msg-2',
					role: 'assistant',
					parts: [{ type: 'text', text: 'Hello!' }],
				},
			],
		})
		render(<ChatInterface />)
		const dots = document.querySelectorAll('.animate-bounce')
		expect(dots.length).toBe(0)
	})

	it('renders inline error message for messages with error type', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [
				{
					id: 'err-1',
					role: 'assistant',
					messageType: 'error',
					error: {
						code: 'rate_limit',
						message: 'You are being rate limited.',
						retryable: true,
					},
					parts: [],
				} as any,
			],
		})
		render(<ChatInterface />)
		expect(screen.getByText('Rate Limit Exceeded')).toBeTruthy()
		expect(screen.getByText('You are being rate limited.')).toBeTruthy()
	})

	it('renders empty conversation when not new chat and messages are empty', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [],
		})
		render(<ChatInterface />)
		expect(screen.queryByTestId('start-screen')).toBeNull()
		expect(screen.queryByTestId('message')).toBeNull()
	})

	it('renders the prompt input textarea', () => {
		render(<ChatInterface />)
		expect(screen.getByTestId('prompt-textarea')).toBeTruthy()
	})

	it('shows stop button when generation is in progress', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			status: 'streaming',
		})
		render(<ChatInterface />)
		const stopButton = screen.getByRole('button', { name: 'Stop generating' })
		expect(stopButton).toBeTruthy()
	})
})
