// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	ChevronRightIcon: () => <svg data-testid="chevron-right" />,
	CheckIcon: () => <svg data-testid="check-icon" />,
}));

vi.mock("@base-ui/react/menu", () => ({
	Menu: {
		Root: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Trigger: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
			<button data-testid="menu-trigger" {...props as Record<string, unknown>}>{children}</button>
		),
		Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Positioner: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
			<div data-testid="menu-positioner" className={className}>{children}</div>
		),
		Popup: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="menu-popup" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		Group: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
			<div data-testid="menu-group" {...props as Record<string, unknown>}>{children}</div>
		),
		GroupLabel: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<span data-testid="menu-group-label" className={className} {...props as Record<string, unknown>}>{children}</span>
		),
		Item: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="menu-item" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		SubmenuRoot: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		SubmenuTrigger: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<button data-testid="submenu-trigger" className={className} {...props as Record<string, unknown>}>{children}</button>
		),
		CheckboxItem: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="checkbox-item" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		CheckboxItemIndicator: ({ children }: { children?: React.ReactNode }) => (
			<span data-testid="checkbox-indicator">{children}</span>
		),
		RadioGroup: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
			<div data-testid="radio-group" {...props as Record<string, unknown>}>{children}</div>
		),
		RadioItem: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="radio-item" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		RadioItemIndicator: ({ children }: { children?: React.ReactNode }) => (
			<span data-testid="radio-indicator">{children}</span>
		),
		Separator: ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
			<hr data-testid="menu-separator" className={className} {...props as Record<string, unknown>} />
		),
	},
}));

