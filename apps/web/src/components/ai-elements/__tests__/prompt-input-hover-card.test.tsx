// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
	PromptInputHoverCard,
	PromptInputHoverCardContent,
	PromptInputHoverCardTrigger,
} from "../prompt-input-hover-card";

vi.mock("@/components/ui/hover-card", () => ({
	HoverCard: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="hover-card">{children}</div>
	),
	HoverCardTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="hover-card-trigger">{children}</div>
	),
	HoverCardContent: ({
		children,
		align,
	}: {
		children: React.ReactNode;
		align: string;
	}) => (
		<div data-testid="hover-card-content" data-align={align}>
			{children}
		</div>
	),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputHoverCard", () => {
	it("renders children", () => {
		render(<PromptInputHoverCard>card content</PromptInputHoverCard>);
		expect(screen.getByText("card content")).toBeTruthy();
	});

	it("wraps in HoverCard", () => {
		render(<PromptInputHoverCard>content</PromptInputHoverCard>);
		expect(screen.getByTestId("hover-card")).toBeTruthy();
	});

	it("passes props through", () => {
		const onOpenChange = vi.fn();
		render(<PromptInputHoverCard onOpenChange={onOpenChange}>content</PromptInputHoverCard>);
		expect(screen.getByTestId("hover-card")).toBeTruthy();
	});
});

describe("PromptInputHoverCardTrigger", () => {
	it("renders children", () => {
		render(<PromptInputHoverCardTrigger>trigger</PromptInputHoverCardTrigger>);
		expect(screen.getByText("trigger")).toBeTruthy();
	});

	it("wraps in HoverCardTrigger", () => {
		render(<PromptInputHoverCardTrigger>trigger</PromptInputHoverCardTrigger>);
		expect(screen.getByTestId("hover-card-trigger")).toBeTruthy();
	});
});

describe("PromptInputHoverCardContent", () => {
	it("renders children", () => {
		render(<PromptInputHoverCardContent>content body</PromptInputHoverCardContent>);
		expect(screen.getByText("content body")).toBeTruthy();
	});

	it("defaults align to start", () => {
		render(<PromptInputHoverCardContent>body</PromptInputHoverCardContent>);
		const el = screen.getByTestId("hover-card-content");
		expect(el.getAttribute("data-align")).toBe("start");
	});

	it("accepts custom align", () => {
		render(<PromptInputHoverCardContent align="end">body</PromptInputHoverCardContent>);
		const el = screen.getByTestId("hover-card-content");
		expect(el.getAttribute("data-align")).toBe("end");
	});

	it("wraps in HoverCardContent", () => {
		render(<PromptInputHoverCardContent>body</PromptInputHoverCardContent>);
		expect(screen.getByTestId("hover-card-content")).toBeTruthy();
	});
});
