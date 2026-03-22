import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ConvexAuthProvider } from "../providers/ConvexAuthProvider";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { setupPushNotifications } from "../lib/notifications";
import { usePushTokenSync } from "../hooks/usePushTokenSync";

SplashScreen.preventAutoHideAsync();

function AppBootstrap({ children }: { children: React.ReactNode }) {
  usePushTokenSync();
  return <>{children}</>;
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  const loadPreference = useThemeStore((s) => s.loadPreference);

  useEffect(() => {
    Promise.all([
      initialize(),
      loadPreference(),
      setupPushNotifications().catch(() => {}),
    ]).then(() => SplashScreen.hideAsync());
  }, [initialize, loadPreference]);

  if (isLoading) return null;

  return (
    <ConvexAuthProvider>
      <AppBootstrap>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#09090b" },
            headerTintColor: "#fafafa",
            contentStyle: { backgroundColor: "#09090b" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: "", headerBackTitle: "Back" }} />
          <Stack.Screen name="new" options={{ title: "New Chat", presentation: "modal" }} />
          <Stack.Screen name="settings/byok" options={{ title: "OpenRouter Key", presentation: "modal" }} />
          <Stack.Screen name="settings/account" options={{ title: "Account", presentation: "modal" }} />
          <Stack.Screen name="settings/appearance" options={{ title: "Appearance", presentation: "modal" }} />
          <Stack.Screen name="share/[shareId]" options={{ title: "Shared Chat" }} />
          <Stack.Screen name="legal/privacy" options={{ title: "Privacy Policy" }} />
          <Stack.Screen name="legal/terms" options={{ title: "Terms of Service" }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="light" />
      </AppBootstrap>
    </ConvexAuthProvider>
  );
}
