import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Id } from "@server/convex/_generated/dataModel";

const mockNavigate = vi.fn();
const mockUseQuery = vi.fn();

vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: { getByExternalId: "users:getByExternalId" },
		chats: {
			list: "chats:list",
			remove: "chats:remove",
			removeBulk: "chats:removeBulk",
			setTitle: "chats:setTitle",
			setGeneratedTitle: "chats:setGeneratedTitle",
			generateTitle: "chats:generateTitle",
		},
		messages: { getFirstUserMessage: "messages:getFirstUserMessage" },
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));

vi.mock("@/lib/auth-client", () => ({
	useAuth: vi.fn(() => ({
		user: null,
		session: null,
		loading: false,
		isAuthenticated: false,
		refetchSession: vi.fn(),
	})),
}));

vi.mock("@/lib/convex", () => ({
	convexClient: { query: vi.fn(), mutation: vi.fn(), action: vi.fn() },
}));

vi.mock("@/stores/provider", () => ({
	useProviderStore: vi.fn(
		(selector: (s: { activeProvider: string }) => unknown) =>
			selector({ activeProvider: "osschat" }),
	),
}));

vi.mock("@/stores/chat-title", () => ({
	useChatTitleStore: vi.fn(
		(
			selector: (s: {
				length: string;
				confirmDelete: boolean;
				generatingChatIds: Record<string, string>;
				setGenerating: () => void;
			}) => unknown,
		) =>
			selector({
				length: "standard",
				confirmDelete: true,
				generatingChatIds: {},
				setGenerating: vi.fn(),
			}),
	),
}));

const mockDeselectAll = vi.fn();
vi.mock("@/stores/bulk-selection", () => ({
	useBulkSelectionStore: vi.fn(
		(
			selector: (s: {
				selectedChatIds: Set<string>;
				selectChat: () => void;
				selectAll: () => void;
				deselectAll: () => void;
				getSelectedChatIds: () => string[];
			}) => unknown,
		) =>
			selector({
				selectedChatIds: new Set<string>(),
				selectChat: vi.fn(),
				selectAll: vi.fn(),
				deselectAll: mockDeselectAll,
				getSelectedChatIds: () => [],
			}),
	),
}));

vi.mock("@/components/ui/sidebar", () => ({
	Sidebar: ({ children, ...props }: React.PropsWithChildren) => (
		<div data-testid="sidebar" {...props}>
			{children}
		</div>
	),
	SidebarContent: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sidebar-content">{children}</div>
	),
	SidebarFooter: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sidebar-footer">{children}</div>
	),
	SidebarGroup: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sidebar-group">{children}</div>
	),
	SidebarGroupLabel: ({ children }: React.PropsWithChildren) => (
		<div data-testid="sidebar-group-label">{children}</div>
	),
	SidebarMenu: ({ children }: React.PropsWithChildren) => (
		<ul data-testid="sidebar-menu">{children}</ul>
	),
	SidebarMenuButton: ({
		children,
		...props
	}: React.PropsWithChildren<{ isActive?: boolean; onClick?: () => void }>) => (
		<button data-testid="sidebar-menu-button" {...props}>
			{children}
		</button>
	),
	SidebarMenuItem: ({
		children,
		...props
	}: React.PropsWithChildren<{ className?: string }>) => (
		<li data-testid="sidebar-menu-item" {...props}>
			{children}
		</li>
	),
	useSidebar: () => ({
		state: "expanded",
		open: true,
		setOpen: vi.fn(),
		openMobile: false,
		setOpenMobile: vi.fn(),
		isMobile: false,
		toggleSidebar: vi.fn(),
	}),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: React.PropsWithChildren<Record<string, unknown>>) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogAction: ({ children }: React.PropsWithChildren) => (
		<button>{children}</button>
	),
	AlertDialogCancel: ({ children }: React.PropsWithChildren) => (
		<button>{children}</button>
	),
	AlertDialogContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => (
		<p>{children}</p>
	),
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
		<h2>{children}</h2>
	),
}));

vi.mock("@/components/icons", () => ({
	ChevronRightIcon: () => <span data-testid="icon-chevron" />,
	MenuIcon: () => <span data-testid="icon-menu" />,
	PlusIcon: () => <span data-testid="icon-plus" />,
	SidebarIcon: () => <span data-testid="icon-sidebar" />,
}));

