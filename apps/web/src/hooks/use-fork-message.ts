import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { MutableRefObject } from "react";
import { getModelById, getModelCapabilities } from "@/stores/model";
import { useModelStore } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import type { Model } from "@/stores/model";

interface UseForkMessageParams {
	convexUserId: Id<"users"> | undefined;
	messages: Array<UIMessage>;
	messagesResult: ReadonlyArray<{ _id: Id<"messages">; clientMessageId?: string }> | undefined;
	chatIdRef: MutableRefObject<string | null>;
	models: Array<Model>;
	activeProvider: string;
	webSearchEnabled: boolean;
}

export function useForkMessage({
	convexUserId,
	messages,
	messagesResult,
	chatIdRef,
	models,
	activeProvider,
	webSearchEnabled,
}: UseForkMessageParams) {
	const forkChatMut = useMutation(api.chatFork.fork);
	const startBackgroundStream = useMutation(api.backgroundStream.startStream);
	const cleanupStaleJobs = useMutation(api.backgroundStream.cleanupStaleJobs);

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

				await cleanupStaleJobs({ userId: convexUserId }).catch((cleanupError) => {
					console.warn("[ForkMessage] Failed to cleanup stale jobs", cleanupError);
				});

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

	return { forkMessage };
}
