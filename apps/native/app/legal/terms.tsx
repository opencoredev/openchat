import { ScrollView, Text, StyleSheet } from "react-native";

export default function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.meta}>Last updated: March 2026</Text>
      <Text style={styles.body}>
        By using OpenChat you agree to use the service in accordance with applicable laws and not to abuse, scrape, or reverse-engineer the platform.
        {"\n\n"}
        The service is provided "as is" without warranty. OpenChat / OpenCore Dev is not liable for any damages arising from use of the service.
        {"\n\n"}
        For the full terms of service, visit: https://osschat.dev/terms
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
