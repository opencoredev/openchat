import { PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { RefObject } from "react";

export interface ChatContextMenuProps {
	chatId: string;
	x: number;
	y: number;
	menuRef: RefObject<HTMLDivElement | null>;
	onRegenerateTitle: (chatId: string) => void;
	onRename: () => void;
	onDelete: (chatId: string) => void;
	confirmDelete: boolean;
	onSetDeleteId: (chatId: string) => void;
}

export function ChatContextMenu({
	chatId,
	x,
	y,
	menuRef,
	onRegenerateTitle,
	onRename,
	onDelete,
	confirmDelete,
	onSetDeleteId,
}: ChatContextMenuProps) {
	return (
		<div
			ref={menuRef}
			className="fixed z-50 min-w-[190px] rounded-lg border border-sidebar-border/60 bg-sidebar/95 p-1 shadow-lg backdrop-blur"
			style={{ left: x, top: y }}
			onClick={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				onClick={() => onRegenerateTitle(chatId)}
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
						onSetDeleteId(chatId);
					} else {
						onDelete(chatId);
					}
				}}
			>
				<Trash2Icon className="size-4" />
				Delete chat
			</button>
		</div>
	);
}
