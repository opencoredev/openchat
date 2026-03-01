import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import { betterAuth } from "better-auth";
import { oAuthProxy } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";

import { getAllowedOrigins } from "./lib/origins";
import { LOCAL_APP_URL } from "./lib/constants";
import { createLogger } from "./lib/logger";

const logger = createLogger("auth");

/**
 * Production Convex site URL - used for OAuth callbacks.
 * All OAuth flows (including from preview environments) route through production.
 */
const PRODUCTION_CONVEX_SITE_URL = process.env.PRODUCTION_CONVEX_SITE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUTH_EMAIL_FROM = process.env.AUTH_EMAIL_FROM;

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

/**
 * Better Auth component client for Convex integration.
 * Provides adapter for database operations and helper methods.
 */
export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Create Better Auth instance with GitHub OAuth only.
 * This is called for each request to get a fresh auth instance with context.
 * 
 * IMPORTANT: authConfig and the convex plugin must be created inside this function
 * because CONVEX_SITE_URL is not available at module load time in Convex.
 */
export const createAuth = (
	ctx: GenericCtx<DataModel>,
	{ optionsOnly } = { optionsOnly: false }
) => {
	// Get URLs at runtime - CONVEX_SITE_URL is the base for OAuth callbacks
	const convexSiteUrl = process.env.CONVEX_SITE_URL;
	if (!convexSiteUrl) {
		throw new Error("CONVEX_SITE_URL environment variable is not set");
	}
	const siteUrl = process.env.SITE_URL || LOCAL_APP_URL;

	// Detect if this is a preview environment (explicit opt-in only).
	// Preview deployments intentionally support email/password auth only.
	const isPreview = process.env.DEPLOYMENT_TYPE === "preview";

	// Build authConfig at runtime when CONVEX_SITE_URL is available
	const authConfig = {
		providers: [getAuthConfigProvider()],
	};

	// Build plugins array - add oAuthProxy for preview environments
	const plugins = [
		// Required for Convex compatibility - pass authConfig for JWT configuration
		convex({ authConfig }),
		// Enable cross-domain auth for frontend on different domain (localhost:3000 -> convex.site)
		crossDomain({ siteUrl }),
		...(isPreview
			? [
				(() => {
					if (!PRODUCTION_CONVEX_SITE_URL) {
						throw new Error("PRODUCTION_CONVEX_SITE_URL environment variable is not set");
					}
					return oAuthProxy({
						productionURL: PRODUCTION_CONVEX_SITE_URL,
						currentURL: convexSiteUrl,
					});
				})(),
			]
			: []),
	];

	const trustedOrigins = [
		PRODUCTION_CONVEX_SITE_URL,
		convexSiteUrl,
		siteUrl,
		...getAllowedOrigins(),
	].filter((origin): origin is string => Boolean(origin));

	const auth = betterAuth({
		// Disable logging when createAuth is called just to generate options
		logger: {
			disabled: optionsOnly,
		},
		// Use Convex site URL as baseURL so OAuth callbacks work correctly
		baseURL: convexSiteUrl,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			requireEmailVerification: !isPreview,
			sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
				const safeUrl = escapeHtml(url);
				if (!RESEND_API_KEY || !AUTH_EMAIL_FROM) {
					void logger.warn("Password reset email provider is not configured", {
						email: user.email,
						hasResendApiKey: Boolean(RESEND_API_KEY),
						hasAuthEmailFrom: Boolean(AUTH_EMAIL_FROM),
					});
					return;
				}

				const response = await fetch("https://api.resend.com/emails", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${RESEND_API_KEY}`,
					},
					body: JSON.stringify({
						from: AUTH_EMAIL_FROM,
						to: user.email,
						subject: "Reset your osschat password",
						html: `<p>Reset your password by clicking the link below:</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
					}),
				});

				if (!response.ok) {
					const body = await response.text();
					void logger.error("Failed to send password reset email", {
						email: user.email,
						status: response.status,
						body,
					});
					return;
				}

				void logger.info("Password reset email sent", { email: user.email });
			},
		},
		emailVerification: {
			sendOnSignUp: false,
			sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
				void logger.info("Verification email sent", { email: user.email, url });
			},
		},
		socialProviders: isPreview
			? {}
			: {
					// Only include GitHub OAuth if credentials are configured
					// (avoids throwing during Convex module analysis when env vars aren't set yet)
					...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
						? {
								github: {
									clientId: process.env.GITHUB_CLIENT_ID,
									clientSecret: process.env.GITHUB_CLIENT_SECRET,
									// Use current environment's URL for OAuth callbacks
									redirectURI: `${convexSiteUrl}/api/auth/callback/github`,
								},
							}
						: {}),
					// Only include Vercel OAuth if credentials are configured
					...(process.env.VERCEL_CLIENT_ID && process.env.VERCEL_CLIENT_SECRET
						? {
								vercel: {
									clientId: process.env.VERCEL_CLIENT_ID,
									clientSecret: process.env.VERCEL_CLIENT_SECRET,
									// Use current environment's URL for OAuth callbacks
									redirectURI: `${convexSiteUrl}/api/auth/callback/vercel`,
									// Request email and profile scopes
									scope: ["openid", "email", "profile"],
								},
							}
						: {}),
				},
		// Trust explicitly configured origins (no wildcards for security)
		trustedOrigins,
		plugins,
	});

	return auth;
};

/**
 * Get the currently authenticated user from Better Auth.
 * Returns null if not authenticated.
 */
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		return await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) => q.eq("externalId", identity.subject))
			.unique();
	},
});
