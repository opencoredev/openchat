// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

vi.mock("lucide-react", () => ({
	CopyIcon: () => <span data-testid="copy-icon" />,
	MailIcon: () => <span data-testid="mail-icon" />,
	MessageCircleIcon: () => <span data-testid="message-circle-icon" />,
	PencilIcon: () => <span data-testid="pencil-icon" />,
	Share2Icon: () => <span data-testid="share-icon" />,
	SparklesIcon: () => <span data-testid="sparkles-icon" />,
	Trash2Icon: () => <span data-testid="trash-icon" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, className, asChild }: any) => {
		if (asChild && children) {
			return children;
		}
		return (
			<button onClick={onClick} disabled={disabled} className={className}>
				{children}
			</button>
		);
	},
}));

vi.mock("@/components/ui/alert-dialog", () => ({
	AlertDialog: ({ open, children, onOpenChange }: any) =>
		open ? <div data-testid="alert-dialog">{children}</div> : null,
	AlertDialogContent: ({ children, onKeyDown, size }: any) => (
		<div data-testid="alert-dialog-content" onKeyDown={onKeyDown}>
			{children}
		</div>
	),
	AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
	AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
	AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
	AlertDialogAction: ({ children, onClick, className }: any) => (
		<button onClick={onClick} className={className} data-testid="dialog-action">
			{children}
		</button>
	),
	AlertDialogCancel: ({ children }: any) => (
		<button data-testid="dialog-cancel">{children}</button>
	),
}));

import {
	ChatContextMenu,
	DeleteChatDialog,
	BulkDeleteDialog,
	BulkSelectionBar,
	ShareChatDialog,
} from "../chat-list-dialogs";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ChatContextMenu", () => {
	const baseProps = {
		contextMenuElementRef: createRef<HTMLDivElement>(),
		onRegenerateTitle: vi.fn(),
		onShareFromMenu: vi.fn(),
		onRenameFromMenu: vi.fn(),
		onDeleteFromMenu: vi.fn(),
	};

	it("renders null when contextMenu is null", () => {
		const { container } = render(
			<ChatContextMenu {...baseProps} contextMenu={null} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders menu when contextMenu has data", () => {
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 100, y: 200 }}
			/>,
		);
		expect(screen.getByText("Regenerate name")).toBeDefined();
		expect(screen.getByText("Share")).toBeDefined();
		expect(screen.getByText("Rename")).toBeDefined();
		expect(screen.getByText("Delete chat")).toBeDefined();
	});

	it("calls onRegenerateTitle when regenerate button is clicked", () => {
		const onRegenerateTitle = vi.fn();
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 100, y: 200 }}
				onRegenerateTitle={onRegenerateTitle}
			/>,
		);
		fireEvent.click(screen.getByText("Regenerate name"));
		expect(onRegenerateTitle).toHaveBeenCalledWith("chat-1");
	});

	it("calls onRenameFromMenu when rename button is clicked", () => {
		const onRenameFromMenu = vi.fn();
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 100, y: 200 }}
				onRenameFromMenu={onRenameFromMenu}
			/>,
		);
		fireEvent.click(screen.getByText("Rename"));
		expect(onRenameFromMenu).toHaveBeenCalled();
	});

	it("calls onShareFromMenu when share button is clicked", () => {
		const onShareFromMenu = vi.fn();
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 100, y: 200 }}
				onShareFromMenu={onShareFromMenu}
			/>,
		);
		fireEvent.click(screen.getByText("Share"));
		expect(onShareFromMenu).toHaveBeenCalledWith("chat-1");
	});

	it("calls onDeleteFromMenu when delete button is clicked", () => {
		const onDeleteFromMenu = vi.fn();
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 100, y: 200 }}
				onDeleteFromMenu={onDeleteFromMenu}
			/>,
		);
		fireEvent.click(screen.getByText("Delete chat"));
		expect(onDeleteFromMenu).toHaveBeenCalledWith("chat-1");
	});

	it("positions menu using context menu coordinates", () => {
		render(
			<ChatContextMenu
				{...baseProps}
				contextMenu={{ chatId: "chat-1", x: 150, y: 300 }}
			/>,
		);
		const menu = document.querySelector("[style]");
		expect(menu).toBeTruthy();
	});
});

