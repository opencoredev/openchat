/**
 * Type-safe environment variables for TanStack Start
 * Access these via import.meta.env in client code
 */

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const convexSiteUrl =
  (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ||
  (convexUrl ? convexUrl.replace(/\.convex\.cloud$/, ".convex.site") : "");

// Client-side env vars (must be prefixed with VITE_)
export const env = {
  CONVEX_URL: convexUrl,
  CONVEX_SITE_URL: convexSiteUrl,
  POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
  POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
} as const;


const PRODUCTION_HOSTS = ["osschat.dev", "www.osschat.dev"];

export function isPreviewDeployment(): boolean {
	if (typeof window === "undefined") return false;
	const hostname = window.location.hostname;
	if (hostname === "localhost" || hostname === "127.0.0.1") return false;
	return !PRODUCTION_HOSTS.includes(hostname);
}
