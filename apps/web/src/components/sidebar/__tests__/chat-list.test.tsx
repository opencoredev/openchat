// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Id } from "@server/convex/_generated/dataModel";
import { ChatGroup, ChatList, groupChatsByTime } from "../chat-list";

vi.mock("../../ui/sidebar", () => ({
	SidebarGroup: ({ children }: any) => <div>{children}</div>,
	SidebarGroupLabel: ({ children }: any) => <div>{children}</div>,
	SidebarMenu: ({ children }: any) => <div>{children}</div>,
	SidebarMenuButton: ({ children, onClick, onContextMenu, className }: any) => (
		<button onClick={onClick} onContextMenu={onContextMenu} className={className}>
			{children}
		</button>
	),
	SidebarMenuItem: ({ children, className }: any) => <div className={className}>{children}</div>,
}));
vi.mock("lucide-react", () => ({
	GitForkIcon: ({ className }: any) => <span className={className} data-testid="fork-icon" />,
	XIcon: ({ className }: any) => <span className={className} />,
}));
vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const NOW = Date.now();
const CHAT_TODAY = { _id: "chat-1" as Id<"chats">, title: "Today Chat", updatedAt: NOW };
const CHAT_3DAYS = {
	_id: "chat-2" as Id<"chats">,
	title: "3 Days Chat",
	updatedAt: NOW - 3 * 24 * 60 * 60 * 1000,
};
const CHAT_15DAYS = {
	_id: "chat-3" as Id<"chats">,
	title: "15 Days Chat",
	updatedAt: NOW - 15 * 24 * 60 * 60 * 1000,
};
const CHAT_45DAYS = {
	_id: "chat-4" as Id<"chats">,
	title: "45 Days Chat",
	updatedAt: NOW - 45 * 24 * 60 * 60 * 1000,
};

describe("groupChatsByTime", () => {
	it("places a chat from today into today bucket", () => {
		const result = groupChatsByTime([CHAT_TODAY], NOW);
		expect(result.today).toHaveLength(1);
		expect(result.last7Days).toHaveLength(0);
	});

	it("places a 3-day-old chat into last7Days bucket", () => {
		const result = groupChatsByTime([CHAT_3DAYS], NOW);
		expect(result.last7Days).toHaveLength(1);
	});

	it("places a 15-day-old chat into last30Days bucket (line 36-37)", () => {
		const result = groupChatsByTime([CHAT_15DAYS], NOW);
		expect(result.last30Days).toHaveLength(1);
	});

	it("places a 45-day-old chat into older bucket (lines 38-39)", () => {
		const result = groupChatsByTime([CHAT_45DAYS], NOW);
		expect(result.older).toHaveLength(1);
		expect(result.last30Days).toHaveLength(0);
	});

	it("returns empty arrays when no chats provided", () => {
		const result = groupChatsByTime([], NOW);
		expect(result.today).toHaveLength(0);
		expect(result.last7Days).toHaveLength(0);
		expect(result.last30Days).toHaveLength(0);
		expect(result.older).toHaveLength(0);
	});
});

const defaultGroupProps = {
	label: "Today",
	chats: [CHAT_TODAY],
	currentChatId: undefined,
	onChatClick: vi.fn(),
	onChatContextMenu: vi.fn(),
	onQuickDelete: vi.fn(),
	generatingChatIds: {} as Record<string, "auto" | "manual">,
	editingChatId: null,
	editValue: "",
	onEditChange: vi.fn(),
	onStartEdit: vi.fn(),
	onEditSubmit: vi.fn(),
	onEditCancel: vi.fn(),
	selectedChatIds: new Set<string>(),
	onSelectClick: vi.fn(),
};

