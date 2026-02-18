import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import { useAuth } from "@/lib/auth-client";
import { useModels } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import { useStreamingLifecycle } from "./use-streaming-state";
import type { ChatStatus } from "./use-streaming-state";
import { useMessageActions } from "./use-message-actions";

interface ChatFileAttachment {
	type: "file";
	mediaType: string;
	filename?: string;
	url: string;
}

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
	const isMountedRef = useRef(true);
	const { user } = useAuth();
	const { models } = useModels();
	const activeProvider = useProviderStore((s) => s.activeProvider);
	const webSearchEnabled = useProviderStore((s) => s.webSearchEnabled);

	const [messages, setMessages] = useState<Array<UIMessage>>([]);
	const [status, setStatus] = useState<ChatStatus>("ready");
	const [error, setError] = useState<Error | undefined>(undefined);
	const [currentChatId, setCurrentChatId] = useState<string | null>(chatId ?? null);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const chatIdRef = useRef<string | null>(chatId ?? null);

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

	const convexUser = useQuery(
		api.users.getByExternalId,
		user?.id ? { externalId: user.id } : "skip",
	);
	const convexUserId = convexUser?._id;

	const messagesResult = useQuery(
		api.messages.list,
		chatId && convexUserId ? { chatId: chatId as Id<"chats">, userId: convexUserId } : "skip",
	);

	const activeStreamJob = useQuery(
		api.backgroundStream.getActiveStreamJob,
		chatId && convexUserId ? { chatId: chatId as Id<"chats">, userId: convexUserId } : "skip",
	);

	const createChat = useMutation(api.chats.create);
	const sendMessagesMut = useMutation(api.messages.send);
	const editAndRegenerate = useMutation(api.messages.editAndRegenerate);
	const retryMessageMut = useMutation(api.messages.retryMessage);
	const forkChatMut = useMutation(api.chats.fork);
	const startBackgroundStream = useMutation(api.backgroundStream.startStream);
	const cleanupStaleJobs = useMutation(api.backgroundStream.cleanupStaleJobs);

	const isNewChat = !chatId;
	const isUserLoading = !!(user?.id && convexUser === undefined);

	const { streamingRef, stop } = useStreamingLifecycle({
		activeStreamJob,
		messagesResult,
		status,
		setStatus,
		setMessages,
	});

	const { sendMessage, editMessage, retryMessage, forkMessage } = useMessageActions({
		convexUserId,
		isUserLoading,
		userId: user?.id,
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
		isNewChat,
		isLoadingMessages: chatId ? messagesResult === undefined : false,
		isUserLoading,
		chatId: currentChatId,
		isResuming: status === "streaming" && !!activeStreamJob,
		resumedContent: streamingRef.current?.content || "",
	};
}
