import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
  Alert, ActionSheetIOS, Image, Share,
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
import { useChatOptions } from "../../stores/chat-options";
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
  error?: { code: string; message: string } | null;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { convexUserId } = useConvexUser();
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const chatOptions = useChatOptions();

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

  // ─── Queries ───────────────────────────────────────────────────────────────
  const chat = useQuery(api.chats.get,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip");
  const messages = useQuery(api.messages.list,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip");
  const activeStreamJob = useQuery(api.streamJobs.getActiveStreamJob,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip");
  const searchAvailability = useQuery(api.search.getSearchAvailability,
    convexUserId ? { userId: convexUserId } : "skip");

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const sendMessage      = useMutation(api.messages.send);
  const startStream      = useMutation(api.streamJobs.startStream);
  const editAndRegen     = useMutation(api.messages.editAndRegenerate);
  const retryMsg         = useMutation(api.messages.retryMessage);
  const generateUpload   = useMutation(api.files.generateUploadUrl);
  const saveFileMeta     = useMutation(api.files.saveFileMetadata);
  const getExportData    = useQuery(api.chatExport.getChatExportData,
    convexUserId && chatId ? { chatId, userId: convexUserId } : "skip");

  // Web search: disable toggle if backend says it's not configured
  const searchConfigured = searchAvailability?.configured ?? true;
  const searchLimitReached = searchAvailability ? !searchAvailability.canSearch : false;
  const searchRemaining = searchAvailability?.remaining ?? 0;

  // ─── Header ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chat) return;
    navigation.setOptions({
      title: chat.title || "Chat",
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginRight: 4 }}>
          <ModelSwitcherChip modelId={selectedModelId} onPress={() => router.push("/new")} />
        </View>
      ),
    });
  }, [chat?.title, selectedModelId, navigation, router]);

  // ─── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (messages?.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages?.length, activeStreamJob?.content]);

  // ─── File upload ───────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (uri: string, filename: string, contentType: string, size: number) => {
    if (!convexUserId) return;
    setIsUploadingFile(true);
    try {
      const uploadUrl = await generateUpload({ userId: convexUserId, chatId });
      const res = await fetch(uri);
      const blob = await res.blob();
      const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: blob });
      if (!up.ok) throw new Error("Upload failed");
      const { storageId } = await up.json() as { storageId: Id<"_storage"> };
      await saveFileMeta({ userId: convexUserId, chatId, storageId, filename, contentType, size });
      setPendingAttachments((prev) => [...prev, { storageId, filename, contentType, size }]);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not upload.");
    } finally {
      setIsUploadingFile(false);
    }
  }, [convexUserId, chatId, generateUpload, saveFileMeta]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission required", "Please allow photo library access."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() ?? "jpg";
    await uploadFile(asset.uri, `image.${ext}`, `image/${ext}`, asset.fileSize ?? 0);
  }, [uploadFile]);

  const handleAttachFile = useCallback(async () => {
    const pick = async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf", "text/*"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      await uploadFile(a.uri, a.name, a.mimeType ?? "application/octet-stream", a.size ?? 0);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Photo Library", "File"], cancelButtonIndex: 0 },
        async (i) => { if (i === 1) await pickImage(); if (i === 2) await pick(); }
      );
    } else { await pick(); }
  }, [pickImage, uploadFile]);

  // ─── Send ──────────────────────────────────────────────────────────────────
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
      await sendMessage({ chatId, userId: convexUserId,
        userMessage: { content, clientMessageId, attachments: attachments.length ? attachments : undefined } });
      const context = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
      context.push({ role: "user", content });
      const provider = selectedModelId.startsWith("openai") ? "openai"
        : selectedModelId.startsWith("anthropic") ? "anthropic" : "openrouter";
      await startStream({
        chatId, userId: convexUserId, messageId: assistantClientId,
        model: selectedModelId, provider, messages: context,
        options: {
          enableWebSearch: chatOptions.webSearchEnabled,
          enableReasoning: chatOptions.reasoningEnabled,
          reasoningEffort: chatOptions.reasoningEffort !== "none" ? chatOptions.reasoningEffort : undefined,
        },
      });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to send.");
      setInputText(content);
    } finally { setIsSending(false); }
  }, [inputText, convexUserId, isSending, chatId, messages, pendingAttachments, sendMessage, startStream, selectedModelId, chatOptions]);

  // ─── Edit ──────────────────────────────────────────────────────────────────
  const handleEditSave = useCallback(async () => {
    if (!editingMessageId || !convexUserId) return;
    const content = editingContent.trim();
    if (!content) return;
    try {
      await editAndRegen({ chatId, userId: convexUserId, messageId: editingMessageId as Id<"messages">, newContent: content });
      const assistantClientId = nanoid();
      const editedMsg = messages?.find((m) => m._id === editingMessageId);
      const context = (messages ?? [])
        .filter((m) => m.createdAt <= (editedMsg?.createdAt ?? 0))
        .map((m) => ({ role: m.role, content: m._id === editingMessageId ? content : m.content }));
      const provider = selectedModelId.startsWith("openai") ? "openai"
        : selectedModelId.startsWith("anthropic") ? "anthropic" : "openrouter";
      await startStream({ chatId, userId: convexUserId, messageId: assistantClientId, model: selectedModelId, provider, messages: context,
        options: { enableWebSearch: chatOptions.webSearchEnabled, enableReasoning: chatOptions.reasoningEnabled, reasoningEffort: chatOptions.reasoningEffort !== "none" ? chatOptions.reasoningEffort : undefined } });
    } catch (err) { Alert.alert("Edit failed", err instanceof Error ? err.message : "Unknown error."); }
    finally { setEditingMessageId(null); setEditingContent(""); }
  }, [editingMessageId, editingContent, convexUserId, chatId, messages, editAndRegen, startStream, selectedModelId, chatOptions]);

  // ─── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async (messageId: string) => {
    if (!convexUserId) return;
    try {
      await retryMsg({ chatId, userId: convexUserId, messageId: messageId as Id<"messages"> });
      const assistantClientId = nanoid();
      const context = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
      const provider = selectedModelId.startsWith("openai") ? "openai" : selectedModelId.startsWith("anthropic") ? "anthropic" : "openrouter";
      await startStream({ chatId, userId: convexUserId, messageId: assistantClientId, model: selectedModelId, provider, messages: context,
        options: { enableWebSearch: chatOptions.webSearchEnabled } });
    } catch (err) { Alert.alert("Retry failed", err instanceof Error ? err.message : "Unknown error."); }
  }, [convexUserId, chatId, messages, retryMsg, startStream, selectedModelId, chatOptions]);

  // ─── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!getExportData) return;
    const { chat: c, messages: msgs } = getExportData;
    const lines: string[] = [
      `# ${c.title}`,
      `Exported from OpenChat on ${new Date(c.createdAt).toLocaleDateString()}`,
      "",
    ];
    for (const msg of msgs) {
      const role = msg.role === "user" ? "You" : "Assistant";
      lines.push(`## ${role}`);
      lines.push(msg.content);
      lines.push("");
    }
    const markdown = lines.join("\n");
    try {
      await Share.share({ message: markdown, title: c.title });
    } catch {
      // user cancelled
    }
  }, [getExportData]);

  if (!convexUserId || messages === undefined) {
    return <View style={styles.centered}><ActivityIndicator color="#38C9A8" size="large" /></View>;
  }

  const isStreaming = !!activeStreamJob && ["running", "pending"].includes(activeStreamJob.status);
  const streamingContent = activeStreamJob?.content ?? "";

  const allMessages: Message[] = [
    ...(messages ?? []),
    ...(isStreaming ? [{ _id: "__streaming__", role: "assistant", content: streamingContent || "…",
      modelId: selectedModelId, status: "streaming", createdAt: Date.now() }] : []),
  ];

  // Reasoning capability for selected model
  const currentModel = useModelStore.getState().getModelById(selectedModelId);
  const supportsReasoning = currentModel?.reasoning === true;

  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={88}>

      <FlatList ref={flatListRef} data={allMessages} keyExtractor={(item) => item._id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <MessageBubble message={item}
            onEdit={(mid, c) => { setEditingMessageId(mid); setEditingContent(c); }}
            onRetry={handleRetry} />
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })} />

      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <View style={styles.attachBar}>
          {pendingAttachments.map((a, i) => (
            <View key={i} style={styles.attachChip}>
              <Ionicons name="document-outline" size={13} color="#38C9A8" />
              <Text style={styles.attachChipText} numberOfLines={1}>{a.filename}</Text>
              <TouchableOpacity onPress={() => setPendingAttachments((p) => p.filter((_, j) => j !== i))}>
                <Ionicons name="close" size={13} color="#71717a" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Edit banner */}
      {editingMessageId && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>Editing message</Text>
          <TouchableOpacity onPress={() => { setEditingMessageId(null); setEditingContent(""); }}>
            <Text style={styles.editBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Toolbar chips */}
      <View style={styles.toolbar}>
        {/* Web search toggle */}
        <TouchableOpacity
          style={[styles.toolChip, chatOptions.webSearchEnabled && styles.toolChipActive,
            (!searchConfigured || searchLimitReached) && styles.toolChipDisabled]}
          onPress={() => {
            if (!searchConfigured) { Alert.alert("Web search unavailable", "The server is not configured for web search."); return; }
            if (searchLimitReached && !chatOptions.webSearchEnabled) { Alert.alert("Daily limit reached", "You've used all your daily web searches."); return; }
            chatOptions.toggleWebSearch();
          }}
          disabled={!searchConfigured && !chatOptions.webSearchEnabled}
        >
          <Ionicons name="globe-outline" size={14}
            color={chatOptions.webSearchEnabled ? "#000" : "#71717a"} />
          <Text style={[styles.toolChipText, chatOptions.webSearchEnabled && styles.toolChipTextActive]}>
            {chatOptions.webSearchEnabled
              ? `Search (${searchRemaining})`
              : "Web Search"}
          </Text>
        </TouchableOpacity>

        {/* Reasoning toggle — only shown for models that support it */}
        {supportsReasoning && (
          <TouchableOpacity
            style={[styles.toolChip, chatOptions.reasoningEnabled && styles.toolChipActive]}
            onPress={chatOptions.toggleReasoning}
          >
            <Ionicons name="bulb-outline" size={14}
              color={chatOptions.reasoningEnabled ? "#000" : "#71717a"} />
            <Text style={[styles.toolChipText, chatOptions.reasoningEnabled && styles.toolChipTextActive]}>
              Reasoning
            </Text>
          </TouchableOpacity>
        )}

        {/* Effort selector — shown when reasoning is ON and model supports effort levels */}
        {supportsReasoning && chatOptions.reasoningEnabled && (
          <TouchableOpacity
            style={[styles.toolChip, styles.toolChipEffort]}
            onPress={() => {
              const efforts: Array<{ label: string; value: typeof chatOptions.reasoningEffort }> = [
                { label: "Low", value: "low" },
                { label: "Medium", value: "medium" },
                { label: "High", value: "high" },
              ];
              if (Platform.OS === "ios") {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: ["Cancel", ...efforts.map((e) => e.label)], cancelButtonIndex: 0 },
                  (i) => { if (i > 0) chatOptions.setReasoningEffort(efforts[i - 1]!.value); }
                );
              } else {
                Alert.alert("Reasoning effort", undefined,
                  [...efforts.map((e) => ({ text: e.label, onPress: () => chatOptions.setReasoningEffort(e.value) })),
                   { text: "Cancel", style: "cancel" as const }]);
              }
            }}
          >
            <Text style={styles.toolChipTextEffort}>
              {chatOptions.reasoningEffort.charAt(0).toUpperCase() + chatOptions.reasoningEffort.slice(1)}
            </Text>
            <Ionicons name="chevron-down" size={11} color="#38C9A8" />
          </TouchableOpacity>
        )}

        {/* Export button */}
        {getExportData && (
          <TouchableOpacity style={[styles.toolChip, styles.toolChipExport]} onPress={handleExport}>
            <Ionicons name="share-outline" size={14} color="#71717a" />
          </TouchableOpacity>
        )}
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachButton} onPress={handleAttachFile} disabled={isUploadingFile}>
          {isUploadingFile
            ? <ActivityIndicator size="small" color="#71717a" />
            : <Ionicons name="attach" size={22} color="#71717a" />}
        </TouchableOpacity>
        <TextInput style={styles.textInput}
          value={editingMessageId ? editingContent : inputText}
          onChangeText={editingMessageId ? setEditingContent : setInputText}
          placeholder={editingMessageId ? "Edit message…" : "Message…"}
          placeholderTextColor="#52525b"
          multiline maxLength={32000} />
        <TouchableOpacity
          style={[styles.sendButton,
            (!(editingMessageId ? editingContent.trim() : inputText.trim()) || isSending || isStreaming) && styles.sendButtonDisabled]}
          onPress={editingMessageId ? handleEditSave : handleSend}
          disabled={!(editingMessageId ? editingContent.trim() : inputText.trim()) || isSending || isStreaming}>
          {isSending || isStreaming
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.sendButtonText}>{editingMessageId ? "✓" : "↑"}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── MessageBubble ──────────────────────────────────────────────────────────
function MessageBubble({ message, onEdit, onRetry }: {
  message: Message;
  onEdit: (id: string, content: string) => void;
  onRetry: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = !!message.error;

  const handleLongPress = () => {
    if (isStreaming) return;
    const buttons: Array<{ text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }> = [];
    if (isUser) {
      buttons.push({ text: "Edit & Regenerate", onPress: () => onEdit(message._id, message.content) });
      buttons.push({ text: "Retry", onPress: () => onRetry(message._id) });
    } else {
      buttons.push({ text: "Retry", onPress: () => onRetry(message._id) });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", undefined, buttons);
  };

  return (
    <TouchableOpacity style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}
      onLongPress={handleLongPress} activeOpacity={0.85} delayLongPress={400}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant,
        isStreaming && styles.bubbleStreaming, isError && styles.bubbleError]}>

        {/* Image attachments — inline previews */}
        {message.attachments?.filter((a) => a.contentType.startsWith("image/")).map((a, i) => (
          a.url ? (
            <Image key={i} source={{ uri: a.url }}
              style={styles.attachImage}
              resizeMode="cover" />
          ) : null
        ))}

        {/* Non-image attachments — file chips */}
        {message.attachments?.filter((a) => !a.contentType.startsWith("image/")).map((a, i) => (
          <View key={i} style={styles.attachItem}>
            <Ionicons name="document-outline" size={14} color="#38C9A8" />
            <Text style={styles.attachName} numberOfLines={1}>{a.filename}</Text>
          </View>
        ))}

        <MarkdownMessage content={message.content} role={isUser ? "user" : "assistant"} />

        {/* Error display */}
        {isError && message.error && (
          <View style={styles.errorChip}>
            <Ionicons name="alert-circle-outline" size={14} color="#f87171" />
            <Text style={styles.errorText} numberOfLines={2}>{message.error.message}</Text>
          </View>
        )}

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
  bubbleError: { borderWidth: 1, borderColor: "#3f1d1d" },
  streamingDot: { marginTop: 6 },
  modelLabel: { color: "#52525b", fontSize: 11, marginTop: 4, marginLeft: 4 },
  attachImage: { width: "100%", height: 180, borderRadius: 8, marginBottom: 8 },
  attachItem: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  attachName: { color: "#38C9A8", fontSize: 12, flex: 1 },
  errorChip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  errorText: { color: "#f87171", fontSize: 12, flex: 1 },
  attachBar: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  attachChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#18181b", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#27272a", maxWidth: 200,
  },
  attachChipText: { color: "#fafafa", fontSize: 12, flex: 1 },
  editBanner: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: "#1c2a2e", borderTopWidth: 1, borderTopColor: "#27272a",
  },
  editBannerText: { color: "#38C9A8", fontSize: 13, fontWeight: "600" },
  editBannerCancel: { color: "#71717a", fontSize: 13 },
  // Toolbar
  toolbar: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2, gap: 6,
    borderTopWidth: 1, borderTopColor: "#27272a",
  },
  toolChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#18181b", borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#27272a",
  },
  toolChipActive: { backgroundColor: "#38C9A8", borderColor: "#38C9A8" },
  toolChipDisabled: { opacity: 0.4 },
  toolChipEffort: { borderColor: "#38C9A8", backgroundColor: "#0d1f1d" },
  toolChipExport: { marginLeft: "auto" },
  toolChipText: { color: "#71717a", fontSize: 12, fontWeight: "600" },
  toolChipTextActive: { color: "#000" },
  toolChipTextEffort: { color: "#38C9A8", fontSize: 12, fontWeight: "600" },
  // Input bar
  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 8, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#27272a",
    backgroundColor: "#09090b", gap: 6,
  },
  attachButton: { width: 36, height: 40, justifyContent: "center", alignItems: "center" },
  textInput: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: "#18181b", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: "#fafafa", fontSize: 15,
    borderWidth: 1, borderColor: "#27272a",
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#38C9A8",
    justifyContent: "center", alignItems: "center",
  },
  sendButtonDisabled: { backgroundColor: "#27272a" },
  sendButtonText: { color: "#000", fontSize: 20, fontWeight: "700", lineHeight: 24 },
});
