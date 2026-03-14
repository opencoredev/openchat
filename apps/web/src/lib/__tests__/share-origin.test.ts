import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_SHARE_ORIGIN, getShareOrigin } from "../share-origin";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("getShareOrigin", () => {
	it("prefers VITE_APP_URL when configured", () => {
		vi.stubEnv("VITE_APP_URL", "https://app.example.com");
		expect(getShareOrigin({ windowOrigin: "http://localhost:3000" })).toBe(
			"https://app.example.com",
		);
	});

	it("falls back to Vercel preview origin", () => {
		vi.stubEnv("VITE_APP_URL", "");
		vi.stubEnv("VERCEL_URL", "preview.example.vercel.app");
		expect(getShareOrigin()).toBe("https://preview.example.vercel.app");
	});

	it("uses the current window origin when no env override exists", () => {
		vi.stubEnv("VITE_APP_URL", "");
		vi.stubEnv("VERCEL_URL", "");
		expect(getShareOrigin({ windowOrigin: "http://localhost:3000" })).toBe(
			"http://localhost:3000",
		);
	});

	it("uses the production fallback when no origin is available", () => {
		vi.stubEnv("VITE_APP_URL", "");
		vi.stubEnv("VERCEL_URL", "");
		expect(getShareOrigin()).toBe(FALLBACK_SHARE_ORIGIN);
	});
});
