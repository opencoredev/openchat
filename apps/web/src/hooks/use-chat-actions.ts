import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getModelById, getModelCapabilities } from "@/stores/model";
import { useModelStore } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import { useStreamStore } from "@/stores/stream";
import { analytics } from "@/lib/analytics";
import { shouldTriggerAutoTitle } from "@/lib/title-generation";
import type { Model } from "@/stores/model";
import {
	normalizeMessageParts,
	getUserFriendlyError,
	type ChatStatus,
	type ChatFileAttachment,
	type StreamingState,
	type ReasoningPartWithState,
} from "./chat-utils";

interface UseChatActionsParams {
	convexUserId: Id<"users"> | undefined;
	isUserLoading: boolean;
	user: { id: string } | null | undefined;
	messages: Array<UIMessage>;
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>;
	messagesResult: ReadonlyArray<{ _id: Id<"messages">; clientMessageId?: string }> | undefined;
	setStatus: (s: ChatStatus) => void;
	setError: (e: Error | undefined) => void;
	chatIdRef: MutableRefObject<string | null>;
	streamingRef: MutableRefObject<StreamingState | null>;
	onChatCreatedRef: MutableRefObject<((chatId: string) => void) | undefined>;
	setCurrentChatId: (id: string) => void;
	models: Array<Model>;
	activeProvider: string;
	webSearchEnabled: boolean;
}

