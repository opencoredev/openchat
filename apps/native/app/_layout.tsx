import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ConvexAuthProvider } from "../providers/ConvexAuthProvider";
import { useAuthStore } from "../stores/auth";

// Keep the splash screen visible while we check for a stored session
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, [initialize]);

  if (isLoading) {
    // Splash screen is still visible; render nothing until we know auth state
    return null;
  }

  return (
    <ConvexAuthProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ConvexAuthProvider>
  );
}
