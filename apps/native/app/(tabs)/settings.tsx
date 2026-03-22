import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
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
  const selectedModelName = useModelStore(
    (s) => s.getModelById(s.selectedModelId)?.name ?? s.selectedModelId
  );

  const handleSignOut = async () => {
    if (sessionToken) await signOut(sessionToken);
    await clearSession();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile card */}
      {convexUser && (
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push("/settings/account")}>
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
          <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
        </TouchableOpacity>
      )}

      <Text style={styles.sectionHeader}>AI</Text>
      <SettingsRow
        icon="sparkles-outline"
        label="Model"
        value={selectedModelName}
        onPress={() => router.push("/new")}
      />
      <SettingsRow
        icon="key-outline"
        label="OpenRouter Key"
        value={convexUser?.hasOpenRouterKey ? "Connected" : "Not set"}
        valueColor={convexUser?.hasOpenRouterKey ? "#38C9A8" : undefined}
        onPress={() => router.push("/settings/byok")}
      />

      <Text style={styles.sectionHeader}>Account</Text>
      <SettingsRow
        icon="person-outline"
        label="Profile & Account"
        onPress={() => router.push("/settings/account")}
      />

      <Text style={styles.sectionHeader}>Info</Text>
      <SettingsRow icon="information-circle-outline" label="Version" value="0.1.0" />
      <SettingsRow
        icon="globe-outline"
        label="Privacy Policy"
        onPress={() => router.push("/legal/privacy")}
      />
      <SettingsRow
        icon="document-text-outline"
        label="Terms of Service"
        onPress={() => router.push("/legal/terms")}
      />

      <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#f87171" />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SettingsRow({
  icon, label, value, valueColor, onPress,
}: {
  icon: string; label: string; value?: string; valueColor?: string; onPress?: () => void;
}) {
  const Inner = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon as "key-outline"} size={18} color="#71717a" />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}]} numberOfLines={1}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={14} color="#3f3f46" /> : null}
      </View>
    </View>
  );
  if (!onPress) return Inner;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{Inner}</TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 48 },
  profileCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#18181b", borderRadius: 12,
    padding: 16, marginBottom: 20, gap: 14,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { backgroundColor: "#27272a", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fafafa", fontSize: 20, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { color: "#fafafa", fontSize: 16, fontWeight: "600" },
  profileEmail: { color: "#71717a", fontSize: 13, marginTop: 2 },
  sectionHeader: {
    color: "#52525b", fontSize: 11, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginBottom: 4, marginTop: 20, paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", backgroundColor: "#18181b",
    padding: 14, borderRadius: 10, marginBottom: 3,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowLabel: { color: "#fafafa", fontSize: 14, fontWeight: "500" },
  rowValue: { color: "#71717a", fontSize: 13, maxWidth: 180, textAlign: "right" },
  signOutRow: {
    flexDirection: "row", alignItems: "center",
    gap: 10, backgroundColor: "#18181b",
    padding: 14, borderRadius: 10, marginTop: 24,
  },
  signOutText: { color: "#f87171", fontSize: 14, fontWeight: "600" },
});
