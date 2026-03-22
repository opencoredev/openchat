/**
 * Metro bundler configuration for the OpenChat monorepo.
 *
 * Key things this does:
 *   1. Adds the workspace root to watchFolders so Metro can see apps/server.
 *   2. Adds both the project and workspace node_modules to the resolver path.
 *
 * The @server/* path alias is handled by babel-plugin-module-resolver
 * (see babel.config.js), so no resolveRequest override is needed here.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname; // apps/native
const workspaceRoot = path.resolve(projectRoot, "../.."); // repo root

const config = getDefaultConfig(projectRoot);

// Allow Metro to watch the entire monorepo so changes in apps/server
// (e.g. regenerated _generated/api.js) are picked up immediately.
config.watchFolders = [workspaceRoot];

// Resolve node_modules from both the app package and the workspace root.
// This handles packages that are hoisted by Bun to the root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
