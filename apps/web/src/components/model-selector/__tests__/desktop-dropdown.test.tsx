// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/icons", () => ({
	SearchIcon: ({ className }: any) => <span data-testid="search-icon" className={className} />,
}));

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/model-info-panel", () => ({
	ModelInfoPanel: ({ model }: any) => (
		<div data-testid="model-info-panel">{model.name}</div>
	),
}));

vi.mock("../provider-logo", () => ({
	ProviderLogo: ({ providerId, className }: any) => (
		<img data-testid={`logo-${providerId}`} alt={providerId} className={className} />
	),
}));

vi.mock("../model-item", () => ({
	ModelItem: ({ model, isSelected, onInfoClick, onInfoHover }: { model: { id: string; name: string }; isSelected: boolean; onInfoClick: () => void; onInfoHover: () => void }) => (
		<div data-testid={`model-item-${model.id}`} aria-selected={isSelected}>
			{model.name}
			<button data-testid={`info-click-${model.id}`} onClick={onInfoClick}>InfoClick</button>
			<button data-testid={`info-hover-${model.id}`} onMouseEnter={onInfoHover}>InfoHover</button>
		</div>
	),
}));

vi.mock("../icons", () => ({
	CloseIcon: ({ className }: any) => <span data-testid="close-icon" className={className} />,
	StarIcon: ({ filled, className }: any) => (
		<span data-testid="star-icon" data-filled={filled} className={className} />
	),
}));

import { DesktopDropdown } from "../desktop-dropdown";
import type { Model } from "@/stores/model";

const makeModel = (id: string, name: string): Model =>
	({
		id,
		name,
		provider: "OpenAI",
		providerId: "openai",
		modelName: name,
		logoId: "openai",
		modality: ["text"],
		reasoning: false,
		toolCall: false,
		isFree: false,
		isPopular: false,
	}) as unknown as Model;

