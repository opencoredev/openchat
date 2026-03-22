import { ScrollView, View, Text, StyleSheet } from "react-native";

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.meta}>Last updated: March 2026</Text>
      <Text style={styles.body}>
        OpenChat is an open-source AI chat platform. We collect minimal data required to provide the service.
        {"\n\n"}
        Your conversations are stored in Convex and are associated with your authenticated account. They are not shared with third parties. AI requests are routed through OpenRouter, which may process message content according to their own privacy policy.
        {"\n\n"}
        You can delete your account and all associated data at any time from Settings → Account → Delete Account.
        {"\n\n"}
        For the full privacy policy, visit: https://osschat.dev/privacy
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  meta: { color: "#52525b", fontSize: 13, marginBottom: 20 },
  body: { color: "#a1a1aa", fontSize: 15, lineHeight: 24 },
});
