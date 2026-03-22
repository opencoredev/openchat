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
  ActionSheetIOS,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { nanoid } from "nanoid/non-secure";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { useConvexUser } from "../../hooks/useConvexUser";
import { useModelStore } from "../../stores/model";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { ModelSwitcherChip } from "../../components/ModelSwitcherChip";

type Attachment = {
  storageId: Id<"_storage">;
  filename: string;
  contentType: string;
  size: number;
  url?: string;
};

type Message = {
  _id: string;
  role: string;
  content: string;
  modelId?: string;
  status?: string;
  createdAt: number;
  attachments?: Attachment[];
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { convexUserId } = useConvexUser();
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ storageId: Id<"_storage">; filename: string; contentType: string; size: number }>
  >([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const chatId = id as Id<"chats">;

  // ── Convex queries ───────────────────────────────────────────────
  const chat = useQuery(
    api.chats.get,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );
  const messages = useQuery(
    api.messages.list,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );
  const activeStreamJob = useQuery(
    api.streamJobs.getActiveStreamJob,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip"
  );

  // ── Mutations ────────────────────────────────────────────────────
  const sendMessage = useMutation(api.messages.send);
  const startStream = useMutation(api.streamJobs.startStream);
  const editAndRegenerate = useMutation(api.messages.editAndRegenerate);
  const retryMessage = useMutation(api.messages.retryMessage);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFileMetadata = useMutation(api.files.saveFileMetadata);

  // ── Header ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!chat) return;
    navigation.setOptions({
      title: chat.title || "Chat",
      headerRight: () => (
        <ModelSwitcherChip
          modelId={selectedModelId}
          onPress={() => router.push("/new")}
        />
      ),
    });
  }, [chat?.title, selectedModelId, navigation, router]);

  // ── Auto-scroll ──────────────────────────────────────────────────
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages?.length, activeStreamJob?.content]);

  // ── File upload ──────────────────────────────────────────────────
  const handleAttachFile = useCallback(async () => {
    if (!convexUserId) return;

    const pick = async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "image/*",
          "application/pdf",
          "text/*",
          "application/json",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await uploadFile(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream", asset.size ?? 0);
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Photo Library", "File"], cancelButtonIndex: 0 },
        async (index) => {
          if (index === 1) await pickImage();
          if (index === 2) await pick();
        }
      );
    } else {
      await pick();
    }
  }, [convexUserId, chatId]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() ?? "jpg";
    await uploadFile(asset.uri, `image.${ext}`, `image/${ext}`, asset.fileSize ?? 0);
  }, [convexUserId, chatId]);

  const uploadFile = useCallback(async (
    uri: string,
    filename: string,
    contentType: string,
    size: number
  ) => {
    if (!convexUserId) return;
    setIsUploadingFile(true);
    try {
      // 1. Get upload URL from Convex
      const uploadUrl = await generateUploadUrl({ userId: convexUserId, chatId });

      // 2. Upload the file bytes directly
      const response = await fetch(uri);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploadResponse.ok) throw new Error("Upload failed");
      const { storageId } = await uploadResponse.json() as { storageId: Id<"_storage"> };

      // 3. Save metadata
      await saveFileMetadata({
        userId: convexUserId,
        chatId,
        storageId,
        filename,
        contentType,
        size,
      });

      setPendingAttachments((prev) => [
        ...prev,
        { storageId, filename, contentType, size },
      ]);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setIsUploadingFile(false);
    }
  }, [convexUserId, chatId, generateUploadUrl, saveFileMetadata]);

  // ── Send message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !convexUserId || isSending) return;

    setInputText("");
    const attachments = [...pendingAttachments];
    setPendingAttachments([]);
    setIsSending(true);

    try {
      const clientMessageId = nanoid();
      const assistantClientId = nanoid();

      await sendMessage({
        chatId,
        userId: convexUserId,
        userMessage: {
          content,
          clientMessageId,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });

      const context = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
      context.push({ role: "user", content });

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
  }, [inputText, convexUserId, isSending, chatId, messages, pendingAttachments, sendMessage, startStream, selectedModelId]);

  // ── Edit & regenerate ────────────────────────────────────────────
  const handleEditSave = useCallback(async () => {
    if (!editingMessageId || !convexUserId) return;
    const content = editingContent.trim();
    if (!content) return;
    try {
      const { messageId } = await editAndRegenerate({
        chatId,
        userId: convexUserId,
        messageId: editingMessageId as Id<"messages">,
        newContent: content,
      });
      const assistantClientId = nanoid();
      const context = (messages ?? [])
        .filter((m) => m.createdAt <= (messages?.find((x) => x._id === editingMessageId)?.createdAt ?? 0))
        .map((m) => ({ role: m.role, content: m.role === "user" && m._id === editingMessageId ? content : m.content }));
      const provider = selectedModelId.startsWith("openai")
        ? "openai" : selectedModelId.startsWith("anthropic") ? "anthropic" : "openrouter";
      await startStream({
        chatId, userId: convexUserId, messageId: assistantClientId,
        model: selectedModelId, provider, messages: context,
      });
    } catch (err) {
      Alert.alert("Edit failed", err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setEditingMessageId(null);
      setEditingContent("");
    }
  }, [editingMessageId, editingContent, convexUserId, chatId, messages, editAndRegenerate, startStream, selectedModelId]);

  // ── Retry ────────────────────────────────────────────────────────
  const handleRetry = useCallback(async (messageId: string) => {
    if (!convexUserId) return;
    try {
      const { userContent } = await retryMessage({
        chatId, userId: convexUserId, messageId: messageId as Id<"messages">,
      });
      const assistantClientId = nanoid();
      const context = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
      const provider = selectedModelId.startsWith("openai")
        ? "openai" : selectedModelId.startsWith("anthropic") ? "anthropic" : "openrouter";
      await startStream({
        chatId, userId: convexUserId, messageId: assistantClientId,
        model: selectedModelId, provider, messages: context,
      });
    } catch (err) {
      Alert.alert("Retry failed", err instanceof Error ? err.message : "Unknown error.");
    }
  }, [convexUserId, chatId, messages, retryMessage, startStream, selectedModelId]);

  if (!convexUserId || messages === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#38C9A8" size="large" />
      </View>
    );
  }

  const isStreaming = !!activeStreamJob && ["running", "pending"].includes(activeStreamJob.status);
  const streamingContent = activeStreamJob?.content ?? "";

  const allMessages: Message[] = [
    ...(messages ?? []),
    ...(isStreaming ? [{
      _id: "__streaming__",
      role: "assistant",
      content: streamingContent || "…",
      modelId: selectedModelId,
      status: "streaming",
      createdAt: Date.now(),
    }] : []),
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
          <MessageBubble
            message={item}
            onEdit={(id, content) => {
              setEditingMessageId(id);
              setEditingContent(content);
            }}
            onRetry={(id) => handleRetry(id)}
          />
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <View style={styles.attachmentBar}>
          {pendingAttachments.map((a, i) => (
            <View key={i} style={styles.attachmentChip}>
              <Ionicons name="document-outline" size={14} color="#38C9A8" />
              <Text style={styles.attachmentChipText} numberOfLines={1}>{a.filename}</Text>
              <TouchableOpacity onPress={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}>
                <Ionicons name="close" size={14} color="#71717a" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Edit mode banner */}
      {editingMessageId && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>Editing message</Text>
          <TouchableOpacity onPress={() => { setEditingMessageId(null); setEditingContent(""); }}>
            <Text style={styles.editBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttachFile}
          disabled={isUploadingFile}
        >
          {isUploadingFile
            ? <ActivityIndicator size="small" color="#71717a" />
            : <Ionicons name="attach" size={22} color="#71717a" />}
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={editingMessageId ? editingContent : inputText}
          onChangeText={editingMessageId ? setEditingContent : setInputText}
          placeholder={editingMessageId ? "Edit message…" : "Message…"}
          placeholderTextColor="#52525b"
          multiline
          maxLength={32000}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            (!(editingMessageId ? editingContent.trim() : inputText.trim()) || isSending || isStreaming) && styles.sendButtonDisabled,
          ]}
          onPress={editingMessageId ? handleEditSave : handleSend}
          disabled={!(editingMessageId ? editingContent.trim() : inputText.trim()) || isSending || isStreaming}
        >
          {isSending || isStreaming
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.sendButtonText}>{editingMessageId ? "✓" : "↑"}</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  onEdit,
  onRetry,
}: {
  message: Message;
  onEdit: (id: string, content: string) => void;
  onRetry: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const [showActions, setShowActions] = useState(false);

  const handleLongPress = () => {
    if (isStreaming) return;
    if (isUser) {
      Alert.alert("Message", undefined, [
        { text: "Edit & Regenerate", onPress: () => onEdit(message._id, message.content) },
        { text: "Retry", onPress: () => onRetry(message._id) },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert("Message", undefined, [
        { text: "Retry", onPress: () => onRetry(message._id) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}
      onLongPress={handleLongPress}
      activeOpacity={0.85}
      delayLongPress={400}
    >
      <View style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
        isStreaming && styles.bubbleStreaming,
      ]}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <View style={styles.attachmentList}>
            {message.attachments.map((a, i) => (
              <View key={i} style={styles.attachmentItem}>
                <Ionicons name="document-outline" size={14} color="#38C9A8" />
                <Text style={styles.attachmentName} numberOfLines={1}>{a.filename}</Text>
              </View>
            ))}
          </View>
        )}
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
    </TouchableOpacity>
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
  attachmentList: { marginBottom: 8, gap: 4 },
  attachmentItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  attachmentName: { color: "#38C9A8", fontSize: 12, flex: 1 },
  attachmentBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#18181b",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#27272a",
    maxWidth: 200,
  },
  attachmentChipText: { color: "#fafafa", fontSize: 12, flex: 1 },
  editBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#1c2a2e",
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  editBannerText: { color: "#38C9A8", fontSize: 13, fontWeight: "600" },
  editBannerCancel: { color: "#71717a", fontSize: 13 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    backgroundColor: "#09090b",
    gap: 6,
  },
  attachButton: { width: 36, height: 40, justifyContent: "center", alignItems: "center" },
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#38C9A8",
    justifyContent: "center", alignItems: "center",
  },
  sendButtonDisabled: { backgroundColor: "#27272a" },
  sendButtonText: { color: "#000", fontSize: 20, fontWeight: "700", lineHeight: 24 },
});
