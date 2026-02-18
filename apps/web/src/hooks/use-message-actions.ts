import { useCallback } from "react";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import { getModelById, getModelCapabilities, useModelStore } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import { useStreamStore } from "@/stores/stream";
import { analytics } from "@/lib/analytics";
import { triggerAutoTitle } from "./use-auto-title";
import type {
	StreamingState,
	ReasoningPartWithState,
	ConvexMessageRecord,
	ChatStatus,
} from "./use-streaming-state";
import { normalizeMessageParts } from "./use-streaming-state";

interface ChatFileAttachment {
	type: "file";
	mediaType: string;
	filename?: string;
	url: string;
}

function getUserFriendlyError(message: string): string {
	const lowerMessage = message.toLowerCase();
	
	if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
		return "You're sending messages too quickly. Please wait a moment.";
	}
	if (lowerMessage.includes("unauthorized") || lowerMessage.includes("authentication")) {
		return "Session expired. Please refresh the page.";
	}
	if (lowerMessage.includes("not found")) {
		return "The requested resource could not be found.";
	}
	if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
		return "The request took too long. Please try again.";
	}
	if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
		return "Network error. Please check your connection and try again.";
	}
	
	return "An unexpected error occurred. Please try again.";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRuntimeModelConfig(models: any[], overrideModelId?: string) {
	const modelState = useModelStore.getState();
	const runtimeModelId = overrideModelId || modelState.selectedModelId;
	const runtimeReasoningEnabled = modelState.reasoningEnabled;
	const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
	const runtimeModel = getModelById(models, runtimeModelId);
	const runtimeSupportsToolCalls = getModelCapabilities(
		runtimeModelId,
		runtimeModel,
	).supportsTools;
	return { runtimeModelId, runtimeReasoningEnabled, runtimeReasoningEffort, runtimeSupportsToolCalls };
}

function checkProviderLimit(): boolean {
	const providerState = useProviderStore.getState();
	if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
		toast.error("Daily limit reached", { description: "Add your OpenRouter API key to continue." });
		return true;
	}
	return false;
}

function createInitialStreamParts(reasoningEffort: string): UIMessage["parts"] {
	const parts: UIMessage["parts"] = [];
	if (reasoningEffort !== "none") {
		const reasoningPart: ReasoningPartWithState = { type: "reasoning", text: "", state: "streaming" };
		parts.push(reasoningPart as UIMessage["parts"][number]);
	}
	parts.push({ type: "text", text: "", state: "streaming" });
	return parts;
}

function messagesToTextHistory(msgs: Array<UIMessage>): Array<{ role: string; content: string }> {
	return msgs
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => {
			const textPart = m.parts.find((p): p is { type: "text"; text: string } => p.type === "text");
			return { role: m.role, content: textPart?.text || "" };
		});
}

