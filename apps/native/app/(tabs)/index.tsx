import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { useRouter } from "expo-router";

export default function ChatsScreen() {
  const router = useRouter();
  // Fetch the current user's chats from Convex (real-time subscription)
  const chats = useQuery(api.chats.list);

  if (chats === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38C9A8" />
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No chats yet.</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={() => router.push("/chat/new")}
        >
          <Text style={styles.newChatButtonText}>Start a new chat</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => router.push(`/chat/${item._id}`)}
          >
            <Text style={styles.chatTitle} numberOfLines={1}>
              {item.title ?? "Untitled chat"}
            </Text>
            <Text style={styles.chatMeta} numberOfLines={1}>
              {item.model ?? ""}
            </Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/chat/new")}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#09090b" },
  emptyText: { color: "#a1a1aa", fontSize: 16, marginBottom: 16 },
  chatItem: { padding: 16 },
  chatTitle: { color: "#fafafa", fontSize: 16, fontWeight: "600" },
  chatMeta: { color: "#71717a", fontSize: 13, marginTop: 2 },
  separator: { height: 1, backgroundColor: "#27272a" },
  newChatButton: {
    backgroundColor: "#38C9A8",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  newChatButtonText: { color: "#000", fontWeight: "700", fontSize: 15 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#38C9A8",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#000", fontSize: 28, fontWeight: "700", lineHeight: 32 },
});
