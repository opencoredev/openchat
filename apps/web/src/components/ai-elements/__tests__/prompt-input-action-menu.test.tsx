// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuItem,
	PromptInputActionMenuTrigger,
} from "../prompt-input-action-menu";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	PlusIcon: () => <svg data-testid="plus-icon" />,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="dropdown-menu">{children}</div>
	),
	DropdownMenuTrigger: ({
		children,
		render: renderProp,
	}: {
		children?: React.ReactNode;
		render?: React.ReactElement;
	}) => {
		if (renderProp) {
			return React.cloneElement(renderProp, {}, children);
		}
		return <div data-testid="dropdown-trigger">{children}</div>;
	},
	DropdownMenuContent: ({
		children,
		className,
		align,
	}: {
		children?: React.ReactNode;
		className?: string;
		align?: string;
	}) => (
		<div data-testid="dropdown-content" className={className} data-align={align}>
			{children}
		</div>
	),
	DropdownMenuItem: ({
		children,
		className,
	}: {
		children?: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="dropdown-item" className={className}>
			{children}
		</div>
	),
}));

vi.mock("../prompt-input-primitives", () => ({
	PromptInputButton: ({
		children,
		className,
		...props
	}: {
		children?: React.ReactNode;
		className?: string;
	}) => (
		<button data-testid="prompt-button" className={className} {...props}>
			{children}
		</button>
	),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputActionMenu", () => {
	it("renders children", () => {
		render(<PromptInputActionMenu>menu content</PromptInputActionMenu>);
		expect(screen.getByText("menu content")).toBeTruthy();
	});

	it("wraps in DropdownMenu", () => {
		render(<PromptInputActionMenu>content</PromptInputActionMenu>);
		expect(screen.getByTestId("dropdown-menu")).toBeTruthy();
	});
});

describe("PromptInputActionMenuTrigger", () => {
	it("renders custom children", () => {
		render(<PromptInputActionMenuTrigger>Open Menu</PromptInputActionMenuTrigger>);
		expect(screen.getByText("Open Menu")).toBeTruthy();
	});

	it("renders default PlusIcon when no children provided", () => {
		render(<PromptInputActionMenuTrigger />);
		expect(screen.getByTestId("plus-icon")).toBeTruthy();
	});

	it("passes className to the underlying button", () => {
		render(<PromptInputActionMenuTrigger className="trigger-cls">Open</PromptInputActionMenuTrigger>);
		const btn = screen.getByTestId("prompt-button");
		expect(btn.className).toContain("trigger-cls");
	});
});

describe("PromptInputActionMenuContent", () => {
	it("renders children", () => {
		render(<PromptInputActionMenuContent>menu items</PromptInputActionMenuContent>);
		expect(screen.getByText("menu items")).toBeTruthy();
	});

	it("wraps in DropdownMenuContent", () => {
		render(<PromptInputActionMenuContent>items</PromptInputActionMenuContent>);
		expect(screen.getByTestId("dropdown-content")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputActionMenuContent className="content-cls">items</PromptInputActionMenuContent>);
		expect(screen.getByTestId("dropdown-content").className).toContain("content-cls");
	});

	it("passes align=start by default", () => {
		render(<PromptInputActionMenuContent>items</PromptInputActionMenuContent>);
		expect(screen.getByTestId("dropdown-content").getAttribute("data-align")).toBe("start");
	});
});

describe("PromptInputActionMenuItem", () => {
	it("renders children", () => {
		render(<PromptInputActionMenuItem>Item Label</PromptInputActionMenuItem>);
		expect(screen.getByText("Item Label")).toBeTruthy();
	});

	it("wraps in DropdownMenuItem", () => {
		render(<PromptInputActionMenuItem>Item</PromptInputActionMenuItem>);
		expect(screen.getByTestId("dropdown-item")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputActionMenuItem className="item-cls">Item</PromptInputActionMenuItem>);
		expect(screen.getByTestId("dropdown-item").className).toContain("item-cls");
	});
});