vi.mock("lucide-react", () => ({
	GitForkIcon: () => <span data-testid="icon-git-fork" />,
	PencilIcon: () => <span data-testid="icon-pencil" />,
	SparklesIcon: () => <span data-testid="icon-sparkles" />,
	Trash2Icon: () => <span data-testid="icon-trash" />,
	XIcon: () => <span data-testid="icon-x" />,
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

import { AppSidebar } from "../app-sidebar";
import { useAuth } from "@/lib/auth-client";
import { useBulkSelectionStore } from "@/stores/bulk-selection";

function makeChatItem(
	id: string,
	title: string,
	minutesAgo: number,
): {
	_id: Id<"chats">;
	title: string;
	updatedAt: number;
} {
	return {
		_id: id as Id<"chats">,
		title,
		updatedAt: Date.now() - minutesAgo * 60 * 1000,
	};
}

function setupQueryMocks(options: {
	convexUser?: { _id: string } | undefined;
	chats?: Array<{ _id: Id<"chats">; title: string; updatedAt: number }>;
}) {
	mockUseQuery.mockImplementation((queryName: string, args: unknown) => {
		if (args === "skip") return undefined;
		if (queryName === "users:getByExternalId") {
			return options.convexUser ?? undefined;
		}
		if (queryName === "chats:list") {
			return options.chats ? { chats: options.chats } : undefined;
		}
		return undefined;
	});
}

function setupAuthenticatedUser() {
	vi.mocked(useAuth).mockReturnValue({
		user: { id: "u1", email: "a@b.c", name: "Alice", image: null },
		session: { id: "s1", token: "tok" },
		loading: false,
		isAuthenticated: true,
		refetchSession: vi.fn(),
	});
}

describe("AppSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUseQuery.mockReturnValue(undefined);
	});

	it("renders without crashing", () => {
		setupQueryMocks({});
		const { container } = render(<AppSidebar />);
		expect(container).toBeTruthy();
	});

	it("shows 'New Chat' button", () => {
		setupQueryMocks({});
		render(<AppSidebar />);
		expect(screen.getByText("New Chat")).toBeTruthy();
	});

	it("shows 'No chats yet' empty state when there are no chats", () => {
		setupAuthenticatedUser();
		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [],
		});

		render(<AppSidebar />);
		expect(screen.getByText("No chats yet")).toBeTruthy();
	});

	it("shows chat titles when chats exist", () => {
		setupAuthenticatedUser();
		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [
				makeChatItem("chat1", "My First Chat", 5),
				makeChatItem("chat2", "Another Chat", 30),
			],
		});

		render(<AppSidebar />);
		expect(screen.getByText("My First Chat")).toBeTruthy();
		expect(screen.getByText("Another Chat")).toBeTruthy();
	});

	it("groups chats under 'Today' label when recent", () => {
		setupAuthenticatedUser();
		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [makeChatItem("chat1", "Recent Chat", 5)],
		});

		render(<AppSidebar />);
		expect(screen.getByText("Today")).toBeTruthy();
		expect(screen.getByText("Recent Chat")).toBeTruthy();
	});

	it("shows bulk selection bar with count when chats are selected", () => {
		setupAuthenticatedUser();
		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [
				makeChatItem("chat1", "Chat One", 5),
				makeChatItem("chat2", "Chat Two", 10),
			],
		});

		const selectedIds = new Set<string>(["chat1", "chat2"]);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(vi.mocked(useBulkSelectionStore) as any).mockImplementation(
			(selector: (s: Record<string, unknown>) => unknown) =>
				selector({
					selectedChatIds: selectedIds,
					selectChat: vi.fn(),
					selectAll: vi.fn(),
					deselectAll: mockDeselectAll,
					getSelectedChatIds: () => ["chat1", "chat2"],
				}),
		);

		render(<AppSidebar />);
		expect(screen.getByText("2 selected")).toBeTruthy();
		expect(screen.getByText("Delete")).toBeTruthy();
	});

	it("shows user profile in footer when authenticated", () => {
		vi.mocked(useAuth).mockReturnValue({
			user: { id: "u1", email: "alice@test.com", name: "Alice", image: null },
			session: { id: "s1", token: "tok" },
			loading: false,
			isAuthenticated: true,
			refetchSession: vi.fn(),
		});

		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [],
		});

		render(<AppSidebar />);
		expect(screen.getByText("Alice")).toBeTruthy();
		expect(screen.getByText("Settings")).toBeTruthy();
	});

	it("does not show user profile when not authenticated", () => {
		vi.mocked(useAuth).mockReturnValue({
			user: null,
			session: null,
			loading: false,
			isAuthenticated: false,
			refetchSession: vi.fn(),
		});

		setupQueryMocks({});

		render(<AppSidebar />);
		expect(screen.queryByText("Settings")).toBeNull();
	});

	it("shows mobile menu button with correct aria-label", () => {
		setupQueryMocks({});
		render(<AppSidebar />);
		expect(screen.getByLabelText("Open menu")).toBeTruthy();
	});

	it("shows delete buttons on each chat item", () => {
		setupAuthenticatedUser();
		setupQueryMocks({
			convexUser: { _id: "convex_u1" },
			chats: [
				makeChatItem("chat1", "Chat One", 5),
				makeChatItem("chat2", "Chat Two", 10),
			],
		});

		render(<AppSidebar />);
		const deleteButtons = screen.getAllByLabelText("Delete chat");
		expect(deleteButtons.length).toBe(2);
	});
});
