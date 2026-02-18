// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Model } from "@/stores/model";

const MOCK_MODELS: Model[] = [
	{
		id: "anthropic/claude-3.5-sonnet",
		name: "Claude 3.5 Sonnet",
		provider: "Anthropic",
		modelName: "Claude",
		providerId: "anthropic",
		logoId: "anthropic",
		family: "Claude 3.5",
		isPopular: true,
		reasoning: false,
		toolCall: true,
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		modelName: "GPT",
		providerId: "openai",
		logoId: "openai",
		family: "GPT-4o",
		isPopular: true,
		modality: "text+image->text",
		reasoning: false,
		toolCall: true,
	},
	{
		id: "google/gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		provider: "Google",
		modelName: "Gemini",
		providerId: "google",
		logoId: "google",
		family: "Gemini 2.5",
		isPopular: true,
		isFree: true,
	},
	{
		id: "deepseek/deepseek-r1",
		name: "DeepSeek R1",
		provider: "DeepSeek",
		modelName: "DeepSeek",
		providerId: "deepseek",
		logoId: "deepseek",
		family: "DeepSeek R1",
		isPopular: true,
		reasoning: true,
	},
	{
		id: "meta-llama/llama-3.3-70b-instruct",
		name: "Llama 3.3 70B",
		provider: "Meta Llama",
		modelName: "Llama",
		providerId: "meta-llama",
		logoId: "llama",
		family: "Llama 3.3",
		isPopular: false,
	},
];

vi.mock("@/stores/model", () => ({
	useModels: vi.fn(() => ({
		models: MOCK_MODELS,
		isLoading: false,
		error: null,
	})),
	useModelStore: vi.fn((selector: (s: any) => any) =>
		selector({
			selectedModelId: "anthropic/claude-3.5-sonnet",
			setSelectedModel: vi.fn(),
		}),
	),
	getModelById: vi.fn((models: Model[], id: string) =>
		models.find((m) => m.id === id),
	),
}));

vi.mock("@/hooks/use-favorite-models", () => ({
	useFavoriteModels: vi.fn(() => ({
		favorites: new Set<string>(),
		toggleFavorite: vi.fn(),
		isFavorite: vi.fn(() => false),
		addDefaults: vi.fn(),
		missingDefaultsCount: 0,
	})),
}));

vi.mock("@/stores/ui", () => ({
	useUIStore: vi.fn((selector: (s: any) => any) =>
		selector({ filterStyle: "company" }),
	),
}));

vi.mock("@/components/model-info-panel", () => ({
	ModelInfoPanel: ({ model }: { model: Model }) => (
		<div data-testid="model-info-panel">{model.name}</div>
	),
}));

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({
		children,
		className,
		render: _render,
		...rest
	}: any) => (
		<span className={className} {...rest}>
			{children}
		</span>
	),
	TooltipContent: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

vi.mock("react-dom", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		flushSync: (fn: () => void) => fn(),
	};
});

import { ModelSelector, ConnectedModelSelector } from "../model-selector";

function renderSelector(overrides: Partial<Parameters<typeof ModelSelector>[0]> = {}) {
	const defaultProps = {
		value: "anthropic/claude-3.5-sonnet",
		onValueChange: vi.fn(),
	};
	return render(<ModelSelector {...defaultProps} {...overrides} />);
}

function openDropdown() {
	const trigger = screen.getByRole("button", { name: /select model/i });
	fireEvent.click(trigger);
}

describe("ModelSelector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
		Object.defineProperty(window, "innerHeight", { value: 768, writable: true });
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("renders the trigger button with the selected model name", () => {
		renderSelector({ value: "anthropic/claude-3.5-sonnet" });

		expect(screen.getByText("Claude 3.5 Sonnet")).toBeDefined();
		expect(screen.getByRole("button", { name: /select model/i })).toBeDefined();
	});

	it("shows 'Select model' when the value does not match any model", () => {
		renderSelector({ value: "nonexistent/model" });

		expect(screen.getByText("Select model")).toBeDefined();
	});

	it("opens the dropdown and displays all models", () => {
		renderSelector();
		openDropdown();

		for (const model of MOCK_MODELS) {
			const matches = screen.getAllByText(model.name);
			expect(matches.length).toBeGreaterThanOrEqual(1);
		}

		expect(screen.getByRole("listbox", { name: /models/i })).toBeDefined();
	});

	it("filters models when typing in the search input", () => {
		renderSelector();
		openDropdown();

		const searchInput = screen.getByPlaceholderText(/search all models/i);
		fireEvent.change(searchInput, { target: { value: "gpt" } });

		expect(screen.getAllByText("GPT-4o").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByText("Gemini 2.5 Flash")).toBeNull();
		expect(screen.queryByText("DeepSeek R1")).toBeNull();
	});

	it("calls onValueChange when a model is clicked", () => {
		const onValueChange = vi.fn();
		renderSelector({ onValueChange });
		openDropdown();

		const gptOptions = screen.getAllByText("GPT-4o");
		fireEvent.click(gptOptions[gptOptions.length - 1]);

		expect(onValueChange).toHaveBeenCalledWith("openai/gpt-4o");
		expect(onValueChange).toHaveBeenCalledTimes(1);
	});

	it("shows provider filter buttons on desktop", () => {
		renderSelector();
		openDropdown();

		const providerLogos = screen.getAllByRole("img");
		const providerAlts = providerLogos.map((img) => img.getAttribute("alt"));

		expect(providerAlts).toEqual(
			expect.arrayContaining([
				expect.stringContaining("anthropic"),
			]),
		);
	});

	it("shows the Free badge for free models", () => {
		renderSelector();
		openDropdown();

		expect(screen.getByText("Free")).toBeDefined();
	});

	it("displays the total model count in the footer", () => {
		renderSelector();
		openDropdown();

		expect(screen.getByText(/5 models/)).toBeDefined();
	});

	it("does not open when disabled", () => {
		renderSelector({ disabled: true });

		const trigger = screen.getByRole("button", { name: /select model/i });
		expect(trigger.hasAttribute("disabled")).toBe(true);

		fireEvent.click(trigger);

		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("shows 'No models found' when search yields no results", () => {
		renderSelector();
		openDropdown();

		const searchInput = screen.getByPlaceholderText(/search all models/i);
		fireEvent.change(searchInput, { target: { value: "zzzznonexistent" } });

		expect(screen.getByText("No models found")).toBeDefined();
	});

	it("selects a model with keyboard ArrowDown + Enter", () => {
		const onValueChange = vi.fn();
		renderSelector({ onValueChange });
		openDropdown();

		fireEvent.keyDown(document, { key: "ArrowDown" });
		fireEvent.keyDown(document, { key: "Enter" });

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledWith(expect.any(String));
	});

	it("renders ConnectedModelSelector without crashing", () => {
		render(<ConnectedModelSelector />);

		expect(screen.getByText("Claude 3.5 Sonnet")).toBeDefined();
	});
});
