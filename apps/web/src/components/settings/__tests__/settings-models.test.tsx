// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useModels, getCacheStatus } from "@/stores/model";
import { useUIStore } from "@/stores/ui";

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

vi.mock("@/stores/ui", () => ({
	useUIStore: vi.fn((selector?: any) => {
		const state = {
			filterStyle: "model" as const,
			setFilterStyle: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, className }: any) => (
		<button onClick={onClick} disabled={disabled} className={className}>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/separator", () => ({
	Separator: () => <hr />,
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	CheckCircleIcon: () => <span data-testid="check-icon" />,
	DatabaseIcon: () => <span data-testid="database-icon" />,
	RefreshCwIcon: ({ className }: any) => <span data-testid="refresh-icon" className={className} />,
	ZapIcon: () => <span data-testid="zap-icon" />,
}));

import { ModelsSection } from "../settings-models";

const mockUseModels = vi.mocked(useModels);
const mockGetCacheStatus = vi.mocked(getCacheStatus);
const mockUseUIStore = vi.mocked(useUIStore);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mockUseModels.mockReturnValue({
		models: [],
		isLoading: false,
		reload: vi.fn(),
		totalCount: 0,
		error: null,
	});
	mockGetCacheStatus.mockReturnValue({
		hasData: false,
		isStale: false,
		age: null,
	});
	mockUseUIStore.mockImplementation((selector?: any) => {
		const state = {
			filterStyle: "model" as const,
			setFilterStyle: vi.fn(),
		};
		return selector ? selector(state) : state;
	});
});

