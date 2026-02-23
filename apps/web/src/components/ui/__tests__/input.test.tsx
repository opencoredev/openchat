// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@base-ui/react/input", () => ({
	Input: ({
		className,
		type,
		...props
	}: {
		className?: string;
		type?: string;
		[key: string]: unknown;
	}) => (
		<input
			data-testid="base-input"
			type={type}
			className={className}
			{...(props as Record<string, unknown>)}
		/>
	),
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { Input } from "../input";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Input", () => {
	it("renders without crashing", () => {
		render(<Input />);
		expect(document.body).toBeTruthy();
	});

	it("renders the base-input element", () => {
		render(<Input />);
		expect(screen.getByTestId("base-input")).toBeTruthy();
	});

	it("has data-slot='input'", () => {
		render(<Input />);
		const el = screen.getByTestId("base-input");
		expect(el.getAttribute("data-slot")).toBe("input");
	});

	it("forwards type prop", () => {
		render(<Input type="email" />);
		const el = screen.getByTestId("base-input");
		expect(el.getAttribute("type")).toBe("email");
	});

	it("forwards type=password", () => {
		render(<Input type="password" />);
		const el = screen.getByTestId("base-input");
		expect(el.getAttribute("type")).toBe("password");
	});

	it("forwards className prop merged with base classes", () => {
		render(<Input className="my-input" />);
		const el = screen.getByTestId("base-input");
		expect(el.className).toContain("my-input");
	});

	it("includes base class in className", () => {
		render(<Input />);
		const el = screen.getByTestId("base-input");
		expect(el.className).toContain("w-full");
	});

	it("forwards placeholder prop", () => {
		render(<Input placeholder="Enter value" />);
		const el = screen.getByTestId("base-input");
		expect(el.getAttribute("placeholder")).toBe("Enter value");
	});

	it("forwards disabled prop", () => {
		render(<Input disabled />);
		const el = screen.getByTestId("base-input") as HTMLInputElement;
		expect(el.disabled).toBe(true);
	});

	it("forwards id prop", () => {
		render(<Input id="my-input-id" />);
		const el = screen.getByTestId("base-input");
		expect(el.id).toBe("my-input-id");
	});

	it("forwards name prop", () => {
		render(<Input name="username" />);
		const el = screen.getByTestId("base-input");
		expect(el.getAttribute("name")).toBe("username");
	});
});
