import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@server": path.resolve(__dirname, "../server"),
		},
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/testSetup.test.ts"],
		environment: "node",
	},
});
