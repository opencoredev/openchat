import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { toast } from "sonner";
import type { MouseEvent } from "react";
import type { Id } from "@server/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-client";
import { convexClient } from "@/lib/convex";
import { useProviderStore } from "@/stores/provider";
import { useChatTitleStore } from "@/stores/chat-title";
import { useBulkSelectionStore } from "@/stores/bulk-selection";
import { SidebarContent, useSidebar } from "../ui/sidebar";
import { ChatGroup, ChatItemSkeleton } from "./chat-list-item";
import type { ChatItem } from "./chat-list-item";
import {
	ChatContextMenu,
	DeleteChatDialog,
	BulkDeleteDialog,
	BulkSelectionBar,
} from "./chat-list-dialogs";
import type { ContextMenuState } from "./chat-list-dialogs";

const CHATS_CACHE_KEY = "openchat-chats-cache";
const CONTEXT_MENU_PADDING = 12;

export function groupChatsByTime(chats: Array<ChatItem>, now: number) {
	const today: Array<ChatItem> = [];
	const last7Days: Array<ChatItem> = [];
	const last30Days: Array<ChatItem> = [];
	const older: Array<ChatItem> = [];

	const oneDayMs = 1000 * 60 * 60 * 24;

	for (const chat of chats) {
		const diffDays = Math.floor((now - chat.updatedAt) / oneDayMs);
		if (diffDays === 0) today.push(chat);
		else if (diffDays < 7) last7Days.push(chat);
		else if (diffDays < 30) last30Days.push(chat);
		else older.push(chat);
	}

	return { today, last7Days, last30Days, older };
}