describe("ModelsSection", () => {
	it("renders without crashing", () => {
		render(<ModelsSection />);
		expect(document.body).toBeTruthy();
	});

	it("shows 'Filter Display' heading", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Filter Display")).toBeDefined();
	});

	it("shows 'Model Source' heading", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Model Source")).toBeDefined();
	});

	it("shows 'Model Cache' heading", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Model Cache")).toBeDefined();
	});

	it("shows 'Available Models' heading", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Available Models")).toBeDefined();
	});

	it("shows 'OpenRouter' label in model source", () => {
		render(<ModelsSection />);
		expect(screen.getByText("OpenRouter")).toBeDefined();
	});

	it("shows Model and Company filter buttons", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Model")).toBeDefined();
		expect(screen.getByText("Company")).toBeDefined();
	});

	it("shows '0 models available' when totalCount is 0", () => {
		render(<ModelsSection />);
		expect(screen.getByText("0 models available")).toBeDefined();
	});

	it("shows Refresh button", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Refresh")).toBeDefined();
	});

	it("shows 'Last Updated' and 'Never' when no cache age", () => {
		render(<ModelsSection />);
		expect(screen.getByText("Last Updated")).toBeDefined();
		expect(screen.getByText("Never")).toBeDefined();
	});

	it("shows loading state in available models section", () => {
		mockUseModels.mockReturnValue({
			models: [],
			isLoading: true,
			reload: vi.fn(),
			totalCount: 0,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("Loading models...")).toBeDefined();
	});

	it("shows loading indicator in models loaded section when loading", () => {
		mockUseModels.mockReturnValue({
			models: [],
			isLoading: true,
			reload: vi.fn(),
			totalCount: 0,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("Loading...")).toBeDefined();
	});

	it("shows model list when models are available", () => {
		mockUseModels.mockReturnValue({
			models: [
				{
					id: "openai/gpt-4o",
					name: "GPT-4o",
					provider: "OpenAI",
					logoId: "openai",
					isPopular: false,
					isFree: false,
				},
			],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 1,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("GPT-4o")).toBeDefined();
		expect(screen.getByText("OpenAI")).toBeDefined();
	});

	it("shows POPULAR badge for popular models", () => {
		mockUseModels.mockReturnValue({
			models: [
				{
					id: "openai/gpt-4o",
					name: "GPT-4o",
					provider: "OpenAI",
					logoId: "openai",
					isPopular: true,
					isFree: false,
				},
			],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 1,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("POPULAR")).toBeDefined();
	});

	it("shows FREE badge for free models", () => {
		mockUseModels.mockReturnValue({
			models: [
				{
					id: "openai/gpt-4o",
					name: "GPT-4o",
					provider: "OpenAI",
					logoId: "openai",
					isPopular: false,
					isFree: true,
				},
			],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 1,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("FREE")).toBeDefined();
	});

	it("shows '+N more models available' when totalCount > 8", () => {
		const models = Array.from({ length: 8 }, (_, i) => ({
			id: `model-${i}`,
			name: `Model ${i}`,
			provider: "Provider",
			logoId: "provider",
			isPopular: false,
			isFree: false,
		}));
		mockUseModels.mockReturnValue({
			models,
			isLoading: false,
			reload: vi.fn(),
			totalCount: 15,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("+7 more models available")).toBeDefined();
	});

	it("shows error message when error is present", () => {
		mockUseModels.mockReturnValue({
			models: [],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 0,
			error: new Error("Failed to fetch models"),
		});
		render(<ModelsSection />);
		expect(screen.getByText(/Error loading models: Failed to fetch models/)).toBeDefined();
	});

	it("shows 'Fresh' badge when cache has data and is not stale", () => {
		mockGetCacheStatus.mockReturnValue({
			hasData: true,
			isStale: false,
			age: 60000,
		});
		render(<ModelsSection />);
		expect(screen.getByText("Fresh")).toBeDefined();
	});

	it("shows 'Stale' badge when cache is stale", () => {
		mockGetCacheStatus.mockReturnValue({
			hasData: true,
			isStale: true,
			age: 7200000,
		});
		render(<ModelsSection />);
		expect(screen.getByText("Stale")).toBeDefined();
	});

	it("shows formatted age from cache", () => {
		mockGetCacheStatus.mockReturnValue({
			hasData: true,
			isStale: false,
			age: 120000,
		});
		render(<ModelsSection />);
		expect(screen.getByText("2m ago")).toBeDefined();
	});

	it("clicking Company button calls setFilterStyle", () => {
		const mockSetFilterStyle = vi.fn();
		mockUseUIStore.mockImplementation((selector?: any) => {
			const state = {
				filterStyle: "model" as const,
				setFilterStyle: mockSetFilterStyle,
			};
			return selector ? selector(state) : state;
		});
		render(<ModelsSection />);
		fireEvent.click(screen.getByText("Company"));
		expect(mockSetFilterStyle).toHaveBeenCalledWith("company");
	});

	it("clicking Model button calls setFilterStyle", () => {
		const mockSetFilterStyle = vi.fn();
		mockUseUIStore.mockImplementation((selector?: any) => {
			const state = {
				filterStyle: "company" as const,
				setFilterStyle: mockSetFilterStyle,
			};
			return selector ? selector(state) : state;
		});
		render(<ModelsSection />);
		fireEvent.click(screen.getByText("Model"));
		expect(mockSetFilterStyle).toHaveBeenCalledWith("model");
	});

	it("clicking Refresh button triggers reload", async () => {
		const mockReload = vi.fn().mockResolvedValue(undefined);
		mockUseModels.mockReturnValue({
			models: [],
			isLoading: false,
			reload: mockReload,
			totalCount: 0,
			error: null,
		});
		render(<ModelsSection />);
		fireEvent.click(screen.getByText("Refresh"));
		expect(mockReload).toHaveBeenCalled();
	});

	it("shows model count in models loaded section", () => {
		mockUseModels.mockReturnValue({
			models: [],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 42,
			error: null,
		});
		render(<ModelsSection />);
		expect(screen.getByText("42 models available")).toBeDefined();
	});

	it("shows formatted age in days when age exceeds 24h (line 16)", () => {
		mockGetCacheStatus.mockReturnValue({
			hasData: true,
			isStale: true,
			age: 2 * 24 * 60 * 60 * 1000,
		});
		render(<ModelsSection />);
		expect(screen.getByText("2d ago")).toBeDefined();
	});

	it("hides model logo img on error (line 182)", () => {
		mockUseModels.mockReturnValue({
			models: [
				{
					id: "openai/gpt-4o",
					name: "GPT-4o",
					provider: "OpenAI",
					logoId: "openai",
					isPopular: false,
					isFree: false,
				},
			],
			isLoading: false,
			reload: vi.fn(),
			totalCount: 1,
			error: null,
		});
		render(<ModelsSection />);
		const img = document.querySelector("img") as HTMLImageElement;
		expect(img).toBeTruthy();
		fireEvent.error(img);
		expect(img.style.display).toBe("none");
	});
});
