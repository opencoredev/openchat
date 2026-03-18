import type { FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;
type ActionAuthUser = { _id: Id<"users"> } | null;

const getByExternalIdRef = "users:getByExternalId" as unknown as FunctionReference<
	"query",
	"public",
	{ externalId: string },
	ActionAuthUser
>;

export async function requireAuthUserId(
	ctx: AuthCtx,
	expectedUserId?: Id<"users">,
): Promise<Id<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized");
	}

	const user = await ctx.db
		.query("users")
		.withIndex("by_external_id", (q) => q.eq("externalId", identity.subject))
		.unique();
	if (!user) {
		throw new Error("User not found");
	}

	if (expectedUserId && user._id !== expectedUserId) {
		throw new Error("Unauthorized");
	}

	return user._id;
}

export async function requireAuthUserIdFromAction(
	ctx: ActionCtx,
	expectedUserId?: Id<"users">,
): Promise<Id<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized");
	}

	const user = await ctx.runQuery(getByExternalIdRef, {
		externalId: identity.subject,
	});
	if (!user) {
		throw new Error("User not found");
	}

	if (expectedUserId && user._id !== expectedUserId) {
		throw new Error("Unauthorized");
	}

	return user._id;
}
