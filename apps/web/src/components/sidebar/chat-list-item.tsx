import type { MouseEvent } from "react";
import type { Id } from "@server/convex/_generated/dataModel";
import { GitForkIcon, XIcon } from "lucide-react";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "../ui/sidebar";
import { cn } from "@/lib/utils";

export interface ChatItem {
	_id: Id<"chats">;
	title: string;
	updatedAt: number;
	status?: string;
	forkedFromChatId?: string;
}

export function ChatItemSkeleton({ delay = 0 }: { delay?: number }) {
	return (
		<div className="flex items-center gap-3 rounded-lg px-3 py-2">
			<div className={cn("size-4 rounded bg-sidebar-foreground/10 animate-pulse", delay > 0 && `[animation-delay:${delay}ms]`)} style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined} />
			<div className={cn("h-4 flex-1 rounded bg-sidebar-foreground/10 animate-pulse", delay > 0 && `[animation-delay:${delay}ms]`)} style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined} />
		</div>
	);
}

export interface ChatGroupProps {
	label: string;
	chats: Array<ChatItem>;
	currentChatId?: string;
	onChatClick: (chatId: string) => void;
	onChatContextMenu: (chatId: string, event: MouseEvent) => void;
	onQuickDelete: (chatId: string, event: React.MouseEvent) => void;
	generatingChatIds: Partial<Record<string, "auto" | "manual">>;
	editingChatId: string | null;
	editValue: string;
	onEditChange: (value: string) => void;
	onStartEdit: (chatId: string, title: string, event: React.MouseEvent) => void;
	onEditSubmit: () => void;
	onEditCancel: () => void;
	selectedChatIds: Set<string>;
	onSelectClick: (chatId: Id<"chats">, shiftKey: boolean) => void;
}

export function ChatGroup({
	label,
	chats,
	currentChatId,
	onChatClick,
	onChatContextMenu,
	onQuickDelete,
	generatingChatIds,
	editingChatId,
	editValue,
	onEditChange,
	onStartEdit,
	onEditSubmit,
	onEditCancel,
	selectedChatIds,
	onSelectClick,
}: ChatGroupProps) {
	if (chats.length === 0) return null;

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{label}</SidebarGroupLabel>
			<SidebarMenu>
				{chats.map((chat) => {
					const isSelected = selectedChatIds.has(chat._id);
					return (
						<SidebarMenuItem key={chat._id} className="relative">
							<SidebarMenuButton
								isActive={currentChatId === chat._id}
								onClick={(event) => {
									if (editingChatId === chat._id) return;
									if (event.shiftKey || selectedChatIds.size > 0) {
										event.preventDefault();
										onSelectClick(chat._id, event.shiftKey);
										return;
									}
									onChatClick(chat._id);
								}}
								onContextMenu={(event) => {
									onChatContextMenu(chat._id, event);
								}}
								className={cn(
									"pr-8",
									isSelected && "bg-sidebar-primary/15 border-l-2 border-sidebar-primary"
								)}
							 >
							 {generatingChatIds[chat._id] ? (
								<span className="block h-5 flex-1 rounded bg-sidebar-foreground/10 animate-pulse" />
							) : editingChatId === chat._id ? (
								<input
									className="h-5 w-full bg-transparent text-sm text-sidebar-foreground outline-none"
									value={editValue}
									onChange={(event) => onEditChange(event.target.value)}
									onClick={(event) => event.stopPropagation()}
									onFocus={(event) => event.currentTarget.select()}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											onEditSubmit();
										}
										if (event.key === "Escape") {
											event.preventDefault();
											onEditCancel();
										}
									}}
									onBlur={onEditCancel}
									autoFocus
								/>
							) : (
								 <>
								   {chat.forkedFromChatId && (
									 <GitForkIcon className="size-3.5 shrink-0 text-sidebar-foreground/40" />
								   )}
								   <span
									 className="truncate"
									 onMouseDown={(event) => event.stopPropagation()}
									 onDoubleClick={(event) => {
									   onStartEdit(chat._id, chat.title, event);
									 }}
								   >
									 {chat.title}
								   </span>
								 </>
							 )}
							</SidebarMenuButton>
							<button
								type="button"
								className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center opacity-0 transition-opacity group-hover/menu-item:opacity-70 text-sidebar-foreground/60 hover:text-sidebar-foreground/85 z-10"
								onClick={(event) => {
									if (event.shiftKey) {
										event.preventDefault();
										event.stopPropagation();
										onSelectClick(chat._id, true);
										return;
									}
									onQuickDelete(chat._id, event);
								}}
								aria-label="Delete chat"
							>
								<XIcon className="size-3.5" />
							</button>
						</SidebarMenuItem>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}
