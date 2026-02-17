/**
 * Convex Client - Singleton instance for the entire app
 */

import { ConvexReactClient } from "convex/react";
import { env } from "./env";

// Create client only in browser environment with valid URL
// During SSR, convexClient will be null - components must handle this gracefully
export const convexClient =
  typeof window !== "undefined" && env.CONVEX_URL
    ? new ConvexReactClient(env.CONVEX_URL, { expectAuth: true })
    : null;


