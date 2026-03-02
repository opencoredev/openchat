/**
 * Test Setup for Convex Tests
 *
 * This file provides a module loader for convex-test that works with Bun.
 * Since Bun doesn't support import.meta.glob, we need to manually create lazy loaders.
 *
 * NOTE: @convex-dev/rate-limiter/test uses import.meta.glob which doesn't work in Bun,
 * so we provide a compatible implementation here.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const resolvePackageModuleUrl = (
	packageName: string,
	relativeModulePath: string,
) => {
	const packageJsonPath = require.resolve(`${packageName}/package.json`);
	const packageRoot = dirname(packageJsonPath);
	return pathToFileURL(join(packageRoot, relativeModulePath)).href;
};

const { default: betterAuthSchemaDefault } = await import(
	/* @vite-ignore */ resolvePackageModuleUrl(
		"@convex-dev/better-auth",
		"dist/component/schema.js",
	),
);

const loadModule = (modulePath: string): Promise<unknown> => import(modulePath);

// Create modules object that convex-test expects (lazy-loaded functions)
export const modules: Record<string, () => Promise<unknown>> = {
  './auth.config.ts': () => import('./auth.config'),
  './benchmarks.ts': () => import('./benchmarks'),
  './backgroundStream.ts': () => import('./backgroundStream'),
  './streamJobs.ts': () => import('./streamJobs'),
  './streamExecution.ts': () => import('./streamExecution'),
  './chatExport.ts': () => import('./chatExport'),
  './chatFork.ts': () => import('./chatFork'),
  './chatTitle.ts': () => import('./chatTitle'),
  './chats.ts': () => import('./chats'),
  './crons.ts': () => import('./crons'),
  './files.ts': () => import('./files'),
  './http.ts': () => import('./http'),
  './messages.ts': () => import('./messages'),
  './migrations.ts': () => import('./migrations'),
  './previewSeed.ts': () => import('./previewSeed'),
  './promptTemplates.ts': () => import('./promptTemplates'),
  './schema.ts': () => import('./schema'),
  './users.ts': () => import('./users'),
  './userProfile.ts': () => import('./userProfile'),
  './userApiKeys.ts': () => import('./userApiKeys'),
  './userAuth.ts': () => import('./userAuth'),
  './userDelete.ts': () => import('./userDelete'),
  './userDeleteBatch.ts': () => import('./userDeleteBatch'),
  './message_queries.ts': () => import('./message_queries'),
  './message_helpers.ts': () => import('./message_helpers'),
  './lib/batchFileUrls.ts': () => import('./lib/batchFileUrls'),
  './lib/billingUtils.ts': () => import('./lib/billingUtils'),
  './lib/dbStats.ts': () => import('./lib/dbStats'),
  './lib/logger.ts': () => import('./lib/logger'),
  './lib/model_matching.ts': () => import('./lib/model_matching'),
  './lib/rateLimiter.ts': () => import('./lib/rateLimiter'),
  './config/constants.ts': () => import('./config/constants'),
  './_generated/api.ts': () => loadModule('./_generated/api'),
  './_generated/server.ts': () => loadModule('./_generated/server'),
};

// Rate limiter component schema (manually defined since @convex-dev/rate-limiter doesn't export it properly)
const rateLimiterComponentSchema = defineSchema({
    rateLimits: defineTable({
        name: v.string(),
        key: v.optional(v.string()), // undefined is singleton
        shard: v.number(), // 0 is singleton
        value: v.number(), // can go negative if capacity is reserved ahead of time
        ts: v.number(),
    }).index("name", ["name", "key", "shard"]),
});

// Rate limiter component modules (using proper package imports)
// Import directly from the package without hardcoded paths
const rateLimiterComponentModules: Record<string, () => Promise<unknown>> = {
	// Bun respects package "exports" and blocks deep imports.
	// Use relative file imports into node_modules to load component modules.
	'./internal.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/rate-limiter",
				"dist/component/internal.js",
			),
		),
	'./lib.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/rate-limiter",
				"dist/component/lib.js",
			),
		),
	'./schema.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/rate-limiter",
				"dist/component/schema.js",
			),
		),
	'./_generated/api.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/rate-limiter",
				"dist/component/_generated/api.js",
			),
		),
	'./_generated/server.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/rate-limiter",
				"dist/component/_generated/server.js",
			),
		),
};

/**
 * Rate limiter test helper (Bun-compatible version of @convex-dev/rate-limiter/test)
 * This replaces the Vite-specific import.meta.glob with manual imports
 */
export const rateLimiter = {
  schema: rateLimiterComponentSchema,
  modules: rateLimiterComponentModules,
	register: (
		t: any,
		name: string = "rateLimiter",
	) => {
		t.registerComponent(name, rateLimiterComponentSchema, rateLimiterComponentModules);
	},
};

// Also export these for backwards compatibility
export { rateLimiterComponentSchema, rateLimiterComponentModules };

// ---------------------------------------------------------------------------
// betterAuth component setup for tests that call deleteUserRecord / deleteAccount
// ---------------------------------------------------------------------------

// betterAuth component modules (lazy-loaded to avoid import side effects)
const betterAuthComponentModules: Record<string, () => Promise<unknown>> = {
	'./adapter.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/better-auth",
				"dist/component/adapter.js",
			),
		),
	'./schema.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/better-auth",
				"dist/component/schema.js",
			),
		),
	'./_generated/api.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/better-auth",
				"dist/component/_generated/api.js",
			),
		),
	'./_generated/server.ts': () =>
		import(
			/* @vite-ignore */ resolvePackageModuleUrl(
				"@convex-dev/better-auth",
				"dist/component/_generated/server.js",
			),
		),
};

// betterAuth schema imported at top of file (stays synchronous).

/**
 * betterAuth test helper for tests that exercise deleteUserRecord / deleteAccount.
 * Registers the betterAuth component so ctx.runMutation(components.betterAuth.adapter.deleteMany, ...)
 * resolves against the in-memory test database.
 */
export const betterAuth = {
	modules: betterAuthComponentModules,
	register: (t: any, name: string = "betterAuth") => {
		t.registerComponent(name, betterAuthSchemaDefault, betterAuthComponentModules);
	},
};

export { betterAuthComponentModules };
