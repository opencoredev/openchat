import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { SessionData } from "../stores/auth";

const authBaseUrl = (
  Constants.expoConfig?.extra?.authBaseUrl ??
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ??
  ""
) as string;

/**
 * Exchange a Better Auth session token for a short-lived Convex JWT.
 * Called by ConvexProviderWithAuth every time it needs a fresh token.
 */
export async function fetchConvexToken(sessionToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${authBaseUrl}/api/auth/convex/token`, {
      method: "GET",
      headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { token?: string };
    return json.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the current user's profile from the Better Auth server.
 * Used after OAuth completes to populate session data.
 */
export async function fetchSessionProfile(sessionToken: string): Promise<Omit<SessionData, "token"> | null> {
  try {
    const res = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { user?: { id: string; email?: string; name?: string; image?: string } };
    if (!json.user?.id) return null;
    return {
      userId: json.user.id,
      email: json.user.email,
      name: json.user.name,
      image: json.user.image,
    };
  } catch {
    return null;
  }
}

export async function signOut(sessionToken: string): Promise<void> {
  try {
    await fetch(`${authBaseUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    });
  } catch {
    // best-effort
  }
}