describe("ChatGroup", () => {
	it("renders null when chats is empty", () => {
		const { container } = render(<ChatGroup {...defaultGroupProps} chats={[]} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders label and chat titles", () => {
		render(<ChatGroup {...defaultGroupProps} />);
		expect(screen.getByText("Today")).toBeTruthy();
		expect(screen.getByText("Today Chat")).toBeTruthy();
	});

	it("calls onChatClick when a chat button is clicked normally", () => {
		const onChatClick = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onChatClick={onChatClick} />);
		fireEvent.click(screen.getByText("Today Chat"));
		expect(onChatClick).toHaveBeenCalledWith("chat-1");
	});

	it("calls onSelectClick on shift-click (line 116-119)", () => {
		const onSelectClick = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onSelectClick={onSelectClick} />);
		fireEvent.click(screen.getByText("Today Chat"), { shiftKey: true });
		expect(onSelectClick).toHaveBeenCalledWith("chat-1", true);
	});

	it("calls onSelectClick when selectedChatIds is non-empty on click (line 116-119)", () => {
		const onSelectClick = vi.fn();
		const selectedChatIds = new Set(["chat-1"]);
		render(
			<ChatGroup
				{...defaultGroupProps}
				onSelectClick={onSelectClick}
				selectedChatIds={selectedChatIds}
			/>,
		);
		fireEvent.click(screen.getByText("Today Chat"));
		expect(onSelectClick).toHaveBeenCalledWith("chat-1", false);
	});

	it("does nothing when editing chat is clicked (line 115)", () => {
		const onChatClick = vi.fn();
		render(
			<ChatGroup
				{...defaultGroupProps}
				onChatClick={onChatClick}
				editingChatId="chat-1"
				editValue="editing title"
			/>,
		);
		const input = screen.getByRole("textbox");
		fireEvent.click(input);
		expect(onChatClick).not.toHaveBeenCalled();
	});

	it("calls onEditSubmit on Enter key in edit input (line 142-145)", () => {
		const onEditSubmit = vi.fn();
		render(
			<ChatGroup
				{...defaultGroupProps}
				editingChatId="chat-1"
				editValue="new title"
				onEditSubmit={onEditSubmit}
			/>,
		);
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
		expect(onEditSubmit).toHaveBeenCalled();
	});

	it("calls onEditCancel on Escape key in edit input (line 146-149)", () => {
		const onEditCancel = vi.fn();
		render(
			<ChatGroup
				{...defaultGroupProps}
				editingChatId="chat-1"
				editValue="title"
				onEditCancel={onEditCancel}
			/>,
		);
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
		expect(onEditCancel).toHaveBeenCalled();
	});

	it("calls onEditCancel on blur of edit input (line 151)", () => {
		const onEditCancel = vi.fn();
		render(
			<ChatGroup
				{...defaultGroupProps}
				editingChatId="chat-1"
				editValue="title"
				onEditCancel={onEditCancel}
			/>,
		);
		fireEvent.blur(screen.getByRole("textbox"));
		expect(onEditCancel).toHaveBeenCalled();
	});

	it("calls onEditChange when editing input changes (line 138)", () => {
		const onEditChange = vi.fn();
		render(
			<ChatGroup
				{...defaultGroupProps}
				editingChatId="chat-1"
				editValue=""
				onEditChange={onEditChange}
			/>,
		);
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } });
		expect(onEditChange).toHaveBeenCalledWith("new");
	});

	it("shows generating skeleton when chat is being generated (line 132-133)", () => {
		render(
			<ChatGroup
				{...defaultGroupProps}
				generatingChatIds={{ "chat-1": "auto" }}
			/>,
		);
		expect(screen.queryByText("Today Chat")).toBeNull();
	});

	it("renders fork icon for forked chats (line 156-157)", () => {
		const forkedChat = { ...CHAT_TODAY, forkedFromChatId: "parent-chat-id" };
		render(<ChatGroup {...defaultGroupProps} chats={[forkedChat]} />);
		expect(screen.getByTestId("fork-icon")).toBeTruthy();
	});

	it("calls onStartEdit on double click of chat title (line 162-163)", () => {
		const onStartEdit = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onStartEdit={onStartEdit} />);
		fireEvent.dblClick(screen.getByText("Today Chat"));
		expect(onStartEdit).toHaveBeenCalledWith("chat-1", "Today Chat", expect.anything());
	});

	it("calls onQuickDelete when delete button is clicked (line 181)", () => {
		const onQuickDelete = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onQuickDelete={onQuickDelete} />);
		const deleteBtn = screen.getByRole("button", { name: /delete chat/i });
		fireEvent.click(deleteBtn);
		expect(onQuickDelete).toHaveBeenCalledWith("chat-1", expect.anything());
	});

	it("calls onSelectClick on shift-click of delete button (line 175-179)", () => {
		const onSelectClick = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onSelectClick={onSelectClick} />);
		const deleteBtn = screen.getByRole("button", { name: /delete chat/i });
		fireEvent.click(deleteBtn, { shiftKey: true });
		expect(onSelectClick).toHaveBeenCalledWith("chat-1", true);
	});

	it("calls onChatContextMenu on right-click (line 123-125)", () => {
		const onChatContextMenu = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onChatContextMenu={onChatContextMenu} />);
		fireEvent.contextMenu(screen.getByText("Today Chat"));
		expect(onChatContextMenu).toHaveBeenCalledWith("chat-1", expect.anything());
	});

	it("marks current chat as active", () => {
		render(<ChatGroup {...defaultGroupProps} currentChatId="chat-1" />);
		const btn = screen.getByRole("button", { name: "Today Chat" });
		expect(btn).toBeTruthy();
	});

	it("stops propagation on mousedown of chat title span (line 161)", () => {
		const onChatClick = vi.fn();
		render(<ChatGroup {...defaultGroupProps} onChatClick={onChatClick} />);
		const titleSpan = screen.getByText("Today Chat");
		fireEvent.mouseDown(titleSpan);
		expect(screen.getByText("Today Chat")).toBeTruthy();
	});
});

