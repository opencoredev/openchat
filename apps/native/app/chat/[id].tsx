import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { nanoid } from "nanoid/non-secure";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { useConvexUser } from "../../hooks/useConvexUser";
import { useModelStore } from "../../stores/model";
import { MarkdownMessage } from "../../components/MarkdownMessage";

type Message = {
  _id: string;
  role: string;
  content: string;
  modelId?: string;
  status?: string;
  createdAt: number;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { convexUserId } = useConvexUser();
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // ── Convex queries ──────────────────────────────────────────────────────────
  const chatId = id as Id<"chats">;

  const chat = useQuery(
    api.chats.get,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );

  const messages = useQuery(
    api.messages.list,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );

  // Real-time streaming job — live updates as the AI generates
  const activeStreamJob = useQuery(
    api.streamJobs.getActiveStreamJob,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const sendMessage = useMutation(api.messages.send);
  const startStream = useMutation(api.streamJobs.startStream);

  // ── Set header title from chat ───────────────────────────────────────────────
  useEffect(() => {
    if (chat?.title) {
      navigation.setOptions({ title: chat.title });
    }
  }, [chat?.title, navigation]);

  // ── Auto-scroll on new messages ──────────────────────────────────────────────
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages?.length, activeStreamJob?.content]);

  // ── Send a message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !convexUserId || isSending) return;

    setInputText("");
    setIsSending(true);

    try {
      const clientMessageId = nanoid();
      const assistantClientId = nanoid();

      // 1. Persist the user message immediately
      await sendMessage({
        chatId,
        userId: convexUserId,
        userMessage: { content, clientMessageId },
      });

      // 2. Build context for the stream
      const context = (messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      context.push({ role: "user", content });

      // 3. Start the Convex streaming job
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
        messages: context,
      });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to send message.");
      setInputText(content);
    } finally {
      setIsSending(false);
    }
  }, [inputText, convexUserId, isSending, chatId, messages, sendMessage, startStream, selectedModelId]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!convexUserId || messages === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#38C9A8" size="large" />
      </View>
    );
  }

  // Merge persisted messages with live streaming content
  const streamingContent = activeStreamJob?.content ?? "";
  const isStreaming = !!activeStreamJob && ["running", "pending"].includes(activeStreamJob.status);

  const allMessages: Message[] = [
    ...(messages ?? []),
    // Show streaming placeholder while the response is in-flight
    ...(isStreaming
      ? [{
          _id: "__streaming__",
          role: "assistant",
          content: streamingContent || "…",
          modelId: selectedModelId,
          status: "streaming",
          createdAt: Date.now(),
        }]
      : []),
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={88}
    >
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <MessageBubble message={item} />
        )}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message…"
          placeholderTextColor="#52525b"
          multiline
          maxLength={32000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || isSending || isStreaming) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending || isStreaming}
        >
          {isSending || isStreaming ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          isStreaming && styles.bubbleStreaming,
        ]}
      >
        <MarkdownMessage content={message.content} role={isUser ? "user" : "assistant"} />
        {isStreaming && (
          <View style={styles.streamingDot}>
            <ActivityIndicator size="small" color="#38C9A8" />
          </View>
        )}
      </View>
      {!isUser && message.modelId && (
        <Text style={styles.modelLabel}>
          {message.modelId.split("/").pop() ?? message.modelId}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#09090b" },
  messageList: { padding: 12, paddingBottom: 8 },
  bubbleRow: { marginBottom: 12, maxWidth: "88%", alignSelf: "flex-start" },
  bubbleRowUser: { alignSelf: "flex-end" },
  bubble: { borderRadius: 14, padding: 12 },
  bubbleUser: { backgroundColor: "#27272a" },
  bubbleAssistant: { backgroundColor: "transparent" },
  bubbleStreaming: { opacity: 0.85 },
  streamingDot: { marginTop: 6 },
  modelLabel: { color: "#52525b", fontSize: 11, marginTop: 4, marginLeft: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    backgroundColor: "#09090b",
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#18181b",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fafafa",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#38C9A8",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: { backgroundColor: "#27272a" },
  sendButtonText: { color: "#000", fontSize: 20, fontWeight: "700", lineHeight: 24 },
});
