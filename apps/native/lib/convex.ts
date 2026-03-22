import { ConvexReactClient } from "convex/react";
import Constants from "expo-constants";

const convexUrl = Constants.expoConfig?.extra?.convexUrl
  ?? process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "[OpenChat Native] EXPO_PUBLIC_CONVEX_URL is not set. " +
    "Copy apps/native/.env.example to apps/native/.env and fill in the value."
  );
}

/**
 * Singleton Convex client for the mobile app.
 * Shared across all screens so we get a single persistent WebSocket connection.
 */
export const convexClient = new ConvexReactClient(convexUrl as string);
