import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function completeActiveAndPendingStreams(
	ctx: MutationCtx,
	chatId: Id<"chats">,
	now: number,
) {
	const [activeStreams, pendingStreams] = await Promise.all([
		ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", chatId).eq("status", "running"))
			.collect(),
		ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", chatId).eq("status", "pending"))
			.collect(),
	]);

	const streams = [...activeStreams, ...pendingStreams];
	await Promise.all(
		streams.map((stream) =>
			ctx.db.patch(stream._id, {
				status: "completed",
				completedAt: now,
			}),
		),
	);

	return streams.length;
}

export async function softDeleteMessagesAfter(
	ctx: MutationCtx,
	chatId: Id<"chats">,
	cutoffCreatedAt: number,
	now: number,
) {
	const messagesToDelete = await ctx.db
		.query("messages")
		.withIndex("by_chat_not_deleted", (q) =>
			q.eq("chatId", chatId).eq("deletedAt", undefined)
		)
		.order("asc")
		.filter((q) => q.gt(q.field("createdAt"), cutoffCreatedAt))
		.collect();

	await Promise.all(
		messagesToDelete.map((message) =>
			ctx.db.patch(message._id, {
				deletedAt: now,
			}),
		),
	);

	return messagesToDelete.length;
}

export async function softDeleteAllMessagesInChat(
	ctx: MutationCtx,
	chatId: Id<"chats">,
	now: number,
) {
	const messages = await ctx.db
		.query("messages")
		.withIndex("by_chat_not_deleted", (q) =>
			q.eq("chatId", chatId).eq("deletedAt", undefined)
		)
		.collect();

	await Promise.all(
		messages.map((message) =>
			ctx.db.patch(message._id, {
				deletedAt: now,
			}),
		),
	);

	return messages.length;
}
