/**
 * Server-side Convex HTTP Client
 * Use this for API routes, server functions, and SSR contexts
 * where the browser-based ConvexReactClient is not available.
 */

import { ConvexHttpClient } from "convex/browser";

const runtimeEnv = (import.meta as ImportMeta & {
	env?: Record<string, string | undefined>;
}).env;
const runtimeEnvEnabled = process.env.NODE_ENV !== "test";
const CONVEX_URL =
	process.env.VITE_CONVEX_URL ||
	process.env.CONVEX_URL ||
	(runtimeEnvEnabled ? runtimeEnv?.VITE_CONVEX_URL : undefined) ||
	(runtimeEnvEnabled ? runtimeEnv?.CONVEX_URL : undefined);

function createServerClient() {
	if (!CONVEX_URL) {
		console.warn("[Convex Server] No CONVEX_URL configured");
		return null;
	}
	return new ConvexHttpClient(CONVEX_URL);
}

export const convexServerClient = createServerClient();

export function getConvexServerClient() {
	if (!convexServerClient) {
		throw new Error("VITE_CONVEX_URL is not configured");
	}
	return convexServerClient;
}

export function createConvexServerClient(authToken?: string) {
	if (!CONVEX_URL) {
		throw new Error("VITE_CONVEX_URL is not configured");
	}
	const client = new ConvexHttpClient(CONVEX_URL);
	if (authToken) {
		client.setAuth(authToken);
	}
	return client;
}
