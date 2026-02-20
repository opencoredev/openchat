// Allowed URL schemes for search result links (security: prevent XSS via javascript:/data: URLs)
export const ALLOWED_URL_SCHEMES = new Set(["http:", "https:"]);

// Validates and sanitizes a URL, returning null if the URL is invalid or uses a disallowed scheme
export function getSafeUrl(url: string): string | null {
	try {
		const urlObj = new URL(url);
		// Only allow http and https schemes to prevent XSS/phishing via javascript:, data:, etc.
		if (!ALLOWED_URL_SCHEMES.has(urlObj.protocol)) {
			return null;
		}
		return urlObj.toString();
	} catch {
		// If URL parsing fails, it's not a valid URL
		return null;
	}
}

// Helper to replace UTM source in URLs with osschat.dev
// Returns null if the URL is invalid or uses a disallowed scheme
export function replaceUtmSource(url: string): string | null {
	const safeUrl = getSafeUrl(url);
	if (!safeUrl) {
		return null;
	}

	try {
		const urlObj = new URL(safeUrl);
		// Replace any existing utm_source with osschat.dev
		if (urlObj.searchParams.has("utm_source")) {
			urlObj.searchParams.set("utm_source", "osschat.dev");
		}
		// Replace utm_medium if it exists
		if (urlObj.searchParams.has("utm_medium")) {
			urlObj.searchParams.set("utm_medium", "referral");
		}
		return urlObj.toString();
	} catch {
		// If URL parsing fails after validation, return the safe URL
		return safeUrl;
	}
}
