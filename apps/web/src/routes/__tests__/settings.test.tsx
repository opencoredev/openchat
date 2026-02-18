import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
	createFileRoute: () => (opts: any) => opts,
}));

const mockUseAuth = vi.fn();
vi.mock("@/lib/auth-client", () => ({
	useAuth: (...args: any[]) => mockUseAuth(...args),
	authClient: { updateUser: vi.fn() },
	signOut: vi.fn(),
}));

vi.mock("convex/react", () => ({
	useQuery: vi.fn(() => null),
	useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: { getByExternalId: "users:getByExternalId", updateName: "users:updateName" },
	},
}));

vi.mock("@/stores/openrouter", () => ({
	useOpenRouterKey: vi.fn(() => ({
		hasApiKey: false,
		clearApiKey: vi.fn(),
		initialize: vi.fn(),
		isInitialized: true,
	})),
}));

vi.mock("@/stores/provider", () => ({
	useProviderStore: vi.fn((selector?: any) => {
		const state = {
			activeProvider: "osschat" as const,
			setActiveProvider: vi.fn(),
			dailyUsageCents: 0,
			remainingBudgetCents: () => 10,
		};
		return selector ? selector(state) : state;
	}),
	DAILY_LIMIT_CENTS: 10,
	isPreviewDeployment: vi.fn(() => false),
}));

vi.mock("@/stores/model", () => ({
	useModels: vi.fn(() => ({
		models: [],
		isLoading: false,
		reload: vi.fn(),
		totalCount: 0,
		error: null,
	})),
	getCacheStatus: vi.fn(() => ({
		hasData: false,
		isStale: false,
		age: null,
	})),
}));

vi.mock("@/stores/chat-title", () => ({
	useChatTitleStore: vi.fn((selector?: any) => {
		const state = {
			length: "standard" as const,
			setLength: vi.fn(),
			confirmDelete: true,
			setConfirmDelete: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/stores/ui", () => ({
	useUIStore: vi.fn((selector?: any) => {
		const state = {
			filterStyle: "model" as const,
			setFilterStyle: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/stores/shortcuts", () => ({
	useShortcutsStore: vi.fn((selector?: any) => {
		const state = {
			bindings: {},
			setBinding: vi.fn(),
			resetBinding: vi.fn(),
			resetAllBindings: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/lib/shortcuts", () => ({
	SHORTCUT_CATEGORIES: [
		{ id: "general", label: "General" },
		{ id: "navigation", label: "Navigation" },
		{ id: "chat", label: "Chat" },
	],
	SHORTCUT_DEFINITIONS: [
		{
			id: "toggle-sidebar",
			category: "general",
			label: "Toggle sidebar",
			description: "Show or hide the sidebar",
			defaultBinding: { mac: "meta+b", other: "ctrl+b" },
		},
	],
	bindingHasModifier: vi.fn(() => true),
	bindingToTokens: vi.fn(() => ["Ctrl", "B"]),
	eventToBinding: vi.fn(() => ""),
	getConflictingShortcutIds: vi.fn(() => []),
	getEffectiveBinding: vi.fn(() => "ctrl+b"),
	getShortcutById: vi.fn(() => null),
	isMacPlatform: vi.fn(() => false),
	isReservedShortcutBinding: vi.fn(() => false),
	normalizeBinding: vi.fn((b: string) => b),
}));

vi.mock("@/components/openrouter-connect-modal", () => ({
	OpenRouterConnectModal: () => null,
}));

vi.mock("@/components/delete-account-modal", () => ({
	DeleteAccountModal: () => null,
}));

const authenticatedUser = {
	user: { id: "u1", name: "Test User", email: "test@example.com", image: null },
	isAuthenticated: true,
	loading: false,
	refetchSession: vi.fn().mockResolvedValue(true),
};

async function renderSettings() {
	const mod = await import("../settings");
	const Component = (mod.Route as any).component;
	return render(<Component />);
}

describe("SettingsPage", () => {
	beforeEach(() => {
		mockUseAuth.mockReturnValue(authenticatedUser);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders the settings page for an authenticated user", async () => {
		await renderSettings();
		expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
		expect(screen.getByText("Account")).toBeDefined();
		expect(screen.getByText("Providers")).toBeDefined();
		expect(screen.getByText("Chat")).toBeDefined();
		expect(screen.getByText("Models")).toBeDefined();
		expect(screen.getByText("Shortcuts")).toBeDefined();
	});

	it("shows the Account section by default", async () => {
		await renderSettings();
		expect(screen.getByText("Profile")).toBeDefined();
		expect(screen.getByText("Authentication")).toBeDefined();
		expect(screen.getByText("Danger Zone")).toBeDefined();
	});

	it("navigates to Providers section when tab is clicked", async () => {
		await renderSettings();
		fireEvent.click(screen.getByText("Providers"));
		expect(screen.getByText("AI Provider")).toBeDefined();
		expect(screen.getByText("OSSChat Cloud")).toBeDefined();
	});

	it("navigates to Chat section when tab is clicked", async () => {
		await renderSettings();
		fireEvent.click(screen.getByText("Chat"));
		expect(screen.getByText("Chat Titles")).toBeDefined();
		expect(screen.getByText("Auto title length")).toBeDefined();
	});

	it("navigates to Models section when tab is clicked", async () => {
		await renderSettings();
		fireEvent.click(screen.getByText("Models"));
		expect(screen.getByText("Filter Display")).toBeDefined();
		expect(screen.getByText("Model Source")).toBeDefined();
		expect(screen.getByText("Model Cache")).toBeDefined();
	});

	it("navigates to Shortcuts section when tab is clicked", async () => {
		await renderSettings();
		fireEvent.click(screen.getByText("Shortcuts"));
		expect(screen.getByText("Keyboard Shortcuts")).toBeDefined();
		expect(screen.getByText("Reset all")).toBeDefined();
	});

	it("shows sign-in prompt when user is not authenticated", async () => {
		mockUseAuth.mockReturnValue({
			user: null,
			isAuthenticated: false,
			loading: false,
			refetchSession: vi.fn(),
		});
		await renderSettings();
		expect(screen.getByText("Please sign in to access settings.")).toBeDefined();
		expect(screen.getByText("Sign In")).toBeDefined();
	});

	it("shows a loading spinner while auth is loading", async () => {
		mockUseAuth.mockReturnValue({
			user: null,
			isAuthenticated: false,
			loading: true,
			refetchSession: vi.fn(),
		});
		await renderSettings();
		expect(screen.queryByText("Account")).toBeNull();
	});
});
