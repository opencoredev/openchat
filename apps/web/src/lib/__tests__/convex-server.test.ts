import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSetAuth = vi.fn();
const mockConvexHttpClient = vi.fn(function (this: { setAuth: typeof mockSetAuth }) {
	this.setAuth = mockSetAuth;
});

vi.mock("convex/browser", () => ({
	ConvexHttpClient: mockConvexHttpClient,
}));

async function loadModule() {
	vi.resetModules();
	mockConvexHttpClient.mockClear();
	mockSetAuth.mockClear();
	return import("@/lib/convex-server");
}

describe("createConvexServerClient", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("throws when VITE_CONVEX_URL and CONVEX_URL are both unset", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		expect(() => createConvexServerClient()).toThrow("VITE_CONVEX_URL is not configured");
	});

	it("creates a ConvexHttpClient when VITE_CONVEX_URL is set", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		const client = createConvexServerClient();
		expect(mockConvexHttpClient).toHaveBeenCalledWith("https://example.convex.cloud");
		expect(client).toBeDefined();
	});

	it("creates a ConvexHttpClient when CONVEX_URL is set as fallback", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "");
		vi.stubEnv("CONVEX_URL", "https://fallback.convex.cloud");
		const { createConvexServerClient } = await loadModule();
		const client = createConvexServerClient();
		expect(mockConvexHttpClient).toHaveBeenCalledWith("https://fallback.convex.cloud");
		expect(client).toBeDefined();
	});

	it("does not call setAuth when no authToken is provided", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		createConvexServerClient();
		expect(mockSetAuth).not.toHaveBeenCalled();
	});

	it("calls setAuth with the provided authToken", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		createConvexServerClient("my-auth-token");
		expect(mockSetAuth).toHaveBeenCalledOnce();
		expect(mockSetAuth).toHaveBeenCalledWith("my-auth-token");
	});

	it("does not call setAuth when authToken is undefined", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		createConvexServerClient(undefined);
		expect(mockSetAuth).not.toHaveBeenCalled();
	});

	it("prefers VITE_CONVEX_URL over CONVEX_URL", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://vite.convex.cloud");
		vi.stubEnv("CONVEX_URL", "https://fallback.convex.cloud");
		const { createConvexServerClient } = await loadModule();
		createConvexServerClient();
		expect(mockConvexHttpClient).toHaveBeenCalledWith("https://vite.convex.cloud");
	});

	it("returns a client object with setAuth method", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { createConvexServerClient } = await loadModule();
		const client = createConvexServerClient("token");
		expect(client).toHaveProperty("setAuth");
	});
});

describe("getConvexServerClient", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("throws when no CONVEX_URL is configured (module-level client is null)", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "");
		vi.stubEnv("CONVEX_URL", "");
		const { getConvexServerClient } = await loadModule();
		expect(() => getConvexServerClient()).toThrow("VITE_CONVEX_URL is not configured");
	});

	it("returns the module-level client when URL is configured", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "");
		const { getConvexServerClient, convexServerClient } = await loadModule();
		const client = getConvexServerClient();
		expect(client).toBe(convexServerClient);
	});
});
