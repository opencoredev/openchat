/**
 * Rate Limiter Configuration
 *
 * Using @convex-dev/rate-limiter for simple, effective rate limiting.
 *
 * Algorithms:
 * - Fixed Window: Simple count per time period
 * - Token Bucket: Allows bursts, refills over time
 */

import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * Global rate limiter instance
 *
 * Comprehensive rate limiting for all app operations:
 *
 * USER OPERATIONS:
 * - User authentication: 100/min (high limit for auth flows)
 * - API key save: 5/min (rarely changed)
 * - API key remove: 5/min (rarely changed)
 *
 * CHAT OPERATIONS:
 * - Chat creation: 20/min with 5 burst
 * - Chat deletion: 15/min with 3 burst
 * - Chat bulk deletion: 50/min with 50 burst (consumes 1 token per chat)
 * - Chat export: 5/min with 2 burst
 *
 * MESSAGE OPERATIONS:
 * - Message send: 30/min with 10 burst
 * - Stream upsert: 200/min with 50 burst (AI streaming needs high throughput)
 *
 * FILE OPERATIONS:
 * - Upload URL generation: 10/min with 3 burst
 * - File metadata save: 10/min with 3 burst
 * - File deletion: 15/min with 5 burst
 *
 * PROMPT TEMPLATE OPERATIONS:
 * - Template creation: 20/min with 5 burst
 * - Template update: 30/min with 10 burst
 * - Template deletion: 15/min with 3 burst
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// User operations
	userEnsure: {
		kind: "token bucket",
		rate: 100,
		period: MINUTE,
		capacity: 20, // Allow burst for auth flows
	},
	userSaveApiKey: {
		kind: "token bucket",
		rate: 5,
		period: MINUTE,
		capacity: 2,
	},
	userRemoveApiKey: {
		kind: "token bucket",
		rate: 5,
		period: MINUTE,
		capacity: 2,
	},

	// Chat operations
	chatCreate: {
		kind: "token bucket",
		rate: 20,
		period: MINUTE,
		capacity: 5,
	},
	chatDelete: {
		kind: "token bucket",
		rate: 15,
		period: MINUTE,
		capacity: 3,
	},
	chatBulkDelete: {
		kind: "token bucket",
		rate: 50,
		period: MINUTE,
		capacity: 50, // Allow up to 50 chats to be deleted in bulk
	},
	chatExport: {
		kind: "token bucket",
		rate: 5,
		period: MINUTE,
		capacity: 2,
	},
	chatTitleGenerate: {
		kind: "token bucket",
		rate: 20,
		period: MINUTE,
		capacity: 5,
	},

	// Message operations
	messageSend: {
		kind: "token bucket",
		rate: 30,
		period: MINUTE,
		capacity: 10,
	},
	messageStreamUpsert: {
		kind: "token bucket",
		rate: 200,
		period: MINUTE,
		capacity: 50, // AI streaming needs many rapid updates
	},

	// File operations
	fileGenerateUploadUrl: {
		kind: "token bucket",
		rate: 10,
		period: MINUTE,
		capacity: 3,
	},
	fileSaveMetadata: {
		kind: "token bucket",
		rate: 10,
		period: MINUTE,
		capacity: 3,
	},
	fileDelete: {
		kind: "token bucket",
		rate: 15,
		period: MINUTE,
		capacity: 5,
	},

	// Prompt template operations
	templateCreate: {
		kind: "token bucket",
		rate: 20,
		period: MINUTE,
		capacity: 5,
	},
	templateUpdate: {
		kind: "token bucket",
		rate: 30,
		period: MINUTE,
		capacity: 10,
	},
	templateDelete: {
		kind: "token bucket",
		rate: 15,
		period: MINUTE,
		capacity: 3,
	},
});
