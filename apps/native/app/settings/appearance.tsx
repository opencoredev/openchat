import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeStore, type ThemePreference } from "../../stores/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: string; description: string }[] = [
  { value: "system", label: "System", icon: "phone-portrait-outline", description: "Follow the device setting" },
  { value: "dark", label: "Dark", icon: "moon-outline", description: "Always use dark mode" },
  { value: "light", label: "Light", icon: "sunny-outline", description: "Always use light mode" },
];

export default function AppearanceScreen() {
  const { preference, setPreference } = useThemeStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Appearance</Text>
      <Text style={styles.description}>
        Choose how OpenChat looks. The System option follows your device's dark/light mode setting.
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => {
          const isSelected = preference === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => setPreference(opt.value)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
                <Ionicons
                  name={opt.icon as "moon-outline"}
                  size={22}
                  color={isSelected ? "#000" : "#71717a"}
                />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color="#38C9A8" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  description: { color: "#a1a1aa", fontSize: 14, lineHeight: 20, marginBottom: 24 },
  options: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionSelected: { borderColor: "#38C9A8", backgroundColor: "#0d1f1d" },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#27272a",
    justifyContent: "center", alignItems: "center",
  },
  iconWrapSelected: { backgroundColor: "#38C9A8" },
  optionText: { flex: 1 },
  optionLabel: { color: "#a1a1aa", fontSize: 15, fontWeight: "600" },
  optionLabelSelected: { color: "#fafafa" },
  optionDesc: { color: "#52525b", fontSize: 12, marginTop: 2 },
});
