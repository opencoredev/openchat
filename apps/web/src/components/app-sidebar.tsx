import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { Button } from "./ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	useSidebar,
} from "./ui/sidebar";
import { useAuth } from "@/lib/auth-client";
import { convexClient } from "@/lib/convex";
import { useProviderStore } from "@/stores/provider";
import { useChatTitleStore } from "@/stores/chat-title";
import { cn } from "@/lib/utils";
import { MenuIcon, PlusIcon, SidebarIcon } from "@/components/icons";
import { ChatList, groupChatsByTime } from "./sidebar/chat-list";
import type { ChatItem } from "./sidebar/chat-list";
import {
	BulkDeleteDialog,
	BulkSelectionBar,
	ChatContextMenu,
	DeleteChatDialog,
	ShareChatDialog,
} from "./sidebar/chat-list-dialogs";
import { SidebarUser } from "./sidebar/sidebar-user";
import { useSidebarActions } from "./sidebar/use-sidebar-actions";

const CHATS_CACHE_KEY = "openchat-chats-cache";

export function AppSidebar({
	variant = "inset",
	collapsible = "offcanvas",
	...props
}: React.ComponentProps<typeof Sidebar>) {
	const { user } = useAuth();
	const { open, isMobile, setOpen, setOpenMobile } = useSidebar();
	const navigate = useNavigate();
	const activeProvider = useProviderStore((s) => s.activeProvider);
	const chatTitleLength = useChatTitleStore((s) => s.length);
	const confirmDelete = useChatTitleStore((s) => s.confirmDelete);
	const generatingChatIds = useChatTitleStore((s) => s.generatingChatIds);
	const setTitleGenerating = useChatTitleStore((s) => s.setGenerating);

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
				const minimal = chatsResult.chats.map(({ _id, title, updatedAt }) => ({
					_id,
					title,
					updatedAt,
				}));
				sessionStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(minimal));
			} catch (e) {
				console.warn("Failed to save chats to sessionStorage:", e);
			}
		}
	}, [chatsResult?.chats]);

	const chats = chatsResult?.chats ?? cachedChatsRef.current ?? [];
	const hasCachedChats = chats.length > 0;
	const isLoadingChats =
		user?.id && !hasCachedChats
			? convexUser === undefined || chatsResult === undefined
			: false;

	const dayKey = new Date().toDateString();
	const grouped = useMemo(() => groupChatsByTime(chats, Date.now()), [chats, dayKey]);
	const flatChatIds = useMemo(
		() =>
			[...grouped.today, ...grouped.last7Days, ...grouped.last30Days, ...grouped.older].map(
				(c) => c._id,
			),
		[grouped],
	);

	const {
		contextMenu,
		contextMenuElementRef,
		deleteChatId,
		setDeleteChatId,
		deleteChat,
		showBulkDeleteDialog,
		setShowBulkDeleteDialog,
		isBulkDeleting,
		showShareDialog,
		setShowShareDialog,
		isGeneratingShare,
		isRevokingShare,
		shareChatId,
		shareUrl,
		editingChatId,
		editValue,
		setEditValue,
		selectedChatIds,
		deselectAll,
		handleSelectClick,
		handleChatContextMenu,
		handleQuickDelete,
		handleRenameFromMenu,
		handleShareFromMenu,
		handleCopyShareLink,
		handleNativeShare,
		handleRevokeShare,
		handleStartEdit,
		handleCancelEdit,
		handleSubmitEdit,
		handleRegenerateTitle,
		handleDeleteChat,
		handleBulkDelete,
		handleDeleteFromMenu,
	} = useSidebarActions({
		convexUser,
		currentChatId,
		navigate,
		chats,
		confirmDelete,
		chatTitleLength,
		activeProvider,
		flatChatIds,
		setTitleGenerating,
	});

	const handleNewChat = () => {
		if (isMobile) setOpenMobile(false);
		navigate({ to: "/" });
	};

	const handleChatClick = (chatId: string) => {
		if (isMobile) setOpenMobile(false);
		navigate({ to: "/c/$chatId", params: { chatId } });
	};

	return (
		<>
			<button
				onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
				className="fixed left-3 top-3 z-50 flex size-11 items-center justify-center rounded-xl bg-sidebar/95 shadow-lg ring-1 ring-sidebar-border/50 backdrop-blur-sm text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar hover:text-sidebar-foreground active:scale-95 md:hidden"
				aria-label="Open menu"
			>
				<MenuIcon />
			</button>

			<div
				className={cn(
					"fixed left-3 top-3 z-50 flex items-center gap-1 rounded-xl bg-sidebar/95 p-1 shadow-lg ring-1 ring-sidebar-border/50 backdrop-blur-sm",
					"transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
					"hidden md:flex",
					open ? "pointer-events-none opacity-0 scale-95" : "opacity-100 scale-100",
				)}
			>
				<button
					onClick={() => setOpen(true)}
					className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					title="Open sidebar"
				>
					<SidebarIcon />
				</button>
				<button
					onClick={handleNewChat}
					className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					title="New Chat"
				>
					<PlusIcon />
				</button>
			</div>

			<Sidebar variant={variant} collapsible={collapsible} {...props}>
				<div className="relative flex h-14 shrink-0 items-center justify-center px-3">
					<button
						onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
						className="absolute left-3 flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
						title="Close sidebar"
					>
						<SidebarIcon />
					</button>
					<button
						onClick={handleNewChat}
						className="flex items-center transition-opacity hover:opacity-80"
					>
						<span className="text-xl font-bold tracking-tight text-sidebar-foreground">
							oss<span className="text-sidebar-primary">chat</span>
						</span>
					</button>
				</div>

				<div className="shrink-0 px-3 pb-3">
					<Button
						onClick={handleNewChat}
						className="w-full justify-center gap-2"
						variant="default"
					>
						New Chat
					</Button>
				</div>

				<SidebarContent className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
					<ChatList
						isLoading={isLoadingChats}
						grouped={grouped}
						currentChatId={currentChatId}
						onChatClick={handleChatClick}
						onChatContextMenu={handleChatContextMenu}
						onQuickDelete={handleQuickDelete}
						generatingChatIds={generatingChatIds}
						editingChatId={editingChatId}
						editValue={editValue}
						onEditChange={setEditValue}
						onStartEdit={handleStartEdit}
						onEditSubmit={handleSubmitEdit}
						onEditCancel={handleCancelEdit}
						selectedChatIds={selectedChatIds}
						onSelectClick={handleSelectClick}
					/>
				</SidebarContent>

				<BulkSelectionBar
					selectedChatIds={selectedChatIds}
					onDeselectAll={deselectAll}
					confirmDelete={confirmDelete}
					isBulkDeleting={isBulkDeleting}
					onBulkDelete={handleBulkDelete}
					onShowBulkDeleteDialog={() => setShowBulkDeleteDialog(true)}
				/>

				<SidebarFooter className="shrink-0 p-3">
					<SidebarUser user={user} isMobile={isMobile} setOpen={setOpen} />
				</SidebarFooter>
			</Sidebar>

			<ChatContextMenu
				contextMenu={contextMenu}
				contextMenuElementRef={contextMenuElementRef}
				onRegenerateTitle={handleRegenerateTitle}
				onShareFromMenu={handleShareFromMenu}
				onRenameFromMenu={handleRenameFromMenu}
				onDeleteFromMenu={handleDeleteFromMenu}
			/>

			<DeleteChatDialog
				deleteChatId={deleteChatId}
				deleteChat={deleteChat}
				onOpenChange={(isOpen) => {
					if (!isOpen) setDeleteChatId(null);
				}}
				onDelete={handleDeleteChat}
			/>

			<BulkDeleteDialog
				open={showBulkDeleteDialog}
				onOpenChange={(isOpen) => {
					if (!isOpen) setShowBulkDeleteDialog(false);
				}}
				selectedCount={selectedChatIds.size}
				onBulkDelete={handleBulkDelete}
			/>

			<ShareChatDialog
				open={showShareDialog}
				onOpenChange={(isOpen) => {
					setShowShareDialog(isOpen);
				}}
				chatTitle={chats.find((chat) => chat._id === shareChatId)?.title ?? "Shared chat"}
				shareUrl={shareUrl}
				isGenerating={isGeneratingShare}
				isRevoking={isRevokingShare}
				canNativeShare={typeof navigator !== "undefined" && "share" in navigator}
				onCopyLink={handleCopyShareLink}
				onNativeShare={handleNativeShare}
				onRevokeShare={handleRevokeShare}
			/>
		</>
	);
}
