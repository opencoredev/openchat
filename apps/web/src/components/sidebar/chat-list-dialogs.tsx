import { PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { RefObject } from "react";
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
import { Button } from "../ui/button";

export interface ContextMenuState {
	chatId: string;
	x: number;
	y: number;
}

export interface ChatContextMenuProps {
	contextMenu: ContextMenuState | null;
	contextMenuElementRef: RefObject<HTMLDivElement | null>;
	onRegenerateTitle: (chatId: string) => void;
	onRename: () => void;
	onDelete: (chatId: string) => void;
	confirmDelete: boolean;
	onSetDeleteId: (chatId: string) => void;
}

export function ChatContextMenu({
	contextMenu,
	contextMenuElementRef,
	onRegenerateTitle,
	onRename,
	onDelete,
	confirmDelete,
	onSetDeleteId,
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
				onClick={onRename}
			>
				<PencilIcon className="size-4" />
				Rename
			</button>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive/90 hover:bg-destructive/10 hover:text-destructive"
				onClick={() => {
					if (confirmDelete) {
						onSetDeleteId(contextMenu.chatId);
					} else {
						onDelete(contextMenu.chatId);
					}
				}}
			>
				<Trash2Icon className="size-4" />
				Delete chat
			</button>
		</div>
	);
}

export interface DeleteChatDialogProps {
	deleteChatId: string | null;
	deleteChatTitle: string | undefined;
	onOpenChange: (open: boolean) => void;
	onConfirm: (chatId: string) => void;
}

export function DeleteChatDialog({
	deleteChatId,
	deleteChatTitle,
	onOpenChange,
	onConfirm,
}: DeleteChatDialogProps) {
	return (
		<AlertDialog
			open={!!deleteChatId}
			onOpenChange={(isDialogOpen) => { if (!isDialogOpen) onOpenChange(false); }}
		>
			<AlertDialogContent
				size="sm"
				onKeyDown={(event) => {
					if (event.key === "Enter" && deleteChatId) {
						event.preventDefault();
						onConfirm(deleteChatId);
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete chat</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete &ldquo;{deleteChatTitle ?? "this chat"}&rdquo;?
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						onClick={() => deleteChatId && onConfirm(deleteChatId)}
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
	selectedCount: number;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function BulkDeleteDialog({
	open,
	selectedCount,
	onOpenChange,
	onConfirm,
}: BulkDeleteDialogProps) {
	return (
		<AlertDialog
			open={open}
			onOpenChange={(isDialogOpen) => { if (!isDialogOpen) onOpenChange(false); }}
		>
			<AlertDialogContent
				size="sm"
				onKeyDown={(event) => {
					if (event.key === "Enter" && selectedCount > 0) {
						event.preventDefault();
						onConfirm();
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}?
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						onClick={onConfirm}
					>
						Delete {selectedCount} chat{selectedCount !== 1 ? "s" : ""}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface BulkSelectionBarProps {
	selectedCount: number;
	isBulkDeleting: boolean;
	confirmDelete: boolean;
	onDeselectAll: () => void;
	onDelete: () => void;
	onShowBulkDeleteDialog: () => void;
}

export function BulkSelectionBar({
	selectedCount,
	isBulkDeleting,
	confirmDelete,
	onDeselectAll,
	onDelete,
	onShowBulkDeleteDialog,
}: BulkSelectionBarProps) {
	if (selectedCount === 0) return null;

	return (
		<div className="shrink-0 border-t border-sidebar-border/50 px-3 py-2 flex items-center justify-between gap-2">
			<span className="text-sm text-sidebar-foreground/70">{selectedCount} selected</span>
			<div className="flex items-center gap-1">
				<Button onClick={onDeselectAll} variant="ghost" size="sm" className="h-7 px-2 text-xs">Cancel</Button>
				<Button
					onClick={() => {
						if (confirmDelete) {
							onShowBulkDeleteDialog();
						} else {
							onDelete();
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
