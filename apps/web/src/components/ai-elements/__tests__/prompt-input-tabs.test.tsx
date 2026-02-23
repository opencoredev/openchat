// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	PromptInputTab,
	PromptInputTabBody,
	PromptInputTabItem,
	PromptInputTabLabel,
	PromptInputTabsList,
} from "../prompt-input-tabs";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PromptInputTabsList", () => {
	it("renders children", () => {
		render(<PromptInputTabsList>list content</PromptInputTabsList>);
		expect(screen.getByText("list content")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<PromptInputTabsList className="custom-class">content</PromptInputTabsList>);
		const el = screen.getByText("content");
		expect(el.className).toContain("custom-class");
	});

	it("passes additional props", () => {
		render(<PromptInputTabsList data-testid="tabs-list">content</PromptInputTabsList>);
		expect(screen.getByTestId("tabs-list")).toBeTruthy();
	});
});

describe("PromptInputTab", () => {
	it("renders children", () => {
		render(<PromptInputTab>tab content</PromptInputTab>);
		expect(screen.getByText("tab content")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<PromptInputTab className="my-tab">content</PromptInputTab>);
		const el = screen.getByText("content");
		expect(el.className).toContain("my-tab");
	});

	it("passes additional props", () => {
		render(<PromptInputTab data-testid="tab">content</PromptInputTab>);
		expect(screen.getByTestId("tab")).toBeTruthy();
	});
});

describe("PromptInputTabLabel", () => {
	it("renders children", () => {
		render(<PromptInputTabLabel>label text</PromptInputTabLabel>);
		expect(screen.getByText("label text")).toBeTruthy();
	});

	it("renders as h3", () => {
		render(<PromptInputTabLabel>label</PromptInputTabLabel>);
		const el = screen.getByText("label");
		expect(el.tagName).toBe("H3");
	});

	it("applies default className", () => {
		render(<PromptInputTabLabel>label</PromptInputTabLabel>);
		const el = screen.getByText("label");
		expect(el.className).toContain("mb-2");
	});

	it("merges custom className", () => {
		render(<PromptInputTabLabel className="extra">label</PromptInputTabLabel>);
		const el = screen.getByText("label");
		expect(el.className).toContain("extra");
	});
});

describe("PromptInputTabBody", () => {
	it("renders children", () => {
		render(<PromptInputTabBody>body content</PromptInputTabBody>);
		expect(screen.getByText("body content")).toBeTruthy();
	});

	it("applies space-y-1 class by default", () => {
		render(<PromptInputTabBody data-testid="body">body</PromptInputTabBody>);
		const el = screen.getByTestId("body");
		expect(el.className).toContain("space-y-1");
	});

	it("merges custom className", () => {
		render(<PromptInputTabBody className="custom">body</PromptInputTabBody>);
		const el = screen.getByText("body");
		expect(el.className).toContain("custom");
	});
});

describe("PromptInputTabItem", () => {
	it("renders children", () => {
		render(<PromptInputTabItem>item content</PromptInputTabItem>);
		expect(screen.getByText("item content")).toBeTruthy();
	});

	it("applies default flex classes", () => {
		render(<PromptInputTabItem data-testid="item">item</PromptInputTabItem>);
		const el = screen.getByTestId("item");
		expect(el.className).toContain("flex");
		expect(el.className).toContain("items-center");
	});

	it("merges custom className", () => {
		render(<PromptInputTabItem className="custom-item">item</PromptInputTabItem>);
		const el = screen.getByText("item");
		expect(el.className).toContain("custom-item");
	});

	it("passes additional props", () => {
		const onClick = vi.fn();
		render(<PromptInputTabItem onClick={onClick} data-testid="item">item</PromptInputTabItem>);
		screen.getByTestId("item").click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
