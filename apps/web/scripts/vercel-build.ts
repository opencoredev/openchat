import { execFileSync } from "node:child_process";

function log(message: string) {
	console.log(`[vercel-build] ${message}`);
}

function run(
	command: string,
	args: string[],
	options?: {
		cwd?: string;
		env?: Record<string, string | undefined>;
	}
) {
	execFileSync(command, args, {
		cwd: options?.cwd,
		env: {
			...process.env,
			...options?.env,
		},
		stdio: "inherit",
	});
}

function setConvexEnvIfPresent(key: string, value: string | undefined, previewName: string, deployKey: string) {
	if (!value) return;
	run(
		"bunx",
		["convex", "env", "set", key, value, "--preview-name", previewName],
		{
			cwd: "../server",
			env: { CONVEX_DEPLOY_KEY: deployKey },
		}
	);
}

if (process.env.VERCEL_ENV === "production") {
	log("Production build detected; running bun run build.");
	run("bun", ["run", "build"]);
	process.exit(0);
}

const previewKey = process.env.CONVEX_PREVIEW_DEPLOY_KEY ?? process.env.CONVEX_DEPLOY_KEY;

if (!previewKey) {
	if (process.env.VITE_CONVEX_URL) {
		log("No Convex deploy key found; using existing VITE_CONVEX_URL and running bun run build.");
		run("bun", ["run", "build"]);
		process.exit(0);
	}

	log("Missing Convex deploy key for preview build.");
	log("Set CONVEX_DEPLOY_KEY (or CONVEX_PREVIEW_DEPLOY_KEY) in Vercel Preview env.");
	process.exit(1);
}

let previewName = "preview";
if (process.env.VERCEL_GIT_PULL_REQUEST_ID) {
	previewName = `pr-${process.env.VERCEL_GIT_PULL_REQUEST_ID}`;
} else if (process.env.VERCEL_GIT_COMMIT_REF) {
	previewName = process.env.VERCEL_GIT_COMMIT_REF
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "")
		.replace(/-+/g, "-") || "preview";
}

const siteUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
const productionConvexSiteUrl =
	process.env.PRODUCTION_CONVEX_SITE_URL ?? "https://outgoing-setter-201.convex.site";

if (process.env.CONVEX_DRY_RUN === "1") {
	log("Dry run enabled.");
	log(`Would deploy Convex preview named: ${previewName}`);
	log(`Would set SITE_URL=${siteUrl ?? "<empty>"}`);
	log("Would set DEPLOYMENT_TYPE=preview");
	log(`Would set PRODUCTION_CONVEX_SITE_URL=${productionConvexSiteUrl}`);
	log("Would run web build with VITE_CONVEX_URL.");
	process.exit(0);
}

log(`Deploying Convex preview: ${previewName}`);
run(
	"bunx",
	[
		"convex",
		"deploy",
		"--yes",
		"--preview-create",
		previewName,
		"--preview-run",
		"previewSeed",
		"--cmd-url-env-var-name",
		"VITE_CONVEX_URL",
		"--cmd",
		"cd ../web && bun run build",
	],
	{
		cwd: "../server",
		env: { CONVEX_DEPLOY_KEY: previewKey },
	}
);

log(`Syncing Convex preview env vars for ${previewName}`);
setConvexEnvIfPresent("SITE_URL", siteUrl, previewName, previewKey);
setConvexEnvIfPresent("DEPLOYMENT_TYPE", "preview", previewName, previewKey);
setConvexEnvIfPresent("PRODUCTION_CONVEX_SITE_URL", productionConvexSiteUrl, previewName, previewKey);
setConvexEnvIfPresent("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET, previewName, previewKey);
setConvexEnvIfPresent(
	"GITHUB_CLIENT_ID",
	process.env.AUTH_GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID,
	previewName,
	previewKey
);
setConvexEnvIfPresent(
	"GITHUB_CLIENT_SECRET",
	process.env.AUTH_GITHUB_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET,
	previewName,
	previewKey
);
setConvexEnvIfPresent("VERCEL_CLIENT_ID", process.env.VERCEL_CLIENT_ID, previewName, previewKey);
setConvexEnvIfPresent("VERCEL_CLIENT_SECRET", process.env.VERCEL_CLIENT_SECRET, previewName, previewKey);

log("Preview build completed.");
