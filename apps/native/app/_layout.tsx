import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ConvexAuthProvider } from "../providers/ConvexAuthProvider";
import { useAuthStore } from "../stores/auth";
import { setupPushNotifications } from "../lib/notifications";
import { usePushTokenSync } from "../hooks/usePushTokenSync";

SplashScreen.preventAutoHideAsync();

function AppBootstrap({ children }: { children: React.ReactNode }) {
  // Syncs push token to Convex once the user is authenticated
  usePushTokenSync();
  return <>{children}</>;
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    initialize().then(() => SplashScreen.hideAsync());
    setupPushNotifications()
      .then((token) => { pushTokenRef.current = token; })
      .catch(() => {});
  }, [initialize]);

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
          <Stack.Screen name="share/[shareId]" options={{ title: "Shared Chat" }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="light" />
      </AppBootstrap>
    </ConvexAuthProvider>
  );
}
