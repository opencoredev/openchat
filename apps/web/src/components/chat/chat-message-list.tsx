import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConversationScroll, Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageFile, MessageResponse } from "@/components/ai-elements/message";
import { UserMessageActions, AssistantMessageActions } from "@/components/message-actions";
import { StartScreen } from "@/components/start-screen";
import { ProviderLogo } from "@/components/model-selector/provider-logo";
import { getModelById, useModels } from "@/stores/model";
import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { buildChainOfThoughtSteps, ChainOfThought } from "./chat-chain-of-thought";
import { InlineErrorMessage } from "./inline-error-message";

function AutoScroll({ messageCount }: { messageCount: number }) {
	const { scrollToBottom, isAtBottom } = useConversationScroll();
	const prevCountRef = useRef(messageCount);
	const initialScrollDone = useRef(false);

	useEffect(() => {
		if (messageCount > 0 && !initialScrollDone.current) {
			initialScrollDone.current = true;
			requestAnimationFrame(() => {
				scrollToBottom();
				setTimeout(() => {
					scrollToBottom();
				}, 100);
			});
		} else if (messageCount > prevCountRef.current && isAtBottom) {
			requestAnimationFrame(() => {
				scrollToBottom();
			});
		}
		prevCountRef.current = messageCount;
	}, [messageCount, scrollToBottom, isAtBottom]);

	return null;
}

function LoadingIndicator() {
	return (
		<div className="flex items-center gap-1.5 py-2">
			<span className="size-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0ms]" />
			<span className="size-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:150ms]" />
			<span className="size-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:300ms]" />
		</div>
	);
}

export interface ChatMessageListProps {
	chatId: string | null;
	messages: Array<{
		id: string;
		role: string;
		parts?: Array<UIMessagePart<UIDataTypes, UITools>>;
		metadata?: unknown;
	}>;
	isLoading: boolean;
	isNewChat: boolean;
	onPromptSelect: (prompt: string) => void;
	onRetryMessage: (messageId: string, modelId?: string) => Promise<void>;
	onForkMessage: (messageId: string, modelId?: string) => Promise<void>;
	editingMessageId: string | null;
	onStartEdit: (messageId: string, content: string) => void;
}

