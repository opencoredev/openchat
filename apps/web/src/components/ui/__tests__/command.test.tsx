// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	SearchIcon: () => <svg data-testid="search-icon" />,
	CheckIcon: () => <svg data-testid="check-icon" />,
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children }: { children?: React.ReactNode }) => <div data-testid="dialog-root">{children}</div>,
	DialogContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div data-testid="dialog-content" className={className}>{children}</div>
	),
	DialogHeader: ({ children }: { children?: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
	DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
	DialogDescription: ({ children }: { children?: React.ReactNode }) => (
		<p data-testid="dialog-description">{children}</p>
	),
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroup: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div data-testid="input-group" className={className}>{children}</div>
	),
	InputGroupAddon: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="input-group-addon">{children}</div>
	),
}));

vi.mock("cmdk", () => ({
	Command: Object.assign(
		({ children, className }: { children?: React.ReactNode; className?: string }) => (
			<div data-testid="cmdk-root" className={className}>{children}</div>
		),
		{
			Input: ({ className, placeholder }: { className?: string; placeholder?: string }) => (
				<input data-testid="cmdk-input" className={className} placeholder={placeholder} />
			),
			List: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
				<div data-testid="cmdk-list" className={className}>{children}</div>
			),
			Empty: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
				<div data-testid="cmdk-empty" className={className}>{children}</div>
			),
			Group: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
				<div data-testid="cmdk-group" className={className}>{children}</div>
			),
			Item: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
				<div data-testid="cmdk-item" className={className}>{children}</div>
			),
			Separator: ({ className }: { className?: string }) => (
				<hr data-testid="cmdk-separator" className={className} />
			),
		},
	),
}));

import {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
} from "../command";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Command", () => {
	it("renders without crashing", () => {
		render(<Command />);
		expect(screen.getByTestId("cmdk-root")).toBeTruthy();
	});

	it("passes className", () => {
		render(<Command className="custom-cmd" />);
		const el = screen.getByTestId("cmdk-root");
		expect(el.className).toContain("custom-cmd");
	});

	it("renders children", () => {
		render(<Command><span>Child content</span></Command>);
		expect(screen.getByText("Child content")).toBeTruthy();
	});
});

describe("CommandDialog", () => {
	it("renders with default title and description", () => {
		render(<CommandDialog open><span>Dialog child</span></CommandDialog>);
		expect(screen.getByTestId("dialog-title")).toBeTruthy();
		expect(screen.getByText("Command Palette")).toBeTruthy();
		expect(screen.getByText("Search for a command to run...")).toBeTruthy();
	});

	it("renders children", () => {
		render(<CommandDialog open><span>My content</span></CommandDialog>);
		expect(screen.getByText("My content")).toBeTruthy();
	});

	it("accepts custom title", () => {
		render(<CommandDialog open title="Custom Title"><span>x</span></CommandDialog>);
		expect(screen.getByText("Custom Title")).toBeTruthy();
	});
});

describe("CommandInput", () => {
	it("renders the input", () => {
		render(
			<Command>
				<CommandInput placeholder="Search..." />
			</Command>,
		);
		expect(screen.getByTestId("cmdk-input")).toBeTruthy();
	});

	it("passes placeholder", () => {
		render(
			<Command>
				<CommandInput placeholder="Type here" />
			</Command>,
		);
		const input = screen.getByTestId("cmdk-input");
		expect(input.getAttribute("placeholder")).toBe("Type here");
	});

	it("renders the search icon", () => {
		render(
			<Command>
				<CommandInput />
			</Command>,
		);
		expect(screen.getByTestId("search-icon")).toBeTruthy();
	});
});

describe("CommandList", () => {
	it("renders children", () => {
		render(<Command><CommandList>List content</CommandList></Command>);
		expect(screen.getByText("List content")).toBeTruthy();
	});

	it("renders the list element", () => {
		render(<Command><CommandList>Items</CommandList></Command>);
		expect(screen.getByTestId("cmdk-list")).toBeTruthy();
	});
});

describe("CommandEmpty", () => {
	it("renders empty state text", () => {
		render(<Command><CommandEmpty>No results found.</CommandEmpty></Command>);
		expect(screen.getByText("No results found.")).toBeTruthy();
	});
});

describe("CommandGroup", () => {
	it("renders children", () => {
		render(<Command><CommandGroup>Group items</CommandGroup></Command>);
		expect(screen.getByText("Group items")).toBeTruthy();
	});

	it("passes className", () => {
		render(<Command><CommandGroup className="grp-cls">G</CommandGroup></Command>);
		const el = screen.getByTestId("cmdk-group");
		expect(el.className).toContain("grp-cls");
	});
});

describe("CommandItem", () => {
	it("renders item content and check icon", () => {
		render(
			<Command>
				<CommandList>
					<CommandGroup>
						<CommandItem>Item label</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);
		expect(screen.getByText("Item label")).toBeTruthy();
		expect(screen.getByTestId("check-icon")).toBeTruthy();
	});
});

describe("CommandShortcut", () => {
	it("renders shortcut text", () => {
		render(<CommandShortcut>⌘K</CommandShortcut>);
		expect(screen.getByText("⌘K")).toBeTruthy();
	});

	it("has data-slot attribute", () => {
		render(<CommandShortcut data-testid="shortcut">⌘P</CommandShortcut>);
		const el = screen.getByTestId("shortcut");
		expect(el.getAttribute("data-slot")).toBe("command-shortcut");
	});
});

describe("CommandSeparator", () => {
	it("renders separator element", () => {
		render(<Command><CommandSeparator /></Command>);
		expect(screen.getByTestId("cmdk-separator")).toBeTruthy();
	});
});
