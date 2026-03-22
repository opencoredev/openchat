import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useConvexUser } from "../../hooks/useConvexUser";

type ChatListItem = {
  _id: string;
  title: string;
  updatedAt: number;
  status?: string;
};

export default function ChatsScreen() {
  const router = useRouter();
  const { convexUserId, isLoading } = useConvexUser();

  // Paginated chat list — real-time subscription
  const result = useQuery(
    api.chats.list,
    convexUserId
      ? { userId: convexUserId, limit: 50 }
      : "skip"
  );

  if (isLoading || result === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38C9A8" />
      </View>
    );
  }

  const chats = result.chats as ChatListItem[];

  return (
    <View style={styles.container}>
      {chats.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={52} color="#27272a" />
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptySubtitle}>Start a conversation with any AI model</Text>
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => router.push("/new")}
          >
            <Text style={styles.newChatButtonText}>New Chat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              onPress={() => router.push(`/chat/${item._id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/new")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

function ChatRow({ chat, onPress }: { chat: ChatListItem; onPress: () => void }) {
  const isStreaming = chat.status === "streaming";
  return (
    <TouchableOpacity style={styles.chatRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.chatRowLeft}>
        <Text style={styles.chatTitle} numberOfLines={1}>
          {chat.title || "Untitled"}
        </Text>
        <Text style={styles.chatMeta}>
          {isStreaming ? "Generating…" : new Date(chat.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      {isStreaming && <ActivityIndicator size="small" color="#38C9A8" />}
      <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: "#09090b" },
  emptyTitle: { color: "#a1a1aa", fontSize: 18, fontWeight: "600", marginTop: 8 },
  emptySubtitle: { color: "#52525b", fontSize: 14, textAlign: "center", maxWidth: 240 },
  newChatButton: {
    backgroundColor: "#38C9A8",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  newChatButtonText: { color: "#000", fontWeight: "700", fontSize: 15 },
  listContent: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: "#18181b", marginLeft: 16 },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  chatRowLeft: { flex: 1 },
  chatTitle: { color: "#fafafa", fontSize: 15, fontWeight: "600" },
  chatMeta: { color: "#52525b", fontSize: 12, marginTop: 2 },
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
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
