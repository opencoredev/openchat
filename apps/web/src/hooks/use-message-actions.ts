import { useCallback } from "react";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import { analytics } from "@/lib/analytics";
import { triggerAutoTitle } from "./use-auto-title";
import type {
	StreamingState,
	ConvexMessageRecord,
	ChatStatus,
} from "./use-streaming-state";
import {
	getRuntimeModelConfig,
	checkProviderLimit,
	createInitialStreamParts,
	createStreamMetadata,
	getUserFriendlyError,
} from "./message-action-utils";
import { useRegenerateActions } from "./use-regenerate-actions";

interface ChatFileAttachment {
	type: "file";
	mediaType: string;
	filename?: string;
	url: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationFn = (...args: any[]) => Promise<any>;

export interface MessageActionsDeps {
	convexUserId: Id<"users"> | undefined;
	isUserLoading: boolean;
	userId: string | undefined;
	messages: Array<UIMessage>;
	messagesResult: Array<ConvexMessageRecord> | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	models: any[];
	activeProvider: string;
	webSearchEnabled: boolean;
	chatIdRef: React.MutableRefObject<string | null>;
	streamingRef: React.MutableRefObject<StreamingState | null>;
	setMessages: React.Dispatch<React.SetStateAction<Array<UIMessage>>>;
	setStatus: React.Dispatch<React.SetStateAction<ChatStatus>>;
	setError: React.Dispatch<React.SetStateAction<Error | undefined>>;
	setCurrentChatId: React.Dispatch<React.SetStateAction<string | null>>;
	onChatCreatedRef: React.MutableRefObject<((chatId: string) => void) | undefined>;
	createChat: MutationFn;
	sendMessagesMut: MutationFn;
	editAndRegenerate: MutationFn;
	retryMessageMut: MutationFn;
	forkChatMut: MutationFn;
	startBackgroundStream: MutationFn;
	cleanupStaleJobs: MutationFn;
}

export interface MessageActionsReturn {
	sendMessage: (message: { text: string; files?: Array<ChatFileAttachment> }) => Promise<void>;
	editMessage: (messageId: string, newContent: string) => Promise<void>;
	retryMessage: (messageId: string, overrideModelId?: string) => Promise<void>;
	forkMessage: (messageId: string, overrideModelId?: string) => Promise<string | undefined>;
}

export function useMessageActions(deps: MessageActionsDeps): MessageActionsReturn {
	const {
		convexUserId,
		isUserLoading,
		userId,
		messages,
		messagesResult,
		models,
		activeProvider,
		webSearchEnabled,
		chatIdRef,
		streamingRef,
		setMessages,
		setStatus,
		setError,
		setCurrentChatId,
		onChatCreatedRef,
		createChat,
		sendMessagesMut,
		editAndRegenerate,
		retryMessageMut,
		forkChatMut,
		startBackgroundStream,
		cleanupStaleJobs,
	} = deps;

	const sendMessage = useCallback(
		async (message: { text: string; files?: Array<ChatFileAttachment> }) => {
			if (!convexUserId) {
				if (isUserLoading) {
					toast.error("Please wait", { description: "Setting up your account." });
				} else if (!userId) {
					toast.error("Sign in required");
				} else {
					toast.error("Account sync failed");
				}
				return;
			}

			if (!message.text.trim()) return;

			const { runtimeModelId, runtimeReasoningEffort, runtimeSupportsToolCalls } =
				getRuntimeModelConfig(models);
			if (checkProviderLimit()) return;

			let targetChatId = chatIdRef.current;
			const startedWithoutChatId = !targetChatId;
			const existingMessageCount = messagesResult?.length ?? messages.length;

			if (!targetChatId) {
				try {
					const result = await createChat({ userId: convexUserId, title: "New Chat" });
					targetChatId = result.chatId;
					chatIdRef.current = targetChatId;
					setCurrentChatId(targetChatId);
					analytics.chatCreated();
					onChatCreatedRef.current?.(targetChatId!);
				} catch {
					toast.error("Failed to create chat");
					return;
				}
			}

			const userMsgId = crypto.randomUUID();
			const assistantMsgId = crypto.randomUUID();
			const userCreatedAt = Date.now();

			setMessages((prev) => [
				...prev,
				{ id: userMsgId, role: "user", parts: [{ type: "text", text: message.text }] },
			]);
			setStatus("submitted");
			setError(undefined);
			analytics.messageSent(runtimeModelId);

			sendMessagesMut({
				chatId: targetChatId as Id<"chats">,
				userId: convexUserId,
				userMessage: { content: message.text, clientMessageId: userMsgId, createdAt: userCreatedAt },
			}).catch(() => {
				toast.error("Message may not be saved", {
					description: "We could not persist your message. Please resend if it is missing after refresh.",
				});
			});

			try {
				await cleanupStaleJobs({ userId: convexUserId }).catch(() => {});

				const allMsgs = messages.map((m) => {
					const textPart = m.parts.find((p): p is { type: "text"; text: string } => p.type === "text");
					return { role: m.role, content: textPart?.text || "" };
				});
				allMsgs.push({ role: "user", content: message.text });

				await startBackgroundStream({
					chatId: targetChatId as Id<"chats">,
					userId: convexUserId,
					messageId: assistantMsgId,
					model: runtimeModelId,
					provider: activeProvider,
					messages: allMsgs,
					options: {
						enableReasoning: runtimeReasoningEffort !== "none",
						reasoningEffort: runtimeReasoningEffort,
						enableWebSearch: webSearchEnabled,
						supportsToolCalls: runtimeSupportsToolCalls,
					},
				});

				setStatus("streaming");
				streamingRef.current = { id: assistantMsgId, content: "", reasoning: "", chainHash: "[]" };

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: createInitialStreamParts(runtimeReasoningEffort),
						metadata: createStreamMetadata(runtimeReasoningEffort, runtimeModelId, activeProvider, webSearchEnabled),
					},
				]);

				triggerAutoTitle({
					chatId: targetChatId!,
					userId: convexUserId,
					seedText: message.text,
					existingMessageCount,
					startedWithoutChatId,
					activeProvider,
				});

			} catch (err) {
				const parsedError = err instanceof Error ? err : new Error("Unknown error");
				setError(parsedError);
				setStatus("error");
				const errorMessage = parsedError.message.toLowerCase();
				if (errorMessage.includes("search") && errorMessage.includes("limit")) {
					toast.error("Search limit reached", {
						description: "You've used your daily web searches. Limit resets tomorrow.",
					});
				} else if (errorMessage.includes("web search") && errorMessage.includes("unavailable")) {
					toast.error("Web search unavailable", {
						description: "Web search is temporarily unavailable. Try again shortly.",
					});
				} else if (
					errorMessage.includes("stream already in progress") ||
					errorMessage.includes("current request")
				) {
					toast.error("Response still in progress", {
						description: "Wait for the current response to finish, then send again.",
					});
				} else if (errorMessage.includes("daily") && errorMessage.includes("limit")) {
					toast.error("Daily limit reached", {
						description: "Add your OpenRouter API key to continue.",
					});
				} else {
					console.error("[PersistentChat] Send message error:", parsedError.message);
					toast.error("Failed to send message", {
						description: getUserFriendlyError(parsedError.message),
					});
				}
			}
		},
		[
			convexUserId,
			isUserLoading,
			userId,
			messages,
			messagesResult,
			models,
			activeProvider,
			webSearchEnabled,
			createChat,
			sendMessagesMut,
			startBackgroundStream,
			cleanupStaleJobs,
			chatIdRef,
			streamingRef,
			setMessages,
			setStatus,
			setError,
			setCurrentChatId,
			onChatCreatedRef,
		],
	);

	const { editMessage, retryMessage, forkMessage } = useRegenerateActions({
		convexUserId,
		messages,
		messagesResult,
		models,
		activeProvider,
		webSearchEnabled,
		chatIdRef,
		streamingRef,
		setMessages,
		setStatus,
		setError,
		editAndRegenerate,
		retryMessageMut,
		forkChatMut,
		startBackgroundStream,
		cleanupStaleJobs,
	});

	return { sendMessage, editMessage, retryMessage, forkMessage };
}