const baseProps = {
	contentRef: createRef<HTMLDivElement>(),
	visible: true,
	dropdownPosition: { top: 100, left: 100, openAbove: false },
	isLoading: false,
	flatList: [],
	value: "",
	uniqueProviders: [],
	query: "",
	setQuery: vi.fn(),
	isSearching: false,
	hasFavorites: false,
	showFavoritesOnly: false,
	setShowFavoritesOnly: vi.fn(),
	selectedProvider: null,
	setSelectedProvider: vi.fn(),
	addDefaults: vi.fn(),
	filterStyle: "model",
	highlightedIndex: -1,
	setHighlightedIndex: vi.fn(),
	isFavorite: vi.fn(() => false),
	missingDefaultsCount: 0,
	hoveredInfoModel: null,
	onSelect: vi.fn(),
	onClose: vi.fn(),
	onInfoOpen: vi.fn(),
	onToggleFavorite: vi.fn(),
	showInfoPanel: vi.fn(),
	hideInfoPanel: vi.fn(),
	inputRef: createRef<HTMLInputElement>(),
	listRef: createRef<HTMLDivElement>(),
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("DesktopDropdown", () => {
	it("renders without crashing", () => {
		render(<DesktopDropdown {...baseProps} />);
		expect(document.body).toBeTruthy();
	});

	it("renders search input", () => {
		render(<DesktopDropdown {...baseProps} />);
		const input = document.querySelector('input[type="text"]') as HTMLInputElement;
		expect(input).toBeTruthy();
		expect(input?.placeholder).toBe("Search all models...");
	});

	it("renders search icon", () => {
		render(<DesktopDropdown {...baseProps} />);
		expect(screen.getByTestId("search-icon")).toBeDefined();
	});

	it("shows 'Loading models...' when isLoading is true", () => {
		render(<DesktopDropdown {...baseProps} isLoading={true} />);
		expect(screen.getByText("Loading models...")).toBeDefined();
	});

	it("shows 'No models found' when flatList is empty and not searching", () => {
		render(<DesktopDropdown {...baseProps} flatList={[]} isLoading={false} />);
		expect(screen.getByText("No models found")).toBeDefined();
	});

	it("shows 'No favorites yet' when in favorites mode and list is empty", () => {
		render(
			<DesktopDropdown
				{...baseProps}
				flatList={[]}
				showFavoritesOnly={true}
				isLoading={false}
			/>,
		);
		expect(screen.getByText("No favorites yet")).toBeDefined();
	});

	it("shows 'Add suggested models' button when favorites empty", () => {
		render(
			<DesktopDropdown
				{...baseProps}
				flatList={[]}
				showFavoritesOnly={true}
				isLoading={false}
			/>,
		);
		expect(screen.getByText("Add suggested models")).toBeDefined();
	});

	it("renders model items when flatList has models", () => {
		const models = [makeModel("openai/gpt-4o", "GPT-4o"), makeModel("openai/gpt-4", "GPT-4")];
		render(<DesktopDropdown {...baseProps} flatList={models} />);
		expect(screen.getByTestId("model-item-openai/gpt-4o")).toBeDefined();
		expect(screen.getByTestId("model-item-openai/gpt-4")).toBeDefined();
	});

	it("shows model count in footer", () => {
		const models = [makeModel("openai/gpt-4o", "GPT-4o"), makeModel("openai/gpt-4", "GPT-4")];
		render(<DesktopDropdown {...baseProps} flatList={models} />);
		expect(screen.getByText("2 models")).toBeDefined();
	});

	it("shows '1 model' singular when one model", () => {
		const models = [makeModel("openai/gpt-4o", "GPT-4o")];
		render(<DesktopDropdown {...baseProps} flatList={models} />);
		expect(screen.getByText("1 model")).toBeDefined();
	});

	it("shows clear button when query is present", () => {
		render(<DesktopDropdown {...baseProps} query="gpt" />);
		expect(screen.getByTestId("close-icon")).toBeDefined();
	});

	it("does not show clear button when query is empty", () => {
		render(<DesktopDropdown {...baseProps} query="" />);
		expect(screen.queryByTestId("close-icon")).toBeNull();
	});

	it("clicking clear button calls setQuery with empty string", () => {
		const setQuery = vi.fn();
		render(<DesktopDropdown {...baseProps} query="gpt" setQuery={setQuery} />);
		fireEvent.click(screen.getByTestId("close-icon").closest("button")!);
		expect(setQuery).toHaveBeenCalledWith("");
	});

	it("shows provider sidebar when not searching", () => {
		const uniqueProviders = [
			{ id: "openai", name: "OpenAI", modelName: "gpt", logoId: "openai", count: 5 },
		];
		render(<DesktopDropdown {...baseProps} uniqueProviders={uniqueProviders} isSearching={false} />);
		expect(screen.getByTestId("logo-openai")).toBeDefined();
	});

	it("hides provider sidebar when searching", () => {
		const uniqueProviders = [
			{ id: "openai", name: "OpenAI", modelName: "gpt", logoId: "openai", count: 5 },
		];
		render(<DesktopDropdown {...baseProps} uniqueProviders={uniqueProviders} isSearching={true} />);
		expect(screen.queryByTestId("logo-openai")).toBeNull();
	});

	it("shows model info panel when hoveredInfoModel is set", () => {
		const model = makeModel("openai/gpt-4o", "GPT-4o");
		render(<DesktopDropdown {...baseProps} hoveredInfoModel={model} />);
		expect(screen.getByTestId("model-info-panel")).toBeDefined();
		expect(screen.getByText("GPT-4o")).toBeDefined();
	});

	it("does not show model info panel when hoveredInfoModel is null", () => {
		render(<DesktopDropdown {...baseProps} hoveredInfoModel={null} />);
		expect(screen.queryByTestId("model-info-panel")).toBeNull();
	});

	it("shows keyboard hints in footer", () => {
		render(<DesktopDropdown {...baseProps} />);
		expect(screen.getByText("navigate")).toBeDefined();
		expect(screen.getByText("select")).toBeDefined();
	});

	it("shows 'Add N suggested' when showFavoritesOnly and missingDefaultsCount > 0", () => {
		render(
			<DesktopDropdown
				{...baseProps}
				showFavoritesOnly={true}
				missingDefaultsCount={3}
			/>,
		);
		expect(screen.getByText(/Add 3 suggested/)).toBeDefined();
	});

	it("calls addDefaults when 'Add suggested models' button is clicked", () => {
		const addDefaults = vi.fn();
		render(
			<DesktopDropdown
				{...baseProps}
				flatList={[]}
				showFavoritesOnly={true}
				addDefaults={addDefaults}
				isLoading={false}
			/>,
		);
		fireEvent.click(screen.getByText("Add suggested models"));
		expect(addDefaults).toHaveBeenCalled();
	});

	it("star button calls setShowFavoritesOnly when hasFavorites is true", () => {
		const setShowFavoritesOnly = vi.fn();
		const setSelectedProvider = vi.fn();
		render(
			<DesktopDropdown
				{...baseProps}
				hasFavorites={true}
				setShowFavoritesOnly={setShowFavoritesOnly}
				setSelectedProvider={setSelectedProvider}
				isSearching={false}
			/>,
		);
		const starButton = screen.getByTestId("star-icon").closest("button")!;
		fireEvent.click(starButton);
		expect(setShowFavoritesOnly).toHaveBeenCalledWith(true);
	});

	it("star button calls addDefaults when hasFavorites is false", () => {
		const addDefaults = vi.fn();
		render(
			<DesktopDropdown
				{...baseProps}
				hasFavorites={false}
				addDefaults={addDefaults}
				isSearching={false}
			/>,
		);
		const starButton = screen.getByTestId("star-icon").closest("button")!;
		fireEvent.click(starButton);
		expect(addDefaults).toHaveBeenCalled();
	});

	it("typing in search input calls setQuery", () => {
		const setQuery = vi.fn();
		render(<DesktopDropdown {...baseProps} setQuery={setQuery} />);
		const input = document.querySelector('input[type="text"]')!;
		fireEvent.change(input, { target: { value: "claude" } });
		expect(setQuery).toHaveBeenCalledWith("claude");
	});

	it("visible prop controls opacity class", () => {
		const { rerender } = render(<DesktopDropdown {...baseProps} visible={true} />);
		let outer = document.querySelector("[style]");
		expect(outer?.className).toContain("opacity-100");

		rerender(<DesktopDropdown {...baseProps} visible={false} />);
		outer = document.querySelector("[style]");
		expect(outer?.className).toContain("opacity-0");
	});

	it("shows 'No models found' when isSearching is true and list empty", () => {
		render(
			<DesktopDropdown
				{...baseProps}
				flatList={[]}
				isSearching={true}
				query="nothing"
			/>,
		);
		expect(screen.getByText("No models found")).toBeDefined();
	});

	it("shows 'Clear search' link when isSearching and list empty", () => {
		render(
			<DesktopDropdown
				{...baseProps}
				flatList={[]}
				isSearching={true}
				query="nothing"
			/>,
		);
		expect(screen.getByText("Clear search")).toBeDefined();
	});
	it("clicking a non-selected provider in sidebar calls setSelectedProvider and setShowFavoritesOnly(false)", () => {
		const setSelectedProvider = vi.fn();
		const setShowFavoritesOnly = vi.fn();
		const uniqueProviders = [
			{ id: "openai", name: "OpenAI", modelName: "gpt", logoId: "openai", count: 5 },
		];
		render(
			<DesktopDropdown
				{...baseProps}
				uniqueProviders={uniqueProviders}
				isSearching={false}
				selectedProvider={null}
				setSelectedProvider={setSelectedProvider}
				setShowFavoritesOnly={setShowFavoritesOnly}
			/>,
		);
		const logo = screen.getByTestId("logo-openai");
		fireEvent.click(logo.closest("button")!);
		expect(setSelectedProvider).toHaveBeenCalledWith("openai");
		expect(setShowFavoritesOnly).toHaveBeenCalledWith(false);
	});

	it("clicking an already-selected provider in sidebar does NOT call setSelectedProvider", () => {
		const setSelectedProvider = vi.fn();
		const uniqueProviders = [
			{ id: "openai", name: "OpenAI", modelName: "gpt", logoId: "openai", count: 5 },
		];
		render(
			<DesktopDropdown
				{...baseProps}
				uniqueProviders={uniqueProviders}
				isSearching={false}
				selectedProvider="openai"
				setSelectedProvider={setSelectedProvider}
			/>,
		);
		const logo = screen.getByTestId("logo-openai");
		fireEvent.click(logo.closest("button")!);
		expect(setSelectedProvider).not.toHaveBeenCalled();
	});

	it("star button (hasFavorites=true) also calls setSelectedProvider(null)", () => {
		const setSelectedProvider = vi.fn();
		const setShowFavoritesOnly = vi.fn();
		render(
			<DesktopDropdown
				{...baseProps}
				hasFavorites={true}
				setShowFavoritesOnly={setShowFavoritesOnly}
				setSelectedProvider={setSelectedProvider}
				isSearching={false}
			/>,
		);
		const starButton = screen.getByTestId("star-icon").closest("button")!;
		fireEvent.click(starButton);
		expect(setSelectedProvider).toHaveBeenCalledWith(null);
	});

	it("footer 'Add N suggested' button click calls addDefaults", () => {
		const addDefaults = vi.fn();
		render(
			<DesktopDropdown
				{...baseProps}
				showFavoritesOnly={true}
				missingDefaultsCount={3}
				addDefaults={addDefaults}
			/>,
		);
		fireEvent.click(screen.getByText(/Add 3 suggested/));
		expect(addDefaults).toHaveBeenCalled();
	});

	it("mouseLeave on list container calls setHighlightedIndex(-1)", () => {
		const setHighlightedIndex = vi.fn();
		const models = [makeModel("openai/gpt-4o", "GPT-4o")];
		render(<DesktopDropdown {...baseProps} flatList={models} setHighlightedIndex={setHighlightedIndex} />);
		const listContainer = screen.getByRole("listbox").querySelector(".overflow-y-auto")!;
		fireEvent.mouseLeave(listContainer);
		expect(setHighlightedIndex).toHaveBeenCalledWith(-1);
	});

	it("onInfoClick on ModelItem calls onInfoOpen with model", () => {
		const onInfoOpen = vi.fn();
		const model = makeModel("openai/gpt-4o", "GPT-4o");
		render(<DesktopDropdown {...baseProps} flatList={[model]} onInfoOpen={onInfoOpen} />);
		fireEvent.click(screen.getByTestId("info-click-openai/gpt-4o"));
		expect(onInfoOpen).toHaveBeenCalledWith(model);
	});

	it("onInfoHover on ModelItem calls showInfoPanel with model", () => {
		const showInfoPanel = vi.fn();
		const model = makeModel("openai/gpt-4o", "GPT-4o");
		render(<DesktopDropdown {...baseProps} flatList={[model]} showInfoPanel={showInfoPanel} />);
		fireEvent.mouseEnter(screen.getByTestId("info-hover-openai/gpt-4o"));
		expect(showInfoPanel).toHaveBeenCalledWith(model);
	});
});
