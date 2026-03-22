import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useAuthStore } from "../../stores/auth";

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#38C9A8",
        tabBarInactiveTintColor: "#52525b",
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        tabBarStyle: {
          backgroundColor: "#09090b",
          borderTopColor: "#18181b",
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
