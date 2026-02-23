// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

vi.mock("@/lib/utils", () => ({
	cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}));

vi.mock("@/components/icons", () => ({
	SearchIcon: () => <span data-testid="search-icon" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("../provider-logo", () => ({
	ProviderLogo: ({ providerId }: any) => <span data-testid={`logo-${providerId}`} />,
}));

vi.mock("../model-item", () => ({
	ModelItem: ({ model, onSelect, isSelected, onHover, onInfoClick, onToggleFavorite }: any) => (
		<div
			data-testid={`model-item-${model.id}`}
			data-selected={String(isSelected)}
			onClick={onSelect}
			onMouseEnter={onHover}
		>
			<button data-testid={`info-btn-${model.id}`} onClick={() => onInfoClick?.()}>InfoBtn</button>
			<button data-testid={`fav-btn-${model.id}`} onClick={(e: any) => onToggleFavorite?.(e)}>FavBtn</button>
		</div>
	),
}));

vi.mock("../icons", () => ({
	CloseIcon: () => <span data-testid="close-icon" />,
	StarIcon: ({ filled }: any) => <span data-testid="star-icon" data-filled={String(filled)} />,
}));

import { MobileDrawer } from "../mobile-drawer";
import type { Model } from "@/stores/model";

const makeModel = (id: string): Model =>
	({
		id,
		name: id,
		description: "",
		context_length: 4096,
		pricing: { prompt: "0", completion: "0" },
	}) as unknown as Model;

const makeProps = (overrides: Record<string, any> = {}) => ({
	contentRef: createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement | null>,
	visible: true,
	isLoading: false,
	flatList: [] as Model[],
	value: "",
	uniqueProviders: [] as any[],
	query: "",
	setQuery: vi.fn(),
	isSearching: false,
	hasFavorites: false,
	showFavoritesOnly: false,
	setShowFavoritesOnly: vi.fn(),
	selectedProvider: null as string | null,
	setSelectedProvider: vi.fn(),
	addDefaults: vi.fn(),
	filterStyle: "company",
	highlightedIndex: -1,
	setHighlightedIndex: vi.fn(),
	isFavorite: vi.fn(() => false),
	missingDefaultsCount: 0,
	onSelect: vi.fn(),
	onClose: vi.fn(),
	onToggleFavorite: vi.fn(),
	inputRef: createRef<HTMLInputElement>() as React.RefObject<HTMLInputElement | null>,
	listRef: createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement | null>,
	...overrides,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("MobileDrawer", () => {
	it("renders the 'Select Model' heading", () => {
		render(<MobileDrawer {...makeProps()} />);
		expect(screen.getByText("Select Model")).toBeTruthy();
	});

	it("renders close button with aria-label='Close'", () => {
		render(<MobileDrawer {...makeProps()} />);
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
	});

	it("clicking close button calls onClose", () => {
		const props = makeProps();
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("clicking backdrop div calls onClose", () => {
		const props = makeProps();
		const { container } = render(<MobileDrawer {...props} />);
		const backdrop = container.querySelector(".bg-black\\/60");
		expect(backdrop).toBeTruthy();
		fireEvent.click(backdrop!);
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("visible=true → drawer does NOT have translate-y-full class", () => {
		const { container } = render(<MobileDrawer {...makeProps({ visible: true })} />);
		const drawer = container.querySelector('[role="listbox"]');
		expect(drawer).toBeTruthy();
		expect(drawer!.className).not.toContain("translate-y-full");
	});

	it("visible=false → drawer has translate-y-full class", () => {
		const { container } = render(<MobileDrawer {...makeProps({ visible: false })} />);
		const drawer = container.querySelector('[role="listbox"]');
		expect(drawer).toBeTruthy();
		expect(drawer!.className).toContain("translate-y-full");
	});

	it("visible=true → backdrop does NOT have pointer-events-none", () => {
		const { container } = render(<MobileDrawer {...makeProps({ visible: true })} />);
		const backdrop = container.querySelector(".bg-black\\/60");
		expect(backdrop!.className).not.toContain("pointer-events-none");
	});

	it("visible=false → backdrop has pointer-events-none", () => {
		const { container } = render(<MobileDrawer {...makeProps({ visible: false })} />);
		const backdrop = container.querySelector(".bg-black\\/60");
		expect(backdrop!.className).toContain("pointer-events-none");
	});

	it("search input renders with correct placeholder", () => {
		render(<MobileDrawer {...makeProps()} />);
		const input = screen.getByPlaceholderText("Search all models...");
		expect(input).toBeTruthy();
	});

	it("typing in search input calls setQuery with typed value", () => {
		const props = makeProps();
		render(<MobileDrawer {...props} />);
		const input = screen.getByPlaceholderText("Search all models...");
		fireEvent.change(input, { target: { value: "gpt" } });
		expect(props.setQuery).toHaveBeenCalledWith("gpt");
	});

	it("when query is non-empty, clear button appears", () => {
		render(<MobileDrawer {...makeProps({ query: "gpt" })} />);
		const closeIcons = screen.getAllByTestId("close-icon");
		expect(closeIcons.length).toBeGreaterThanOrEqual(2);
	});

	it("clicking clear button calls setQuery('')", () => {
		const props = makeProps({ query: "gpt" });
		const { container } = render(<MobileDrawer {...props} />);
		const allButtons = container.querySelectorAll("button:not([aria-label])");
		const clearButton = Array.from(allButtons).find((btn) =>
			btn.querySelector('[data-testid="close-icon"]'),
		);
		expect(clearButton).toBeTruthy();
		fireEvent.click(clearButton!);
		expect(props.setQuery).toHaveBeenCalledWith("");
	});

	it("when isLoading=true, shows 'Loading models...' text", () => {
		render(<MobileDrawer {...makeProps({ isLoading: true })} />);
		expect(screen.getByText("Loading models...")).toBeTruthy();
	});

	it("when flatList=[] and isLoading=false and not searching, shows 'No models found'", () => {
		render(<MobileDrawer {...makeProps({ flatList: [], isLoading: false, isSearching: false })} />);
		expect(screen.getByText("No models found")).toBeTruthy();
	});

	it("when isSearching=true and no results, shows 'Clear search' button", () => {
		render(
			<MobileDrawer
				{...makeProps({ flatList: [], isSearching: true, query: "xyz" })}
			/>,
		);
		expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
	});

	it("clicking 'Clear search' button calls setQuery('')", () => {
		const props = makeProps({ flatList: [], isSearching: true, query: "xyz" });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
		expect(props.setQuery).toHaveBeenCalledWith("");
	});

	it("when showFavoritesOnly=true and no results, shows 'Add suggested models' button", () => {
		render(
			<MobileDrawer
				{...makeProps({ flatList: [], showFavoritesOnly: true, isSearching: false })}
			/>,
		);
		expect(screen.getByRole("button", { name: /Add suggested models/i })).toBeTruthy();
	});

	it("clicking 'Add suggested models' calls addDefaults", () => {
		const props = makeProps({ flatList: [], showFavoritesOnly: true, isSearching: false });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByRole("button", { name: /Add suggested models/i }));
		expect(props.addDefaults).toHaveBeenCalledTimes(1);
	});

	it("when flatList has models, renders a model-item for each", () => {
		const models = [makeModel("m1"), makeModel("m2"), makeModel("m3")];
		render(<MobileDrawer {...makeProps({ flatList: models })} />);
		expect(screen.getByTestId("model-item-m1")).toBeTruthy();
		expect(screen.getByTestId("model-item-m2")).toBeTruthy();
		expect(screen.getByTestId("model-item-m3")).toBeTruthy();
	});

	it("clicking a model item calls onSelect with model.id", () => {
		const props = makeProps({ flatList: [makeModel("m1")] });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByTestId("model-item-m1"));
		expect(props.onSelect).toHaveBeenCalledWith("m1");
	});

	it("selected model item has data-selected='true'", () => {
		const models = [makeModel("m1"), makeModel("m2")];
		render(<MobileDrawer {...makeProps({ flatList: models, value: "m1" })} />);
		expect(screen.getByTestId("model-item-m1").getAttribute("data-selected")).toBe("true");
		expect(screen.getByTestId("model-item-m2").getAttribute("data-selected")).toBe("false");
	});

	it("Favorites button: hasFavorites=true → clicking calls setShowFavoritesOnly(true) and setSelectedProvider(null)", () => {
		const props = makeProps({ hasFavorites: true });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByRole("button", { name: /Favorites/i }));
		expect(props.setShowFavoritesOnly).toHaveBeenCalledWith(true);
		expect(props.setSelectedProvider).toHaveBeenCalledWith(null);
	});

	it("Favorites button: hasFavorites=false → clicking calls addDefaults", () => {
		const props = makeProps({ hasFavorites: false });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByRole("button", { name: /Favorites/i }));
		expect(props.addDefaults).toHaveBeenCalledTimes(1);
	});

	it("showFavoritesOnly=true → Favorites button has amber-related class", () => {
		render(<MobileDrawer {...makeProps({ showFavoritesOnly: true })} />);
		const favBtn = screen.getByRole("button", { name: /Favorites/i });
		expect(favBtn.className).toContain("amber");
	});

	it("showFavoritesOnly=false → Favorites button does NOT have amber class", () => {
		render(<MobileDrawer {...makeProps({ showFavoritesOnly: false })} />);
		const favBtn = screen.getByRole("button", { name: /Favorites/i });
		expect(favBtn.className).not.toContain("amber");
	});

	it("provider buttons render for each uniqueProvider (up to 8)", () => {
		const providers = Array.from({ length: 5 }, (_, i) => ({
			id: `p${i}`,
			name: `Provider ${i}`,
			modelName: `Model ${i}`,
			logoId: `p${i}`,
		}));
		render(<MobileDrawer {...makeProps({ uniqueProviders: providers })} />);
		for (const p of providers) {
			expect(screen.getByTestId(`logo-${p.id}`)).toBeTruthy();
		}
	});

	it("only renders up to 8 provider buttons", () => {
		const providers = Array.from({ length: 10 }, (_, i) => ({
			id: `p${i}`,
			name: `Provider ${i}`,
			modelName: `Model ${i}`,
			logoId: `p${i}`,
		}));
		render(<MobileDrawer {...makeProps({ uniqueProviders: providers })} />);
		for (let i = 0; i < 8; i++) {
			expect(screen.getByTestId(`logo-p${i}`)).toBeTruthy();
		}
		expect(screen.queryByTestId("logo-p8")).toBeNull();
		expect(screen.queryByTestId("logo-p9")).toBeNull();
	});

	it("clicking a provider button (not currently selected) calls setSelectedProvider(id) and setShowFavoritesOnly(false)", () => {
		const providers = [{ id: "openai", name: "OpenAI", modelName: "GPT", logoId: "openai" }];
		const props = makeProps({ uniqueProviders: providers, selectedProvider: null });
		render(<MobileDrawer {...props} />);
		const logo = screen.getByTestId("logo-openai");
		fireEvent.click(logo.parentElement!);
		expect(props.setSelectedProvider).toHaveBeenCalledWith("openai");
		expect(props.setShowFavoritesOnly).toHaveBeenCalledWith(false);
	});

	it("clicking already-selected provider button does NOT call setSelectedProvider again", () => {
		const providers = [{ id: "openai", name: "OpenAI", modelName: "GPT", logoId: "openai" }];
		const props = makeProps({ uniqueProviders: providers, selectedProvider: "openai" });
		render(<MobileDrawer {...props} />);
		const logo = screen.getByTestId("logo-openai");
		fireEvent.click(logo.parentElement!);
		expect(props.setSelectedProvider).not.toHaveBeenCalled();
	});

	it("isSearching=true hides the provider filter bar", () => {
		render(<MobileDrawer {...makeProps({ isSearching: true })} />);
		expect(screen.queryByRole("button", { name: /Favorites/i })).toBeNull();
	});

	it("isSearching=false shows the provider filter bar", () => {
		render(<MobileDrawer {...makeProps({ isSearching: false })} />);
		expect(screen.getByRole("button", { name: /Favorites/i })).toBeTruthy();
	});

	it("model count footer shows 'N models' for multiple models", () => {
		const models = [makeModel("m1"), makeModel("m2"), makeModel("m3")];
		render(<MobileDrawer {...makeProps({ flatList: models })} />);
		expect(screen.getByText("3 models")).toBeTruthy();
	});

	it("model count footer shows '1 model' (singular) for one model", () => {
		render(<MobileDrawer {...makeProps({ flatList: [makeModel("m1")] })} />);
		expect(screen.getByText("1 model")).toBeTruthy();
	});

	it("model count footer shows '0 models' for empty list", () => {
		render(<MobileDrawer {...makeProps({ flatList: [] })} />);
		expect(screen.getByText("0 models")).toBeTruthy();
	});

	it("showFavoritesOnly=true and missingDefaultsCount > 0 → shows 'Add N suggested' in footer", () => {
		render(
			<MobileDrawer
				{...makeProps({ showFavoritesOnly: true, missingDefaultsCount: 3 })}
			/>,
		);
		expect(screen.getByText(/Add 3 suggested/)).toBeTruthy();
	});

	it("showFavoritesOnly=false → shows 'Tap to select' in footer", () => {
		render(<MobileDrawer {...makeProps({ showFavoritesOnly: false })} />);
		expect(screen.getByText("Tap to select")).toBeTruthy();
	});

	it("showFavoritesOnly=true but missingDefaultsCount=0 → shows 'Tap to select' in footer", () => {
		render(
			<MobileDrawer
				{...makeProps({ showFavoritesOnly: true, missingDefaultsCount: 0 })}
			/>,
		);
		expect(screen.getByText("Tap to select")).toBeTruthy();
	});

	it("footer 'Add N suggested' button calls addDefaults when clicked", () => {
		const props = makeProps({ showFavoritesOnly: true, missingDefaultsCount: 2 });
		render(<MobileDrawer {...props} />);
		fireEvent.click(screen.getByText(/Add 2 suggested/));
		expect(props.addDefaults).toHaveBeenCalledTimes(1);
	});
	it("onHover callback calls setHighlightedIndex with correct index", () => {
		const setHighlightedIndex = vi.fn();
		const models = [makeModel("m1"), makeModel("m2")];
		render(<MobileDrawer {...makeProps({ flatList: models, setHighlightedIndex })} />);
		fireEvent.mouseEnter(screen.getByTestId("model-item-m1"));
		expect(setHighlightedIndex).toHaveBeenCalledWith(0);
		fireEvent.mouseEnter(screen.getByTestId("model-item-m2"));
		expect(setHighlightedIndex).toHaveBeenCalledWith(1);
	});

	it("onInfoClick callback calls onInfoOpen with model", () => {
		const onInfoOpen = vi.fn();
		const model = makeModel("m1");
		render(<MobileDrawer {...makeProps({ flatList: [model], onInfoOpen })} />);
		fireEvent.click(screen.getByTestId("info-btn-m1"));
		expect(onInfoOpen).toHaveBeenCalledWith(model);
	});

	it("onToggleFavorite callback fires with model id", () => {
		const onToggleFavorite = vi.fn();
		const model = makeModel("m1");
		render(<MobileDrawer {...makeProps({ flatList: [model], onToggleFavorite })} />);
		fireEvent.click(screen.getByTestId("fav-btn-m1"));
		expect(onToggleFavorite).toHaveBeenCalledWith(expect.any(Object), "m1");
	});

	it("provider button title uses modelName when filterStyle is 'model'", () => {
		const providers = [{ id: "openai", name: "OpenAI Provider", modelName: "GPT Model", logoId: "openai" }];
		render(<MobileDrawer {...makeProps({ uniqueProviders: providers, filterStyle: "model" })} />);
		const logo = screen.getByTestId("logo-openai");
		const button = logo.parentElement!;
		expect(button.title).toBe("GPT Model");
	});

	it("provider button title uses name when filterStyle is 'company'", () => {
		const providers = [{ id: "openai", name: "OpenAI Provider", modelName: "GPT Model", logoId: "openai" }];
		render(<MobileDrawer {...makeProps({ uniqueProviders: providers, filterStyle: "company" })} />);
		const logo = screen.getByTestId("logo-openai");
		const button = logo.parentElement!;
		expect(button.title).toBe("OpenAI Provider");
	});
});
