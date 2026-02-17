import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ChatTitleLength = "short" | "standard" | "long";
type ChatTitleGenerationMode = "auto" | "manual";

interface ChatTitleState {
	length: ChatTitleLength;
	setLength: (length: ChatTitleLength) => void;
	confirmDelete: boolean;
	setConfirmDelete: (confirm: boolean) => void;
	generatingChatIds: Record<string, ChatTitleGenerationMode>;
	setGenerating: (chatId: string, generating: boolean, mode?: ChatTitleGenerationMode) => void;
}

export const useChatTitleStore = create<ChatTitleState>()(
	devtools(
		persist(
			(set) => ({
				length: "standard",
				setLength: (length) => set({ length }, false, "chatTitle/setLength"),
				confirmDelete: true,
				setConfirmDelete: (confirm) =>
					set({ confirmDelete: confirm }, false, "chatTitle/setConfirmDelete"),
				generatingChatIds: {},
				setGenerating: (chatId, generating, mode = "auto") =>
					set(
						(state) => {
							const next = { ...state.generatingChatIds };
							if (generating) {
								next[chatId] = mode;
							} else {
								delete next[chatId];
							}
							return { generatingChatIds: next };
						},
						false,
						"chatTitle/setGenerating",
					),
			}),
			{
				name: "chat-title-store",
				partialize: (state) => ({
					length: state.length,
					confirmDelete: state.confirmDelete,
				}),
			},
		),
		{ name: "chat-title-store" },
	),
);
