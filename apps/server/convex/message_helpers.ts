import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { incrementStat, STAT_KEYS } from "./lib/dbStats";
import type { ToolInvocationData, ChainOfThoughtPartData, ErrorData, MessageType } from "./message_validators";

const MAX_MESSAGE_CONTENT_LENGTH = 100 * 1024; // 100KB

const MAX_MESSAGES_PER_CHAT = 10_000;

const ALLOWED_ROLES = ["user", "assistant"] as const;
type MessageRole = typeof ALLOWED_ROLES[number];

const MAX_ATTACHMENTS_PER_MESSAGE = 20;

function validateRole(role: string): MessageRole {
	if (!ALLOWED_ROLES.includes(role as MessageRole)) {
		throw new Error(
			`Invalid message role: "${role}". Only "user" and "assistant" are allowed.`,
		);
	}
	return role as MessageRole;
}

async function validateAttachmentOwnership(
	ctx: MutationCtx | QueryCtx,
	attachments: Array<{ storageId: Id<"_storage"> }>,
	userId: Id<"users">,
): Promise<void> {
	if (attachments.length === 0) return;

	if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
		throw new Error(
			`Too many attachments: ${attachments.length}. Maximum is ${MAX_ATTACHMENTS_PER_MESSAGE}.`,
		);
	}

	for (const attachment of attachments) {
		const fileUpload = await ctx.db
			.query("fileUploads")
			.withIndex("by_storage", (q) => q.eq("storageId", attachment.storageId))
			.unique();

		if (!fileUpload) {
			throw new Error(
				"Unauthorized: attachment references a file that does not exist in your uploads.",
			);
		}

		if (fileUpload.userId !== userId) {
			throw new Error(
				"Unauthorized: you do not own the referenced attachment file.",
			);
		}

		if (fileUpload.deletedAt) {
			throw new Error(
				"Attachment references a file that has been deleted.",
			);
		}
	}
}

export async function getVerifiedStorageIds(
	ctx: QueryCtx,
	storageIds: Id<"_storage">[],
	userId: Id<"users">,
): Promise<Set<string>> {
	const verified = new Set<string>();

	const checks = storageIds.map(async (storageId) => {
		const fileUpload = await ctx.db
			.query("fileUploads")
			.withIndex("by_storage", (q) => q.eq("storageId", storageId))
			.unique();

		if (fileUpload && fileUpload.userId === userId && !fileUpload.deletedAt) {
			verified.add(storageId);
		}
	});

	await Promise.all(checks);
	return verified;
}