export function useChatActions({
	convexUserId,
	isUserLoading,
	user,
	messages,
	setMessages,
	messagesResult,
	setStatus,
	setError,
	chatIdRef,
	streamingRef,
	onChatCreatedRef,
	setCurrentChatId,
	models,
	activeProvider,
	webSearchEnabled,
}: UseChatActionsParams) {
	const createChat = useMutation(api.chats.create);
	const sendMessages = useMutation(api.messages.send);
	const editAndRegenerate = useMutation(api.messages.editAndRegenerate);
	const retryMessageMut = useMutation(api.messages.retryMessage);
	const forkChatMut = useMutation(api.chats.fork);
	const startBackgroundStream = useMutation(api.backgroundStream.startStream);
	const cleanupStaleJobs = useMutation(api.backgroundStream.cleanupStaleJobs);

	const sendMessage = useCallback(
		async (message: { text: string; files?: Array<ChatFileAttachment> }) => {
			if (!convexUserId) {
				if (isUserLoading) {
					toast.error("Please wait", { description: "Setting up your account." });
				} else if (!user?.id) {
					toast.error("Sign in required");
				} else {
					toast.error("Account sync failed");
				}
				return;
			}

			if (!message.text.trim()) return;

			const providerState = useProviderStore.getState();
			const modelState = useModelStore.getState();
			const runtimeModelId = modelState.selectedModelId;
			const runtimeReasoningEnabled = modelState.reasoningEnabled;
			const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
			const runtimeModel = getModelById(models, runtimeModelId);
			const runtimeSupportsToolCalls = getModelCapabilities(
				runtimeModelId,
				runtimeModel,
			).supportsTools;
			if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
				toast.error("Daily limit reached", {
					description: "Add your OpenRouter API key to continue.",
				});
				return;
			}

			let targetChatId = chatIdRef.current;
			const startedWithoutChatId = !targetChatId;
			const existingMessageCount = (messagesResult as unknown[])?.length ?? messages.length;

			if (!targetChatId) {
				try {
					const result = await createChat({ userId: convexUserId, title: "New Chat" });
					targetChatId = result.chatId;
					chatIdRef.current = targetChatId;
					setCurrentChatId(targetChatId);
					analytics.chatCreated();
					onChatCreatedRef.current?.(targetChatId);
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

			sendMessages({
				chatId: targetChatId as Id<"chats">,
				userId: convexUserId,
				userMessage: {
					content: message.text,
					clientMessageId: userMsgId,
					createdAt: userCreatedAt,
				},
			}).catch(() => {
				toast.error("Message may not be saved", {
					description:
						"We could not persist your message. Please resend if it is missing after refresh.",
				});
			});

			try {
				await cleanupStaleJobs({ userId: convexUserId }).catch(() => {});

				const allMsgs = messages.map((m) => {
					const textPart = m.parts.find(
						(p): p is { type: "text"; text: string } => p.type === "text",
					);
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
						enableReasoning: runtimeReasoningEnabled,
						reasoningEffort: runtimeReasoningEffort,
						enableWebSearch: webSearchEnabled,
						supportsToolCalls: runtimeSupportsToolCalls,
					},
				});

				setStatus("streaming");
				streamingRef.current = {
					id: assistantMsgId,
					content: "",
					reasoning: "",
					chainHash: "[]",
				};

				const initialParts: UIMessage["parts"] = [];
				if (runtimeReasoningEffort !== "none") {
					const reasoningPart: ReasoningPartWithState = {
						type: "reasoning",
						text: "",
						state: "streaming",
					};
					initialParts.push(reasoningPart as UIMessage["parts"][number]);
				}
				initialParts.push({ type: "text", text: "", state: "streaming" });

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: initialParts,
						metadata: {
							reasoningRequested: runtimeReasoningEffort !== "none",
							modelId: runtimeModelId,
							provider: activeProvider,
							reasoningEffort: runtimeReasoningEffort,
							webSearchEnabled,
							resumedFromActiveStream: false,
						},
					},
				]);

				const shouldQueueAutoTitle = shouldTriggerAutoTitle({
					startedWithoutChatId,
					existingMessageCount,
					seedText: message.text,
				});
				if (shouldQueueAutoTitle) {
					void fetch("/api/workflow/generate-title", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							chatId: targetChatId,
							userId: convexUserId,
							seedText: message.text.trim().slice(0, 300),
							length: "standard",
							provider: activeProvider,
							mode: "auto",
						}),
					})
						.then(async (response) => {
							if (response.ok) return;
							const payload = await response.json().catch(() => null);
							console.warn("[AutoTitle] Workflow request failed", {
								status: response.status,
								payload,
							});
						})
						.catch((autoTitleError) => {
							console.warn("[AutoTitle] Workflow request failed", autoTitleError);
						});
				}
			} catch (err) {
				const parsedError = err instanceof Error ? err : new Error("Unknown error");
				setError(parsedError);
				setStatus("error");
				const errorMessage = parsedError.message.toLowerCase();
				if (errorMessage.includes("search") && errorMessage.includes("limit")) {
					toast.error("Search limit reached", {
						description: "You've used your daily web searches. Limit resets tomorrow.",
					});
				} else if (
					errorMessage.includes("web search") &&
					errorMessage.includes("unavailable")
				) {
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
				} else if (
					errorMessage.includes("daily") &&
					errorMessage.includes("limit")
				) {
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
			user?.id,
			messages,
			messagesResult,
			models,
			activeProvider,
			webSearchEnabled,
			createChat,
			sendMessages,
			startBackgroundStream,
			cleanupStaleJobs,
			chatIdRef,
			streamingRef,
			onChatCreatedRef,
			setCurrentChatId,
			setMessages,
			setStatus,
			setError,
		],
	);

	const editMessage = useCallback(
		async (messageId: string, newContent: string) => {
			if (!convexUserId || !chatIdRef.current) return;

			const trimmedContent = newContent.trim();
			if (!trimmedContent) return;

			const providerState = useProviderStore.getState();
			const modelState = useModelStore.getState();
			const runtimeModelId = modelState.selectedModelId;
			const runtimeReasoningEnabled = modelState.reasoningEnabled;
			const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
			const runtimeModel = getModelById(models, runtimeModelId);
			const runtimeSupportsToolCalls = getModelCapabilities(
				runtimeModelId,
				runtimeModel,
			).supportsTools;

			if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
				toast.error("Daily limit reached", {
					description: "Add your OpenRouter API key to continue.",
				});
				return;
			}

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
					const metadata = m.metadata as
						| { serverMessageId?: unknown; clientMessageId?: unknown }
						| undefined;
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
				const allMsgs = keptMessages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => {
						const textPart = m.parts.find(
							(p): p is { type: "text"; text: string } => p.type === "text",
						);
						return { role: m.role, content: textPart?.text || "" };
					});

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

				const initialParts: UIMessage["parts"] = [];
				if (runtimeReasoningEffort !== "none") {
					const reasoningPart: ReasoningPartWithState = {
						type: "reasoning",
						text: "",
						state: "streaming",
					};
					initialParts.push(reasoningPart as UIMessage["parts"][number]);
				}
				initialParts.push({ type: "text", text: "", state: "streaming" });

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: initialParts,
						metadata: {
							reasoningRequested: runtimeReasoningEffort !== "none",
							modelId: runtimeModelId,
							provider: activeProvider,
							reasoningEffort: runtimeReasoningEffort,
							webSearchEnabled,
							resumedFromActiveStream: false,
						},
					},
				]);

				setStatus("streaming");
				streamingRef.current = {
					id: assistantMsgId,
					content: "",
					reasoning: "",
					chainHash: "[]",
				};
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

			const providerState = useProviderStore.getState();
			const modelState = useModelStore.getState();
			const runtimeModelId = overrideModelId || modelState.selectedModelId;
			const runtimeReasoningEnabled = modelState.reasoningEnabled;
			const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
			const runtimeModel = getModelById(models, runtimeModelId);
			const runtimeSupportsToolCalls = getModelCapabilities(
				runtimeModelId,
				runtimeModel,
			).supportsTools;

			if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
				toast.error("Daily limit reached", {
					description: "Add your OpenRouter API key to continue.",
				});
				return;
			}

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
					const metadata = m.metadata as
						| { serverMessageId?: unknown; clientMessageId?: unknown }
						| undefined;
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
				const allMsgs = keptMessages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => {
						const textPart = m.parts.find(
							(p): p is { type: "text"; text: string } => p.type === "text",
						);
						return { role: m.role, content: textPart?.text || "" };
					});

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

				const initialParts: UIMessage["parts"] = [];
				if (runtimeReasoningEffort !== "none") {
					const reasoningPart: ReasoningPartWithState = {
						type: "reasoning",
						text: "",
						state: "streaming",
					};
					initialParts.push(reasoningPart as UIMessage["parts"][number]);
				}
				initialParts.push({ type: "text", text: "", state: "streaming" });

				setMessages((prev) => [
					...prev,
					{
						id: assistantMsgId,
						role: "assistant",
						parts: initialParts,
						metadata: {
							reasoningRequested: runtimeReasoningEffort !== "none",
							modelId: runtimeModelId,
							provider: activeProvider,
							reasoningEffort: runtimeReasoningEffort,
							webSearchEnabled,
							resumedFromActiveStream: false,
						},
					},
				]);

				setStatus("streaming");
				streamingRef.current = {
					id: assistantMsgId,
					content: "",
					reasoning: "",
					chainHash: "[]",
				};
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

			const providerState = useProviderStore.getState();
			const modelState = useModelStore.getState();
			const runtimeModelId = overrideModelId || modelState.selectedModelId;
			const runtimeReasoningEnabled = modelState.reasoningEnabled;
			const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
			const runtimeModel = getModelById(models, runtimeModelId);
			const runtimeSupportsToolCalls = getModelCapabilities(
				runtimeModelId,
				runtimeModel,
			).supportsTools;

			if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
				toast.error("Daily limit reached", {
					description: "Add your OpenRouter API key to continue.",
				});
				return undefined;
			}

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

			const msgsUpToFork = messages
				.slice(0, forkIdx + 1)
				.filter((message) => message.role === "user" || message.role === "assistant")
				.map((message) => {
					const textPart = message.parts.find(
						(part): part is { type: "text"; text: string } => part.type === "text",
					);
					return { role: message.role, content: textPart?.text || "" };
				});

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
			messagesResult,
			models,
			activeProvider,
			webSearchEnabled,
			forkChatMut,
			cleanupStaleJobs,
			startBackgroundStream,
			chatIdRef,
		],
	);

	return { sendMessage, editMessage, retryMessage, forkMessage };
}