describe("DeleteChatDialog", () => {
	it("does not render when deleteChatId is null", () => {
		render(
			<DeleteChatDialog
				deleteChatId={null}
				deleteChat={null}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("alert-dialog")).toBeNull();
	});

	it("renders dialog when deleteChatId is set", () => {
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("alert-dialog")).toBeDefined();
	});

	it("shows chat title in dialog", () => {
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.getByText(/My Chat/)).toBeDefined();
	});

	it("shows 'this chat' when deleteChat is null", () => {
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={null}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.getByText(/this chat/)).toBeDefined();
	});

	it("shows 'Delete chat' title", () => {
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.getByText("Delete chat")).toBeDefined();
	});

	it("calls onDelete when Confirm is clicked", () => {
		const onDelete = vi.fn();
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={onDelete}
			/>,
		);
		fireEvent.click(screen.getByText("Confirm"));
		expect(onDelete).toHaveBeenCalledWith("chat-1");
	});

	it("shows Cancel button", () => {
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("dialog-cancel")).toBeDefined();
	});

	it("calls onDelete when Enter is pressed in dialog", () => {
		const onDelete = vi.fn();
		render(
			<DeleteChatDialog
				deleteChatId="chat-1"
				deleteChat={{ title: "My Chat" }}
				onOpenChange={vi.fn()}
				onDelete={onDelete}
			/>,
		);
		fireEvent.keyDown(screen.getByTestId("alert-dialog-content"), { key: "Enter" });
		expect(onDelete).toHaveBeenCalledWith("chat-1");
	});
});

describe("ShareChatDialog", () => {
	const baseProps = {
		open: true,
		onOpenChange: vi.fn(),
		chatTitle: "Shared Chat",
		shareUrl: "https://osschat.dev/share/abc123",
		isGenerating: false,
		isRevoking: false,
		canNativeShare: true,
		onCopyLink: vi.fn().mockResolvedValue(undefined),
		onNativeShare: vi.fn().mockResolvedValue(undefined),
		onRevokeShare: vi.fn().mockResolvedValue(undefined),
	};

	it("renders the share actions", () => {
		render(<ShareChatDialog {...baseProps} />);
		expect(screen.getByText("Copy link")).toBeDefined();
		expect(screen.getByText("Native share")).toBeDefined();
		expect(screen.getByText("Share to X")).toBeDefined();
		expect(screen.getByText("Share to WhatsApp")).toBeDefined();
		expect(screen.getByText("Share via Email")).toBeDefined();
		expect(screen.getByText("Stop sharing")).toBeDefined();
	});

	it("shows the generating state", () => {
		render(<ShareChatDialog {...baseProps} isGenerating />);
		expect(screen.getByText("Generating share link...")).toBeDefined();
		expect(screen.getByText("Copy link").hasAttribute("disabled")).toBe(true);
	});

	it("calls the copy handler", () => {
		const onCopyLink = vi.fn().mockResolvedValue(undefined);
		render(<ShareChatDialog {...baseProps} onCopyLink={onCopyLink} />);
		fireEvent.click(screen.getByText("Copy link"));
		expect(onCopyLink).toHaveBeenCalled();
	});

	it("calls the native share handler", () => {
		const onNativeShare = vi.fn().mockResolvedValue(undefined);
		render(<ShareChatDialog {...baseProps} onNativeShare={onNativeShare} />);
		fireEvent.click(screen.getByText("Native share"));
		expect(onNativeShare).toHaveBeenCalled();
	});

	it("calls the revoke handler", () => {
		const onRevokeShare = vi.fn().mockResolvedValue(undefined);
		render(<ShareChatDialog {...baseProps} onRevokeShare={onRevokeShare} />);
		fireEvent.click(screen.getByText("Stop sharing"));
		expect(onRevokeShare).toHaveBeenCalled();
	});

	it("disables native share when unavailable", () => {
		render(<ShareChatDialog {...baseProps} canNativeShare={false} />);
		expect(screen.getByText("Native share").hasAttribute("disabled")).toBe(true);
	});
});

