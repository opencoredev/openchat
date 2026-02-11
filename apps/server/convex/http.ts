import "./polyfills";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { streamLLM } from "./streaming";
import { api } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { getAllowedOrigins, getCorsOrigin } from "./lib/origins";

const http = httpRouter();

// Register Better Auth routes with CORS enabled for client-side requests
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: getAllowedOrigins(),
    allowedHeaders: ["content-type", "authorization", "better-auth-cookie"],
    exposedHeaders: ["set-better-auth-cookie"],
  },
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ 
        ok: true, 
        ts: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }),
});

// LLM streaming endpoint - runs on Convex infrastructure for persistence
http.route({
  path: "/stream-llm",
  method: "POST",
  handler: streamLLM,
});

// Handle CORS preflight for streaming endpoint
http.route({
  path: "/stream-llm",
  method: "OPTIONS",
  handler: streamLLM,
});

// Public stats endpoint for sign-in page
// SECURITY: This endpoint exposes only aggregate, non-sensitive stats (counts, stars).
// If sensitive data is ever added, ensure CORS remains restricted to getAllowedOrigins().
http.route({
  path: "/stats",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const allowedOrigin = getCorsOrigin(origin);

    const stats = await ctx.runQuery(api.stats.getPublicStats, {});

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cache-control": "public, max-age=60", // Cache for 1 minute
    };

    // Only set CORS header for allowed origins
    if (allowedOrigin) {
      headers["access-control-allow-origin"] = allowedOrigin;
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers,
    });
  }),
});

export default http;
