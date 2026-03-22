/**
 * Babel configuration for the OpenChat native app.
 *
 * babel-plugin-module-resolver translates the TypeScript path alias
 *   @server/*  →  ../../apps/server/*   (relative to apps/native/)
 * so Metro can resolve imports like:
 *   import { api } from "@server/convex/_generated/api"
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            // maps  @server/foo  →  <workspaceRoot>/apps/server/foo
            "@server": "../server",
          },
          extensions: [
            ".ios.js",
            ".android.js",
            ".native.js",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".json",
          ],
        },
      ],
    ],
  };
};
