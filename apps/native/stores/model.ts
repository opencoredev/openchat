import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Model {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  family?: string;
  description?: string;
  contextLength?: number;
  pricing?: { input: number; output: number };
  reasoning?: boolean;
  toolCall?: boolean;
  isPopular?: boolean;
  isFree?: boolean;
  modality?: string;
}

const POPULAR_MODEL_IDS = new Set([
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4.1",
  "openai/o3",
  "openai/o4-mini",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-4-maverick",
  "deepseek/deepseek-r1",
  "deepseek/deepseek-chat-v3-0324",
  "x-ai/grok-3",
  "x-ai/grok-3-mini",
  "mistralai/mistral-large-latest",
]);

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_KEY = "openchat_models_cache";

interface ModelStore {
  selectedModelId: string;
  models: Model[];
  isLoadingModels: boolean;
  modelCacheTimestamp: number;
  setSelectedModel: (id: string) => void;
  fetchModels: (baseUrl: string) => Promise<void>;
  getModelById: (id: string) => Model | undefined;
  popularModels: () => Model[];
  modelsByProvider: () => Record<string, Model[]>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  selectedModelId: "anthropic/claude-3.5-sonnet",
  models: [],
  isLoadingModels: false,
  modelCacheTimestamp: 0,

  setSelectedModel: (id) => set({ selectedModelId: id }),

  fetchModels: async (baseUrl: string) => {
    const { models, modelCacheTimestamp, isLoadingModels } = get();
    if (isLoadingModels) return;
    if (models.length > 0 && Date.now() - modelCacheTimestamp < CACHE_TTL_MS) return;

    // Try loading from AsyncStorage cache first
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { models: cachedModels, timestamp } = JSON.parse(cached) as { models: Model[]; timestamp: number };
        if (Date.now() - timestamp < CACHE_TTL_MS) {
          set({ models: cachedModels, modelCacheTimestamp: timestamp, isLoadingModels: false });
          return;
        }
      }
    } catch {
      // ignore cache errors
    }

    set({ isLoadingModels: true });
    try {
      // Fetch from the OpenRouter-proxied models endpoint on the web app
      const res = await fetch(`${baseUrl}/api/models`);
      if (!res.ok) throw new Error(`Models API ${res.status}`);
      const data = await res.json() as { data?: Array<{
        id: string; name?: string; description?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
        supported_parameters?: string[];
        architecture?: { modality?: string };
        top_provider?: { max_completion_tokens?: number };
      }> };
      const raw = data.data ?? [];
      const models: Model[] = raw
        .filter((m) => !!m.id)
        .map((m) => {
          const providerSlug = m.id.split("/")[0] ?? "unknown";
          const inputPrice = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
          const outputPrice = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
          const isFree = m.id.endsWith(":free") || (inputPrice === 0 && outputPrice === 0);
          const supportsReasoning =
            m.supported_parameters?.includes("reasoning") ||
            m.supported_parameters?.includes("include_reasoning") ||
            m.id.includes("-r1") ||
            m.id.includes("/o1") ||
            m.id.includes("/o3");
          return {
            id: m.id,
            name: m.name ?? m.id,
            provider: providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1).replace(/-/g, " "),
            providerId: providerSlug,
            description: m.description,
            contextLength: m.context_length,
            pricing: { input: inputPrice, output: outputPrice },
            modality: m.architecture?.modality,
            reasoning: !!supportsReasoning,
            toolCall: !!(m.supported_parameters?.includes("tools") || m.supported_parameters?.includes("tool_choice")),
            isPopular: POPULAR_MODEL_IDS.has(m.id),
            isFree,
          } satisfies Model;
        })
        .sort((a, b) => {
          if (a.isPopular && !b.isPopular) return -1;
          if (!a.isPopular && b.isPopular) return 1;
          return a.name.localeCompare(b.name);
        });
      const ts = Date.now();
      set({ models, modelCacheTimestamp: ts, isLoadingModels: false });
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ models, timestamp: ts })).catch(() => {});
    } catch (err) {
      console.error("[ModelStore] fetchModels failed:", err);
      set({ isLoadingModels: false });
    }
  },

  getModelById: (id) => get().models.find((m) => m.id === id),

  popularModels: () => get().models.filter((m) => m.isPopular),

  modelsByProvider: () => {
    const groups: Record<string, Model[]> = {};
    for (const m of get().models) {
      (groups[m.provider] ??= []).push(m);
    }
    return groups;
  },
}));
