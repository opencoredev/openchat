import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

export type ThemePreference = "system" | "dark" | "light";

const THEME_KEY = "openchat_theme";

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => Promise<void>;
  loadPreference: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: "system",

  setPreference: async (p) => {
    set({ preference: p });
    await AsyncStorage.setItem(THEME_KEY, p);
  },

  loadPreference: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light" || stored === "system") {
        set({ preference: stored });
      }
    } catch {
      // ignore
    }
  },
}));

/**
 * Resolves the effective color scheme: returns "dark" or "light".
 * Use this everywhere you need to branch on dark vs. light.
 */
export function useEffectiveTheme(): "dark" | "light" {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useColorScheme() ?? "dark";
  if (preference === "system") return systemScheme;
  return preference;
}
