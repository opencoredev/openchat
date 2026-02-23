// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useOpenRouterKey } from "@/stores/openrouter";
import { useProviderStore, isPreviewDeployment } from "@/stores/provider";

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

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, className }: any) => (
		<button onClick={onClick} disabled={disabled} className={className}>
			{children}
		</button>
	),
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/openrouter-connect-modal", () => ({
	OpenRouterConnectModal: ({ open }: any) =>
		open ? <div data-testid="connect-modal">ConnectModal</div> : null,
}));

import { ProvidersSection } from "../settings-providers";

const mockUseOpenRouterKey = vi.mocked(useOpenRouterKey);
const mockUseProviderStore = vi.mocked(useProviderStore);
const mockIsPreviewDeployment = vi.mocked(isPreviewDeployment);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mockUseOpenRouterKey.mockReturnValue({
		hasApiKey: false,
		clearApiKey: vi.fn(),
		initialize: vi.fn(),
		isInitialized: true,
	});
	mockUseProviderStore.mockImplementation((selector?: any) => {
		const state = {
			activeProvider: "osschat" as const,
			setActiveProvider: vi.fn(),
			dailyUsageCents: 0,
			remainingBudgetCents: () => 10,
		};
		return selector ? selector(state) : state;
	});
	mockIsPreviewDeployment.mockReturnValue(false);
});

