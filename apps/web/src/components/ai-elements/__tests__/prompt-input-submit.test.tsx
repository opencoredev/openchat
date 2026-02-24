// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { PromptInputSubmit } from "../prompt-input-submit";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	CornerDownLeftIcon: () => <svg data-testid="corner-down-left-icon" />,
	Loader2Icon: () => <svg data-testid="loader2-icon" />,
	SquareIcon: () => <svg data-testid="square-icon" />,
	XIcon: () => <svg data-testid="x-icon" />,
}));

vi.mock("motion/react", () => ({
	motion: {
		div: ({ children, ...rest }: { children: React.ReactNode }) => (
			<div {...rest}>{children}</div>
		),
	},
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroupButton: ({
		children,
		className,
		type,
		...props
	}: {
		children?: React.ReactNode;
		className?: string;
		type?: "submit" | "reset" | "button";
	}) => (
		<button data-testid="submit-button" className={className} type={type} {...props}>
			{children}
		</button>
	),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputSubmit", () => {
	it("renders CornerDownLeftIcon when no status given", () => {
		render(<PromptInputSubmit />);
		expect(screen.getByTestId("corner-down-left-icon")).toBeTruthy();
	});

	it("renders CornerDownLeftIcon for undefined status explicitly", () => {
		render(<PromptInputSubmit status={undefined} />);
		expect(screen.getByTestId("corner-down-left-icon")).toBeTruthy();
	});

	it("renders Loader2Icon for status=submitted", () => {
		render(<PromptInputSubmit status="submitted" />);
		expect(screen.getByTestId("loader2-icon")).toBeTruthy();
	});

	it("renders SquareIcon for status=streaming", () => {
		render(<PromptInputSubmit status="streaming" />);
		expect(screen.getByTestId("square-icon")).toBeTruthy();
	});

	it("renders XIcon for status=error", () => {
		render(<PromptInputSubmit status="error" />);
		expect(screen.getByTestId("x-icon")).toBeTruthy();
	});

	it("renders custom children instead of icon", () => {
		render(<PromptInputSubmit>Send</PromptInputSubmit>);
		expect(screen.getByText("Send")).toBeTruthy();
	});

	it("renders the submit button with aria-label", () => {
		render(<PromptInputSubmit />);
		const btn = screen.getByTestId("submit-button");
		expect(btn.getAttribute("aria-label")).toBe("Submit");
	});

	it("sets type=submit on the button", () => {
		render(<PromptInputSubmit />);
		const btn = screen.getByTestId("submit-button");
		expect(btn.getAttribute("type")).toBe("submit");
	});

	it("merges custom className", () => {
		render(<PromptInputSubmit className="custom-cls" />);
		const btn = screen.getByTestId("submit-button");
		expect(btn.className).toContain("custom-cls");
	});

	it("does not show non-matching status icons when status=submitted", () => {
		render(<PromptInputSubmit status="submitted" />);
		expect(screen.queryByTestId("corner-down-left-icon")).toBeNull();
		expect(screen.queryByTestId("square-icon")).toBeNull();
		expect(screen.queryByTestId("x-icon")).toBeNull();
	});

	it("does not show non-matching status icons when status=streaming", () => {
		render(<PromptInputSubmit status="streaming" />);
		expect(screen.queryByTestId("corner-down-left-icon")).toBeNull();
		expect(screen.queryByTestId("loader2-icon")).toBeNull();
		expect(screen.queryByTestId("x-icon")).toBeNull();
	});

	it("does not show non-matching status icons when status=error", () => {
		render(<PromptInputSubmit status="error" />);
		expect(screen.queryByTestId("corner-down-left-icon")).toBeNull();
		expect(screen.queryByTestId("loader2-icon")).toBeNull();
		expect(screen.queryByTestId("square-icon")).toBeNull();
	});
});
