import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Model } from "@/stores/model";
import type { ChatStatus, StreamingState } from "./chat-utils";
import { useSendMessage } from "./use-send-message";
import { useEditRetryMessage } from "./use-edit-retry-message";
import { useForkMessage } from "./use-fork-message";

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
	const sharedParams = {
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
	};

	const { sendMessage } = useSendMessage({
		...sharedParams,
		isUserLoading,
		user,
		onChatCreatedRef,
		setCurrentChatId,
	});

	const { editMessage, retryMessage } = useEditRetryMessage(sharedParams);

	const { forkMessage } = useForkMessage({
		convexUserId,
		messages,
		messagesResult,
		chatIdRef,
		models,
		activeProvider,
		webSearchEnabled,
	});

	return { sendMessage, editMessage, retryMessage, forkMessage };
}