describe("ProvidersSection", () => {
	it("renders without crashing", () => {
		render(<ProvidersSection />);
		expect(document.body).toBeTruthy();
	});

	it("shows 'AI Provider' heading", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("AI Provider")).toBeDefined();
	});

	it("shows 'OSSChat Cloud' provider", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("OSSChat Cloud")).toBeDefined();
	});

	it("shows FREE badge on OSSChat Cloud", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("FREE")).toBeDefined();
	});

	it("shows 'Personal OpenRouter' provider", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("Personal OpenRouter")).toBeDefined();
	});

	it("shows 'Connect OpenRouter Account' button when no API key", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("Connect OpenRouter Account")).toBeDefined();
	});

	it("does not show 'Disconnect' button when no API key", () => {
		render(<ProvidersSection />);
		expect(screen.queryByText("Disconnect")).toBeNull();
	});

	it("shows daily usage when osschat is active provider", () => {
		render(<ProvidersSection />);
		expect(screen.getByText("Daily Usage")).toBeDefined();
	});

	it("shows 'Disconnect' and 'Manage keys' when API key exists", () => {
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: vi.fn(),
			initialize: vi.fn(),
			isInitialized: true,
		});
		render(<ProvidersSection />);
		expect(screen.getByText("Disconnect")).toBeDefined();
		expect(screen.getByText("Manage keys")).toBeDefined();
	});

	it("shows 'CONNECTED' badge when API key exists", () => {
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: vi.fn(),
			initialize: vi.fn(),
			isInitialized: true,
		});
		render(<ProvidersSection />);
		expect(screen.getByText("CONNECTED")).toBeDefined();
	});

	it("shows 'Connect OpenRouter Account' button is not shown when API key exists", () => {
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: vi.fn(),
			initialize: vi.fn(),
			isInitialized: true,
		});
		render(<ProvidersSection />);
		expect(screen.queryByText("Connect OpenRouter Account")).toBeNull();
	});

	it("opens connect modal when 'Connect OpenRouter Account' is clicked", () => {
		render(<ProvidersSection />);
		expect(screen.queryByTestId("connect-modal")).toBeNull();
		fireEvent.click(screen.getByText("Connect OpenRouter Account"));
		expect(screen.getByTestId("connect-modal")).toBeDefined();
	});

	it("calls clearApiKey when Disconnect is clicked", () => {
		const mockClearApiKey = vi.fn().mockResolvedValue(undefined);
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: mockClearApiKey,
			initialize: vi.fn(),
			isInitialized: true,
		});
		render(<ProvidersSection />);
		fireEvent.click(screen.getByText("Disconnect"));
		expect(mockClearApiKey).toHaveBeenCalled();
	});

	it("shows daily limit in OSSChat section", () => {
		render(<ProvidersSection />);
		expect(screen.getAllByText(/10¢/).length).toBeGreaterThan(0);
	});

	it("shows warning message on preview deployment", () => {
		mockIsPreviewDeployment.mockReturnValue(true);
		render(<ProvidersSection />);
		expect(screen.getByText(/Not available on preview deployments/)).toBeDefined();
	});

	it("shows daily limit reached message when remaining budget is 0", () => {
		mockUseProviderStore.mockImplementation((selector?: any) => {
			const state = {
				activeProvider: "osschat" as const,
				setActiveProvider: vi.fn(),
				dailyUsageCents: 10,
				remainingBudgetCents: () => 0,
			};
			return selector ? selector(state) : state;
		});
		render(<ProvidersSection />);
		expect(screen.getByText(/Daily limit reached/)).toBeDefined();
	});

	it("calls initialize on mount when not initialized", () => {
		const mockInitialize = vi.fn().mockResolvedValue(undefined);
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: false,
			clearApiKey: vi.fn(),
			initialize: mockInitialize,
			isInitialized: false,
		});
		render(<ProvidersSection />);
		expect(mockInitialize).toHaveBeenCalled();
	});

	it("sets active provider to osschat when osschat button is clicked and not preview", () => {
		const mockSetActiveProvider = vi.fn();
		mockUseProviderStore.mockImplementation((selector?: any) => {
			const state = {
				activeProvider: "openrouter" as const,
				setActiveProvider: mockSetActiveProvider,
				dailyUsageCents: 0,
				remainingBudgetCents: () => 10,
			};
			return selector ? selector(state) : state;
		});
		render(<ProvidersSection />);
		fireEvent.click(screen.getByText("OSSChat Cloud"));
		expect(mockSetActiveProvider).toHaveBeenCalledWith("osschat");
	});

	it("handleDisconnect switches to osschat when activeProvider is openrouter", () => {
		const mockSetActiveProvider = vi.fn();
		const mockClearApiKey = vi.fn().mockResolvedValue(undefined);

		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: mockClearApiKey,
			initialize: vi.fn(),
			isInitialized: true,
		});
		mockUseProviderStore.mockImplementation((selector?: any) => {
			const state = {
				activeProvider: "openrouter" as const,
				setActiveProvider: mockSetActiveProvider,
				dailyUsageCents: 0,
				remainingBudgetCents: () => 10,
			};
			return selector ? selector(state) : state;
		});

		render(<ProvidersSection />);
		fireEvent.click(screen.getByText("Disconnect"));
		expect(mockClearApiKey).toHaveBeenCalled();
		expect(mockSetActiveProvider).toHaveBeenCalledWith("osschat");
	});

	it("img onError hides the image", () => {
		render(<ProvidersSection />);
		const images = document.querySelectorAll('img[alt="OpenRouter"]');
		expect(images.length).toBeGreaterThan(0);
		const img = images[0] as HTMLImageElement;
		fireEvent.error(img);
		expect(img.style.display).toBe("none");
	});

	it("preview deployment disables osschat card button", () => {
		mockIsPreviewDeployment.mockReturnValue(true);
		render(<ProvidersSection />);
		const ossButton = screen.getByText("OSSChat Cloud").closest("button") as HTMLButtonElement;
		expect(ossButton.disabled).toBe(true);
	});

	it("clicking Personal OpenRouter button when hasApiKey=true calls setActiveProvider('openrouter')", () => {
		const mockSetActiveProvider = vi.fn();
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: vi.fn(),
			initialize: vi.fn(),
			isInitialized: true,
		});
		mockUseProviderStore.mockImplementation((selector?: any) => {
			const state = {
				activeProvider: "osschat" as const,
				setActiveProvider: mockSetActiveProvider,
				dailyUsageCents: 0,
				remainingBudgetCents: () => 10,
			};
			return selector ? selector(state) : state;
		});
		render(<ProvidersSection />);
		const orButton = screen.getByText("Personal OpenRouter").closest("button")!;
		fireEvent.click(orButton);
		expect(mockSetActiveProvider).toHaveBeenCalledWith("openrouter");
	});

	it("shows checkmark svg when activeProvider is openrouter", () => {
		mockUseOpenRouterKey.mockReturnValue({
			hasApiKey: true,
			clearApiKey: vi.fn(),
			initialize: vi.fn(),
			isInitialized: true,
		});
		mockUseProviderStore.mockImplementation((selector?: any) => {
			const state = {
				activeProvider: "openrouter" as const,
				setActiveProvider: vi.fn(),
				dailyUsageCents: 0,
				remainingBudgetCents: () => 10,
			};
			return selector ? selector(state) : state;
		});
		render(<ProvidersSection />);
		const orButton = screen.getByText("Personal OpenRouter").closest("button")!;
		const checkmark = orButton.querySelector("svg");
		expect(checkmark).toBeTruthy();
	});
});
