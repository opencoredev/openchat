import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@server/convex/_generated/api";
import type { Id } from "@server/convex/_generated/dataModel";
import { convexClient } from "@/lib/convex";
import { useBulkSelectionStore } from "@/stores/bulk-selection";
import type { MouseEvent } from "react";
import type { ChatItem } from "./chat-list";

const CONTEXT_MENU_PADDING = 12;

interface UseSidebarActionsParams {
	convexUser: { _id: Id<"users"> } | null | undefined;
	currentChatId: string | undefined;
	navigate: ReturnType<typeof useNavigate>;
	chats: Array<ChatItem>;
	confirmDelete: boolean;
	chatTitleLength: string;
	activeProvider: string;
	flatChatIds: Array<Id<"chats">>;
	setTitleGenerating: (chatId: string, value: boolean, source?: "auto" | "manual") => void;
}

export function useSidebarActions({
	convexUser,
	currentChatId,
	navigate,
	chats,
	confirmDelete,
	chatTitleLength,
	activeProvider,
	flatChatIds,
	setTitleGenerating,
}: UseSidebarActionsParams) {
	const [contextMenu, setContextMenu] = useState<{
		chatId: string;
		x: number;
		y: number;
	} | null>(null);
	const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [editingChatId, setEditingChatId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [editOriginal, setEditOriginal] = useState("");

	const contextMenuRef = useRef(contextMenu);
	const contextMenuElementRef = useRef<HTMLDivElement | null>(null);
	const isMountedRef = useRef(true);

	const selectedChatIds = useBulkSelectionStore((s) => s.selectedChatIds);
	const selectChat = useBulkSelectionStore((s) => s.selectChat);
	const selectMultiple = useBulkSelectionStore((s) => s.selectAll);
	const deselectAll = useBulkSelectionStore((s) => s.deselectAll);
	const getSelectedChatIds = useBulkSelectionStore((s) => s.getSelectedChatIds);
	const selectionAnchorRef = useRef<string | null>(null);

	const deleteChat = useMemo(
		() => (deleteChatId ? chats.find((chat) => chat._id === deleteChatId) : null),
		[deleteChatId, chats],
	);

	const handleSelectClick = useCallback(
		(chatId: Id<"chats">, shiftKey: boolean) => {
			if (shiftKey) {
				const anchor = selectionAnchorRef.current ?? currentChatId;
				if (anchor) {
					const anchorIdx = flatChatIds.indexOf(anchor as Id<"chats">);
					const targetIdx = flatChatIds.indexOf(chatId);
					if (anchorIdx !== -1 && targetIdx !== -1) {
						const start = Math.min(anchorIdx, targetIdx);
						const end = Math.max(anchorIdx, targetIdx);
						selectMultiple(flatChatIds.slice(start, end + 1));
						selectionAnchorRef.current = anchor;
						return;
					}
				}
			}
			selectChat(chatId);
			selectionAnchorRef.current = chatId;
		},
		[flatChatIds, currentChatId, selectChat, selectMultiple],
	);

	const handleChatContextMenu = (chatId: string, event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setContextMenu({ chatId, x: event.clientX, y: event.clientY });
	};

	const handleQuickDelete = (chatId: string, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (confirmDelete) {
			setDeleteChatId(chatId);
		} else {
			void handleDeleteChat(chatId);
		}
	};

	const handleRenameFromMenu = () => {
		if (!contextMenu) return;
		const chat = chats.find((item) => item._id === contextMenu.chatId);
		if (!chat) return;
		setContextMenu(null);
		setEditingChatId(chat._id);
		setEditValue(chat.title);
	};

	const handleStartEdit = (chatId: string, title: string, event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setEditingChatId(chatId);
		setEditValue(title);
		setEditOriginal(title);
	};

	const handleCancelEdit = () => {
		setEditingChatId(null);
		setEditValue("");
		setEditOriginal("");
	};

	const handleSubmitEdit = async () => {
		if (!editingChatId || !convexClient || !convexUser?._id) {
			handleCancelEdit();
			return;
		}

		const nextTitle = editValue.trim();
		if (!nextTitle) {
			handleCancelEdit();
			return;
		}
		if (nextTitle === editOriginal.trim()) {
			handleCancelEdit();
			return;
		}

		await convexClient.mutation(api.chats.setTitle, {
			chatId: editingChatId as Id<"chats">,
			userId: convexUser._id,
			title: nextTitle,
			updateUpdatedAt: false,
		});

		handleCancelEdit();
	};

	const handleRegenerateTitle = async (chatId: string) => {
		if (!convexClient || !convexUser?._id) return;

		setContextMenu(null);
		setDeleteChatId(null);
		setTitleGenerating(chatId, true, "manual");
		try {
			const seedText = await convexClient.query(api.messages.getFirstUserMessage, {
				chatId: chatId as Id<"chats">,
				userId: convexUser._id,
			});

			if (!seedText) {
				toast.error("No message available to generate a name.");
				return;
			}

			const generatedTitle = await convexClient.action(api.chats.generateTitle, {
				userId: convexUser._id,
				seedText: seedText.trim().slice(0, 300),
				length: chatTitleLength as "short" | "standard" | "long",
				provider: activeProvider as "osschat" | "openrouter",
			});
			if (!generatedTitle) {
				if (activeProvider === "openrouter") {
					const hasOpenRouterKey = await convexClient.query(api.users.hasOpenRouterKey, {
						userId: convexUser._id,
					});
					if (!hasOpenRouterKey) {
						toast.error("Connect your OpenRouter API key to generate titles with this provider.");
						return;
					}
				}
				toast.error("Could not generate a chat title right now. Try again.");
				return;
			}

			await convexClient.mutation(api.chats.setGeneratedTitle, {
				chatId: chatId as Id<"chats">,
				userId: convexUser._id,
				title: generatedTitle,
				force: true,
			});
		} catch (error) {
			console.warn("[Chat] Title regeneration failed:", error);
			const message = error instanceof Error ? error.message : "";
			if (message.toLowerCase().includes("too many title generations")) {
				toast.error("Too many title generations. Please try again later.");
			} else {
				toast.error("Failed to regenerate chat name");
			}
		} finally {
			setTitleGenerating(chatId, false);
		}
	};

	const handleDeleteChat = useCallback(
		async (chatId: string) => {
			if (!convexClient || !convexUser?._id) return;

			setContextMenu(null);
			setDeleteChatId(null);

			try {
				await convexClient.mutation(api.chats.remove, {
					chatId: chatId as Id<"chats">,
					userId: convexUser._id,
				});

				if (currentChatId === chatId) {
					navigate({ to: "/" });
				}
			} catch (error) {
				console.warn("[Chat] Failed to delete chat:", error);
				toast.error("Failed to delete chat");
			}
		},
		[convexUser?._id, currentChatId, navigate],
	);

	const handleBulkDelete = useCallback(
		async () => {
			if (!convexClient || !convexUser?._id) return;

			const chatIdsToDelete = getSelectedChatIds();
			if (chatIdsToDelete.length === 0) return;

			setIsBulkDeleting(true);
			setShowBulkDeleteDialog(false);

			try {
				const result = await convexClient.mutation(api.chats.removeBulk, {
					chatIds: chatIdsToDelete,
					userId: convexUser._id,
				});

				if (result.deleted > 0) {
					toast.success(`Deleted ${result.deleted} chat${result.deleted > 1 ? "s" : ""}`);
				}

				if (result.failed > 0) {
					toast.error(`Failed to delete ${result.failed} chat${result.failed > 1 ? "s" : ""}`);
				}

				if (currentChatId && chatIdsToDelete.includes(currentChatId as Id<"chats">)) {
					navigate({ to: "/" });
				}

				deselectAll();
			} catch (error) {
				console.warn("[Chat] Failed to bulk delete chats:", error);
				if (error instanceof Error && error.name === "RateLimitError") {
					toast.error(error.message);
				} else {
					toast.error("Failed to delete chats");
				}
			} finally {
				setIsBulkDeleting(false);
			}
		},
		[convexUser?._id, currentChatId, navigate, getSelectedChatIds, deselectAll],
	);

	const handleDeleteFromMenu = useCallback(
		(chatId: string) => {
			setContextMenu(null);
			if (confirmDelete) {
				setDeleteChatId(chatId);
			} else {
				void handleDeleteChat(chatId);
			}
		},
		[confirmDelete, handleDeleteChat],
	);

	useEffect(() => {
		contextMenuRef.current = contextMenu;
	}, [contextMenu]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!contextMenu || !contextMenuElementRef.current) return;
		const rect = contextMenuElementRef.current.getBoundingClientRect();
		const maxX = Math.max(CONTEXT_MENU_PADDING, window.innerWidth - rect.width - CONTEXT_MENU_PADDING);
		const maxY = Math.max(CONTEXT_MENU_PADDING, window.innerHeight - rect.height - CONTEXT_MENU_PADDING);
		const nextX = Math.min(Math.max(contextMenu.x, CONTEXT_MENU_PADDING), maxX);
		const nextY = Math.min(Math.max(contextMenu.y, CONTEXT_MENU_PADDING), maxY);

		if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
			setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
		}
	}, [contextMenu]);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const handleDismiss = () => {
			if (!contextMenuRef.current) return;
			if (!isMountedRef.current) return;
			setContextMenu(null);
			setDeleteChatId(null);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape" && contextMenuRef.current) {
				if (!isMountedRef.current) return;
				setContextMenu(null);
				setDeleteChatId(null);
			}
			if (event.key === "Escape" && selectedChatIds.size > 0) {
				deselectAll();
			}
		};

		window.addEventListener("click", handleDismiss);
		window.addEventListener("contextmenu", handleDismiss);
		window.addEventListener("keydown", handleKey);

		return () => {
			window.removeEventListener("click", handleDismiss);
			window.removeEventListener("contextmenu", handleDismiss);
			window.removeEventListener("keydown", handleKey);
		};
	}, [deselectAll, selectedChatIds.size]);

	return {
		contextMenu,
		setContextMenu,
		contextMenuElementRef,
		deleteChatId,
		setDeleteChatId,
		deleteChat,
		showBulkDeleteDialog,
		setShowBulkDeleteDialog,
		isBulkDeleting,
		editingChatId,
		editValue,
		setEditValue,
		selectedChatIds,
		deselectAll,
		handleSelectClick,
		handleChatContextMenu,
		handleQuickDelete,
		handleRenameFromMenu,
		handleStartEdit,
		handleCancelEdit,
		handleSubmitEdit,
		handleRegenerateTitle,
		handleDeleteChat,
		handleBulkDelete,
		handleDeleteFromMenu,
	};
}
