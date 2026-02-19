import { useCallback } from "react";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import { useStreamStore } from "@/stores/stream";
import type { StreamingState, ConvexMessageRecord, ChatStatus } from "./use-streaming-state";
import { normalizeMessageParts } from "./use-streaming-state";
import {
	getRuntimeModelConfig,
	checkProviderLimit,
	createInitialStreamParts,
	messagesToTextHistory,
	createStreamMetadata,
	getUserFriendlyError,
} from "./message-action-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationFn = (...args: any[]) => Promise<any>;

export interface RegenerateActionsDeps {
	convexUserId: Id<"users"> | undefined;
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
	editAndRegenerate: MutationFn;
	retryMessageMut: MutationFn;
	forkChatMut: MutationFn;
	startBackgroundStream: MutationFn;
	cleanupStaleJobs: MutationFn;
}

export interface RegenerateActionsReturn {
	editMessage: (messageId: string, newContent: string) => Promise<void>;
	retryMessage: (messageId: string, overrideModelId?: string) => Promise<void>;
	forkMessage: (messageId: string, overrideModelId?: string) => Promise<string | undefined>;
}

export function useRegenerateActions(deps: RegenerateActionsDeps): RegenerateActionsReturn {
	const {
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
	} = deps;

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

	return { editMessage, retryMessage, forkMessage };
}
