import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { nanoid } from "nanoid/non-secure";
import { api } from "@server/convex/_generated/api";
import { useConvexUser } from "../hooks/useConvexUser";
import { useModelStore, type Model } from "../stores/model";
import Constants from "expo-constants";

const authBaseUrl = (
  Constants.expoConfig?.extra?.authBaseUrl ??
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ??
  ""
) as string;

export default function NewChatScreen() {
  const router = useRouter();
  const { convexUserId } = useConvexUser();
  const {
    models,
    selectedModelId,
    isLoadingModels,
    setSelectedModel,
    fetchModels,
    popularModels,
    modelsByProvider,
  } = useModelStore((s) => ({
    models: s.models,
    selectedModelId: s.selectedModelId,
    isLoadingModels: s.isLoadingModels,
    setSelectedModel: s.setSelectedModel,
    fetchModels: s.fetchModels,
    popularModels: s.popularModels(),
    modelsByProvider: s.modelsByProvider(),
  }));

  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"popular" | "all">("popular");
  const [isCreating, setIsCreating] = useState(false);

  const createChat = useMutation(api.chats.create);
  const sendMessage = useMutation(api.messages.send);
  const startStream = useMutation(api.streamJobs.startStream);

  // Load models on mount
  useEffect(() => {
    if (authBaseUrl) fetchModels(authBaseUrl);
  }, [fetchModels]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const query = searchQuery.toLowerCase();
  const filteredModels = query
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
      )
    : tab === "popular"
    ? popularModels
    : models;

  // Group filtered models by provider for section list
  const sections = query
    ? [{ title: "Results", data: filteredModels }]
    : tab === "popular"
    ? [{ title: "Popular Models", data: filteredModels }]
    : Object.entries(
        filteredModels.reduce((acc, m) => {
          (acc[m.provider] ??= []).push(m);
          return acc;
        }, {} as Record<string, Model[]>)
      )
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([title, data]) => ({ title, data }));

  // ── Create chat + send first message ─────────────────────────────────────────
  const handleStartChat = useCallback(
    async (firstMessage?: string) => {
      if (!convexUserId || isCreating) return;
      setIsCreating(true);
      try {
        const { chatId } = await createChat({
          userId: convexUserId,
          title: "New Chat",
        });

        if (firstMessage?.trim()) {
          const clientMessageId = nanoid();
          const assistantClientId = nanoid();
          await sendMessage({
            chatId,
            userId: convexUserId,
            userMessage: { content: firstMessage.trim(), clientMessageId },
          });
          const provider = selectedModelId.startsWith("openai")
            ? "openai"
            : selectedModelId.startsWith("anthropic")
            ? "anthropic"
            : "openrouter";
          await startStream({
            chatId,
            userId: convexUserId,
            messageId: assistantClientId,
            model: selectedModelId,
            provider,
            messages: [{ role: "user", content: firstMessage.trim() }],
          });
        }

        router.replace(`/chat/${chatId}`);
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Could not create chat.");
      } finally {
        setIsCreating(false);
      }
    },
    [convexUserId, isCreating, createChat, sendMessage, startStream, router, selectedModelId]
  );

  return (
    <View style={styles.container}>
      {/* Model picker header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Chat</Text>
        <Text style={styles.selectedModelLabel}>
          {selectedModel?.name ?? selectedModelId}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["popular", "all"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "popular" ? "Popular" : `All (${models.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search models…"
          placeholderTextColor="#52525b"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {isLoadingModels ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#38C9A8" size="large" />
          <Text style={styles.loadingText}>Loading models…</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ModelRow
              model={item}
              isSelected={item.id === selectedModelId}
              onSelect={() => setSelectedModel(item.id)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Start chat button */}
      <TouchableOpacity
        style={[styles.startButton, isCreating && styles.startButtonDisabled]}
        onPress={() => handleStartChat()}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.startButtonText}>Start chat</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ModelRow({
  model,
  isSelected,
  onSelect,
}: {
  model: Model;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.modelRow, isSelected && styles.modelRowSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.modelRowInner}>
        <View style={styles.modelInfo}>
          <Text style={styles.modelName} numberOfLines={1}>
            {model.name}
          </Text>
          <Text style={styles.modelProvider}>{model.provider}</Text>
        </View>
        <View style={styles.modelBadges}>
          {model.isFree && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Free</Text>
            </View>
          )}
          {model.reasoning && (
            <View style={[styles.badge, styles.badgeReasoning]}>
              <Text style={styles.badgeText}>Thinking</Text>
            </View>
          )}
          {isSelected && (
            <View style={styles.checkMark}>
              <Text style={styles.checkMarkText}>✓</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { color: "#fafafa", fontSize: 22, fontWeight: "700" },
  selectedModelLabel: { color: "#38C9A8", fontSize: 13, marginTop: 2 },
  tabs: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#18181b",
  },
  tabActive: { backgroundColor: "#38C9A8" },
  tabText: { color: "#71717a", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#000" },
  searchContainer: { paddingHorizontal: 12, marginBottom: 8 },
  searchInput: {
    backgroundColor: "#18181b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: "#fafafa",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 80 },
  sectionHeader: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modelRow: {
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "transparent",
  },
  modelRowSelected: { borderColor: "#38C9A8", backgroundColor: "#0d1f1d" },
  modelRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  modelInfo: { flex: 1, marginRight: 8 },
  modelName: { color: "#fafafa", fontSize: 14, fontWeight: "600" },
  modelProvider: { color: "#71717a", fontSize: 12, marginTop: 2 },
  modelBadges: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: {
    backgroundColor: "#27272a",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeReasoning: { backgroundColor: "#1c2a2e" },
  badgeText: { color: "#a1a1aa", fontSize: 10, fontWeight: "600" },
  checkMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#38C9A8",
    justifyContent: "center",
    alignItems: "center",
  },
  checkMarkText: { color: "#000", fontSize: 13, fontWeight: "700" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#71717a", fontSize: 14 },
  startButton: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#38C9A8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
