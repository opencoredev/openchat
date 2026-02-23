// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		className,
		type,
		...props
	}: {
		children?: React.ReactNode;
		className?: string;
		type?: string;
		[key: string]: unknown;
	}) => (
		<button className={className} type={(type ?? "button") as "button" | "submit" | "reset"} {...props as Record<string, unknown>}>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/input", () => ({
	Input: ({
		className,
		...props
	}: {
		className?: string;
		[key: string]: unknown;
	}) => <input data-testid="input" className={className} {...props as Record<string, unknown>} />,
}));

vi.mock("@/components/ui/textarea", () => ({
	Textarea: ({
		className,
		...props
	}: {
		className?: string;
		[key: string]: unknown;
	}) => <textarea data-testid="textarea" className={className} {...props as Record<string, unknown>} />,
}));

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupText,
	InputGroupInput,
	InputGroupTextarea,
} from "../input-group";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("InputGroup", () => {
	it("renders without crashing", () => {
		render(<InputGroup />);
		expect(document.body).toBeTruthy();
	});

	it("renders children", () => {
		render(<InputGroup><span>Child</span></InputGroup>);
		expect(screen.getByText("Child")).toBeTruthy();
	});

	it("has role=group", () => {
		render(<InputGroup data-testid="ig" />);
		const el = screen.getByTestId("ig");
		expect(el.getAttribute("role")).toBe("group");
	});

	it("has data-slot attribute", () => {
		render(<InputGroup data-testid="ig" />);
		const el = screen.getByTestId("ig");
		expect(el.getAttribute("data-slot")).toBe("input-group");
	});

	it("applies custom className", () => {
		render(<InputGroup className="my-group" data-testid="ig" />);
		const el = screen.getByTestId("ig");
		expect(el.className).toContain("my-group");
	});
});

describe("InputGroupAddon", () => {
	it("renders children", () => {
		render(<InputGroupAddon>Icon</InputGroupAddon>);
		expect(screen.getByText("Icon")).toBeTruthy();
	});

	it("has data-slot=input-group-addon", () => {
		render(<InputGroupAddon data-testid="addon">X</InputGroupAddon>);
		const el = screen.getByTestId("addon");
		expect(el.getAttribute("data-slot")).toBe("input-group-addon");
	});

	it("has default inline-start align", () => {
		render(<InputGroupAddon data-testid="addon">X</InputGroupAddon>);
		const el = screen.getByTestId("addon");
		expect(el.getAttribute("data-align")).toBe("inline-start");
	});

	it("accepts inline-end align", () => {
		render(<InputGroupAddon align="inline-end" data-testid="addon">X</InputGroupAddon>);
		const el = screen.getByTestId("addon");
		expect(el.getAttribute("data-align")).toBe("inline-end");
	});

	it("accepts block-start align", () => {
		render(<InputGroupAddon align="block-start" data-testid="addon">X</InputGroupAddon>);
		const el = screen.getByTestId("addon");
		expect(el.getAttribute("data-align")).toBe("block-start");
	});

	it("accepts block-end align", () => {
		render(<InputGroupAddon align="block-end" data-testid="addon">X</InputGroupAddon>);
		const el = screen.getByTestId("addon");
		expect(el.getAttribute("data-align")).toBe("block-end");
	});
});

describe("InputGroupButton", () => {
	it("renders children", () => {
		render(<InputGroupButton>Submit</InputGroupButton>);
		expect(screen.getByText("Submit")).toBeTruthy();
	});

	it("renders as a button element", () => {
		render(<InputGroupButton>Click</InputGroupButton>);
		const btn = screen.getByRole("button");
		expect(btn).toBeTruthy();
	});

	it("has default type=button", () => {
		render(<InputGroupButton>B</InputGroupButton>);
		const btn = screen.getByRole("button") as HTMLButtonElement;
		expect(btn.type).toBe("button");
	});

	it("accepts type=submit", () => {
		render(<InputGroupButton type="submit">Send</InputGroupButton>);
		const btn = screen.getByRole("button") as HTMLButtonElement;
		expect(btn.type).toBe("submit");
	});
});

describe("InputGroupText", () => {
	it("renders text content", () => {
		render(<InputGroupText>http://</InputGroupText>);
		expect(screen.getByText("http://")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<InputGroupText className="my-text" data-testid="txt">ABC</InputGroupText>);
		const el = screen.getByTestId("txt");
		expect(el.className).toContain("my-text");
	});
});

describe("InputGroupInput", () => {
	it("renders an input", () => {
		render(<InputGroupInput />);
		expect(screen.getByTestId("input")).toBeTruthy();
	});

	it("has data-slot=input-group-control", () => {
		render(<InputGroupInput />);
		expect(screen.getByTestId("input").getAttribute("data-slot")).toBe("input-group-control");
	});

	it("forwards placeholder prop", () => {
		render(<InputGroupInput placeholder="Enter text" />);
		expect(screen.getByTestId("input").getAttribute("placeholder")).toBe("Enter text");
	});
});

describe("InputGroupTextarea", () => {
	it("renders a textarea", () => {
		render(<InputGroupTextarea />);
		expect(screen.getByTestId("textarea")).toBeTruthy();
	});

	it("has data-slot=input-group-control", () => {
		render(<InputGroupTextarea />);
		expect(screen.getByTestId("textarea").getAttribute("data-slot")).toBe("input-group-control");
	});

	it("forwards placeholder prop", () => {
		render(<InputGroupTextarea placeholder="Write here" />);
		expect(screen.getByTestId("textarea").getAttribute("placeholder")).toBe("Write here");
	});
});

describe("InputGroupAddon click handler", () => {
	it("clicking the addon directly (not a button) tries to focus the input (lines 55, 57-58)", () => {
		render(
			<InputGroup data-testid="group">
				<InputGroupAddon data-testid="addon">Icon</InputGroupAddon>
				<InputGroupInput />
			</InputGroup>
		);
		const addon = screen.getByTestId("addon");
		fireEvent.click(addon);
		expect(screen.getByTestId("input")).toBeTruthy();
	});

	it("clicking a button inside the addon returns early (lines 55-56)", () => {
		render(
			<InputGroup>
				<InputGroupAddon data-testid="addon">
					<InputGroupButton>X</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		);
		const btn = screen.getByRole("button");
		fireEvent.click(btn);
		expect(screen.getByTestId("addon")).toBeTruthy();
	});
});
