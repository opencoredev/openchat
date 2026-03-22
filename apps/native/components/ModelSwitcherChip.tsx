import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useModelStore } from "../stores/model";

interface ModelSwitcherChipProps {
  modelId: string;
  onPress: () => void;
}

/**
 * Small tappable chip shown in the chat header.
 * Displays the short model name and navigates to the model picker on tap.
 */
export function ModelSwitcherChip({ modelId, onPress }: ModelSwitcherChipProps) {
  const modelName = useModelStore((s) => s.getModelById(modelId)?.name ?? modelId);
  // Shorten to the part after the last slash + strip variant suffixes
  const shortName = modelName.split("/").pop()
    ?.replace(/:free$/, "")
    ?.replace(/-latest$/, "")
    ?? modelName;

  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.text} numberOfLines={1}>{shortName}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#27272a",
    maxWidth: 160,
  },
  text: { color: "#38C9A8", fontSize: 12, fontWeight: "600" },
});