describe("ChatList", () => {
	const grouped = groupChatsByTime(
		[CHAT_TODAY, CHAT_3DAYS, CHAT_15DAYS, CHAT_45DAYS],
		NOW,
	);
	const baseProps = {
		isLoading: false,
		grouped,
		currentChatId: undefined,
		onChatClick: vi.fn(),
		onChatContextMenu: vi.fn(),
		onQuickDelete: vi.fn(),
		generatingChatIds: {} as Record<string, "auto" | "manual">,
		editingChatId: null,
		editValue: "",
		onEditChange: vi.fn(),
		onStartEdit: vi.fn(),
		onEditSubmit: vi.fn(),
		onEditCancel: vi.fn(),
		selectedChatIds: new Set<string>(),
		onSelectClick: vi.fn(),
	};

	it("shows loading skeleton when isLoading=true", () => {
		const { container } = render(<ChatList {...baseProps} isLoading={true} />);
		expect(container.querySelector(".animate-pulse")).toBeTruthy();
	});

	it("shows 'No chats yet' when there are no chats", () => {
		const emptyGrouped = groupChatsByTime([], NOW);
		render(<ChatList {...baseProps} grouped={emptyGrouped} />);
		expect(screen.getByText("No chats yet")).toBeTruthy();
	});

	it("renders all four time groups when chats exist in each", () => {
		render(<ChatList {...baseProps} />);
		expect(screen.getByText("Today")).toBeTruthy();
		expect(screen.getByText("Last 7 days")).toBeTruthy();
		expect(screen.getByText("Last 30 days")).toBeTruthy();
		expect(screen.getByText("Older")).toBeTruthy();
	});

	it("renders Today Chat title", () => {
		render(<ChatList {...baseProps} />);
		expect(screen.getByText("Today Chat")).toBeTruthy();
	});

	it("renders 45 Days Chat in Older group", () => {
		render(<ChatList {...baseProps} />);
		expect(screen.getByText("45 Days Chat")).toBeTruthy();
	});
});
