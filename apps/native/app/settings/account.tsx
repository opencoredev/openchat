import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../stores/auth";
import { useConvexUser } from "../../hooks/useConvexUser";
import { signOut } from "../../lib/auth";

export default function AccountScreen() {
  const router = useRouter();
  const { sessionToken, clearSession } = useAuthStore();
  const { convexUser, convexUserId } = useConvexUser();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = async () => {
    if (sessionToken) await signOut(sessionToken);
    await clearSession();
    router.replace("/auth");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you absolutely sure? This will permanently delete your account, all chats, and messages. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              // Sign out — server-side account deletion requires a dedicated
              // Convex mutation (userDelete.deleteCurrentUser) which mirrors the
              // web app's implementation.  For now we sign out and show a prompt
              // to complete deletion on the web app.
              Alert.alert(
                "Complete on web",
                "To fully delete your account, please visit osschat.dev/settings and use the Delete Account option there. You have been signed out.",
                [{ text: "OK", onPress: async () => {
                  if (sessionToken) await signOut(sessionToken);
                  await clearSession();
                  router.replace("/auth");
                }}]
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Profile</Text>
      <View style={styles.card}>
        <Row label="Name" value={convexUser?.name ?? "—"} />
        <Divider />
        <Row label="Email" value={convexUser?.email ?? "—"} />
      </View>

      <Text style={styles.sectionHeader}>Session</Text>
      <TouchableOpacity style={styles.card} onPress={handleSignOut}>
        <Text style={[styles.rowLabel, { color: "#f87171" }]}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.sectionHeader}>Danger Zone</Text>
      <TouchableOpacity
        style={[styles.card, styles.dangerCard]}
        onPress={handleDeleteAccount}
        disabled={isDeleting}
      >
        {isDeleting
          ? <ActivityIndicator color="#f87171" />
          : <Text style={[styles.rowLabel, { color: "#f87171" }]}>Delete Account</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.container}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function Divider() {
  return <View style={{ height: 1, backgroundColor: "#27272a" }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 48 },
  sectionHeader: {
    color: "#52525b", fontSize: 11, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginBottom: 6, marginTop: 20, paddingHorizontal: 4,
  },
  card: { backgroundColor: "#18181b", borderRadius: 10, overflow: "hidden", marginBottom: 4 },
  dangerCard: { borderWidth: 1, borderColor: "#3f1d1d", backgroundColor: "#1c0f0f", padding: 14 },
  rowLabel: { color: "#fafafa", fontSize: 14, fontWeight: "500" },
});

const rowStyles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  label: { color: "#a1a1aa", fontSize: 14 },
  value: { color: "#fafafa", fontSize: 14, maxWidth: 220, textAlign: "right" },
});