describe("BulkDeleteDialog", () => {
	it("does not render when open is false", () => {
		render(
			<BulkDeleteDialog
				open={false}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("alert-dialog")).toBeNull();
	});

	it("renders dialog when open is true", () => {
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("alert-dialog")).toBeDefined();
	});

	it("shows correct count in title for multiple chats", () => {
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={vi.fn()}
			/>,
		);
		expect(screen.getByText("Delete 3 chats?")).toBeDefined();
	});

	it("shows singular form when selectedCount is 1", () => {
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={1}
				onBulkDelete={vi.fn()}
			/>,
		);
		expect(screen.getByText("Delete 1 chat?")).toBeDefined();
	});

	it("calls onBulkDelete when action button is clicked", () => {
		const onBulkDelete = vi.fn();
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={onBulkDelete}
			/>,
		);
		fireEvent.click(screen.getByTestId("dialog-action"));
		expect(onBulkDelete).toHaveBeenCalled();
	});

	it("shows 'Cancel' button", () => {
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("dialog-cancel")).toBeDefined();
	});

	it("calls onBulkDelete when Enter is pressed", () => {
		const onBulkDelete = vi.fn();
		render(
			<BulkDeleteDialog
				open={true}
				onOpenChange={vi.fn()}
				selectedCount={3}
				onBulkDelete={onBulkDelete}
			/>,
		);
		fireEvent.keyDown(screen.getByTestId("alert-dialog-content"), { key: "Enter" });
		expect(onBulkDelete).toHaveBeenCalled();
	});
});

describe("BulkSelectionBar", () => {
	it("renders null when no chats are selected", () => {
		const { container } = render(
			<BulkSelectionBar
				selectedChatIds={new Set()}
				onDeselectAll={vi.fn()}
				confirmDelete={false}
				isBulkDeleting={false}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders selection bar when chats are selected", () => {
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1", "chat-2"])}
				onDeselectAll={vi.fn()}
				confirmDelete={false}
				isBulkDeleting={false}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		expect(screen.getByText("2 selected")).toBeDefined();
	});

	it("calls onDeselectAll when Cancel is clicked", () => {
		const onDeselectAll = vi.fn();
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1"])}
				onDeselectAll={onDeselectAll}
				confirmDelete={false}
				isBulkDeleting={false}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByText("Cancel"));
		expect(onDeselectAll).toHaveBeenCalled();
	});

	it("calls onBulkDelete directly when confirmDelete is false", () => {
		const onBulkDelete = vi.fn();
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1"])}
				onDeselectAll={vi.fn()}
				confirmDelete={false}
				isBulkDeleting={false}
				onBulkDelete={onBulkDelete}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByText("Delete"));
		expect(onBulkDelete).toHaveBeenCalled();
	});

	it("calls onShowBulkDeleteDialog when confirmDelete is true", () => {
		const onShowBulkDeleteDialog = vi.fn();
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1"])}
				onDeselectAll={vi.fn()}
				confirmDelete={true}
				isBulkDeleting={false}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={onShowBulkDeleteDialog}
			/>,
		);
		fireEvent.click(screen.getByText("Delete"));
		expect(onShowBulkDeleteDialog).toHaveBeenCalled();
	});

	it("Delete button is disabled when isBulkDeleting is true", () => {
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1"])}
				onDeselectAll={vi.fn()}
				confirmDelete={false}
				isBulkDeleting={true}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		const deleteBtn = screen.getByText("Delete");
		expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows singular 'selected' for one chat", () => {
		render(
			<BulkSelectionBar
				selectedChatIds={new Set(["chat-1"])}
				onDeselectAll={vi.fn()}
				confirmDelete={false}
				isBulkDeleting={false}
				onBulkDelete={vi.fn()}
				onShowBulkDeleteDialog={vi.fn()}
			/>,
		);
		expect(screen.getByText("1 selected")).toBeDefined();
	});
});
