import { create } from "zustand";

/**
 * Per-chat send options — mirrors the web app's toolbar state.
 *
 * webSearchEnabled  → passed as options.enableWebSearch to startStream
 * reasoningEffort   → passed as options.reasoningEffort to startStream
 * reasoningEnabled  → derived from reasoningEffort !== "none"
 */

export type ReasoningEffort = "none" | "low" | "medium" | "high";

interface ChatOptionsState {
  webSearchEnabled: boolean;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort;

  toggleWebSearch: () => void;
  setWebSearchEnabled: (v: boolean) => void;

  setReasoningEnabled: (v: boolean) => void;
  toggleReasoning: () => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
}

export const useChatOptions = create<ChatOptionsState>((set, get) => ({
  webSearchEnabled: false,
  reasoningEnabled: false,
  reasoningEffort: "none",

  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
  setWebSearchEnabled: (v) => set({ webSearchEnabled: v }),

  setReasoningEnabled: (v) =>
    set({ reasoningEnabled: v, reasoningEffort: v ? "medium" : "none" }),
  toggleReasoning: () => {
    const next = !get().reasoningEnabled;
    set({ reasoningEnabled: next, reasoningEffort: next ? "medium" : "none" });
  },
  setReasoningEffort: (effort) =>
    set({ reasoningEffort: effort, reasoningEnabled: effort !== "none" }),
}));
