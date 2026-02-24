import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
	vi.resetModules();
	return import("@/lib/server-auth");
}

function requestWithCookie(cookie: string): Request {
	return {
		headers: {
			get: (name: string) => (name.toLowerCase() === "cookie" ? cookie : null),
		},
	} as unknown as Request;
}

function createJwt(expSecondsFromNow = 3600): string {
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
	).toString("base64url");
	return `${header}.${payload}.signature`;
}

describe("server-auth.getConvexAuthToken", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
		vi.stubEnv("VERCEL", "");
		vi.stubEnv("CONVEX_CLOUD_URL", "");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("uses better-auth.convex_jwt cookie fallback when Convex token endpoint is unavailable", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");

		const { getConvexAuthToken } = await loadModule();
		const fallbackJwt = createJwt();
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}; other=value`);

		await expect(getConvexAuthToken(request)).resolves.toBe(fallbackJwt);
	});

	it("prefers token endpoint when it returns a valid token", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ token: "endpoint-token" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("better-auth.convex_jwt=fallback-token");

		await expect(getConvexAuthToken(request)).resolves.toBe("endpoint-token");
	});

	it("falls back to cookie token when endpoint request throws", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

		const { getConvexAuthToken } = await loadModule();
		const fallbackJwt = createJwt();
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);

		await expect(getConvexAuthToken(request)).resolves.toBe(fallbackJwt);
	});

	it("returns null when token endpoint explicitly rejects the request", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("better-auth.convex_jwt=fallback-token");

		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("falls back to cookie token when token endpoint has a server error", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "server-error" }), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { getConvexAuthToken } = await loadModule();
		const fallbackJwt = createJwt();
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);

		await expect(getConvexAuthToken(request)).resolves.toBe(fallbackJwt);
	});

	it("returns null when no cookie header", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const request = { headers: { get: () => null } } as unknown as Request;
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when fallback JWT is expired", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const expiredJwt = createJwt(-3600);
		const request = requestWithCookie(`better-auth.convex_jwt=${expiredJwt}`);
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when endpoint response has no token field", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("some=cookie");
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when endpoint response JSON is not parseable", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("not-json", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			}),
		);
		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("some=cookie");
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null for a cookie with empty value (name=)", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("better-auth.convex_jwt=");
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when JWT payload base64 is not valid JSON", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
		const badPayload = "not-valid-base64-json!!@@$$";
		const malformedJwt = `${header}.${badPayload}.signature`;
		const request = requestWithCookie(`better-auth.convex_jwt=${malformedJwt}`);
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when JWT has fewer than 3 segments (line 45 branch)", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const notAJwt = "onlyone";
		const request = requestWithCookie(`better-auth.convex_jwt=${notAJwt}`);
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when JWT middle segment is empty string (line 47 branch)", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const emptyPayloadJwt = "header..signature";
		const request = requestWithCookie(`better-auth.convex_jwt=${emptyPayloadJwt}`);
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});

	it("returns null when JWT payload has exp that is not a number (line 53 branch)", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getConvexAuthToken } = await loadModule();
		const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
		const payload = Buffer.from(JSON.stringify({ exp: "not-a-number" })).toString("base64url");
		const jwtWithStringExp = `${header}.${payload}.signature`;
		const request = requestWithCookie(`better-auth.convex_jwt=${jwtWithStringExp}`);
		await expect(getConvexAuthToken(request)).resolves.toBeNull();
	});
});

function mockRequest(url: string, method: string, origin: string | null): Request {
	return {
		url,
		method,
		headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
	} as unknown as Request;
}

describe("server-auth module-level guard (line 24)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("throws at module load time when ALLOW_AUTH_COOKIE_FALLBACK is true in production", async () => {
		vi.resetModules();
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
		await expect(import("@/lib/server-auth")).rejects.toThrow(
			"ALLOW_AUTH_COOKIE_FALLBACK must not be enabled in production"
		);
	});
});

describe("server-auth getCookieValue decodeURIComponent failure (lines 37-40)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("returns null when decodeURIComponent throws and raw value is not a valid JWT", async () => {
		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("better-auth.convex_jwt=%ZZnotajwt");
		const result = await getConvexAuthToken(request);
		expect(result).toBeNull();
	});

	it("returns null when cookie header has other cookies but not better-auth.convex_jwt (line 40)", async () => {
		const { getConvexAuthToken } = await loadModule();
		const request = requestWithCookie("session=abc123; theme=dark; lang=en");
		const result = await getConvexAuthToken(request);
		expect(result).toBeNull();
	});
});

describe("server-auth.isSameOrigin", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("returns false for null origin", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "POST", "null"))).toBe(false);
	});

	it("returns false for POST request with no origin header", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "POST", null))).toBe(false);
	});

	it("returns true for POST request with matching origin", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "POST", "https://example.com"))).toBe(true);
	});

	it("returns false for POST request with different origin", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "POST", "https://evil.com"))).toBe(false);
	});

	it("returns true for GET request with no origin header", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "GET", null))).toBe(true);
	});

	it("returns true for GET request with matching origin", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "GET", "https://example.com"))).toBe(true);
	});

	it("returns false for GET request with different origin", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "GET", "https://other.com"))).toBe(false);
	});

	it("handles DELETE method as state-changing", async () => {
		const { isSameOrigin } = await loadModule();
		expect(isSameOrigin(mockRequest("https://example.com/api", "DELETE", "https://example.com"))).toBe(true);
	});
});

describe("server-auth.getAuthUser", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("returns null when CONVEX_SITE_URL is not configured", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
		const { getAuthUser } = await loadModule();
		const request = requestWithCookie("some=cookie");
		await expect(getAuthUser(request)).resolves.toBeNull();
	});

	it("returns null when no cookie header", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		const { getAuthUser } = await loadModule();
		const request = { headers: { get: () => null } } as unknown as Request;
		await expect(getAuthUser(request)).resolves.toBeNull();
	});

	it("returns null when session endpoint returns error", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("Unauthorized", { status: 401 }),
		);
		const { getAuthUser } = await loadModule();
		const request = requestWithCookie("session=abc");
		await expect(getAuthUser(request)).resolves.toBeNull();
	});

	it("returns user when session endpoint returns valid data", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					user: { id: "user_123", email: "user@example.com", name: "Test User" },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		const { getAuthUser } = await loadModule();
		const request = requestWithCookie("session=abc");
		const result = await getAuthUser(request);
		expect(result).toEqual({ id: "user_123", email: "user@example.com", name: "Test User" });
	});

	it("returns null when user field is missing in response", async () => {
		vi.stubEnv("VITE_CONVEX_SITE_URL", "https://example.convex.site");
		vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ session: { id: "session_1" } }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const { getAuthUser } = await loadModule();
		const request = requestWithCookie("session=abc");
		const result = await getAuthUser(request);
		expect(result).toBeNull();
	});
});

describe("server-auth.getConvexUserId", () => {
	const authUser = { id: "ext-user-123", email: "user@example.com", name: "Test User" };

	async function loadWithConvexMock(mockQuery: ReturnType<typeof vi.fn>, mockMutation?: ReturnType<typeof vi.fn>) {
		vi.resetModules();
		const q = mockQuery;
		const m = mockMutation ?? vi.fn();
		vi.doMock("convex/browser", () => {
			function ConvexHttpClient() {
				return { setAuth: vi.fn(), query: q, mutation: m };
			}
			return { ConvexHttpClient };
		});
		return import("@/lib/server-auth");
	}

	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		vi.doUnmock("convex/browser");
	});

	it("returns null when getConvexAuthToken returns null (no cookie)", async () => {
		const { getConvexUserId } = await loadModule();
		const request = { headers: { get: () => null } } as unknown as Request;
		await expect(getConvexUserId(authUser, request)).resolves.toBeNull();
	});

	it("returns existing user _id when user is already in database", async () => {
		const fallbackJwt = createJwt();
		const mockQuery = vi.fn().mockResolvedValue({ _id: "user-convex-id-123" });

		const { getConvexUserId } = await loadWithConvexMock(mockQuery);
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);
		const result = await getConvexUserId(authUser, request);
		expect(result).toBe("user-convex-id-123");
	});

	it("creates user via mutation when user does not exist in database", async () => {
		const fallbackJwt = createJwt();
		const mockQuery = vi.fn().mockResolvedValue(null);
		const mockMutation = vi.fn().mockResolvedValue({ userId: "new-user-id-456" });

		const { getConvexUserId } = await loadWithConvexMock(mockQuery, mockMutation);
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);
		const result = await getConvexUserId(authUser, request);
		expect(result).toBe("new-user-id-456");
	});

	it("creates user via mutation with null email and name (lines 164-165 ?? branches)", async () => {
		const fallbackJwt = createJwt();
		const mockQuery = vi.fn().mockResolvedValue(null);
		const mockMutation = vi.fn().mockResolvedValue({ userId: "null-fields-user" });

		const { getConvexUserId } = await loadWithConvexMock(mockQuery, mockMutation);
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);
		const userWithNullFields = { id: "ext-null-user", email: null, name: null };
		const result = await getConvexUserId(userWithNullFields as Parameters<typeof getConvexUserId>[0], request);
		expect(result).toBe("null-fields-user");
		expect(mockMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ email: undefined, name: undefined }),
		);
	});
});

describe("server-auth.getConvexUserIdReadOnly", () => {
	const authUser = { id: "ext-user-789", email: "readonly@example.com", name: "Readonly User" };

	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("returns user _id when user exists in database", async () => {
		const mockConvexClient = {
			setAuth: vi.fn(),
			query: vi.fn().mockResolvedValue({ _id: "convex-user-id-readonly" }),
			mutation: vi.fn(),
		};
		const { getConvexUserIdReadOnly } = await loadModule();
		const result = await getConvexUserIdReadOnly(
			authUser,
			mockConvexClient as unknown as ReturnType<typeof import("@/lib/convex-server").createConvexServerClient>,
		);
		expect(result).toBe("convex-user-id-readonly");
	});

	it("returns null when user does not exist in database", async () => {
		const mockConvexClient = {
			setAuth: vi.fn(),
			query: vi.fn().mockResolvedValue(null),
			mutation: vi.fn(),
		};
		const { getConvexUserIdReadOnly } = await loadModule();
		const result = await getConvexUserIdReadOnly(
			authUser,
			mockConvexClient as unknown as ReturnType<typeof import("@/lib/convex-server").createConvexServerClient>,
		);
		expect(result).toBeNull();
	});
});

describe("server-auth.getConvexClientForRequest", () => {
	async function loadWithConvexMock() {
		vi.resetModules();
		vi.doMock("convex/browser", () => {
			function ConvexHttpClient() {
				return { setAuth: vi.fn(), query: vi.fn(), mutation: vi.fn() };
			}
			return { ConvexHttpClient };
		});
		return import("@/lib/server-auth");
	}

	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("ALLOW_AUTH_COOKIE_FALLBACK", "true");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("CONVEX_URL", "https://example.convex.cloud");
		vi.stubEnv("VITE_CONVEX_SITE_URL", "");
		vi.stubEnv("CONVEX_SITE_URL", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		vi.doUnmock("convex/browser");
	});

	it("returns null when no auth token is available", async () => {
		const { getConvexClientForRequest } = await loadModule();
		const request = { headers: { get: () => null } } as unknown as Request;
		await expect(getConvexClientForRequest(request)).resolves.toBeNull();
	});

	it("returns a Convex client when auth token is available", async () => {
		const fallbackJwt = createJwt();
		const { getConvexClientForRequest } = await loadWithConvexMock();
		const request = requestWithCookie(`better-auth.convex_jwt=${fallbackJwt}`);
		const client = await getConvexClientForRequest(request);
		expect(client).not.toBeNull();
	});
});
