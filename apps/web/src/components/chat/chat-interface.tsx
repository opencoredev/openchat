/**
 * Chat Interface - Main conversational UI component
 *
 * Uses AI Elements components for a polished, modern UI:
 * - Conversation for auto-scrolling message container
 * - Message for user/assistant message rendering
 * - PromptInput for message composition with file attachments
 * - ModelSelector for choosing AI models
 * - Streaming response support via AI SDK 5
 * - Convex persistence for chat history
 */

import { memo, useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { PromptInputProvider, usePromptInputController } from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { usePersistentChat } from "@/hooks/use-persistent-chat";
import { usePromptDraft } from "@/hooks/use-prompt-draft";
import {
	SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE,
	SHORTCUT_EVENT_STOP_GENERATION,
} from "@/lib/shortcuts";
import { ChatMessageList } from "./chat-message-list";
import { PremiumPromptInputInner } from "./premium-prompt-input";
import type { UIDataTypes, UIMessagePart, UITools } from "ai";

function useIsMac() {
	const [isMac] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.platform.toLowerCase().includes("mac"),
	);

	return isMac;
}

interface ChatInterfaceProps {
	chatId?: string;
}

export function ChatInterface({ chatId }: ChatInterfaceProps) {
	const navigate = useNavigate();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const {
		messages,
		sendMessage,
		editMessage,
		retryMessage,
		forkMessage,
		status,
		error,
		stop,
		isNewChat,
	} = usePersistentChat({
		chatId,
		onChatCreated: (newChatId) => {
			navigate({
				to: "/c/$chatId",
				params: { chatId: newChatId },
				replace: true,
			});
		},
	});

	const isLoading = status === "streaming" || status === "submitted";

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			if (!message.text.trim() && message.files.length === 0) return;

			await sendMessage({
				text: message.text,
				files: message.files,
			});
		},
		[sendMessage],
	);

	const handleForkMessage = useCallback(
		async (messageId: string, modelId?: string) => {
			const newChatId = await forkMessage(messageId, modelId);
			if (!newChatId) return;
			navigate({ to: "/c/$chatId", params: { chatId: newChatId } });
		},
		[forkMessage, navigate],
	);

	return (
		<PromptInputProvider>
			<ChatInterfaceContent
				key={chatId ?? "__new__"}
				chatId={chatId ?? null}
				messages={messages}
				isLoading={isLoading}
				isNewChat={isNewChat}
				error={error ?? null}
				stop={stop}
				handleSubmit={handleSubmit}
				onEditMessage={editMessage}
				onRetryMessage={retryMessage}
				onForkMessage={handleForkMessage}
				textareaRef={textareaRef}
			/>
		</PromptInputProvider>
	);
}