export const ChatMessageList = memo(function ChatMessageList({
	chatId,
	messages,
	isLoading,
	isNewChat,
	onPromptSelect,
	onRetryMessage,
	onForkMessage,
	editingMessageId,
	onStartEdit,
}: ChatMessageListProps) {
	const [openByMessageId, setOpenByMessageId] = useState<Record<string, boolean>>({});

	const prevChatIdRef = useRef(chatId);
	useEffect(() => {
		if (prevChatIdRef.current !== chatId) {
			setOpenByMessageId({});
			prevChatIdRef.current = chatId;
		}
	}, [chatId]);
	const prevThinkingStreamingByMessageIdRef = useRef<Record<string, boolean>>({});

	const processedMessages = useMemo(() => {
		if (messages.length === 0) return [];

		return messages.map((message) => {
			const msg = message as typeof message & {
				error?: {
					code: string;
					message: string;
					details?: string;
					provider?: string;
					retryable?: boolean;
				};
				messageType?: "text" | "error" | "system";
				modelId?: string;
				tokensPerSecond?: number;
				tokenUsage?: {
					promptTokens: number;
					completionTokens: number;
					totalTokens: number;
				};
				timeToFirstTokenMs?: number;
				totalDurationMs?: number;
			};

			const allParts = message.parts || [];
			const textParts = allParts.filter(
				(p): p is { type: "text"; text: string } => p.type === "text",
			);
			const fileParts = allParts.filter(
				(p): p is Extract<UIMessagePart<UIDataTypes, UITools>, { type: "file" }> =>
					p.type === "file",
			);

			const textContent = textParts.map((p) => p.text).join("").trim();
			const hasReasoning = allParts.some((p) => p.type === "reasoning");
			const hasToolParts = allParts.some(
				(p) => typeof p.type === "string" && p.type.startsWith("tool-"),
			);
			const hasFiles = fileParts.length > 0;
			const isCurrentlyStreaming = allParts.some((part) => {
				if ("state" in part && part.state === "streaming") {
					return true;
				}
				if (typeof part.type === "string" && part.type.startsWith("tool-")) {
					const toolState = (part as { state?: unknown }).state;
					return toolState === "input-streaming";
				}
				return false;
			});
			const metadata = message.metadata as
				| {
						thinkingTimeSec?: unknown;
						reasoningRequested?: unknown;
						reasoningTokenCount?: unknown;
						resumedFromActiveStream?: unknown;
						modelId?: string;
						tokensPerSecond?: number;
						timeToFirstTokenMs?: number;
						totalDurationMs?: number;
						tokenUsage?: {
							promptTokens: number;
							completionTokens: number;
							totalTokens: number;
						};
				  }
				| undefined;
			const thinkingTimeSec =
				typeof metadata?.thinkingTimeSec === "number" ? metadata.thinkingTimeSec : undefined;
			const reasoningRequested = metadata?.reasoningRequested === true;
			const reasoningTokenCount =
				typeof metadata?.reasoningTokenCount === "number"
					? metadata.reasoningTokenCount
					: undefined;
			const resumedFromActiveStream = metadata?.resumedFromActiveStream === true;

			const {
				steps: thinkingSteps,
				isAnyStreaming: isAnyStepStreaming,
				hasTextContent,
			} = buildChainOfThoughtSteps(allParts, reasoningRequested);

			const shouldSkip =
				msg.messageType !== "error" &&
				message.role === "assistant" &&
				!textContent &&
				!hasReasoning &&
				!reasoningRequested &&
				!hasToolParts &&
				!hasFiles &&
				!isCurrentlyStreaming;

			return {
				message,
				msg,
				textParts,
				fileParts,
				thinkingSteps,
				isAnyStepStreaming,
				hasTextContent,
				thinkingTimeSec,
				reasoningRequested,
				reasoningTokenCount,
				resumedFromActiveStream,
				isCurrentlyStreaming,
				shouldSkip,
			};
		});
	}, [messages]);

	useEffect(() => {
		const prevThinkingStreamingByMessageId = prevThinkingStreamingByMessageIdRef.current;
		setOpenByMessageId((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const item of processedMessages) {
				const hasStartedAnswerText = item.textParts.some((part) => part.text.trim().length > 0);

				if (
					item.isAnyStepStreaming &&
					!hasStartedAnswerText &&
					next[item.message.id] !== true
				) {
					next[item.message.id] = true;
					changed = true;
				}

				const wasThinkingStreaming =
					prevThinkingStreamingByMessageId[item.message.id] === true;
				if (
					wasThinkingStreaming &&
					hasStartedAnswerText &&
					next[item.message.id] !== false
				) {
					next[item.message.id] = false;
					changed = true;
				}
			}
			return changed ? next : prev;
		});

		const nextThinkingStreamingByMessageId: Record<string, boolean> = {};
		for (const item of processedMessages) {
			nextThinkingStreamingByMessageId[item.message.id] = item.isAnyStepStreaming;
		}
		prevThinkingStreamingByMessageIdRef.current = nextThinkingStreamingByMessageId;
	}, [processedMessages]);

	const setPanelOpen = useCallback((messageId: string, open: boolean) => {
		setOpenByMessageId((prev) => {
			if (prev[messageId] === open) return prev;
			return { ...prev, [messageId]: open };
		});
	}, []);

	// Group consecutive assistant messages with the same compareGroup for side-by-side display
	const renderedItems = useMemo(() => {
		const items: Array<
			| { type: "single"; item: (typeof processedMessages)[number]; itemIndex: number }
			| { type: "compare"; items: Array<{ item: (typeof processedMessages)[number]; itemIndex: number }>; compareGroup: string }
		> = [];

		const visited = new Set<number>();

		for (let i = 0; i < processedMessages.length; i++) {
			if (visited.has(i)) continue;
			const item = processedMessages[i];
			const metadata = item.message.metadata as Record<string, unknown> | undefined;
			const compareGroup = metadata?.compareGroup as string | undefined;

			if (compareGroup && item.message.role === "assistant") {
				// Collect all messages in this compare group
				const group: Array<{ item: (typeof processedMessages)[number]; itemIndex: number }> = [];
				for (let j = i; j < processedMessages.length; j++) {
					const candidate = processedMessages[j];
					const candMeta = candidate.message.metadata as Record<string, unknown> | undefined;
					if (candMeta?.compareGroup === compareGroup && candidate.message.role === "assistant") {
						group.push({ item: candidate, itemIndex: j });
						visited.add(j);
					}
				}
				if (group.length > 1) {
					items.push({ type: "compare", items: group, compareGroup });
				} else {
					// Only one message in group, render normally
					items.push({ type: "single", item, itemIndex: i });
				}
			} else {
				items.push({ type: "single", item, itemIndex: i });
			}
		}

		return items;
	}, [processedMessages]);

	const { models } = useModels();

	/** Render a single message (shared by both standard and compare layouts) */
	const renderSingleMessage = useCallback(
		(
			item: (typeof processedMessages)[number],
			itemIndex: number,
			options?: { compact?: boolean },
		) => {
			if (item.shouldSkip) return null;

			if (item.msg.messageType === "error" && item.msg.error) {
				return (
					<div key={item.message.id} className="group">
						<Message from={item.message.role as "user" | "assistant"}>
							<MessageContent>
								<InlineErrorMessage error={item.msg.error} />
							</MessageContent>
						</Message>
					</div>
				);
			}

			return (
				<div
					key={item.message.id}
					className={cn(
						"group",
						editingMessageId === item.message.id &&
							"ring-2 ring-primary/30 rounded-2xl",
					)}
				>
					<Message from={item.message.role as "user" | "assistant"}>
						<MessageContent>
							{item.thinkingSteps.length > 0 && (
								<ChainOfThought
									steps={item.thinkingSteps}
									isStreaming={item.isAnyStepStreaming}
									hasTextContent={
										item.hasTextContent || item.textParts.length > 0
									}
									thinkingTimeSec={item.thinkingTimeSec}
									reasoningRequested={item.reasoningRequested}
									reasoningTokenCount={item.reasoningTokenCount}
									open={
										openByMessageId[item.message.id] ??
										item.isAnyStepStreaming
									}
									onOpenChange={(open) =>
										setPanelOpen(item.message.id, open)
									}
								/>
							)}

							{item.textParts.map((part, partIndex) => (
								<MessageResponse
									key={`text-${partIndex}`}
									isStreaming={
										item.isCurrentlyStreaming &&
										partIndex === item.textParts.length - 1
									}
									skipInitialAnimation={item.resumedFromActiveStream}
								>
									{part.text || ""}
								</MessageResponse>
							))}

							{item.fileParts.map((part, partIndex) => (
								<MessageFile
									key={`file-${partIndex}`}
									filename={part.filename}
									url={part.url}
									mediaType={part.mediaType}
								/>
							))}
						</MessageContent>
						{item.message.role === "user" ? (
							<UserMessageActions
								messageId={item.message.id}
								content={item.textParts.map((p) => p.text).join("")}
								isStreaming={
									item.isCurrentlyStreaming ||
									editingMessageId === item.message.id
								}
								onEdit={() =>
									onStartEdit(
										item.message.id,
										item.textParts.map((p) => p.text).join(""),
									)
								}
								onRetry={(modelId) => {
									void onRetryMessage(item.message.id, modelId);
								}}
								onFork={(modelId) => {
									void onForkMessage(item.message.id, modelId);
								}}
							/>
						) : !options?.compact ? (
							<AssistantMessageActions
								messageId={item.message.id}
								content={item.textParts.map((p) => p.text).join("")}
								isStreaming={item.isCurrentlyStreaming}
								analytics={{
									modelId: (
										item.message.metadata as
											| Record<string, unknown>
											| undefined
									)?.modelId as string | undefined,
									tokensPerSecond: (
										item.message.metadata as
											| Record<string, unknown>
											| undefined
									)?.tokensPerSecond as number | undefined,
									tokenUsage: (
										item.message.metadata as
											| Record<string, unknown>
											| undefined
									)?.tokenUsage as
										| {
												promptTokens: number;
												completionTokens: number;
												totalTokens: number;
										  }
										| undefined,
									timeToFirstTokenMs: (
										item.message.metadata as
											| Record<string, unknown>
											| undefined
									)?.timeToFirstTokenMs as number | undefined,
								}}
								onRetry={(modelId) => {
									const precedingUser = processedMessages
										.slice(0, itemIndex)
										.reverse()
										.find(
											(candidate) =>
												candidate.message.role === "user",
										);

									if (!precedingUser) {
										toast.error("Could not retry response", {
											description:
												"No preceding user message found for this assistant response.",
										});
										return;
									}

									void onRetryMessage(
										precedingUser.message.id,
										modelId,
									);
								}}
								onFork={(modelId) => {
									const precedingUser = processedMessages
										.slice(0, itemIndex)
										.reverse()
										.find(
											(candidate) =>
												candidate.message.role === "user",
										);

									if (!precedingUser) {
										toast.error("Could not branch off", {
											description:
												"No preceding user message found for this assistant response.",
										});
										return;
									}

									void onForkMessage(
										precedingUser.message.id,
										modelId,
									);
								}}
							/>
						) : null}
					</Message>
				</div>
			);
		},
		[editingMessageId, onStartEdit, onRetryMessage, onForkMessage, openByMessageId, setPanelOpen, processedMessages],
	);

	return (
		<Conversation className="flex-1 px-2 md:px-4" showScrollButton>
			<AutoScroll messageCount={messages.length} />
			<ConversationContent className="mx-auto max-w-5xl pt-16 md:pt-6 pb-16 px-2 md:px-4">
				{messages.length === 0 && isNewChat ? (
					<StartScreen onPromptSelect={onPromptSelect} />
				) : messages.length === 0 ? null : (
					<>
						{renderedItems.map((entry) => {
							if (entry.type === "single") {
								return renderSingleMessage(entry.item, entry.itemIndex);
							}

							// Compare group: render side-by-side
							return (
								<div
									key={`compare-${entry.compareGroup}`}
									className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4"
								>
									{entry.items.map(({ item, itemIndex }) => {
										const meta = item.message.metadata as Record<string, unknown> | undefined;
										const modelId = meta?.modelId as string | undefined;
										const model = modelId ? getModelById(models, modelId) : undefined;
										const modelName = model?.name || modelId?.split("/").pop() || "Unknown";
										const providerId = model?.logoId || modelId?.split("/")[0] || "";

										return (
											<div
												key={item.message.id}
												className={cn(
													"rounded-xl border border-border/50 bg-muted/20 p-3 md:p-4",
													"flex flex-col min-w-0",
												)}
											>
												{/* Model badge header */}
												<div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
													<ProviderLogo providerId={providerId} className="size-4" />
													<span className="text-xs font-medium text-muted-foreground truncate">
														{modelName}
													</span>
													{item.isCurrentlyStreaming && (
														<span className="ml-auto flex items-center gap-1">
															<span className="size-1.5 animate-pulse rounded-full bg-primary" />
															<span className="text-[10px] text-muted-foreground">Streaming</span>
														</span>
													)}
												</div>

												{/* Message content */}
												<div className="flex-1 min-w-0 overflow-hidden">
													{renderSingleMessage(item, itemIndex, { compact: true })}
												</div>
											</div>
										);
									})}
								</div>
							);
						})}
						{isLoading && messages[messages.length - 1]?.role === "user" && (
							<LoadingIndicator />
						)}
					</>
				)}
			</ConversationContent>
		</Conversation>
	);
});
