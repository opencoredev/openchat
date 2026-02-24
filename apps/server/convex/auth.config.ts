import type { AuthConfig } from "convex/server";
import { requireEnv } from "./env";

export default {
	providers: [
		{
			domain: requireEnv("CONVEX_SITE_URL"),
			applicationID: "convex",
		},
	],
} satisfies AuthConfig;
