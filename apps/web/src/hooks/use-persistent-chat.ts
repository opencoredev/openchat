import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useAuth } from "@/lib/auth-client";
import { useConvexUser } from "@/lib/convex-user";
import { useModels } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import { useChatMessages } from "./use-chat-messages";
import { useChatStreaming } from "./use-chat-streaming";
import { useChatActions } from "./use-chat-actions";
import type { ChatStatus, StreamingState, ChatFileAttachment } from "./chat-utils";

export interface UsePersistentChatOptions {
	chatId?: string;
	onChatCreated?: (chatId: string) => void;
}

export interface UsePersistentChatReturn {
	messages: Array<UIMessage>;
	sendMessage: (message: { text: string; files?: Array<ChatFileAttachment> }) => Promise<void>;
	editMessage: (messageId: string, newContent: string) => Promise<void>;
	retryMessage: (messageId: string, overrideModelId?: string) => Promise<void>;
	forkMessage: (messageId: string, overrideModelId?: string) => Promise<string | undefined>;
	status: "ready" | "submitted" | "streaming" | "error";
	error: Error | undefined;
	stop: () => void;
	isNewChat: boolean;
	isLoadingMessages: boolean;
	isUserLoading: boolean;
	chatId: string | null;
	isResuming: boolean;
	resumedContent: string;
}

export function usePersistentChat({
	chatId,
	onChatCreated,
}: UsePersistentChatOptions): UsePersistentChatReturn {
	const { user } = useAuth();
	const { convexUserId, isLoading: isConvexUserLoading } = useConvexUser();
	const { models } = useModels();
	const activeProvider = useProviderStore((s) => s.activeProvider);
	const webSearchEnabled = useProviderStore((s) => s.webSearchEnabled);

	const [messages, setMessages] = useState<Array<UIMessage>>([]);
	const [status, setStatus] = useState<ChatStatus>("ready");
	const [error, setError] = useState<Error | undefined>(undefined);
	const [currentChatId, setCurrentChatId] = useState<string | null>(chatId ?? null);

	const chatIdRef = useRef<string | null>(chatId ?? null);
	const streamingRef = useRef<StreamingState | null>(null);
	const onChatCreatedRef = useRef(onChatCreated);

	useEffect(() => {
		onChatCreatedRef.current = onChatCreated;
	}, [onChatCreated]);

	useEffect(() => {
		if (chatId) {
			chatIdRef.current = chatId;
			setCurrentChatId(chatId);
		}
	}, [chatId]);

	const isUserLoading = !!(user?.id && isConvexUserLoading);

	const { messagesResult, isLoadingMessages } = useChatMessages({
		chatId,
		convexUserId,
		status,
		setMessages,
	});

	const { stop, isResuming, resumedContent } = useChatStreaming({
		chatId,
		convexUserId,
		status,
		setStatus,
		setMessages,
		streamingRef,
	});

	const { sendMessage, editMessage, retryMessage, forkMessage } = useChatActions({
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
	});

	return {
		messages,
		sendMessage,
		editMessage,
		retryMessage,
		forkMessage,
		status,
		error,
		stop,
		isNewChat: !chatId,
		isLoadingMessages,
		isUserLoading,
		chatId: currentChatId,
		isResuming,
		resumedContent,
	};
}
