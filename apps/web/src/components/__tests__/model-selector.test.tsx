// @vitest-environment jsdom

vi.mock("react-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-dom")>();
	return { ...actual, flushSync: (fn: () => void) => fn() };
});

vi.mock("@/stores/model", () => ({
	useModels: vi.fn(),
	getModelById: vi.fn(),
	useModelStore: vi.fn(),
}));

vi.mock("@/hooks/use-favorite-models", () => ({
	useFavoriteModels: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({
	useUIStore: vi.fn(),
}));

vi.mock("@/components/icons", () => ({
	ChevronDownIcon: () => null,
	SearchIcon: () => null,
}));

vi.mock("@/components/model-info-panel", () => ({
	ModelInfoPanel: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: any) => <>{children}</>,
	Tooltip: ({ children }: any) => <>{children}</>,
	TooltipTrigger: ({ children }: any) => <span>{children}</span>,
	TooltipContent: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children, open, onOpenChange }: any) => (
		<>
			{open && (
				<button
					data-testid="dialog-close-btn"
					onClick={() => onOpenChange?.(false)}
				/>
			)}
			{children}
		</>
	),
	DialogContent: ({ children }: any) => <div>{children}</div>,
	DialogHeader: ({ children }: any) => <div>{children}</div>,
	DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { ModelSelector, ConnectedModelSelector } from "../model-selector";
import type { Model } from "@/stores/model";
import { useModels, getModelById, useModelStore } from "@/stores/model";
import { useFavoriteModels } from "@/hooks/use-favorite-models";
import { useUIStore } from "@/stores/ui";

const MOCK_MODELS: Model[] = [
	{
		id: "anthropic/claude-3.5-sonnet",
		name: "Claude 3.5 Sonnet",
		provider: "Anthropic",
		modelName: "Claude",
		providerId: "anthropic",
		logoId: "anthropic",
		isPopular: true,
		isFree: false,
		toolCall: true,
		reasoning: false,
		modality: "text",
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		modelName: "GPT",
		providerId: "openai",
		logoId: "openai",
		isPopular: true,
		isFree: false,
		toolCall: true,
		reasoning: false,
		modality: "text+image",
	},
	{
		id: "test/free-model:free",
		name: "Free Test Model",
		provider: "TestCo",
		modelName: "Free",
		providerId: "test",
		logoId: "test",
		isPopular: false,
		isFree: true,
		toolCall: false,
		reasoning: false,
		modality: "text",
	},
];

function setupDefaultMocks() {
	vi.mocked(useModels).mockReturnValue({
		models: MOCK_MODELS,
		isLoading: false,
		modelsByProvider: {},
		modelsByFamily: {},
		providers: [],
		families: [],
		popularModels: [],
		error: null,
		reload: vi.fn(),
		totalCount: MOCK_MODELS.length,
	} as any);

	vi.mocked(getModelById).mockImplementation(
		(models: Model[], id: string) => models.find((m) => m.id === id),
	);

	vi.mocked(useFavoriteModels).mockReturnValue({
		favorites: new Set<string>(),
		toggleFavorite: vi.fn(),
		isFavorite: vi.fn(() => false),
		addDefaults: vi.fn(),
		missingDefaultsCount: 0,
		hasMissingDefaults: false,
		isLoading: false,
		isAuthenticated: false,
	});

	vi.mocked(useModelStore).mockImplementation((selector: any) =>
		selector({
			selectedModelId: "anthropic/claude-3.5-sonnet",
			setSelectedModel: vi.fn(),
		}),
	);

	vi.mocked(useUIStore).mockImplementation((selector: any) =>
		selector({ filterStyle: "company" }),
	);
}

async function openDropdown() {
	const trigger = screen.getByRole("button", { name: "Select model" });
	await act(async () => {
		fireEvent.click(trigger);
	});
}

describe("ModelSelector", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		setupDefaultMocks();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders the trigger button with the selected model name", () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		expect(trigger).toBeTruthy();
		const names = screen.getAllByText("Claude 3.5 Sonnet");
		expect(names.length >= 1).toBe(true);
	});

	it("shows 'Select model' placeholder when value does not match any model", () => {
		vi.mocked(getModelById).mockReturnValue(undefined);
		render(<ModelSelector value="unknown/model" onValueChange={vi.fn()} />);
		expect(screen.getByText("Select model")).toBeTruthy();
	});

	it("shows 'Loading...' while models are loading and no model is selected", () => {
		vi.mocked(useModels).mockReturnValue({
			models: [],
			isLoading: true,
		} as any);
		vi.mocked(getModelById).mockReturnValue(undefined);
		render(<ModelSelector value="" onValueChange={vi.fn()} />);
		expect(screen.getByText("Loading...")).toBeTruthy();
	});

	it("shows all model items in the dropdown after the trigger is clicked", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		expect(screen.getAllByText("Claude 3.5 Sonnet").length >= 1).toBe(true);
		expect(screen.getByText("GPT-4o")).toBeTruthy();
		expect(screen.getByText("Free Test Model")).toBeTruthy();
	});

	it("filters the model list to only matching models when user types a query", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		const input = screen.getByPlaceholderText("Search all models...");
		await act(async () => {
			fireEvent.change(input, { target: { value: "gpt" } });
		});
		expect(screen.getByText("GPT-4o")).toBeTruthy();
		expect(screen.queryByText("Free Test Model")).toBeNull();
	});

	it("shows 'No models found' when the search query has no results", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		const input = screen.getByPlaceholderText("Search all models...");
		await act(async () => {
			fireEvent.change(input, { target: { value: "zzz_nomatch_xyz_99" } });
		});
		expect(screen.getByText("No models found")).toBeTruthy();
	});

	it("calls onValueChange with the correct model id when a model item is clicked", async () => {
		const onValueChange = vi.fn();
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={onValueChange}
			/>,
		);
		await openDropdown();
		const gptText = screen.getByText("GPT-4o");
		await act(async () => {
			fireEvent.click(gptText);
		});
		expect(onValueChange).toHaveBeenCalledWith("openai/gpt-4o");
	});

	it("renders provider logo images in the sidebar column after dropdown opens", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		const imgs = screen.getAllByRole("img");
		expect(imgs.length >= 2).toBe(true);
	});

	it("shows the 'Free' badge for models that have isFree=true", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		expect(screen.getByText("Free")).toBeTruthy();
	});

	it("displays the correct model count in the dropdown footer", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		expect(screen.getByText("3 models")).toBeTruthy();
	});

	it("has disabled attribute and does not open the dropdown when disabled=true", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
				disabled
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		expect(trigger.hasAttribute("disabled")).toBe(true);
		await act(async () => {
			fireEvent.click(trigger);
		});
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("selects the highlighted model with ArrowDown then Enter", async () => {
		const onValueChange = vi.fn();
		render(
			<ModelSelector value="openai/gpt-4o" onValueChange={onValueChange} />,
		);
		await openDropdown();
		await act(async () => {
			fireEvent.keyDown(document, { key: "ArrowDown" });
		});
		await act(async () => {
			fireEvent.keyDown(document, { key: "Enter" });
		});
		expect(onValueChange).toHaveBeenCalled();
	});

	it("calls scrollIntoView when ArrowDown highlights an element with data-index", async () => {
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		render(<ModelSelector value="anthropic/claude-3.5-sonnet" onValueChange={vi.fn()} />);
		await openDropdown();
		await act(async () => {
			fireEvent.keyDown(document, { key: "ArrowDown" });
		});
		expect(scrollIntoView).toHaveBeenCalled();
	});

	it("closes the dropdown when the Escape key is pressed", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		await openDropdown();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await act(async () => {
			fireEvent.keyDown(document, { key: "Escape" });
		});
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("closes the dropdown when the Tab key is pressed", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		await openDropdown();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await act(async () => {
			fireEvent.keyDown(document, { key: "Tab" });
		});
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("navigates up with ArrowUp key", async () => {
		const onValueChange = vi.fn();
		render(
			<ModelSelector value="openai/gpt-4o" onValueChange={onValueChange} />,
		);
		await openDropdown();
		await act(async () => {
			fireEvent.keyDown(document, { key: "ArrowDown" });
		});
		await act(async () => {
			fireEvent.keyDown(document, { key: "ArrowDown" });
		});
		await act(async () => {
			fireEvent.keyDown(document, { key: "ArrowUp" });
		});
		await act(async () => {
			fireEvent.keyDown(document, { key: "Enter" });
		});
		expect(onValueChange).toHaveBeenCalled();
	});

	it("closes the dropdown when clicking the trigger while it is open", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		await openDropdown();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await act(async () => {
			fireEvent.click(trigger);
		});
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("closes the dropdown when clicking outside of it", async () => {
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Select model" });
		await openDropdown();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await act(async () => {
			fireEvent.mouseDown(document.body);
		});
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("calls toggleFavorite when the star button on a model item is clicked", async () => {
		const toggleFavorite = vi.fn();
		vi.mocked(useFavoriteModels).mockReturnValue({
			favorites: new Set<string>(),
			toggleFavorite,
			isFavorite: vi.fn(() => false),
			addDefaults: vi.fn(),
			missingDefaultsCount: 0,
			hasMissingDefaults: false,
			isLoading: false,
			isAuthenticated: false,
		});
		render(
			<ModelSelector
				value="anthropic/claude-3.5-sonnet"
				onValueChange={vi.fn()}
			/>,
		);
		await openDropdown();
		const favBtns = screen.getAllByTitle("Add to favorites");
		expect(favBtns.length).toBeGreaterThan(0);
		await act(async () => {
			fireEvent.click(favBtns[0]);
		});
		expect(toggleFavorite).toHaveBeenCalled();
	});
});

describe("ConnectedModelSelector", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		setupDefaultMocks();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders the selected model name from the model store", () => {
		render(<ConnectedModelSelector />);
		const trigger = screen.getByRole("button", { name: "Select model" });
		expect(trigger).toBeTruthy();
		const names = screen.getAllByText("Claude 3.5 Sonnet");
		expect(names.length >= 1).toBe(true);
	});

	it("calls the store setSelectedModel when a model is selected", async () => {
		const mockSetSelectedModel = vi.fn();
		vi.mocked(useModelStore).mockImplementation((selector: any) =>
			selector({
				selectedModelId: "anthropic/claude-3.5-sonnet",
				setSelectedModel: mockSetSelectedModel,
			}),
		);
		render(<ConnectedModelSelector />);
		const trigger = screen.getByRole("button", { name: "Select model" });
		await act(async () => {
			fireEvent.click(trigger);
		});
		const gptText = screen.getByText("GPT-4o");
		await act(async () => {
			fireEvent.click(gptText);
		});
		expect(mockSetSelectedModel).toHaveBeenCalledWith("openai/gpt-4o");
	});

});
