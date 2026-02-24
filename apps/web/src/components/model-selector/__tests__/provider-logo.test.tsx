// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { ProviderLogo } from "../provider-logo";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ProviderLogo", () => {
	it("renders img with correct src URL", () => {
		render(<ProviderLogo providerId="openai" />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("src")).toBe("https://models.dev/logos/openai.svg");
	});

	it("renders img with correct alt text", () => {
		render(<ProviderLogo providerId="openai" />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("alt")).toBe("openai logo");
	});

	it("renders img with specified dimensions via className", () => {
		render(<ProviderLogo providerId="openai" className="size-8" />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("class")).toContain("size-8");
	});

	it("renders img with default size-4 class when no className given", () => {
		render(<ProviderLogo providerId="openai" />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("class")).toContain("size-4");
	});

	it("onError: removes img and shows fallback div with first letter of providerId", () => {
		render(<ProviderLogo providerId="openai" />);
		const img = screen.getByRole("img");
		fireEvent.error(img);
		expect(screen.queryByRole("img")).toBeNull();
		expect(screen.getByText("o")).toBeDefined();
	});

	it("fallback shows first letter of multi-word providerId", () => {
		render(<ProviderLogo providerId="anthropic" />);
		const img = screen.getByRole("img");
		fireEvent.error(img);
		expect(screen.getByText("a")).toBeDefined();
	});

	it("fallback div has correct className containing flex and rounded-md", () => {
		render(<ProviderLogo providerId="openai" />);
		const img = screen.getByRole("img");
		fireEvent.error(img);
		const fallback = screen.getByText("o");
		expect(fallback.className).toContain("flex");
		expect(fallback.className).toContain("rounded-md");
	});

	it("fallback div uses provided className instead of default size-4", () => {
		render(<ProviderLogo providerId="openai" className="size-9" />);
		const img = screen.getByRole("img");
		fireEvent.error(img);
		const fallback = screen.getByText("o");
		expect(fallback.className).toContain("size-9");
	});
});
