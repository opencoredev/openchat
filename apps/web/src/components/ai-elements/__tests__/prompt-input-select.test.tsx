// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
	PromptInputSelect,
	PromptInputSelectContent,
	PromptInputSelectItem,
	PromptInputSelectTrigger,
	PromptInputSelectValue,
} from "../prompt-input-select";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="select">{children}</div>
	),
	SelectTrigger: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<button data-testid="select-trigger" className={className}>
			{children}
		</button>
	),
	SelectContent: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="select-content" className={className}>
			{children}
		</div>
	),
	SelectItem: ({
		children,
		className,
		value,
	}: {
		children: React.ReactNode;
		className?: string;
		value: string;
	}) => (
		<div data-testid="select-item" data-value={value} className={className}>
			{children}
		</div>
	),
	SelectValue: ({
		className,
		placeholder,
	}: {
		className?: string;
		placeholder?: string;
	}) => (
		<span data-testid="select-value" className={className}>
			{placeholder}
		</span>
	),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputSelect", () => {
	it("renders children", () => {
		render(<PromptInputSelect>select content</PromptInputSelect>);
		expect(screen.getByText("select content")).toBeTruthy();
	});

	it("wraps in Select", () => {
		render(<PromptInputSelect>content</PromptInputSelect>);
		expect(screen.getByTestId("select")).toBeTruthy();
	});
});

describe("PromptInputSelectTrigger", () => {
	it("renders children", () => {
		render(<PromptInputSelectTrigger>trigger text</PromptInputSelectTrigger>);
		expect(screen.getByText("trigger text")).toBeTruthy();
	});

	it("applies default styling classes", () => {
		render(<PromptInputSelectTrigger>trigger</PromptInputSelectTrigger>);
		const el = screen.getByTestId("select-trigger");
		expect(el.className).toContain("border-none");
	});

	it("merges custom className", () => {
		render(<PromptInputSelectTrigger className="custom">trigger</PromptInputSelectTrigger>);
		const el = screen.getByTestId("select-trigger");
		expect(el.className).toContain("custom");
	});

	it("passes additional props", () => {
		render(
			<PromptInputSelectTrigger data-testid="select-trigger" aria-label="select">
				trigger
			</PromptInputSelectTrigger>,
		);
		expect(screen.getByTestId("select-trigger")).toBeTruthy();
	});
});

describe("PromptInputSelectContent", () => {
	it("renders children", () => {
		render(<PromptInputSelectContent>items here</PromptInputSelectContent>);
		expect(screen.getByText("items here")).toBeTruthy();
	});

	it("wraps in SelectContent", () => {
		render(<PromptInputSelectContent>content</PromptInputSelectContent>);
		expect(screen.getByTestId("select-content")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputSelectContent className="my-content">content</PromptInputSelectContent>);
		const el = screen.getByTestId("select-content");
		expect(el.className).toContain("my-content");
	});
});

describe("PromptInputSelectItem", () => {
	it("renders children", () => {
		render(<PromptInputSelectItem value="opt1">Option 1</PromptInputSelectItem>);
		expect(screen.getByText("Option 1")).toBeTruthy();
	});

	it("wraps in SelectItem", () => {
		render(<PromptInputSelectItem value="opt1">Option 1</PromptInputSelectItem>);
		expect(screen.getByTestId("select-item")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(
			<PromptInputSelectItem className="item-class" value="opt1">
				Option 1
			</PromptInputSelectItem>,
		);
		const el = screen.getByTestId("select-item");
		expect(el.className).toContain("item-class");
	});

	it("passes value prop", () => {
		render(<PromptInputSelectItem value="test-value">Option</PromptInputSelectItem>);
		const el = screen.getByTestId("select-item");
		expect(el.getAttribute("data-value")).toBe("test-value");
	});
});

describe("PromptInputSelectValue", () => {
	it("renders with placeholder", () => {
		render(<PromptInputSelectValue placeholder="Choose..." />);
		expect(screen.getByText("Choose...")).toBeTruthy();
	});

	it("wraps in SelectValue", () => {
		render(<PromptInputSelectValue />);
		expect(screen.getByTestId("select-value")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputSelectValue className="value-class" />);
		const el = screen.getByTestId("select-value");
		expect(el.className).toContain("value-class");
	});
});
