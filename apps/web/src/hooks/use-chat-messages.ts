import { useEffectOnDeps } from "@/hooks/use-mount-effect";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import type { UIMessage } from "ai";
import type { Dispatch, SetStateAction } from "react";
import {
	convexMessageToUIMessage,
	messageFingerprint,
	type ChatStatus,
} from "./chat-utils";

interface UseChatMessagesParams {
	chatId: string | undefined;
	convexUserId: Id<"users"> | undefined;
	status: ChatStatus;
	setMessages: Dispatch<SetStateAction<Array<UIMessage>>>;
}

export function useChatMessages({
	chatId,
	convexUserId,
	status,
	setMessages,
}: UseChatMessagesParams) {
	const messagesResult = useQuery(
		api.messages.list,
		chatId && convexUserId ? { chatId: chatId as Id<"chats">, userId: convexUserId } : "skip",
	);

	useEffectOnDeps(() => {
		if (!messagesResult || status === "streaming" || status === "submitted") return;

		setMessages((prevMessages) => {
			const convexMessages = messagesResult.map(convexMessageToUIMessage);
			let nextMessages = convexMessages;

			if (prevMessages.length === 0) {
				nextMessages = convexMessages;
			} else {
				const lastPrev = prevMessages[prevMessages.length - 1];
				const isLastPrevStreaming =
					lastPrev.id.startsWith("resume-") ||
					(lastPrev.role === "assistant" &&
						!messagesResult.find((m) => m._id === lastPrev.id));

				if (isLastPrevStreaming && convexMessages.length > 0) {
					const lastConvex = convexMessages[convexMessages.length - 1];
					if (lastConvex.role === "assistant") {
						nextMessages = [
							...convexMessages.slice(0, -1),
							{ ...lastConvex, id: lastPrev.id },
						];
					}
				}
			}

			if (prevMessages.length === nextMessages.length) {
				let changed = false;
				for (let i = 0; i < prevMessages.length; i++) {
					if (messageFingerprint(prevMessages[i]) !== messageFingerprint(nextMessages[i])) {
						changed = true;
						break;
					}
				}
				if (!changed) return prevMessages;
			}

			return nextMessages;
		});
	}, [messagesResult, status, setMessages]);

	return {
		messagesResult,
		isLoadingMessages: chatId ? messagesResult === undefined : false,
	};
}
