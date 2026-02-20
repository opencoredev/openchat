import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./lib/auth";

export const getChatExportData = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(
		v.object({
			chat: v.object({
				_id: v.id("chats"),
				title: v.string(),
				createdAt: v.number(),
				updatedAt: v.number(),
			}),
			messages: v.array(
				v.object({
					_id: v.id("messages"),
					role: v.string(),
					content: v.string(),
					createdAt: v.number(),
					modelId: v.optional(v.string()),
					provider: v.optional(v.string()),
					reasoning: v.optional(v.string()),
					attachments: v.optional(
						v.array(
							v.object({
								filename: v.string(),
								contentType: v.string(),
								size: v.number(),
								uploadedAt: v.number(),
								url: v.optional(v.string()),
							}),
						),
					),
				}),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined),
			)
			.order("asc")
			.collect();

		const storageIds = new Set<Id<"_storage">>();
		for (const message of messages) {
			for (const attachment of message.attachments ?? []) {
				storageIds.add(attachment.storageId);
			}
		}

		const urlMap = new Map<Id<"_storage">, string | null>();
		await Promise.all(
			[...storageIds].map(async (storageId) => {
				try {
					const url = await ctx.storage.getUrl(storageId);
					urlMap.set(storageId, url);
				} catch {
					urlMap.set(storageId, null);
				}
			}),
		);

		return {
			chat: {
				_id: chat._id,
				title: chat.title,
				createdAt: chat.createdAt,
				updatedAt: chat.updatedAt,
			},
			messages: messages.map((message) => ({
				_id: message._id,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt,
				modelId: message.modelId,
				provider: message.provider,
				reasoning: message.reasoning,
				attachments: message.attachments?.map((attachment) => ({
					filename: attachment.filename,
					contentType: attachment.contentType,
					size: attachment.size,
					uploadedAt: attachment.uploadedAt,
					url: urlMap.get(attachment.storageId) ?? undefined,
				})),
			})),
		};
	},
});
