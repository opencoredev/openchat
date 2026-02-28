/**
 * Multi-model comparison store.
 *
 * Tracks whether compare mode is enabled and which secondary model
 * the user has selected for side-by-side comparison.
 */

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface CompareState {
	/** Whether multi-model compare mode is active */
	compareEnabled: boolean;
	/** The secondary model to compare against the primary model */
	compareModelId: string;
	/** The active compare group ID for the current streaming session */
	activeCompareGroup: string | null;
	/** Enable or disable compare mode */
	setCompareEnabled: (enabled: boolean) => void;
	/** Toggle compare mode */
	toggleCompare: () => void;
	/** Set the secondary comparison model */
	setCompareModel: (modelId: string) => void;
	/** Set the active compare group (used during streaming) */
	setActiveCompareGroup: (group: string | null) => void;
}

export const useCompareStore = create<CompareState>()(
	devtools(
		persist(
			(set, get) => ({
				compareEnabled: false,
				compareModelId: "google/gemini-2.5-flash",
				activeCompareGroup: null,

				setCompareEnabled: (enabled) => {
					set({ compareEnabled: enabled }, false, "compare/setEnabled");
				},

				toggleCompare: () => {
					const next = !get().compareEnabled;
					set({ compareEnabled: next }, false, "compare/toggle");
				},

				setCompareModel: (modelId) => {
					set({ compareModelId: modelId }, false, "compare/setModel");
				},

				setActiveCompareGroup: (group) => {
					set({ activeCompareGroup: group }, false, "compare/setActiveGroup");
				},
			}),
			{
				name: "compare-store",
				partialize: (state) => ({
					compareEnabled: state.compareEnabled,
					compareModelId: state.compareModelId,
				}),
			},
		),
		{ name: "compare-store" },
	),
);
