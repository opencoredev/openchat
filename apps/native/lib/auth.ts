import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const authBaseUrl = Constants.expoConfig?.extra?.authBaseUrl
  ?? process.env.EXPO_PUBLIC_AUTH_BASE_URL;

if (!authBaseUrl) {
  throw new Error(
    "[OpenChat Native] EXPO_PUBLIC_AUTH_BASE_URL is not set. " +
    "Copy apps/native/.env.example to apps/native/.env and fill in the value."
  );
}

const TOKEN_KEY = "openchat_auth_token";

/**
 * Minimal auth helpers for the mobile client.
 *
 * Auth flow summary (mirrors the web app):
 *  1. User taps "Sign in with GitHub" (or Vercel).
 *  2. We open an OAuth redirect through the Convex site URL
 *     ({EXPO_PUBLIC_AUTH_BASE_URL}/api/auth/signin/github).
 *  3. Better Auth completes the OAuth dance and issues a session token.
 *  4. We exchange the session for a short-lived Convex JWT via
 *     {EXPO_PUBLIC_AUTH_BASE_URL}/api/auth/convex/token
 *  5. That JWT is passed to ConvexProviderWithAuth so every
 *     Convex query/mutation is authenticated.
 *
 * Session tokens are persisted to SecureStore between app restarts.
 */

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * Exchange the Better Auth session token for a Convex JWT.
 * The Convex JWT is short-lived (~1 min) so this should be called
 * every time ConvexProviderWithAuth requests a fresh token.
 */
export async function fetchConvexToken(sessionToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${authBaseUrl}/api/auth/convex/token`, {
      method: "GET",
      headers: {
        Cookie: `better-auth.session_token=${sessionToken}`,
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as { token?: string };
    return json.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Sign out — clears both the local session store and invalidates the
 * Better Auth session server-side.
 */
export async function signOut(sessionToken: string): Promise<void> {
  await clearToken();
  try {
    await fetch(`${authBaseUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        Cookie: `better-auth.session_token=${sessionToken}`,
      },
    });
  } catch {
    // best-effort
  }
}
