import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "../stores/auth";
import Constants from "expo-constants";

// Ensure OAuth redirects back into the app on iOS/Android
WebBrowser.maybeCompleteAuthSession();

const authBaseUrl =
  Constants.expoConfig?.extra?.authBaseUrl ??
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ??
  "";

export default function AuthScreen() {
  const router = useRouter();
  const { isAuthenticated, setSession } = useAuthStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  // Handle deep-link callback that carries the session token
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.token as string | undefined;
      if (token) {
        setSession(token).then(() => router.replace("/"));
      }
    });
    return () => sub.remove();
  }, [router, setSession]);

  const signInWithGitHub = async () => {
    setLoading(true);
    try {
      // The redirect_uri tells Better Auth where to send the user after OAuth.
      // We use a deep link so Expo can intercept it and extract the token.
      const redirectUri = Linking.createURL("auth/callback");
      const signInUrl =
        `${authBaseUrl}/api/auth/signin/github` +
        `?redirect_uri=${encodeURIComponent(redirectUri)}`;

      await WebBrowser.openAuthSessionAsync(signInUrl, redirectUri);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>OpenChat</Text>
      <Text style={styles.tagline}>AI chat across 100+ models</Text>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={signInWithGitHub}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Sign in with GitHub</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  logo: { color: "#fafafa", fontSize: 36, fontWeight: "800", marginBottom: 8 },
  tagline: { color: "#71717a", fontSize: 16, marginBottom: 48 },
  button: {
    backgroundColor: "#38C9A8",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
