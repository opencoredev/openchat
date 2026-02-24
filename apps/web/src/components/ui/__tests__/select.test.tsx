// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	ChevronDownIcon: () => <svg data-testid="chevron-down" />,
	ChevronUpIcon: () => <svg data-testid="chevron-up" />,
	CheckIcon: () => <svg data-testid="check-icon" />,
}));

vi.mock("@base-ui/react/select", () => ({
	Select: {
		Root: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Trigger: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<button data-testid="select-trigger" className={className} {...props as Record<string, unknown>}>{children}</button>
		),
		Icon: ({ render: renderProp }: { render?: React.ReactElement }) => (
			renderProp ? renderProp : <span data-testid="select-icon" />
		),
		Value: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<span data-testid="select-value" className={className} {...props as Record<string, unknown>}>{children}</span>
		),
		Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Positioner: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
			<div data-testid="select-positioner" className={className}>{children}</div>
		),
		Popup: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="select-popup" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		List: ({ children }: { children?: React.ReactNode }) => (
			<div data-testid="select-list">{children}</div>
		),
		Group: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="select-group" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		GroupLabel: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="select-group-label" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		Item: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="select-item" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		ItemText: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
			<span data-testid="select-item-text" className={className}>{children}</span>
		),
		ItemIndicator: ({ children, render: renderProp }: { children?: React.ReactNode; render?: React.ReactElement }) => (
			renderProp ? renderProp : <span>{children}</span>
		),
		Separator: ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
			<hr data-testid="select-separator" className={className} {...props as Record<string, unknown>} />
		),
		ScrollUpArrow: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="scroll-up-arrow" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		ScrollDownArrow: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="scroll-down-arrow" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
	},
}));

import {
	Select,
	SelectGroup,
	SelectValue,
	SelectTrigger,
	SelectContent,
	SelectLabel,
	SelectItem,
	SelectSeparator,
	SelectScrollUpButton,
	SelectScrollDownButton,
} from "../select";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Select", () => {
	it("renders without crashing", () => {
		render(<Select />);
		expect(document.body).toBeTruthy();
	});

	it("renders children", () => {
		render(<Select><span>Select child</span></Select>);
		expect(screen.getByText("Select child")).toBeTruthy();
	});
});

describe("SelectValue", () => {
	it("renders with placeholder text", () => {
		render(<SelectValue placeholder="Choose..." />);
		expect(screen.getByTestId("select-value")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectValue />);
		expect(screen.getByTestId("select-value").getAttribute("data-slot")).toBe("select-value");
	});
});

describe("SelectTrigger", () => {
	it("renders children", () => {
		render(<SelectTrigger>Trigger</SelectTrigger>);
		expect(screen.getByText("Trigger")).toBeTruthy();
	});

	it("renders with chevron down icon", () => {
		render(<SelectTrigger>T</SelectTrigger>);
		expect(screen.getByTestId("chevron-down")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectTrigger>T</SelectTrigger>);
		const el = screen.getByTestId("select-trigger");
		expect(el.getAttribute("data-slot")).toBe("select-trigger");
	});

	it("passes custom className", () => {
		render(<SelectTrigger className="my-trigger">T</SelectTrigger>);
		const el = screen.getByTestId("select-trigger");
		expect(el.className).toContain("my-trigger");
	});

	it("applies size data attribute", () => {
		render(<SelectTrigger size="sm">Small</SelectTrigger>);
		const el = screen.getByTestId("select-trigger");
		expect(el.getAttribute("data-size")).toBe("sm");
	});
});

describe("SelectContent", () => {
	it("renders children", () => {
		render(<SelectContent>Content items</SelectContent>);
		expect(screen.getByText("Content items")).toBeTruthy();
	});

	it("renders positioner, popup, and list", () => {
		render(<SelectContent>Items</SelectContent>);
		expect(screen.getByTestId("select-positioner")).toBeTruthy();
		expect(screen.getByTestId("select-popup")).toBeTruthy();
		expect(screen.getByTestId("select-list")).toBeTruthy();
	});

	it("renders scroll arrows inside content", () => {
		render(<SelectContent>Items</SelectContent>);
		expect(screen.getByTestId("scroll-up-arrow")).toBeTruthy();
		expect(screen.getByTestId("scroll-down-arrow")).toBeTruthy();
	});
});

describe("SelectGroup", () => {
	it("renders children", () => {
		render(<SelectGroup>Group items</SelectGroup>);
		expect(screen.getByText("Group items")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectGroup>G</SelectGroup>);
		const el = screen.getByTestId("select-group");
		expect(el.getAttribute("data-slot")).toBe("select-group");
	});
});

describe("SelectLabel", () => {
	it("renders label text", () => {
		render(<SelectLabel>My Label</SelectLabel>);
		expect(screen.getByText("My Label")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectLabel>L</SelectLabel>);
		expect(screen.getByTestId("select-group-label").getAttribute("data-slot")).toBe("select-label");
	});
});

describe("SelectItem", () => {
	it("renders item text", () => {
		render(<SelectItem value="a">Option A</SelectItem>);
		expect(screen.getByText("Option A")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectItem value="b">B</SelectItem>);
		expect(screen.getByTestId("select-item").getAttribute("data-slot")).toBe("select-item");
	});
});

describe("SelectSeparator", () => {
	it("renders separator", () => {
		render(<SelectSeparator />);
		expect(screen.getByTestId("select-separator")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<SelectSeparator />);
		expect(screen.getByTestId("select-separator").getAttribute("data-slot")).toBe("select-separator");
	});
});

describe("SelectScrollUpButton", () => {
	it("renders with chevron up icon", () => {
		render(<SelectScrollUpButton />);
		expect(screen.getByTestId("chevron-up")).toBeTruthy();
	});

	it("renders scroll up arrow element", () => {
		render(<SelectScrollUpButton />);
		expect(screen.getByTestId("scroll-up-arrow")).toBeTruthy();
	});
});

describe("SelectScrollDownButton", () => {
	it("renders with chevron down icon", () => {
		render(<SelectScrollDownButton />);
		expect(screen.getByTestId("chevron-down")).toBeTruthy();
	});

	it("renders scroll down arrow element", () => {
		render(<SelectScrollDownButton />);
		expect(screen.getByTestId("scroll-down-arrow")).toBeTruthy();
	});
});
