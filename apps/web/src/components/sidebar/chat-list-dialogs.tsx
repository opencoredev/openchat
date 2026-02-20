import { PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react";
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
	onRenameFromMenu: () => void;
	onDeleteFromMenu: (chatId: string) => void;
}

export function ChatContextMenu({
	contextMenu,
	contextMenuElementRef,
	onRegenerateTitle,
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
