import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

const VALID_32_BYTE_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

describe("crypto", () => {
	beforeEach(() => {
		vi.stubEnv("OPENROUTER_ENCRYPTION_KEY", VALID_32_BYTE_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("encryptSecret", () => {
		test("returns a string in iv.tag.encrypted format", async () => {
			const result = await encryptSecret("hello world");
			expect(typeof result).toBe("string");
			const parts = result.split(".");
			expect(parts).toHaveLength(3);
			expect(parts[0]!.length).toBeGreaterThan(0);
			expect(parts[1]!.length).toBeGreaterThan(0);
			expect(parts[2]!.length).toBeGreaterThan(0);
		});

		test("produces different ciphertext each call (random IV)", async () => {
			const a = await encryptSecret("same value");
			const b = await encryptSecret("same value");
			expect(a).not.toBe(b);
		});

		test("encrypts empty string", async () => {
			const result = await encryptSecret("");
			expect(result.split(".")).toHaveLength(3);
		});

		test("encrypts long strings", async () => {
			const long = "a".repeat(10_000);
			const result = await encryptSecret(long);
			expect(result.split(".")).toHaveLength(3);
		});

		test("throws when env var is missing", async () => {
			vi.stubEnv("OPENROUTER_ENCRYPTION_KEY", "");
			await expect(encryptSecret("test")).rejects.toThrow("OPENROUTER_ENCRYPTION_KEY");
		});

		test("throws when key is wrong length", async () => {
			const shortKey = btoa("tooshort");
			vi.stubEnv("OPENROUTER_ENCRYPTION_KEY", shortKey);
			await expect(encryptSecret("test")).rejects.toThrow("32 bytes");
		});

		test("throws when btoa is not available (line 7)", async () => {
			const orig = globalThis.btoa;
			(globalThis as Record<string, unknown>).btoa = undefined;
			try {
				await expect(encryptSecret("test")).rejects.toThrow("Base64 encoding is not available in this runtime");
			} finally {
				globalThis.btoa = orig;
			}
		});
	});

	describe("decryptSecret", () => {
		test("round-trips a simple string", async () => {
			const original = "my secret api key";
			const encrypted = await encryptSecret(original);
			const decrypted = await decryptSecret(encrypted);
			expect(decrypted).toBe(original);
		});

		test("round-trips unicode content", async () => {
			const original = "Hello 世界 🔐 emoji";
			const encrypted = await encryptSecret(original);
			const decrypted = await decryptSecret(encrypted);
			expect(decrypted).toBe(original);
		});

		test("round-trips long string", async () => {
			const original = "x".repeat(5000);
			const encrypted = await encryptSecret(original);
			const decrypted = await decryptSecret(encrypted);
			expect(decrypted).toBe(original);
		});

		test("throws on payload with missing parts", async () => {
			await expect(decryptSecret("onlyonepart")).rejects.toThrow("Invalid encrypted payload");
		});

		test("throws on payload with only two parts", async () => {
			await expect(decryptSecret("part1.part2")).rejects.toThrow("Invalid encrypted payload");
		});

		test("throws on tampered ciphertext", async () => {
			const encrypted = await encryptSecret("original");
			const parts = encrypted.split(".");
			const tampered = `${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
			await expect(decryptSecret(tampered)).rejects.toThrow();
		});

		test("throws on invalid tag length", async () => {
			const encrypted = await encryptSecret("test");
			const parts = encrypted.split(".");
			const shortTag = btoa("short");
			await expect(decryptSecret(`${parts[0]}.${shortTag}.${parts[2]}`)).rejects.toThrow("Invalid encrypted payload");
		});

		test("throws when env var is missing during decrypt", async () => {
			const encrypted = await encryptSecret("test");
			vi.stubEnv("OPENROUTER_ENCRYPTION_KEY", "");
			await expect(decryptSecret(encrypted)).rejects.toThrow("OPENROUTER_ENCRYPTION_KEY");
		});

		test("throws when atob is not available (line 19)", async () => {
			const orig = globalThis.atob;
			(globalThis as Record<string, unknown>).atob = undefined;
			try {
				await expect(decryptSecret("iv.tag.enc")).rejects.toThrow("Base64 decoding is not available in this runtime");
			} finally {
				globalThis.atob = orig;
			}
		});
	});
});
