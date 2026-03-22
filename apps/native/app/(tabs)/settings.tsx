import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/auth";
import { useConvexUser } from "../../hooks/useConvexUser";
import { useModelStore } from "../../stores/model";
import { signOut } from "../../lib/auth";

export default function SettingsScreen() {
  const router = useRouter();
  const { sessionToken, clearSession } = useAuthStore();
  const { convexUser } = useConvexUser();
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const selectedModelName = useModelStore((s) => s.getModelById(s.selectedModelId)?.name ?? s.selectedModelId);

  const handleSignOut = async () => {
    if (sessionToken) await signOut(sessionToken);
    await clearSession();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Profile card */}
      {convexUser && (
        <View style={styles.profileCard}>
          {convexUser.avatarUrl ? (
            <Image source={{ uri: convexUser.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(convexUser.name ?? convexUser.email ?? "U")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{convexUser.name ?? ""}</Text>
            <Text style={styles.profileEmail}>{convexUser.email ?? ""}</Text>
          </View>
        </View>
      )}

      {/* Model */}
      <Text style={styles.sectionHeader}>Model</Text>
      <TouchableOpacity style={styles.row} onPress={() => router.push("/new")}>
        <View style={styles.rowLeft}>
          <Ionicons name="sparkles-outline" size={18} color="#38C9A8" />
          <Text style={styles.rowLabel}>Active Model</Text>
        </View>
        <Text style={styles.rowValue} numberOfLines={1}>{selectedModelName}</Text>
      </TouchableOpacity>

      {/* API Key */}
      <Text style={styles.sectionHeader}>API Key (BYOK)</Text>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push("/settings/byok")}
      >
        <View style={styles.rowLeft}>
          <Ionicons name="key-outline" size={18} color="#38C9A8" />
          <Text style={styles.rowLabel}>OpenRouter API Key</Text>
        </View>
        <View style={styles.rowRight}>
          <View
            style={[
              styles.keyStatusDot,
              convexUser?.hasOpenRouterKey
                ? styles.keyStatusDotActive
                : styles.keyStatusDotInactive,
            ]}
          />
          <Text style={styles.rowValue}>
            {convexUser?.hasOpenRouterKey ? "Connected" : "Not set"}
          </Text>
        </View>
      </TouchableOpacity>

      {/* About */}
      <Text style={styles.sectionHeader}>About</Text>
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Ionicons name="information-circle-outline" size={18} color="#71717a" />
          <Text style={styles.rowLabel}>OpenChat</Text>
        </View>
        <Text style={styles.rowValue}>v0.1.0</Text>
      </View>

      {/* Sign out */}
      <Text style={styles.sectionHeader}>Account</Text>
      <TouchableOpacity style={styles.row} onPress={handleSignOut}>
        <View style={styles.rowLeft}>
          <Ionicons name="log-out-outline" size={18} color="#f87171" />
          <Text style={[styles.rowLabel, { color: "#f87171" }]}>Sign out</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 48 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { backgroundColor: "#27272a", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fafafa", fontSize: 20, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { color: "#fafafa", fontSize: 16, fontWeight: "600" },
  profileEmail: { color: "#71717a", fontSize: 13, marginTop: 2 },
  sectionHeader: {
    color: "#52525b",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#18181b",
    padding: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowLabel: { color: "#fafafa", fontSize: 14, fontWeight: "500" },
  rowValue: { color: "#71717a", fontSize: 13, maxWidth: 180, textAlign: "right" },
  keyStatusDot: { width: 8, height: 8, borderRadius: 4 },
  keyStatusDotActive: { backgroundColor: "#38C9A8" },
  keyStatusDotInactive: { backgroundColor: "#52525b" },
});
