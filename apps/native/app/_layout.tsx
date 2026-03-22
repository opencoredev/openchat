import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ConvexAuthProvider } from "../providers/ConvexAuthProvider";
import { useAuthStore } from "../stores/auth";
import { setupPushNotifications } from "../lib/notifications";

// Keep the splash screen visible while we check for a stored session
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    initialize().then(() => SplashScreen.hideAsync());
    // Register for push notifications (best-effort, no-op if permission denied)
    setupPushNotifications().catch(() => {});
  }, [initialize]);

  if (isLoading) {
    return null;
  }

  return (
    <ConvexAuthProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fafafa",
          contentStyle: { backgroundColor: "#09090b" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: "" }} />
        <Stack.Screen name="new" options={{ title: "New Chat", presentation: "modal" }} />
        <Stack.Screen name="settings/byok" options={{ title: "OpenRouter API Key", presentation: "modal" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </ConvexAuthProvider>
  );
}
