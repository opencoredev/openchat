import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
	logDebug,
	logInfo,
	logWarn,
	logError,
	createLogger,
	logger,
} from "./logger";

describe("logger", () => {
	let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("logDebug", () => {
		test("logs message without context", async () => {
			await logDebug("debug message");
			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			const call = consoleDebugSpy.mock.calls[0];
			expect(call[0]).toContain("DEBUG");
			expect(call[0]).toContain("debug message");
		});

		test("logs message with context", async () => {
			await logDebug("debug with context", { key: "value", count: 42 });
			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			const [msg, ctx] = consoleDebugSpy.mock.calls[0];
			expect(msg).toContain("DEBUG");
			expect(ctx).toContain("value");
		});

		test("hashes PII fields in context", async () => {
			await logDebug("pii test", { userId: "user_123", email: "test@example.com" });
			const ctx = consoleDebugSpy.mock.calls[0][1];
			expect(ctx).not.toContain("user_123");
			expect(ctx).not.toContain("test@example.com");
			expect(ctx).toContain("userIdHash");
			expect(ctx).toContain("emailHash");
		});

		test("handles nested objects in context", async () => {
			await logDebug("nested", { meta: { version: "1.0", info: "data" } });
			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			const ctx = consoleDebugSpy.mock.calls[0][1];
			expect(ctx).toContain("version");
		});

		test("passes non-PII fields through unchanged", async () => {
			await logDebug("non-pii", { status: "active", count: 5 });
			const ctx = consoleDebugSpy.mock.calls[0][1];
			expect(ctx).toContain("active");
			expect(ctx).toContain("5");
		});
	});

	describe("logInfo", () => {
		test("logs message without context", async () => {
			await logInfo("info message");
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const call = consoleLogSpy.mock.calls[0];
			expect(call[0]).toContain("INFO");
			expect(call[0]).toContain("info message");
		});

		test("logs message with context", async () => {
			await logInfo("info with context", { action: "create", resource: "chat" });
			const [msg, ctx] = consoleLogSpy.mock.calls[0];
			expect(msg).toContain("INFO");
			expect(ctx).toContain("create");
			expect(ctx).toContain("chat");
		});

		test("hashes PII fields", async () => {
			await logInfo("user action", { userId: "user_abc", sessionId: "sess_xyz" });
			const ctx = consoleLogSpy.mock.calls[0][1];
			expect(ctx).toContain("userIdHash");
			expect(ctx).toContain("sessionIdHash");
			expect(ctx).not.toContain("user_abc");
			expect(ctx).not.toContain("sess_xyz");
		});

		test("handles arrays in context without modification", async () => {
			await logInfo("with array", { items: ["a", "b", "c"] });
			const ctx = consoleLogSpy.mock.calls[0][1];
			expect(ctx).toContain("a");
		});
	});

	describe("logWarn", () => {
		test("logs message without context", async () => {
			await logWarn("warning message");
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			const call = consoleWarnSpy.mock.calls[0];
			expect(call[0]).toContain("WARN");
			expect(call[0]).toContain("warning message");
		});

		test("logs message with context", async () => {
			await logWarn("rate limited", { remaining: 0, retryAfter: 60 });
			const [msg, ctx] = consoleWarnSpy.mock.calls[0];
			expect(msg).toContain("WARN");
			expect(ctx).toContain("retryAfter");
		});

		test("hashes PII in context", async () => {
			await logWarn("blocked email", { email: "bad@example.com" });
			const ctx = consoleWarnSpy.mock.calls[0][1];
			expect(ctx).toContain("emailHash");
			expect(ctx).not.toContain("bad@example.com");
		});
	});

	describe("logError", () => {
		test("logs Error object", async () => {
			const err = new Error("something went wrong");
			await logError("operation failed", err);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			const [msg, ctx] = consoleErrorSpy.mock.calls[0];
			expect(msg).toContain("ERROR");
			expect(ctx).toContain("something went wrong");
			expect(ctx).toContain("Error");
		});

		test("logs error with stack trace", async () => {
			const err = new Error("with stack");
			await logError("has stack", err);
			const ctx = consoleErrorSpy.mock.calls[0][1];
			expect(ctx).toContain("stack");
		});

		test("logs non-Error objects", async () => {
			await logError("string error", "a plain string error");
			const ctx = consoleErrorSpy.mock.calls[0][1];
			expect(ctx).toContain("a plain string error");
			expect(ctx).toContain("UnknownError");
		});

		test("logs with additional context", async () => {
			const err = new Error("db error");
			await logError("db failed", err, { chatId: "chat_123", userId: "user_abc" });
			const ctx = consoleErrorSpy.mock.calls[0][1];
			expect(ctx).toContain("userIdHash");
			expect(ctx).toContain("chatId");
		});

		test("handles undefined error", async () => {
			await logError("unknown failure", undefined);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		test("handles null error", async () => {
			await logError("null error", null);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		test("includes timestamp in message", async () => {
			await logError("timestamped", new Error("test"));
			const msg = consoleErrorSpy.mock.calls[0][0];
			expect(msg).toMatch(/\d{4}-\d{2}-\d{2}T/);
		});
	});

	describe("createLogger", () => {
		test("prefixes messages with context", async () => {
			const log = createLogger("myModule");
			await log.info("test message");
			const call = consoleLogSpy.mock.calls[0];
			expect(call[0]).toContain("[myModule]");
			expect(call[0]).toContain("test message");
		});

		test("debug prefixes with context", async () => {
			const log = createLogger("debugCtx");
			await log.debug("debug msg");
			expect(consoleDebugSpy.mock.calls[0][0]).toContain("[debugCtx]");
		});

		test("warn prefixes with context", async () => {
			const log = createLogger("warnCtx");
			await log.warn("warn msg");
			expect(consoleWarnSpy.mock.calls[0][0]).toContain("[warnCtx]");
		});

		test("error prefixes with context", async () => {
			const log = createLogger("errCtx");
			await log.error("error msg", new Error("boom"));
			expect(consoleErrorSpy.mock.calls[0][0]).toContain("[errCtx]");
		});

		test("passes context to underlying log functions", async () => {
			const log = createLogger("ctxTest");
			await log.info("with data", { key: "value" });
			const ctx = consoleLogSpy.mock.calls[0][1];
			expect(ctx).toContain("value");
		});
	});

	describe("default logger", () => {
		test("exports a working logger instance", async () => {
			await logger.info("default logger test");
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
		});

		test("default logger debug works", async () => {
			await logger.debug("debug via default");
			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
		});

		test("default logger warn works", async () => {
			await logger.warn("warn via default");
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
		});

		test("default logger error works", async () => {
			await logger.error("error via default", new Error("e"));
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("PII field hashing", () => {
		test("hashes all known PII fields", async () => {
			const piiFields = {
				userId: "user1",
				user_id: "user2",
				email: "e@x.com",
				emailAddress: "ea@x.com",
				email_address: "eaddr@x.com",
				phoneNumber: "555-1234",
				phone_number: "555-5678",
				ipAddress: "1.2.3.4",
				ip_address: "5.6.7.8",
				sessionId: "sess1",
				session_id: "sess2",
			};
			await logInfo("pii test", piiFields);
			const ctx = consoleLogSpy.mock.calls[0][1];
			for (const key of Object.keys(piiFields)) {
				expect(ctx).not.toContain(`"${key}"`);
				expect(ctx).toContain(`${key}Hash`);
			}
		});

		test("non-PII string fields pass through", async () => {
			await logInfo("non-pii", { status: "active", category: "premium" });
			const ctx = consoleLogSpy.mock.calls[0][1];
			expect(ctx).toContain("active");
			expect(ctx).toContain("premium");
		});

		test("returns hash_error when crypto.subtle.digest fails (line 109)", async () => {
			const cryptoSpy = vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(new Error("crypto unavailable"));
			await logInfo("crypto fail", { email: "test@example.com" });
			const ctx = consoleLogSpy.mock.calls[0][1];
			expect(ctx).toContain("hash_error");
			cryptoSpy.mockRestore();
		});
	});
});
