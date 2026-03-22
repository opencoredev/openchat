import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { MarkdownMessage } from "../../components/MarkdownMessage";

export default function SharedChatScreen() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const router = useRouter();

  const sharedChat = useQuery(
    api.chatShares.getSharedChat,
    shareId ? { shareId: shareId as Id<"chatShares"> } : "skip"
  );

  if (sharedChat === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#38C9A8" size="large" />
      </View>
    );
  }

  if (!sharedChat) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>This shared chat could not be found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{sharedChat.title}</Text>
        <Text style={styles.meta}>{sharedChat.messages.length} messages · shared chat</Text>
      </View>
      <FlatList
        data={sharedChat.messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={styles.roleLabel}>{item.role === "user" ? "You" : "Assistant"}</Text>
            <MarkdownMessage content={item.content} role={item.role === "user" ? "user" : "assistant"} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24, backgroundColor: "#09090b" },
  errorText: { color: "#a1a1aa", fontSize: 16, textAlign: "center" },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#27272a" },
  title: { color: "#fafafa", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  meta: { color: "#71717a", fontSize: 13 },
  list: { padding: 16, gap: 12 },
  bubble: { borderRadius: 12, padding: 14, marginBottom: 8 },
  bubbleUser: { backgroundColor: "#18181b", alignSelf: "flex-end", maxWidth: "88%" },
  bubbleAssistant: { backgroundColor: "transparent", alignSelf: "flex-start", maxWidth: "96%" },
  roleLabel: { color: "#52525b", fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 },
  backButton: { backgroundColor: "#38C9A8", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backButtonText: { color: "#000", fontWeight: "700" },
});
