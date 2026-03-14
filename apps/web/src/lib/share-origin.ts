export const FALLBACK_SHARE_ORIGIN = "https://osschat.dev";

export function getShareOrigin(options?: { windowOrigin?: string }) {
	const configuredOrigin = import.meta.env.VITE_APP_URL;
	if (configuredOrigin) return configuredOrigin;

	if (typeof process !== "undefined" && process.env.VERCEL_URL) {
		return `https://${process.env.VERCEL_URL}`;
	}

	return options?.windowOrigin || FALLBACK_SHARE_ORIGIN;
}