export function ChatList() {
	const { user } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const navigate = useNavigate();
	const activeProvider = useProviderStore((s) => s.activeProvider);
	const chatTitleLength = useChatTitleStore((s) => s.length);
	const confirmDelete = useChatTitleStore((s) => s.confirmDelete);
	const generatingChatIds = useChatTitleStore((s) => s.generatingChatIds);
	const setTitleGenerating = useChatTitleStore((s) => s.setGenerating);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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

	let currentChatId: string | undefined;
	try {
		const params = useParams({ from: "/c/$chatId", shouldThrow: false });
		currentChatId = params?.chatId;
	} catch {
		// Not on a chat page
	}

	const convexUser = useQuery(
		api.users.getByExternalId,
		convexClient && user?.id ? { externalId: user.id } : "skip",
	);

	const chatsResult = useQuery(
		api.chats.list,
		convexClient && convexUser?._id ? { userId: convexUser._id } : "skip",
	);

	const cachedChatsRef = useRef<Array<ChatItem> | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const stored = sessionStorage.getItem(CHATS_CACHE_KEY);
			if (stored && !cachedChatsRef.current) {
				cachedChatsRef.current = JSON.parse(stored);
			}
		} catch (e) {
			console.warn("Failed to load chats from sessionStorage:", e);
		}
	}, []);

	useEffect(() => {
		if (chatsResult?.chats && chatsResult.chats.length > 0) {
			cachedChatsRef.current = chatsResult.chats;
			try {
				const minimal = chatsResult.chats.map(({ _id, title, updatedAt }) => ({ _id, title, updatedAt }));
				sessionStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(minimal));
			} catch (e) {
				console.warn("Failed to save chats to sessionStorage:", e);
			}
		}
	}, [chatsResult?.chats]);

	const chats = chatsResult?.chats ?? cachedChatsRef.current ?? [];
	const hasCachedChats = chats.length > 0;
	const isLoadingChats = user?.id && !hasCachedChats
		? convexUser === undefined || chatsResult === undefined
		: false;

	const dayKey = new Date().toDateString();
	const grouped = useMemo(() => groupChatsByTime(chats, Date.now()), [chats, dayKey]);
	const flatChatIds = useMemo(
		() => [...grouped.today, ...grouped.last7Days, ...grouped.last30Days, ...grouped.older].map((c) => c._id),
		[grouped],
	);
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

	const handleChatClick = (chatId: string) => {
		if (isMobile) setOpenMobile(false);
		navigate({ to: "/c/$chatId", params: { chatId } });
	};

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
		if (!editingChatId || !convexClient || !convexUser?._id) { handleCancelEdit(); return; }
		const nextTitle = editValue.trim();
		if (!nextTitle) { handleCancelEdit(); return; }
		if (nextTitle === editOriginal.trim()) { handleCancelEdit(); return; }
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
			if (!seedText) { toast.error("No message available to generate a name."); return; }
			const generatedTitle = await convexClient.action(api.chats.generateTitle, {
				userId: convexUser._id,
				seedText: seedText.trim().slice(0, 300),
				length: chatTitleLength,
				provider: activeProvider,
			});
			if (!generatedTitle) {
				if (activeProvider === "openrouter") {
					const hasOpenRouterKey = await convexClient.query(api.users.hasOpenRouterKey, { userId: convexUser._id });
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
				if (currentChatId === chatId) navigate({ to: "/" });
			} catch (error) {
				console.warn("[Chat] Failed to delete chat:", error);
				toast.error("Failed to delete chat");
			}
		},
		[convexClient, convexUser?._id, currentChatId, navigate],
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
				if (result.deleted > 0) toast.success(`Deleted ${result.deleted} chat${result.deleted > 1 ? "s" : ""}`);
				if (result.failed > 0) toast.error(`Failed to delete ${result.failed} chat${result.failed > 1 ? "s" : ""}`);
				if (currentChatId && chatIdsToDelete.includes(currentChatId as Id<"chats">)) navigate({ to: "/" });
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
		[convexClient, convexUser?._id, currentChatId, navigate, getSelectedChatIds, deselectAll],
	);

	useEffect(() => { contextMenuRef.current = contextMenu; }, [contextMenu]);

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
		return () => { isMountedRef.current = false; };
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
			if (event.key === "Escape" && selectedChatIds.size > 0) deselectAll();
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

	const chatGroupProps = {
		currentChatId,
		onChatClick: handleChatClick,
		onChatContextMenu: handleChatContextMenu,
		onQuickDelete: handleQuickDelete,
		generatingChatIds,
		editingChatId,
		editValue,
		onEditChange: setEditValue,
		onStartEdit: handleStartEdit,
		onEditSubmit: handleSubmitEdit,
		onEditCancel: handleCancelEdit,
		selectedChatIds,
		onSelectClick: handleSelectClick,
	};

	return (
		<>
			<SidebarContent className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
				{isLoadingChats ? (
					<div className="px-3 py-2 space-y-1">
						<ChatItemSkeleton delay={0} />
						<ChatItemSkeleton delay={75} />
						<ChatItemSkeleton delay={150} />
						<ChatItemSkeleton delay={225} />
					</div>
				) : chats.length === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-sidebar-foreground/50">
						No chats yet
					</div>
				) : (
					<>
						<ChatGroup label="Today" chats={grouped.today} {...chatGroupProps} />
						<ChatGroup label="Last 7 days" chats={grouped.last7Days} {...chatGroupProps} />
						<ChatGroup label="Last 30 days" chats={grouped.last30Days} {...chatGroupProps} />
						<ChatGroup label="Older" chats={grouped.older} {...chatGroupProps} />
					</>
				)}
			</SidebarContent>

			<BulkSelectionBar
				selectedCount={selectedChatIds.size}
				isBulkDeleting={isBulkDeleting}
				confirmDelete={confirmDelete}
				onDeselectAll={deselectAll}
				onDelete={() => void handleBulkDelete()}
				onShowBulkDeleteDialog={() => setShowBulkDeleteDialog(true)}
			/>

			<ChatContextMenu
				contextMenu={contextMenu}
				contextMenuElementRef={contextMenuElementRef}
				onRegenerateTitle={handleRegenerateTitle}
				onRename={handleRenameFromMenu}
				onDelete={(chatId) => void handleDeleteChat(chatId)}
				confirmDelete={confirmDelete}
				onSetDeleteId={setDeleteChatId}
			/>

			<DeleteChatDialog
				deleteChatId={deleteChatId}
				deleteChatTitle={deleteChat?.title}
				onOpenChange={(open) => { if (!open) setDeleteChatId(null); }}
				onConfirm={(chatId) => void handleDeleteChat(chatId)}
			/>

			<BulkDeleteDialog
				open={showBulkDeleteDialog}
				selectedCount={selectedChatIds.size}
				onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}
				onConfirm={() => void handleBulkDelete()}
			/>
		</>
	);
}
