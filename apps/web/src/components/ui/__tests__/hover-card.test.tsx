// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@base-ui/react/preview-card", () => ({
	PreviewCard: {
		Root: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Trigger: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
			<span data-testid="hover-card-trigger" {...props as Record<string, unknown>}>{children}</span>
		),
		Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
		Positioner: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
			<div data-testid="hover-card-positioner" className={className}>{children}</div>
		),
		Popup: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
			<div data-testid="hover-card-popup" className={className} {...props as Record<string, unknown>}>{children}</div>
		),
	},
}));

import { HoverCard, HoverCardTrigger, HoverCardContent } from "../hover-card";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("HoverCard", () => {
	it("renders without crashing", () => {
		render(<HoverCard />);
		expect(document.body).toBeTruthy();
	});

	it("renders children", () => {
		render(
			<HoverCard>
				<span>Hover me</span>
			</HoverCard>,
		);
		expect(screen.getByText("Hover me")).toBeTruthy();
	});
});

describe("HoverCardTrigger", () => {
	it("renders children", () => {
		render(<HoverCardTrigger>Trigger text</HoverCardTrigger>);
		expect(screen.getByText("Trigger text")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<HoverCardTrigger data-testid="trigger">Hover</HoverCardTrigger>);
		const el = screen.getByTestId("trigger");
		expect(el.getAttribute("data-slot")).toBe("hover-card-trigger");
	});
});

describe("HoverCardContent", () => {
	it("renders children inside popup", () => {
		render(<HoverCardContent>Card content</HoverCardContent>);
		expect(screen.getByText("Card content")).toBeTruthy();
	});

	it("renders positioner and popup elements", () => {
		render(<HoverCardContent>Content</HoverCardContent>);
		expect(screen.getByTestId("hover-card-positioner")).toBeTruthy();
		expect(screen.getByTestId("hover-card-popup")).toBeTruthy();
	});

	it("passes className to popup", () => {
		render(<HoverCardContent className="card-cls">Content</HoverCardContent>);
		const popup = screen.getByTestId("hover-card-popup");
		expect(popup.className).toContain("card-cls");
	});

	it("has data-slot on popup", () => {
		render(<HoverCardContent>C</HoverCardContent>);
		const popup = screen.getByTestId("hover-card-popup");
		expect(popup.getAttribute("data-slot")).toBe("hover-card-content");
	});
});

describe("HoverCard full composition", () => {
	it("renders trigger and content together", () => {
		render(
			<HoverCard>
				<HoverCardTrigger>Hover target</HoverCardTrigger>
				<HoverCardContent>Preview content</HoverCardContent>
			</HoverCard>,
		);
		expect(screen.getByText("Hover target")).toBeTruthy();
		expect(screen.getByText("Preview content")).toBeTruthy();
	});
});
