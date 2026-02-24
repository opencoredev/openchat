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
import type { Model } from "@/stores/model";
import {
	normalizeMessageParts,
	getUserFriendlyError,
	type ChatStatus,
	type StreamingState,
	type ReasoningPartWithState,
} from "./chat-utils";

interface UseEditRetryMessageParams {
	convexUserId: Id<"users"> | undefined;
	messages: Array<UIMessage>;
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>;
	messagesResult: ReadonlyArray<{ _id: Id<"messages">; clientMessageId?: string }> | undefined;
	setStatus: (s: ChatStatus) => void;
	setError: (e: Error | undefined) => void;
	chatIdRef: MutableRefObject<string | null>;
	streamingRef: MutableRefObject<StreamingState | null>;
	models: Array<Model>;
	activeProvider: string;
	webSearchEnabled: boolean;
}

export function useEditRetryMessage({
	convexUserId,
	messages,
	setMessages,
	messagesResult,
	setStatus,
	setError,
	chatIdRef,
	streamingRef,
	models,
	activeProvider,
	webSearchEnabled,
}: UseEditRetryMessageParams) {
	const editAndRegenerate = useMutation(api.messages.editAndRegenerate);
	const retryMessageMut = useMutation(api.messages.retryMessage);
	const startBackgroundStream = useMutation(api.backgroundStream.startStream);
	const cleanupStaleJobs = useMutation(api.backgroundStream.cleanupStaleJobs);

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

				await cleanupStaleJobs({ userId: convexUserId }).catch((cleanupError) => {
					console.warn("[EditMessage] Failed to cleanup stale jobs", cleanupError);
				});

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

				await cleanupStaleJobs({ userId: convexUserId }).catch((cleanupError) => {
					console.warn("[RetryMessage] Failed to cleanup stale jobs", cleanupError);
				});

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

	return { editMessage, retryMessage };
}