import {
	DropdownMenu,
	DropdownMenuPortal,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "../dropdown-menu";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("DropdownMenu", () => {
	it("renders without crashing", () => {
		render(<DropdownMenu />);
		expect(document.body).toBeTruthy();
	});
});

describe("DropdownMenuTrigger", () => {
	it("renders children", () => {
		render(<DropdownMenuTrigger>Click me</DropdownMenuTrigger>);
		expect(screen.getByText("Click me")).toBeTruthy();
	});
});

describe("DropdownMenuContent", () => {
	it("renders children", () => {
		render(<DropdownMenuContent>Menu content</DropdownMenuContent>);
		expect(screen.getByText("Menu content")).toBeTruthy();
	});

	it("renders positioner and popup", () => {
		render(<DropdownMenuContent>Items</DropdownMenuContent>);
		expect(screen.getByTestId("menu-positioner")).toBeTruthy();
		expect(screen.getByTestId("menu-popup")).toBeTruthy();
	});

	it("passes className to popup", () => {
		render(<DropdownMenuContent className="custom-menu">Items</DropdownMenuContent>);
		const popup = screen.getByTestId("menu-popup");
		expect(popup.className).toContain("custom-menu");
	});
});

describe("DropdownMenuGroup", () => {
	it("renders children", () => {
		render(<DropdownMenuGroup>Group content</DropdownMenuGroup>);
		expect(screen.getByText("Group content")).toBeTruthy();
	});
});

describe("DropdownMenuLabel", () => {
	it("renders label text", () => {
		render(<DropdownMenuLabel>My Label</DropdownMenuLabel>);
		expect(screen.getByText("My Label")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<DropdownMenuLabel className="label-cls">Label</DropdownMenuLabel>);
		const el = screen.getByTestId("menu-group-label");
		expect(el.className).toContain("label-cls");
	});
});

describe("DropdownMenuItem", () => {
	it("renders item content", () => {
		render(<DropdownMenuItem>Item text</DropdownMenuItem>);
		expect(screen.getByText("Item text")).toBeTruthy();
	});

	it("passes variant data attribute", () => {
		render(<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>);
		const el = screen.getByTestId("menu-item");
		expect(el.getAttribute("data-variant")).toBe("destructive");
	});

	it("renders with default variant", () => {
		render(<DropdownMenuItem>Default item</DropdownMenuItem>);
		const el = screen.getByTestId("menu-item");
		expect(el.getAttribute("data-variant")).toBe("default");
	});
});

describe("DropdownMenuSub", () => {
	it("renders children", () => {
		render(<DropdownMenuSub>Sub menu</DropdownMenuSub>);
		expect(screen.getByText("Sub menu")).toBeTruthy();
	});
});

describe("DropdownMenuSubTrigger", () => {
	it("renders children and chevron icon", () => {
		render(<DropdownMenuSubTrigger>Sub trigger</DropdownMenuSubTrigger>);
		expect(screen.getByText("Sub trigger")).toBeTruthy();
		expect(screen.getByTestId("chevron-right")).toBeTruthy();
	});
});

describe("DropdownMenuCheckboxItem", () => {
	it("renders children and indicator", () => {
		render(<DropdownMenuCheckboxItem>Checkbox Item</DropdownMenuCheckboxItem>);
		expect(screen.getByText("Checkbox Item")).toBeTruthy();
		expect(screen.getByTestId("checkbox-indicator")).toBeTruthy();
	});
});

describe("DropdownMenuRadioGroup", () => {
	it("renders children", () => {
		render(<DropdownMenuRadioGroup>Radio content</DropdownMenuRadioGroup>);
		expect(screen.getByText("Radio content")).toBeTruthy();
	});
});

describe("DropdownMenuRadioItem", () => {
	it("renders children and radio indicator", () => {
		render(<DropdownMenuRadioItem value="a">Radio A</DropdownMenuRadioItem>);
		expect(screen.getByText("Radio A")).toBeTruthy();
		expect(screen.getByTestId("radio-indicator")).toBeTruthy();
	});
});

describe("DropdownMenuSeparator", () => {
	it("renders a separator", () => {
		render(<DropdownMenuSeparator />);
		expect(screen.getByTestId("menu-separator")).toBeTruthy();
	});

	it("passes className to separator", () => {
		render(<DropdownMenuSeparator className="my-sep" />);
		const el = screen.getByTestId("menu-separator");
		expect(el.className).toContain("my-sep");
	});
});

describe("DropdownMenuShortcut", () => {
	it("renders shortcut text", () => {
		render(<DropdownMenuShortcut>⌘K</DropdownMenuShortcut>);
		expect(screen.getByText("⌘K")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<DropdownMenuShortcut data-testid="shortcut">⌘K</DropdownMenuShortcut>);
		const el = screen.getByTestId("shortcut");
		expect(el.getAttribute("data-slot")).toBe("dropdown-menu-shortcut");
	});
});

describe("DropdownMenuPortal", () => {
	it("renders children", () => {
		render(<DropdownMenuPortal><div>Portal content</div></DropdownMenuPortal>);
		expect(screen.getByText("Portal content")).toBeTruthy();
	});

	it("renders multiple children", () => {
		render(
			<DropdownMenuPortal>
				<span>first</span>
				<span>second</span>
			</DropdownMenuPortal>
		);
		expect(screen.getByText("first")).toBeTruthy();
		expect(screen.getByText("second")).toBeTruthy();
	});
});

describe("DropdownMenuSubContent", () => {
	it("renders children", () => {
		render(<DropdownMenuSubContent>Sub content</DropdownMenuSubContent>);
		expect(screen.getByText("Sub content")).toBeTruthy();
	});

	it("renders menu-positioner and menu-popup", () => {
		render(<DropdownMenuSubContent>Sub items</DropdownMenuSubContent>);
		expect(screen.getByTestId("menu-positioner")).toBeTruthy();
		expect(screen.getByTestId("menu-popup")).toBeTruthy();
	});

	it("passes custom className to popup", () => {
		render(<DropdownMenuSubContent className="sub-cls">X</DropdownMenuSubContent>);
		const popup = screen.getByTestId("menu-popup");
		expect(popup.className).toContain("sub-cls");
	});
});
