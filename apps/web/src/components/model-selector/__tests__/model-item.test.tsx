// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: any) => <>{children}</>,
	TooltipTrigger: ({ children, render: renderProp, className }: any) =>
		renderProp ? (
			<span className={className}>{children}</span>
		) : (
			<>{children}</>
		),
	TooltipContent: ({ children }: any) => <div data-testid="tooltip-content">{children}</div>,
}));

vi.mock("../provider-logo", () => ({
	ProviderLogo: ({ providerId, className }: any) => (
		<img data-testid="provider-logo" alt={`${providerId} logo`} className={className} />
	),
}));

vi.mock("../icons", () => ({
	StarIcon: ({ className, filled }: any) => (
		<span data-testid="star-icon" data-filled={filled} className={className} />
	),
	EyeIcon: ({ className }: any) => <span data-testid="eye-icon" className={className} />,
	ThinkingIcon: ({ className }: any) => <span data-testid="thinking-icon" className={className} />,
	ToolIcon: ({ className }: any) => <span data-testid="tool-icon" className={className} />,
	InfoIcon: ({ className }: any) => <span data-testid="info-icon" className={className} />,
}));

import { ModelItem } from "../model-item";
import type { Model } from "@/stores/model";

const baseModel: Model = {
	id: "openai/gpt-4o",
	name: "GPT-4o",
	provider: "OpenAI",
	providerId: "openai",
	modelName: "gpt-4o",
	logoId: "openai",
	modality: ["text"],
	reasoning: false,
	toolCall: false,
	isFree: false,
	isPopular: false,
	contextLength: 128000,
	pricing: { prompt: "0", completion: "0" },
} as unknown as Model;

