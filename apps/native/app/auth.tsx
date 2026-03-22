import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "../stores/auth";
import { fetchSessionProfile } from "../lib/auth";
import Constants from "expo-constants";

WebBrowser.maybeCompleteAuthSession();

const authBaseUrl = (
  Constants.expoConfig?.extra?.authBaseUrl ??
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ??
  ""
) as string;

export default function AuthScreen() {
  const router = useRouter();
  const { isAuthenticated, setSession } = useAuthStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  // Handle deep-link callback — extract session token from URL
  useEffect(() => {
    const sub = Linking.addEventListener("url", async ({ url }) => {
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.token as string | undefined;
      if (!token) return;
      try {
        const profile = await fetchSessionProfile(token);
        if (!profile) throw new Error("Could not load user profile.");
        await setSession({ token, ...profile });
        router.replace("/");
      } catch (err) {
        Alert.alert("Sign-in failed", err instanceof Error ? err.message : "Unknown error.");
      }
    });
    return () => sub.remove();
  }, [router, setSession]);

  const signInWithGitHub = async () => {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("auth/callback");
      const signInUrl =
        `${authBaseUrl}/api/auth/signin/github` +
        `?redirect_uri=${encodeURIComponent(redirectUri)}`;
      await WebBrowser.openAuthSessionAsync(signInUrl, redirectUri);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to open sign-in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>OpenChat</Text>
        <Text style={styles.tagline}>100+ AI models. Real-time sync.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={signInWithGitHub}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.buttonText}>Continue with GitHub</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.legalText}>
          By signing in you agree to the OpenChat terms of service.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    justifyContent: "space-between",
    padding: 28,
    paddingTop: 100,
  },
  hero: { alignItems: "center" },
  logo: {
    color: "#fafafa",
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -1,
    marginBottom: 10,
  },
  tagline: { color: "#71717a", fontSize: 17 },
  actions: { gap: 14, paddingBottom: 16 },
  button: {
    backgroundColor: "#38C9A8",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "700" },
  legalText: { color: "#3f3f46", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