function createStreamMetadata(
	runtimeReasoningEffort: string,
	runtimeModelId: string,
	activeProvider: string,
	webSearchEnabled: boolean,
) {
	return {
		reasoningRequested: runtimeReasoningEffort !== "none",
		modelId: runtimeModelId,
		provider: activeProvider,
		reasoningEffort: runtimeReasoningEffort,
		webSearchEnabled,
		resumedFromActiveStream: false,
	};
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

	const editMessage = useCallback(
		async (messageId: string, newContent: string) => {
			if (!convexUserId || !chatIdRef.current) return;

			const trimmedContent = newContent.trim();
			if (!trimmedContent) return;

			const { runtimeModelId, runtimeReasoningEnabled, runtimeReasoningEffort, runtimeSupportsToolCalls } =
				getRuntimeModelConfig(models);
			if (checkProviderLimit()) return;

			const targetChatId = chatIdRef.current as Id<"chats">;
			const editedMessageDoc = messagesResult?.find(
				(msg) => msg._id === messageId || msg.clientMessageId === messageId,
			);

			if (!editedMessageDoc) {
				toast.error("Could not edit message", {
					description: "Message is not synced yet. Please try again in a second.",
				});
				return;
			}

			setError(undefined);
			setStatus("submitted");

			try {
				await editAndRegenerate({
					chatId: targetChatId,
					userId: convexUserId,
					messageId: editedMessageDoc._id,
					newContent: trimmedContent,
				});

				streamingRef.current = null;
				useStreamStore.getState().completeStream();

				const editedIndex = messages.findIndex((m) => {
					if (m.id === messageId) return true;
					const metadata = m.metadata as { serverMessageId?: unknown; clientMessageId?: unknown } | undefined;
					return (
						metadata?.serverMessageId === editedMessageDoc._id ||
						metadata?.clientMessageId === messageId
					);
				});

				if (editedIndex < 0) {
					throw new Error("Edited message not found in local state");
				}

				const keptMessages = messages
					.slice(0, editedIndex + 1)
					.map((m, index) => {
						if (index !== editedIndex) return m;
						const metadata = m.metadata as { reasoningRequested?: unknown } | undefined;
						return {
							...m,
							parts: normalizeMessageParts({
								content: trimmedContent,
								reasoningRequested: metadata?.reasoningRequested === true,
								isStreaming: false,
							}),
						};
					});

				setMessages(keptMessages);

				await cleanupStaleJobs({ userId: convexUserId }).catch(() => {});

				const assistantMsgId = crypto.randomUUID();
				const allMsgs = messagesToTextHistory(keptMessages);

				await startBackgroundStream({
					chatId: targetChatId,
					userId: convexUserId,
					messageId: assistantMsgId,
					model: runtimeModelId,
					provider: activeProvider,
					messages: allMsgs,
					options: {
						enableReasoning: runtimeReasoningEnabled,
						reasoningEffort: runtimeReasoningEffort,
						enableWebSearch: webSearchEnabled,
						supportsToolCalls: runtimeSupportsToolCalls,
					},
				});

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: createInitialStreamParts(runtimeReasoningEffort),
						metadata: createStreamMetadata(runtimeReasoningEffort, runtimeModelId, activeProvider, webSearchEnabled),
					},
				]);

				setStatus("streaming");
				streamingRef.current = { id: assistantMsgId, content: "", reasoning: "", chainHash: "[]" };
			} catch (err) {
				const parsedError = err instanceof Error ? err : new Error("Unknown error");
				setError(parsedError);
				setStatus("error");
				toast.error("Failed to edit message", {
					description: getUserFriendlyError(parsedError.message),
				});
			}
		},
		[
			convexUserId,
			messages,
			messagesResult,
			models,
			activeProvider,
			webSearchEnabled,
			editAndRegenerate,
			startBackgroundStream,
			cleanupStaleJobs,
			chatIdRef,
			streamingRef,
			setMessages,
			setStatus,
			setError,
		],
	);

	const retryMessage = useCallback(
		async (messageId: string, overrideModelId?: string) => {
			if (!convexUserId || !chatIdRef.current) return;

			const { runtimeModelId, runtimeReasoningEnabled, runtimeReasoningEffort, runtimeSupportsToolCalls } =
				getRuntimeModelConfig(models, overrideModelId);
			if (checkProviderLimit()) return;

			const targetChatId = chatIdRef.current as Id<"chats">;
			const retriedMessageDoc = messagesResult?.find(
				(msg) => msg._id === messageId || msg.clientMessageId === messageId,
			);

			if (!retriedMessageDoc) {
				toast.error("Could not retry message", {
					description: "Message is not synced yet. Please try again in a second.",
				});
				return;
			}

			setError(undefined);
			setStatus("submitted");

			try {
				const result = await retryMessageMut({
					chatId: targetChatId,
					userId: convexUserId,
					messageId: retriedMessageDoc._id,
				});

				streamingRef.current = null;
				useStreamStore.getState().completeStream();

				const retriedIndex = messages.findIndex((m) => {
					if (m.id === messageId) return true;
					const metadata = m.metadata as { serverMessageId?: unknown; clientMessageId?: unknown } | undefined;
					return (
						metadata?.serverMessageId === retriedMessageDoc._id ||
						metadata?.clientMessageId === messageId
					);
				});

				if (retriedIndex < 0) {
					throw new Error("Retried message not found in local state");
				}

				const keptMessages = messages.slice(0, retriedIndex + 1).map((m, index) => {
					if (index !== retriedIndex) return m;
					const metadata = m.metadata as { reasoningRequested?: unknown } | undefined;
					return {
						...m,
						parts: normalizeMessageParts({
							content: result.userContent,
							reasoningRequested: metadata?.reasoningRequested === true,
							isStreaming: false,
						}),
					};
				});

				setMessages(keptMessages);

				await cleanupStaleJobs({ userId: convexUserId }).catch(() => {});

				const assistantMsgId = crypto.randomUUID();
				const allMsgs = messagesToTextHistory(keptMessages);

				await startBackgroundStream({
					chatId: targetChatId,
					userId: convexUserId,
					messageId: assistantMsgId,
					model: runtimeModelId,
					provider: activeProvider,
					messages: allMsgs,
					options: {
						enableReasoning: runtimeReasoningEnabled,
						reasoningEffort: runtimeReasoningEffort,
						enableWebSearch: webSearchEnabled,
						supportsToolCalls: runtimeSupportsToolCalls,
					},
				});

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: createInitialStreamParts(runtimeReasoningEffort),
						metadata: createStreamMetadata(runtimeReasoningEffort, runtimeModelId, activeProvider, webSearchEnabled),
					},
				]);

				setStatus("streaming");
				streamingRef.current = { id: assistantMsgId, content: "", reasoning: "", chainHash: "[]" };
			} catch (err) {
				const parsedError = err instanceof Error ? err : new Error("Unknown error");
				setError(parsedError);
				setStatus("error");
				toast.error("Failed to retry message", {
					description: getUserFriendlyError(parsedError.message),
				});
			}
		},
		[
			convexUserId,
			messages,
			messagesResult,
			models,
			activeProvider,
			webSearchEnabled,
			retryMessageMut,
			startBackgroundStream,
			cleanupStaleJobs,
			chatIdRef,
			streamingRef,
			setMessages,
			setStatus,
			setError,
		],
	);

	const forkMessage = useCallback(
		async (messageId: string, overrideModelId?: string) => {
			if (!convexUserId || !chatIdRef.current) return undefined;

			const { runtimeModelId, runtimeReasoningEnabled, runtimeReasoningEffort, runtimeSupportsToolCalls } =
				getRuntimeModelConfig(models, overrideModelId);
			if (checkProviderLimit()) return undefined;

			const forkIdx = messages.findIndex((message) => {
				if (message.id === messageId) return true;
				const metadata = message.metadata as
					| { serverMessageId?: unknown; clientMessageId?: unknown }
					| undefined;
				return (
					metadata?.serverMessageId === messageId ||
					metadata?.clientMessageId === messageId
				);
			});

			if (forkIdx < 0) {
				toast.error("Could not branch off", {
					description: "Message is not synced yet. Please try again in a second.",
				});
				return undefined;
			}

			const msgsUpToFork = messagesToTextHistory(messages.slice(0, forkIdx + 1));

			try {
				const forkMessageDoc = messagesResult?.find(
					(msg) => msg._id === messageId || msg.clientMessageId === messageId,
				);

				if (!forkMessageDoc) {
					toast.error("Could not branch off", {
						description: "Message is not synced yet. Please try again in a second.",
					});
					return undefined;
				}

				const { newChatId } = await forkChatMut({
					chatId: chatIdRef.current as Id<"chats">,
					userId: convexUserId,
					messageId: forkMessageDoc._id,
				});

				await cleanupStaleJobs({ userId: convexUserId }).catch(() => {});

				const assistantMsgId = crypto.randomUUID();
				await startBackgroundStream({
					chatId: newChatId,
					userId: convexUserId,
					messageId: assistantMsgId,
					model: runtimeModelId,
					provider: activeProvider,
					messages: msgsUpToFork,
					options: {
						enableReasoning: runtimeReasoningEnabled,
						reasoningEffort: runtimeReasoningEffort,
						enableWebSearch: webSearchEnabled,
						supportsToolCalls: runtimeSupportsToolCalls,
					},
				});

				return newChatId;
			} catch (err) {
				const parsedError = err instanceof Error ? err : new Error("Unknown error");
				toast.error("Failed to branch off", {
					description: parsedError.message,
				});
				return undefined;
			}
		},
		[
			convexUserId,
			messages,
			models,
			activeProvider,
			webSearchEnabled,
			forkChatMut,
			cleanupStaleJobs,
			startBackgroundStream,
			messagesResult,
			chatIdRef,
			streamingRef,
		],
	);

	return { sendMessage, editMessage, retryMessage, forkMessage };
}
