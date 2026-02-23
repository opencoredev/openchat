// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { CloseIcon, ThinkingIcon, EyeIcon, ToolIcon, InfoIcon, StarIcon } from "../icons";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Icons", () => {
	it("CloseIcon renders an SVG element", () => {
		const { container } = render(<CloseIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("ThinkingIcon renders an SVG element", () => {
		const { container } = render(<ThinkingIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("EyeIcon renders an SVG element", () => {
		const { container } = render(<EyeIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("ToolIcon renders an SVG element", () => {
		const { container } = render(<ToolIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("InfoIcon renders an SVG element", () => {
		const { container } = render(<InfoIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("StarIcon renders an SVG element", () => {
		const { container } = render(<StarIcon />);
		expect(container.querySelector("svg")).toBeTruthy();
	});

	it("CloseIcon applies className to svg", () => {
		const { container } = render(<CloseIcon className="my-class" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("my-class");
	});

	it("ThinkingIcon applies className to svg", () => {
		const { container } = render(<ThinkingIcon className="thinking-test" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("thinking-test");
	});

	it("EyeIcon applies className to svg", () => {
		const { container } = render(<EyeIcon className="eye-test" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("eye-test");
	});

	it("ToolIcon applies className to svg", () => {
		const { container } = render(<ToolIcon className="tool-test" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("tool-test");
	});

	it("InfoIcon applies className to svg", () => {
		const { container } = render(<InfoIcon className="info-test" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("info-test");
	});

	it("StarIcon renders with fill=currentColor when filled=true", () => {
		const { container } = render(<StarIcon filled={true} />);
		expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("StarIcon renders with fill=none when filled=false", () => {
		const { container } = render(<StarIcon filled={false} />);
		expect(container.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});

	it("StarIcon renders with fill=none when filled is undefined", () => {
		const { container } = render(<StarIcon />);
		expect(container.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});

	it("StarIcon applies className to svg", () => {
		const { container } = render(<StarIcon className="star-test" />);
		expect(container.querySelector("svg")?.className.baseVal).toContain("star-test");
	});
});