const defaultProps = {
	model: baseModel,
	isSelected: false,
	isHighlighted: false,
	isFavorite: false,
	onSelect: vi.fn(),
	onHover: vi.fn(),
	onInfoClick: vi.fn(),
	onInfoHover: vi.fn(),
	onInfoClear: vi.fn(),
	onToggleFavorite: vi.fn(),
	dataIndex: 0,
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ModelItem", () => {
	it("renders without crashing", () => {
		render(<ModelItem {...defaultProps} />);
		expect(document.body).toBeTruthy();
	});

	it("shows model name", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.getByText("GPT-4o")).toBeDefined();
	});

	it("renders provider logo", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.getByTestId("provider-logo")).toBeDefined();
	});

	it("renders star/favorite button", () => {
		render(<ModelItem {...defaultProps} />);
		const starIcon = screen.getByTestId("star-icon");
		expect(starIcon).toBeDefined();
	});

	it("renders info button", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.getByTestId("info-icon")).toBeDefined();
	});

	it("does not show 'Free' badge when isFree is false", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.queryByText("Free")).toBeNull();
	});

	it("shows 'Free' badge when model is free", () => {
		const model = { ...baseModel, isFree: true };
		render(<ModelItem {...defaultProps} model={model} />);
		expect(screen.getByText("Free")).toBeDefined();
	});

	it("does not show EyeIcon when modality does not include 'image'", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.queryByTestId("eye-icon")).toBeNull();
	});

	it("shows EyeIcon (vision) when modality includes 'image'", () => {
		const model = { ...baseModel, modality: ["text", "image"] };
		render(<ModelItem {...defaultProps} model={model} />);
		expect(screen.getByTestId("eye-icon")).toBeDefined();
	});

	it("does not show ThinkingIcon when reasoning is false", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.queryByTestId("thinking-icon")).toBeNull();
	});

	it("shows ThinkingIcon (reasoning) when model has reasoning", () => {
		const model = { ...baseModel, reasoning: true };
		render(<ModelItem {...defaultProps} model={model} />);
		expect(screen.getByTestId("thinking-icon")).toBeDefined();
	});

	it("does not show ToolIcon when toolCall is false", () => {
		render(<ModelItem {...defaultProps} />);
		expect(screen.queryByTestId("tool-icon")).toBeNull();
	});

	it("shows ToolIcon when model supports tool use", () => {
		const model = { ...baseModel, toolCall: true };
		render(<ModelItem {...defaultProps} model={model} />);
		expect(screen.getByTestId("tool-icon")).toBeDefined();
	});

	it("applies aria-selected attribute based on isSelected", () => {
		render(<ModelItem {...defaultProps} isSelected={true} />);
		const item = document.querySelector('[role="option"]');
		expect(item?.getAttribute("aria-selected")).toBe("true");
	});

	it("applies data-index attribute", () => {
		render(<ModelItem {...defaultProps} dataIndex={5} />);
		const item = document.querySelector('[data-index="5"]');
		expect(item).toBeTruthy();
	});

	it("calls onSelect when clicked", () => {
		const onSelect = vi.fn();
		render(<ModelItem {...defaultProps} onSelect={onSelect} />);
		const item = document.querySelector('[role="option"]')!;
		fireEvent.click(item);
		expect(onSelect).toHaveBeenCalled();
	});

	it("calls onSelect when Enter key is pressed", () => {
		const onSelect = vi.fn();
		render(<ModelItem {...defaultProps} onSelect={onSelect} />);
		const item = document.querySelector('[role="option"]')!;
		fireEvent.keyDown(item, { key: "Enter" });
		expect(onSelect).toHaveBeenCalled();
	});

	it("does not call onSelect on other key press", () => {
		const onSelect = vi.fn();
		render(<ModelItem {...defaultProps} onSelect={onSelect} />);
		const item = document.querySelector('[role="option"]')!;
		fireEvent.keyDown(item, { key: "Space" });
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("calls onHover and onInfoClear when mouse enters", () => {
		const onHover = vi.fn();
		const onInfoClear = vi.fn();
		render(<ModelItem {...defaultProps} onHover={onHover} onInfoClear={onInfoClear} />);
		const item = document.querySelector('[role="option"]')!;
		fireEvent.mouseEnter(item);
		expect(onHover).toHaveBeenCalled();
		expect(onInfoClear).toHaveBeenCalled();
	});

	it("calls onToggleFavorite when star button is clicked", () => {
		const onToggleFavorite = vi.fn();
		render(<ModelItem {...defaultProps} onToggleFavorite={onToggleFavorite} />);
		const starButton = screen.getByTestId("star-icon").closest("button")!;
		fireEvent.click(starButton);
		expect(onToggleFavorite).toHaveBeenCalled();
	});

	it("calls onInfoHover when info button is hovered", () => {
		const onInfoHover = vi.fn();
		render(<ModelItem {...defaultProps} onInfoHover={onInfoHover} />);
		const infoButton = screen.getByTestId("info-icon").closest("button")!;
		fireEvent.mouseEnter(infoButton);
		expect(onInfoHover).toHaveBeenCalled();
	});

	it("calls onInfoClick when info button is clicked", () => {
		const onInfoClick = vi.fn();
		render(<ModelItem {...defaultProps} onInfoClick={onInfoClick} />);
		const infoButton = screen.getByTestId("info-icon").closest("button")!;
		fireEvent.click(infoButton);
		expect(onInfoClick).toHaveBeenCalled();
	});

	it("shows all capability icons for fully featured model", () => {
		const model = { ...baseModel, isFree: true, modality: ["text", "image"], reasoning: true, toolCall: true };
		render(<ModelItem {...defaultProps} model={model} />);
		expect(screen.getByTestId("eye-icon")).toBeDefined();
		expect(screen.getByTestId("thinking-icon")).toBeDefined();
		expect(screen.getByTestId("tool-icon")).toBeDefined();
		expect(screen.getByText("Free")).toBeDefined();
	});

	it("star icon shows as filled when isFavorite is true", () => {
		render(<ModelItem {...defaultProps} isFavorite={true} />);
		const starIcon = screen.getByTestId("star-icon");
		expect(starIcon.getAttribute("data-filled")).toBe("true");
	});
});
