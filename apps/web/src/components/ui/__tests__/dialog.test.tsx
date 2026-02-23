// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	XIcon: () => <svg data-testid="x-icon" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
		<button className={className} {...props as Record<string, unknown>}>{children}</button>
	),
}));

vi.mock("@base-ui/react/dialog", () => ({
	Dialog: {
		Root: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Trigger: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
			<button {...props as Record<string, unknown>}>{children}</button>
		),
		Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Backdrop: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="dialog-backdrop" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		Popup: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="dialog-popup" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
		Close: ({ children, render: _render, ...props }: { children?: React.ReactNode; render?: unknown; [key: string]: unknown }) => (
			<button data-testid="dialog-close" {...props as Record<string, unknown>}>{children}</button>
		),
		Title: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<h2 className={className} {...props as Record<string, unknown>}>{children}</h2>
		),
		Description: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<p className={className} {...props as Record<string, unknown>}>{children}</p>
		),
	},
}));

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogTitle,
	DialogTrigger,
} from "../dialog";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Dialog", () => {
	it("renders without crashing", () => {
		render(<Dialog open={false} />);
		expect(document.body).toBeTruthy();
	});
});

describe("DialogTrigger", () => {
	it("renders its children", () => {
		render(<DialogTrigger>Open</DialogTrigger>);
		expect(screen.getByText("Open")).toBeTruthy();
	});
});

describe("DialogClose", () => {
	it("renders its children", () => {
		render(<DialogClose>Close me</DialogClose>);
		expect(screen.getByText("Close me")).toBeTruthy();
	});
});

describe("DialogOverlay", () => {
	it("renders with data-testid from mock", () => {
		render(<DialogOverlay />);
		expect(screen.getByTestId("dialog-backdrop")).toBeTruthy();
	});

	it("passes className to backdrop", () => {
		render(<DialogOverlay className="my-overlay" />);
		const el = screen.getByTestId("dialog-backdrop");
		expect(el.className).toContain("my-overlay");
	});
});

describe("DialogHeader", () => {
	it("renders children", () => {
		render(<DialogHeader>Header text</DialogHeader>);
		expect(screen.getByText("Header text")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<DialogHeader className="custom-header">Content</DialogHeader>);
		const content = screen.getByText("Content");
		expect(content.className).toContain("custom-header");
	});

	it("has data-slot attribute", () => {
		render(<DialogHeader data-testid="my-header">H</DialogHeader>);
		const el = screen.getByTestId("my-header");
		expect(el.getAttribute("data-slot")).toBe("dialog-header");
	});
});

describe("DialogFooter", () => {
	it("renders children", () => {
		render(<DialogFooter>Footer content</DialogFooter>);
		expect(screen.getByText("Footer content")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<DialogFooter data-testid="my-footer">F</DialogFooter>);
		const el = screen.getByTestId("my-footer");
		expect(el.getAttribute("data-slot")).toBe("dialog-footer");
	});

	it("renders close button when showCloseButton is true", () => {
		render(<DialogFooter showCloseButton>Content</DialogFooter>);
		expect(screen.getByText("Close")).toBeTruthy();
	});

	it("does not render close button by default", () => {
		render(<DialogFooter>Content</DialogFooter>);
		expect(screen.queryByText("Close")).toBeNull();
	});
});

describe("DialogTitle", () => {
	it("renders with text content", () => {
		render(<DialogTitle>My Dialog Title</DialogTitle>);
		expect(screen.getByText("My Dialog Title")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<DialogTitle className="title-class">Title</DialogTitle>);
		const el = screen.getByText("Title");
		expect(el.className).toContain("title-class");
	});
});

describe("DialogDescription", () => {
	it("renders with text content", () => {
		render(<DialogDescription>Description text</DialogDescription>);
		expect(screen.getByText("Description text")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<DialogDescription className="desc-class">Desc</DialogDescription>);
		const el = screen.getByText("Desc");
		expect(el.className).toContain("desc-class");
	});
});

describe("DialogContent", () => {
	it("renders children inside the popup", () => {
		render(
			<Dialog open>
				<DialogContent>
					<p>Content inside dialog</p>
				</DialogContent>
			</Dialog>,
		);
		expect(screen.getByText("Content inside dialog")).toBeTruthy();
	});

	it("renders close button by default", () => {
		render(
			<Dialog open>
				<DialogContent>Inner</DialogContent>
			</Dialog>,
		);
		expect(screen.getByTestId("x-icon")).toBeTruthy();
	});

	it("does not render close button when showCloseButton=false", () => {
		render(
			<Dialog open>
				<DialogContent showCloseButton={false}>Inner</DialogContent>
			</Dialog>,
		);
		expect(screen.queryByTestId("x-icon")).toBeNull();
	});
});
