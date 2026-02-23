// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

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

const mockSetInput = vi.hoisted(() => vi.fn())

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
		textInput: { value: '', setInput: mockSetInput },
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

vi.mock('../chat/chat-message-list', () => ({
	ChatMessageList: ({ onPromptSelect, onStartEdit, onRetryMessage, onForkMessage, editingMessageId }: any) => (
		<div data-testid="chat-message-list" data-editing={editingMessageId ?? ''}>
			<button data-testid="start-edit-btn" onClick={() => onStartEdit?.('msg-1', 'original text')} />
			<button data-testid="prompt-select-btn" onClick={() => onPromptSelect?.('selected prompt')} />
			<button data-testid="retry-btn" onClick={() => onRetryMessage?.('msg-1')} />
			<button data-testid="fork-btn" onClick={() => onForkMessage?.('msg-1', 'model-x')} />
		</div>
	),
}))

vi.mock('../chat/premium-prompt-input', () => ({
	PremiumPromptInputInner: ({ onSubmit, onStop, isLoading, textareaRef }: any) => (
		<div data-testid="premium-prompt-input" data-loading={String(isLoading)}>
			<textarea ref={textareaRef} data-testid="focus-area" />
			<button data-testid="submit-btn" onClick={() => onSubmit?.({ text: 'test message', files: [] })} />
			<button data-testid="submit-empty-btn" onClick={() => onSubmit?.({ text: '   ', files: [] })} />
			<button data-testid="stop-btn" onClick={onStop} />
		</div>
	),
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

	it('renders ChatMessageList when isNewChat is true and messages are empty', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: true,
			messages: [],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
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

	it('passes messages to ChatMessageList', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [{ id: 'msg-1', role: 'user', parts: [] }],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
	})

	it('renders with streaming status and messages', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			status: 'streaming',
			messages: [{ id: 'msg-1', role: 'user', parts: [] }],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
	})

	it('renders with multiple messages including assistant', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			status: 'streaming',
			messages: [
				{ id: 'msg-1', role: 'user', parts: [] },
				{ id: 'msg-2', role: 'assistant', parts: [] },
			],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
	})

	it('renders inline error message for messages with error type (via ChatMessageList mock)', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			isNewChat: false,
			messages: [{ id: 'err-1', role: 'assistant', parts: [] } as any],
		})
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
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

	it('renders PremiumPromptInputInner (contains textarea/controls)', () => {
		render(<ChatInterface />)
		expect(screen.getByTestId('premium-prompt-input')).toBeTruthy()
	})

	it('shows stop button (data-loading=true) when generation is in progress', () => {
		vi.mocked(usePersistentChat).mockReturnValue({
			...makeDefaultState(),
			status: 'streaming',
		})
		render(<ChatInterface />)
		const input = screen.getByTestId('premium-prompt-input')
		expect(input.getAttribute('data-loading')).toBe('true')
	})

	it('renders ChatMessageList component', () => {
		render(<ChatInterface />)
		expect(screen.getByTestId('chat-message-list')).toBeTruthy()
	})

	it('renders PremiumPromptInputInner component', () => {
		render(<ChatInterface />)
		expect(screen.getByTestId('premium-prompt-input')).toBeTruthy()
	})

	describe('edit message flow', () => {
		it('onStartEdit sets input text to message content', () => {
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			expect(mockSetInput).toHaveBeenCalledWith('original text')
		})

		it('shows editing banner when editingMessageId is set', () => {
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			expect(screen.getByText('Editing message')).toBeTruthy()
		})

		it('cancel button clears the editing banner', () => {
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			expect(screen.getByText('Editing message')).toBeTruthy()
			fireEvent.click(screen.getByText('Cancel'))
			expect(screen.queryByText('Editing message')).toBeNull()
		})

		it('Escape key clears the editing banner', () => {
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			expect(screen.getByText('Editing message')).toBeTruthy()
			fireEvent.keyDown(document, { key: 'Escape' })
			expect(screen.queryByText('Editing message')).toBeNull()
		})

		it('Escape key does nothing when not editing', () => {
			render(<ChatInterface />)
			expect(screen.queryByText('Editing message')).toBeNull()
			fireEvent.keyDown(document, { key: 'Escape' })
			expect(screen.queryByText('Editing message')).toBeNull()
		})

		it('submitting with non-empty text while editing calls editMessage', async () => {
			const editMessage = vi.fn().mockResolvedValue(undefined)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				editMessage,
			})
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			await act(async () => {
				fireEvent.click(screen.getByTestId('submit-btn'))
			})
			expect(editMessage).toHaveBeenCalledWith('msg-1', 'test message')
		})

		it('submitting with empty text while editing does not call editMessage', async () => {
			const editMessage = vi.fn().mockResolvedValue(undefined)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				editMessage,
			})
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			await act(async () => {
				fireEvent.click(screen.getByTestId('submit-empty-btn'))
			})
			expect(editMessage).not.toHaveBeenCalled()
		})

		it('editMessage rejection is caught and editing banner remains visible', async () => {
			const editMessage = vi.fn().mockRejectedValue(new Error('Edit failed'))
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				editMessage,
			})
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('start-edit-btn'))
			await act(async () => {
				fireEvent.click(screen.getByTestId('submit-btn'))
			})
			expect(editMessage).toHaveBeenCalledWith('msg-1', 'test message')
			expect(screen.getByText('Editing message')).toBeTruthy()
		})
	})

	describe('submit flow', () => {
		it('submitting with non-empty text calls sendMessage', async () => {
			const sendMessage = vi.fn().mockResolvedValue(undefined)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				sendMessage,
			})
			render(<ChatInterface />)
			await act(async () => {
				fireEvent.click(screen.getByTestId('submit-btn'))
			})
			expect(sendMessage).toHaveBeenCalledWith({ text: 'test message', files: [] })
		})

		it('submitting with empty/whitespace text does NOT call sendMessage', async () => {
			const sendMessage = vi.fn().mockResolvedValue(undefined)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				sendMessage,
			})
			render(<ChatInterface />)
			await act(async () => {
				fireEvent.click(screen.getByTestId('submit-empty-btn'))
			})
			expect(sendMessage).not.toHaveBeenCalled()
		})

		it('onChatCreated navigates to /c/$chatId', async () => {
			const navigate = vi.fn()
			const { useNavigate } = await import('@tanstack/react-router')
			vi.mocked(useNavigate).mockReturnValue(navigate)

			let capturedOnChatCreated: ((id: string) => void) | undefined
			const { usePersistentChat: upc } = await import('@/hooks/use-persistent-chat')
			vi.mocked(upc).mockImplementation((opts: any) => {
				capturedOnChatCreated = opts?.onChatCreated
				return makeDefaultState()
			})
			render(<ChatInterface />)
			capturedOnChatCreated?.('new-chat-id')
			expect(navigate).toHaveBeenCalledWith(
				expect.objectContaining({ to: '/c/$chatId', params: { chatId: 'new-chat-id' } }),
			)
		})
	})

	describe('loading states', () => {
		it('status submitted renders component without crash', () => {
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				status: 'submitted',
			})
			render(<ChatInterface />)
			expect(screen.getByTestId('premium-prompt-input')).toBeTruthy()
			expect(screen.getByTestId('premium-prompt-input').getAttribute('data-loading')).toBe('true')
		})

		it('isResuming true renders without crash', () => {
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				isResuming: true,
			})
			render(<ChatInterface />)
			expect(document.body).toBeTruthy()
		})
	})

	describe('shortcut events', () => {
		it('SHORTCUT_EVENT_STOP_GENERATION calls stop when isLoading', async () => {
			const stop = vi.fn()
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				status: 'streaming',
				stop,
			})
			render(<ChatInterface />)
			window.dispatchEvent(new Event('stop-generation'))
			expect(stop).toHaveBeenCalled()
		})

		it('SHORTCUT_EVENT_STOP_GENERATION does nothing when not loading', async () => {
			const stop = vi.fn()
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				status: 'ready',
				stop,
			})
			render(<ChatInterface />)
			window.dispatchEvent(new Event('stop-generation'))
			expect(stop).not.toHaveBeenCalled()
		})

		it('SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE focuses the textarea when not focused', () => {
			render(<ChatInterface />)
			const textarea = screen.getByTestId('focus-area')
			const focusSpy = vi.spyOn(textarea, 'focus')
			window.dispatchEvent(new Event('focus-prompt-toggle'))
			expect(focusSpy).toHaveBeenCalled()
		})

		it('SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE blurs the textarea when it is focused', () => {
			render(<ChatInterface />)
			const textarea = screen.getByTestId('focus-area')
			textarea.focus()
			const blurSpy = vi.spyOn(textarea, 'blur')
			window.dispatchEvent(new Event('focus-prompt-toggle'))
			expect(blurSpy).toHaveBeenCalled()
		})
	})

	describe('fork message', () => {
		it('onForkMessage calls forkMessage and navigates on success', async () => {
			const forkMessage = vi.fn().mockResolvedValue('forked-chat-id')
			const navigate = vi.fn()
			const { useNavigate } = await import('@tanstack/react-router')
			vi.mocked(useNavigate).mockReturnValue(navigate)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				forkMessage,
			})
			render(<ChatInterface />)
			await act(async () => {
				fireEvent.click(screen.getByTestId('fork-btn'))
			})
			expect(forkMessage).toHaveBeenCalledWith('msg-1', 'model-x')
			expect(navigate).toHaveBeenCalledWith(
				expect.objectContaining({ to: '/c/$chatId', params: { chatId: 'forked-chat-id' } }),
			)
		})

		it('onForkMessage does not navigate when forkMessage returns null', async () => {
			const forkMessage = vi.fn().mockResolvedValue(null)
			const navigate = vi.fn()
			const { useNavigate } = await import('@tanstack/react-router')
			vi.mocked(useNavigate).mockReturnValue(navigate)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				forkMessage,
			})
			render(<ChatInterface />)
			await act(async () => {
				fireEvent.click(screen.getByTestId('fork-btn'))
			})
			expect(forkMessage).toHaveBeenCalled()
			expect(navigate).not.toHaveBeenCalledWith(
				expect.objectContaining({ to: '/c/$chatId' }),
			)
		})
	})

	describe('prompt select from start screen', () => {
		it('clicking prompt-select-btn sets input via onPromptSelect', () => {
			render(<ChatInterface />)
			fireEvent.click(screen.getByTestId('prompt-select-btn'))
			expect(mockSetInput).toHaveBeenCalledWith('selected prompt')
		})
	})

	describe('retry message', () => {
		it('retryMessage is called when retry button is clicked', async () => {
			const retryMessage = vi.fn().mockResolvedValue(undefined)
			vi.mocked(usePersistentChat).mockReturnValue({
				...makeDefaultState(),
				retryMessage,
			})
			render(<ChatInterface />)
			await act(async () => {
				fireEvent.click(screen.getByTestId('retry-btn'))
			})
			expect(retryMessage).toHaveBeenCalledWith('msg-1')
		})
	})
})
