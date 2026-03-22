import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { useConvexUser } from "../../hooks/useConvexUser";
import { encryptApiKey } from "../../lib/encryption";

export default function BYOKScreen() {
  const { convexUserId, convexUser } = useConvexUser();
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const hasKey = convexUser?.hasOpenRouterKey ?? false;

  const saveKey = useMutation(api.userApiKeys.saveOpenRouterKey);
  const removeKey = useMutation(api.userApiKeys.removeOpenRouterKey);

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      Alert.alert("Missing key", "Please enter your OpenRouter API key.");
      return;
    }
    if (!trimmed.startsWith("sk-or-v1-")) {
      Alert.alert("Invalid key", "OpenRouter API keys start with sk-or-v1-.");
      return;
    }
    if (!convexUserId) return;

    setIsSaving(true);
    try {
      const encrypted = encryptApiKey(trimmed);
      await saveKey({ userId: convexUserId, encryptedKey: encrypted });
      setApiKey("");
      Alert.alert("Saved", "Your OpenRouter API key has been saved.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save key.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = () => {
    if (!convexUserId) return;
    Alert.alert(
      "Remove API Key",
      "Are you sure you want to remove your OpenRouter API key? You will switch to the free tier.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsRemoving(true);
            try {
              await removeKey({ userId: convexUserId });
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to remove key.");
            } finally {
              setIsRemoving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bring Your Own Key</Text>
      <Text style={styles.description}>
        Connect your own OpenRouter API key to unlock unlimited usage across all
        350+ models. Without a key, you get a 10¢/day free allowance.
      </Text>

      <TouchableOpacity
        onPress={() => Linking.openURL("https://openrouter.ai/settings/keys")}
      >
        <Text style={styles.link}>Get an API key from OpenRouter →</Text>
      </TouchableOpacity>

      {/* Current status */}
      <View style={styles.statusCard}>
        <View style={[styles.statusDot, hasKey ? styles.statusDotActive : styles.statusDotInactive]} />
        <Text style={styles.statusText}>
          {hasKey ? "API key connected" : "No API key — using free tier"}
        </Text>
      </View>

      {/* Input */}
      <Text style={styles.label}>OpenRouter API Key</Text>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="sk-or-v1-…"
        placeholderTextColor="#52525b"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />

      <TouchableOpacity
        style={[styles.saveButton, (isSaving || !apiKey.trim()) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={isSaving || !apiKey.trim()}
      >
        {isSaving ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.saveButtonText}>Save Key</Text>
        )}
      </TouchableOpacity>

      {hasKey && (
        <TouchableOpacity
          style={[styles.removeButton, isRemoving && styles.removeButtonDisabled]}
          onPress={handleRemove}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <ActivityIndicator color="#f87171" />
          ) : (
            <Text style={styles.removeButtonText}>Remove Key</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoText}>
          Your key is stored encrypted in Convex and is only used server-side to
          make API requests on your behalf.  It is never exposed to other users
          or sent to third parties.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "700", marginBottom: 10 },
  description: { color: "#a1a1aa", fontSize: 15, lineHeight: 22, marginBottom: 12 },
  link: { color: "#38C9A8", fontSize: 14, marginBottom: 20, textDecorationLine: "underline" },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    gap: 10,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotActive: { backgroundColor: "#38C9A8" },
  statusDotInactive: { backgroundColor: "#52525b" },
  statusText: { color: "#fafafa", fontSize: 14 },
  label: { color: "#a1a1aa", fontSize: 13, marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 14,
    color: "#fafafa",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#27272a",
    marginBottom: 14,
    fontFamily: "monospace",
  },
  saveButton: {
    backgroundColor: "#38C9A8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: "#000", fontSize: 15, fontWeight: "700" },
  removeButton: {
    borderWidth: 1,
    borderColor: "#3f1d1d",
    backgroundColor: "#1c0f0f",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  removeButtonDisabled: { opacity: 0.5 },
  removeButtonText: { color: "#f87171", fontSize: 15, fontWeight: "600" },
  infoCard: {
    backgroundColor: "#111113",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  infoTitle: { color: "#fafafa", fontWeight: "700", fontSize: 14, marginBottom: 6 },
  infoText: { color: "#71717a", fontSize: 13, lineHeight: 20 },
});