export async function insertOrUpdateMessage(
	ctx: MutationCtx,
	args: {
		chatId: Id<"chats">;
		role: string;
		content: string;
		modelId?: string | null;
		provider?: string | null;
		reasoningEffort?: string | null;
		webSearchEnabled?: boolean | null;
		webSearchUsed?: boolean | null;
		webSearchCallCount?: number | null;
		toolCallCount?: number | null;
		maxSteps?: number | null;
		reasoning?: string | null;
		thinkingTimeMs?: number | null;
		thinkingTimeSec?: number | null;
		reasoningCharCount?: number | null;
		reasoningChunkCount?: number | null;
		reasoningTokenCount?: number | null;
		reasoningRequested?: boolean | null;
		toolInvocations?: ToolInvocationData[] | null;
		chainOfThoughtParts?: ChainOfThoughtPartData[] | null;
		createdAt: number;
		status: string;
		clientMessageId?: string | null;
		overrideId?: Id<"messages">;
		userId?: Id<"users">;
		attachments?: Array<{
			storageId: Id<"_storage">;
			filename: string;
			contentType: string;
			size: number;
			uploadedAt: number;
		}>;
		error?: ErrorData | null;
		messageType?: MessageType | null;
	},
) {
	const validatedRole = validateRole(args.role);

	const contentBytes = new TextEncoder().encode(args.content).length;
	if (contentBytes > MAX_MESSAGE_CONTENT_LENGTH) {
		throw new Error(
			`Message content exceeds maximum length of ${MAX_MESSAGE_CONTENT_LENGTH} bytes`,
		);
	}

	if (args.attachments && args.attachments.length > 0 && args.userId) {
		await validateAttachmentOwnership(ctx, args.attachments, args.userId);
	}

	let targetId = args.overrideId;
	if (!targetId && args.clientMessageId) {
		const existing = await ctx.db
			.query("messages")
			.withIndex("by_client_id", (q) =>
				q.eq("chatId", args.chatId).eq("clientMessageId", args.clientMessageId!),
			)
			.unique();
		if (existing && !existing.deletedAt) {
			targetId = existing._id;
		}
	}

	if (!targetId) {
		const chat = await ctx.db.get(args.chatId);
		const messageCount = chat?.messageCount ?? 0;

		if (messageCount >= MAX_MESSAGES_PER_CHAT) {
			throw new Error(
				`Chat has reached maximum message limit of ${MAX_MESSAGES_PER_CHAT}. Please create a new chat.`,
			);
		}

		targetId = await ctx.db.insert("messages", {
			chatId: args.chatId,
			clientMessageId: args.clientMessageId ?? undefined,
			role: validatedRole,
			content: args.content,
			modelId: args.modelId ?? undefined,
			provider: args.provider ?? undefined,
			reasoningEffort: args.reasoningEffort ?? undefined,
			webSearchEnabled: args.webSearchEnabled ?? undefined,
			webSearchUsed: args.webSearchUsed ?? undefined,
			webSearchCallCount: args.webSearchCallCount ?? undefined,
			toolCallCount: args.toolCallCount ?? undefined,
			maxSteps: args.maxSteps ?? undefined,
			reasoning: args.reasoning ?? undefined,
			thinkingTimeMs: args.thinkingTimeMs ?? undefined,
			thinkingTimeSec: args.thinkingTimeSec ?? undefined,
			reasoningCharCount: args.reasoningCharCount ?? undefined,
			reasoningChunkCount: args.reasoningChunkCount ?? undefined,
			reasoningTokenCount: args.reasoningTokenCount ?? undefined,
			reasoningRequested: args.reasoningRequested ?? undefined,
			toolInvocations: args.toolInvocations ?? undefined,
			chainOfThoughtParts: args.chainOfThoughtParts ?? undefined,
			createdAt: args.createdAt,
			status: args.status,
			userId: args.userId ?? undefined,
			attachments: args.attachments ?? undefined,
			error: args.error ?? undefined,
			messageType: args.messageType ?? undefined,
		});

		if (chat) {
			await ctx.db.patch(args.chatId, {
				messageCount: messageCount + 1,
			});
		}

		await incrementStat(ctx, STAT_KEYS.MESSAGES_TOTAL);
	} else {
		await ctx.db.patch(targetId, {
			clientMessageId: args.clientMessageId ?? undefined,
			role: validatedRole,
			content: args.content,
			modelId: args.modelId ?? undefined,
			provider: args.provider ?? undefined,
			reasoningEffort: args.reasoningEffort ?? undefined,
			webSearchEnabled: args.webSearchEnabled ?? undefined,
			webSearchUsed: args.webSearchUsed ?? undefined,
			webSearchCallCount: args.webSearchCallCount ?? undefined,
			toolCallCount: args.toolCallCount ?? undefined,
			maxSteps: args.maxSteps ?? undefined,
			reasoning: args.reasoning ?? undefined,
			thinkingTimeMs: args.thinkingTimeMs ?? undefined,
			thinkingTimeSec: args.thinkingTimeSec ?? undefined,
			reasoningCharCount: args.reasoningCharCount ?? undefined,
			reasoningChunkCount: args.reasoningChunkCount ?? undefined,
			reasoningTokenCount: args.reasoningTokenCount ?? undefined,
			reasoningRequested: args.reasoningRequested ?? undefined,
			toolInvocations: args.toolInvocations ?? undefined,
			chainOfThoughtParts: args.chainOfThoughtParts ?? undefined,
			createdAt: args.createdAt,
			status: args.status,
			userId: args.userId ?? undefined,
			attachments: args.attachments ?? undefined,
			error: args.error ?? undefined,
			messageType: args.messageType ?? undefined,
		});
	}
	return targetId;
}
