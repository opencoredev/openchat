import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuthStore } from "../../stores/auth";
import { signOut } from "../../lib/auth";

export default function SettingsScreen() {
  const { sessionToken, clearSession } = useAuthStore();

  const handleSignOut = async () => {
    if (sessionToken) {
      await signOut(sessionToken);
    }
    await clearSession();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>Account</Text>
      <TouchableOpacity style={styles.row} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b", padding: 16 },
  sectionHeader: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 24,
  },
  row: {
    backgroundColor: "#18181b",
    padding: 16,
    borderRadius: 8,
  },
  signOutText: { color: "#f87171", fontSize: 15, fontWeight: "600" },
});