interface ChatInterfaceContentProps {
	chatId: string | null;
	messages: Array<{
		id: string;
		role: string;
		parts?: Array<UIMessagePart<UIDataTypes, UITools>>;
		metadata?: unknown;
	}>;
	isLoading: boolean;
	isNewChat: boolean;
	error: Error | null;
	stop: () => void;
	handleSubmit: (message: PromptInputMessage) => Promise<void>;
	onEditMessage: (messageId: string, newContent: string) => Promise<void>;
	onRetryMessage: (messageId: string, modelId?: string) => Promise<void>;
	onForkMessage: (messageId: string, modelId?: string) => Promise<void>;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const ChatInterfaceContent = memo(function ChatInterfaceContent({
	chatId,
	messages,
	isLoading,
	isNewChat,
	error: _error,
	stop,
	handleSubmit,
	onEditMessage,
	onRetryMessage,
	onForkMessage,
	textareaRef,
}: ChatInterfaceContentProps) {
	const controller = usePromptInputController();
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [isSavingEdit, setIsSavingEdit] = useState(false);
	const savedDraftRef = useRef<string>("");
	const isMac = useIsMac();
	const focusShortcut = isMac ? "⌘L" : "Ctrl+L";

	const { clearDraft } = usePromptDraft({
		chatId,
		textInputController: controller.textInput,
	});

	const isLoadingRef = useRef(isLoading);
	isLoadingRef.current = isLoading;
	const stopRef = useRef(stop);
	stopRef.current = stop;

	useMountEffect(() => {
		const onFocusPromptToggle = () => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const isTextareaFocused =
				document.activeElement === textarea ||
				textarea.contains(document.activeElement as Node);

			if (isTextareaFocused) {
				textarea.blur();
				const activeElement = document.activeElement;
				if (activeElement instanceof HTMLElement) {
					activeElement.blur();
				}
				return;
			}

			textarea.focus();
		};

		const onStopGeneration = () => {
			if (!isLoadingRef.current) return;
			stopRef.current();
		};

		window.addEventListener(SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE, onFocusPromptToggle);
		window.addEventListener(SHORTCUT_EVENT_STOP_GENERATION, onStopGeneration);

		return () => {
			window.removeEventListener(SHORTCUT_EVENT_FOCUS_PROMPT_TOGGLE, onFocusPromptToggle);
			window.removeEventListener(SHORTCUT_EVENT_STOP_GENERATION, onStopGeneration);
		};
	});

	const setInput = controller.textInput.setInput;
	const onPromptSelect = useCallback(
		(prompt: string) => {
			setInput(prompt);
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 0);
		},
		[setInput, textareaRef],
	);

	const startEdit = useCallback(
		(messageId: string, content: string) => {
			savedDraftRef.current = controller.textInput.value;
			setEditingMessageId(messageId);
			setInput(content);
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 0);
		},
		[controller.textInput.value, setInput, textareaRef],
	);

	const cancelEdit = useCallback(() => {
		setEditingMessageId(null);
		setIsSavingEdit(false);
		setInput(savedDraftRef.current);
		savedDraftRef.current = "";
	}, [setInput]);

	const editingMessageIdRef = useRef(editingMessageId);
	editingMessageIdRef.current = editingMessageId;
	const cancelEditRef = useRef(cancelEdit);
	cancelEditRef.current = cancelEdit;

	useMountEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && editingMessageIdRef.current) {
				e.preventDefault();
				cancelEditRef.current();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	});

	const handleSubmitWithDraftClear = useCallback(
		async (message: PromptInputMessage) => {
			if (editingMessageId) {
				if (!message.text.trim()) return;
				try {
					setIsSavingEdit(true);
					await onEditMessage(editingMessageId, message.text);
					setEditingMessageId(null);
					setIsSavingEdit(false);
					savedDraftRef.current = "";
					clearDraft();
				} catch {
					setIsSavingEdit(false);
				}
				return;
			}
			await handleSubmit(message).then(() => {
				clearDraft();
			});
		},
		[handleSubmit, clearDraft, editingMessageId, onEditMessage],
	);

	return (
		<div className="flex h-full flex-col">
			<ChatMessageList
				chatId={chatId}
				messages={messages}
				isLoading={isLoading}
				isNewChat={isNewChat}
				onPromptSelect={onPromptSelect}
				onRetryMessage={onRetryMessage}
				onForkMessage={onForkMessage}
				editingMessageId={editingMessageId}
				onStartEdit={startEdit}
			/>

			<div className="px-2 md:px-4 pt-2 md:pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-4">
				<div className="mx-auto max-w-3xl">
					{editingMessageId && (
						<div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
							<span className="text-sm text-primary font-medium">Editing message</span>
							<button
								type="button"
								onClick={cancelEdit}
								className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								<XIcon className="size-3" />
								Cancel
							</button>
						</div>
					)}
					<PremiumPromptInputInner
						onSubmit={handleSubmitWithDraftClear}
						isLoading={isLoading || isSavingEdit}
						onStop={stop}
						textareaRef={textareaRef}
						focusShortcut={focusShortcut}
					/>
				</div>
			</div>
		</div>
	);
});
