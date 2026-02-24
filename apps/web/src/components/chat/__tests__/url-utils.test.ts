import { describe, expect, test } from "vitest";
import { getSafeUrl, replaceUtmSource, ALLOWED_URL_SCHEMES } from "../url-utils";

describe("ALLOWED_URL_SCHEMES", () => {
	test("includes http:", () => {
		expect(ALLOWED_URL_SCHEMES.has("http:")).toBe(true);
	});

	test("includes https:", () => {
		expect(ALLOWED_URL_SCHEMES.has("https:")).toBe(true);
	});

	test("does not include javascript:", () => {
		expect(ALLOWED_URL_SCHEMES.has("javascript:")).toBe(false);
	});

	test("does not include data:", () => {
		expect(ALLOWED_URL_SCHEMES.has("data:")).toBe(false);
	});
});

describe("getSafeUrl", () => {
	test("returns normalised https URL for valid https input", () => {
		const result = getSafeUrl("https://example.com");
		expect(result).toBe("https://example.com/");
	});

	test("returns normalised http URL for valid http input", () => {
		const result = getSafeUrl("http://example.com/path");
		expect(result).toBe("http://example.com/path");
	});

	test("preserves query parameters", () => {
		const result = getSafeUrl("https://example.com/search?q=hello&page=1");
		expect(result).toContain("q=hello");
		expect(result).toContain("page=1");
	});

	test("preserves hash fragment", () => {
		const result = getSafeUrl("https://example.com/page#section");
		expect(result).toContain("#section");
	});

	test("returns null for javascript: URL", () => {
		expect(getSafeUrl("javascript:alert(1)")).toBeNull();
	});

	test("returns null for data: URL", () => {
		expect(getSafeUrl("data:text/html,<h1>XSS</h1>")).toBeNull();
	});

	test("returns null for file: URL", () => {
		expect(getSafeUrl("file:///etc/passwd")).toBeNull();
	});

	test("returns null for completely invalid URL", () => {
		expect(getSafeUrl("not-a-url")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(getSafeUrl("")).toBeNull();
	});

	test("handles URLs with port numbers", () => {
		const result = getSafeUrl("https://example.com:8080/api");
		expect(result).toContain(":8080");
	});

	test("handles URLs with subdomains", () => {
		const result = getSafeUrl("https://sub.domain.example.com");
		expect(result).not.toBeNull();
	});
});

describe("replaceUtmSource", () => {
	test("replaces existing utm_source with osschat.dev", () => {
		const result = replaceUtmSource("https://example.com?utm_source=google");
		expect(result).toContain("utm_source=osschat.dev");
		expect(result).not.toContain("utm_source=google");
	});

	test("replaces existing utm_medium with referral", () => {
		const result = replaceUtmSource("https://example.com?utm_medium=cpc");
		expect(result).toContain("utm_medium=referral");
		expect(result).not.toContain("utm_medium=cpc");
	});

	test("replaces both utm_source and utm_medium when both present", () => {
		const result = replaceUtmSource("https://example.com?utm_source=google&utm_medium=cpc");
		expect(result).toContain("utm_source=osschat.dev");
		expect(result).toContain("utm_medium=referral");
	});

	test("leaves URL unchanged when no UTM params present", () => {
		const result = replaceUtmSource("https://example.com/page?q=hello");
		expect(result).toContain("q=hello");
		expect(result).not.toContain("utm_source");
	});

	test("returns null for invalid URL", () => {
		expect(replaceUtmSource("not-a-url")).toBeNull();
	});

	test("returns null for javascript: URL", () => {
		expect(replaceUtmSource("javascript:alert(1)")).toBeNull();
	});

	test("preserves other query params alongside UTM replacement", () => {
		const result = replaceUtmSource(
			"https://example.com?q=test&utm_source=old&page=2",
		);
		expect(result).toContain("q=test");
		expect(result).toContain("page=2");
		expect(result).toContain("utm_source=osschat.dev");
	});

	test("does not add utm_source when it was not in the original URL", () => {
		const result = replaceUtmSource("https://example.com/plain");
		expect(result).not.toContain("utm_source");
	});

	test("handles valid https URL without modification when no UTM params", () => {
		const result = replaceUtmSource("https://example.com/");
		expect(result).toBe("https://example.com/");
	});
});
