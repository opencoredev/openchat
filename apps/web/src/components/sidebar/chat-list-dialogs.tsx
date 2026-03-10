import {
	CopyIcon,
	MailIcon,
	MessageCircleIcon,
	PencilIcon,
	Share2Icon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import { Button } from "../ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ChatContextMenuProps {
	contextMenu: { chatId: string; x: number; y: number } | null;
	contextMenuElementRef: React.RefObject<HTMLDivElement | null>;
	onRegenerateTitle: (chatId: string) => void;
	onShareFromMenu: (chatId: string) => void;
	onRenameFromMenu: () => void;
	onDeleteFromMenu: (chatId: string) => void;
}

export function ChatContextMenu({
	contextMenu,
	contextMenuElementRef,
	onRegenerateTitle,
	onShareFromMenu,
	onRenameFromMenu,
	onDeleteFromMenu,
}: ChatContextMenuProps) {
	if (!contextMenu) return null;

	return (
		<div
			ref={contextMenuElementRef}
			className="fixed z-50 min-w-[190px] rounded-lg border border-sidebar-border/60 bg-sidebar/95 p-1 shadow-lg backdrop-blur"
			style={{ left: contextMenu.x, top: contextMenu.y }}
			onClick={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				onClick={() => onRegenerateTitle(contextMenu.chatId)}
			>
				<SparklesIcon className="size-4" />
				Regenerate name
			</button>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				onClick={() => onShareFromMenu(contextMenu.chatId)}
			>
				<Share2Icon className="size-4" />
				Share
			</button>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				onClick={onRenameFromMenu}
			>
				<PencilIcon className="size-4" />
				Rename
			</button>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive/90 hover:bg-destructive/10 hover:text-destructive"
				onClick={() => onDeleteFromMenu(contextMenu.chatId)}
			>
				<Trash2Icon className="size-4" />
				Delete chat
			</button>
		</div>
	);
}

export interface ShareChatDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	chatTitle: string;
	shareUrl: string;
	isGenerating: boolean;
	isRevoking: boolean;
	canNativeShare: boolean;
	onCopyLink: () => Promise<void>;
	onNativeShare: () => Promise<void>;
	onRevokeShare: () => Promise<void>;
}

export function ShareChatDialog({
	open,
	onOpenChange,
	chatTitle,
	shareUrl,
	isGenerating,
	isRevoking,
	canNativeShare,
	onCopyLink,
	onNativeShare,
	onRevokeShare,
}: ShareChatDialogProps) {
	const canShare = Boolean(shareUrl) && !isGenerating;
	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(chatTitle || "Shared chat");

	const targets = [
		{
			label: "Share to X",
			href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
		},
		{
			label: "Share to WhatsApp",
			href: `https://wa.me/?text=${encodeURIComponent(`${chatTitle}: ${shareUrl}`)}`,
		},
		{
			label: "Share via Email",
			href: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`Check out this shared chat:\n${shareUrl}`)}`,
		},
	];

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Share chat</AlertDialogTitle>
					<AlertDialogDescription>
						Create and share a public, read-only link to this chat.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm break-all text-muted-foreground">
						{isGenerating ? "Generating share link..." : shareUrl || "Share link will appear here"}
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						<Button
							type="button"
							variant="default"
							className="justify-start gap-2"
							disabled={!canShare}
							onClick={() => {
								void onCopyLink();
							}}
						>
							<CopyIcon className="size-4" />
							Copy link
						</Button>
						<Button
							type="button"
							variant="outline"
							className="justify-start gap-2"
							disabled={!canShare || !canNativeShare}
							onClick={() => {
								void onNativeShare();
							}}
						>
							<Share2Icon className="size-4" />
							Native share
						</Button>
						{targets.map((target) =>
							canShare ? (
								<Button
									key={target.label}
									type="button"
									variant="outline"
									className="justify-start gap-2"
									asChild
								>
									<a href={target.href} target="_blank" rel="noreferrer">
										{target.label.includes("WhatsApp") ? (
											<MessageCircleIcon className="size-4" />
										) : target.label.includes("Email") ? (
											<MailIcon className="size-4" />
										) : (
											<Share2Icon className="size-4" />
										)}
										{target.label}
									</a>
								</Button>
							) : (
								<Button
									key={target.label}
									type="button"
									variant="outline"
									className="justify-start gap-2"
									disabled
								>
									{target.label.includes("WhatsApp") ? (
										<MessageCircleIcon className="size-4" />
									) : target.label.includes("Email") ? (
										<MailIcon className="size-4" />
									) : (
										<Share2Icon className="size-4" />
									)}
									{target.label}
								</Button>
							),
						)}
					</div>
				</div>

				<AlertDialogFooter>
					<Button
						type="button"
						variant="destructive"
						disabled={!shareUrl || isGenerating || isRevoking}
						onClick={() => {
							void onRevokeShare();
						}}
					>
						{isRevoking ? "Stopping share..." : "Stop sharing"}
					</Button>
					<AlertDialogCancel>Close</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface DeleteChatDialogProps {
	deleteChatId: string | null;
	deleteChat: { title: string } | null | undefined;
	onOpenChange: (open: boolean) => void;
	onDelete: (chatId: string) => void;
}

export function DeleteChatDialog({
	deleteChatId,
	deleteChat,
	onOpenChange,
	onDelete,
}: DeleteChatDialogProps) {
	return (
		<AlertDialog
			open={!!deleteChatId}
			onOpenChange={onOpenChange}
		>
			<AlertDialogContent
				size="sm"
				onKeyDown={(event) => {
					if (event.key === "Enter" && deleteChatId) {
						event.preventDefault();
						onDelete(deleteChatId);
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete chat</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete &ldquo;{deleteChat?.title ?? "this chat"}&rdquo;?
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						onClick={() => deleteChatId && onDelete(deleteChatId)}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface BulkDeleteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedCount: number;
	onBulkDelete: () => void;
}

export function BulkDeleteDialog({
	open,
	onOpenChange,
	selectedCount,
	onBulkDelete,
}: BulkDeleteDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				size="sm"
				onKeyDown={(event) => {
					if (event.key === "Enter" && selectedCount > 0) {
						event.preventDefault();
						void onBulkDelete();
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}?
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						onClick={() => void onBulkDelete()}
					>
						Delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface BulkSelectionBarProps {
	selectedChatIds: Set<string>;
	onDeselectAll: () => void;
	confirmDelete: boolean;
	isBulkDeleting: boolean;
	onBulkDelete: () => void;
	onShowBulkDeleteDialog: () => void;
}

export function BulkSelectionBar({
	selectedChatIds,
	onDeselectAll,
	confirmDelete,
	isBulkDeleting,
	onBulkDelete,
	onShowBulkDeleteDialog,
}: BulkSelectionBarProps) {
	if (selectedChatIds.size === 0) return null;

	return (
		<div className="shrink-0 border-t border-sidebar-border/50 px-3 py-2 flex items-center justify-between gap-2">
			<span className="text-sm text-sidebar-foreground/70">
				{selectedChatIds.size} selected
			</span>
			<div className="flex items-center gap-1">
				<Button
					onClick={onDeselectAll}
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
				>
					Cancel
				</Button>
				<Button
					onClick={() => {
						if (confirmDelete) {
							onShowBulkDeleteDialog();
						} else {
							void onBulkDelete();
						}
					}}
					variant="destructive"
					size="sm"
					className="h-7 px-2 text-xs gap-1"
					disabled={isBulkDeleting}
				>
					<Trash2Icon className="size-3" />
					Delete
				</Button>
			</div>
		</div>
	);
}
