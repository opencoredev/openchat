// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
	PromptInputCommand,
	PromptInputCommandEmpty,
	PromptInputCommandGroup,
	PromptInputCommandInput,
	PromptInputCommandItem,
	PromptInputCommandList,
	PromptInputCommandSeparator,
} from "../prompt-input-command";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/command", () => ({
	Command: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="command" className={className}>
			{children}
		</div>
	),
	CommandInput: ({ className, placeholder }: { className?: string; placeholder?: string }) => (
		<input data-testid="command-input" className={className} placeholder={placeholder} />
	),
	CommandList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="command-list" className={className}>
			{children}
		</div>
	),
	CommandEmpty: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="command-empty" className={className}>
			{children}
		</div>
	),
	CommandGroup: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="command-group" className={className}>
			{children}
		</div>
	),
	CommandItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="command-item" className={className}>
			{children}
		</div>
	),
	CommandSeparator: ({ className }: { className?: string }) => (
		<hr data-testid="command-separator" className={className} />
	),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputCommand", () => {
	it("renders children", () => {
		render(<PromptInputCommand>cmd content</PromptInputCommand>);
		expect(screen.getByText("cmd content")).toBeTruthy();
	});

	it("wraps in Command", () => {
		render(<PromptInputCommand>content</PromptInputCommand>);
		expect(screen.getByTestId("command")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommand className="my-cmd">content</PromptInputCommand>);
		expect(screen.getByTestId("command").className).toContain("my-cmd");
	});
});

describe("PromptInputCommandInput", () => {
	it("renders an input", () => {
		render(<PromptInputCommandInput />);
		expect(screen.getByTestId("command-input")).toBeTruthy();
	});

	it("passes placeholder", () => {
		render(<PromptInputCommandInput placeholder="Search..." />);
		const el = screen.getByTestId("command-input");
		expect(el.getAttribute("placeholder")).toBe("Search...");
	});

	it("merges custom className", () => {
		render(<PromptInputCommandInput className="input-class" />);
		expect(screen.getByTestId("command-input").className).toContain("input-class");
	});
});

describe("PromptInputCommandList", () => {
	it("renders children", () => {
		render(<PromptInputCommandList>list items</PromptInputCommandList>);
		expect(screen.getByText("list items")).toBeTruthy();
	});

	it("wraps in CommandList", () => {
		render(<PromptInputCommandList>items</PromptInputCommandList>);
		expect(screen.getByTestId("command-list")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommandList className="list-class">items</PromptInputCommandList>);
		expect(screen.getByTestId("command-list").className).toContain("list-class");
	});
});

describe("PromptInputCommandEmpty", () => {
	it("renders children", () => {
		render(<PromptInputCommandEmpty>No results</PromptInputCommandEmpty>);
		expect(screen.getByText("No results")).toBeTruthy();
	});

	it("wraps in CommandEmpty", () => {
		render(<PromptInputCommandEmpty>No results</PromptInputCommandEmpty>);
		expect(screen.getByTestId("command-empty")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommandEmpty className="empty-cls">No results</PromptInputCommandEmpty>);
		expect(screen.getByTestId("command-empty").className).toContain("empty-cls");
	});
});

describe("PromptInputCommandGroup", () => {
	it("renders children", () => {
		render(<PromptInputCommandGroup>group content</PromptInputCommandGroup>);
		expect(screen.getByText("group content")).toBeTruthy();
	});

	it("wraps in CommandGroup", () => {
		render(<PromptInputCommandGroup>content</PromptInputCommandGroup>);
		expect(screen.getByTestId("command-group")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommandGroup className="grp-cls">content</PromptInputCommandGroup>);
		expect(screen.getByTestId("command-group").className).toContain("grp-cls");
	});
});

describe("PromptInputCommandItem", () => {
	it("renders children", () => {
		render(<PromptInputCommandItem>item text</PromptInputCommandItem>);
		expect(screen.getByText("item text")).toBeTruthy();
	});

	it("wraps in CommandItem", () => {
		render(<PromptInputCommandItem>item</PromptInputCommandItem>);
		expect(screen.getByTestId("command-item")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommandItem className="item-cls">item</PromptInputCommandItem>);
		expect(screen.getByTestId("command-item").className).toContain("item-cls");
	});
});

describe("PromptInputCommandSeparator", () => {
	it("renders", () => {
		render(<PromptInputCommandSeparator />);
		expect(screen.getByTestId("command-separator")).toBeTruthy();
	});

	it("merges custom className", () => {
		render(<PromptInputCommandSeparator className="sep-cls" />);
		expect(screen.getByTestId("command-separator").className).toContain("sep-cls");
	});
});
