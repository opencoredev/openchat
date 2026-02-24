// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { Switch } from "../switch";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Switch", () => {
	it("renders without crashing", () => {
		render(<Switch />);
		expect(document.body).toBeTruthy();
	});

	it("has role switch", () => {
		render(<Switch />);
		expect(screen.getByRole("switch")).toBeTruthy();
	});

	it("is unchecked by default", () => {
		render(<Switch />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("false");
	});

	it("renders as checked when checked=true", () => {
		render(<Switch checked />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("true");
	});

	it("renders as unchecked when checked=false", () => {
		render(<Switch checked={false} />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("false");
	});

	it("has data-state=checked when controlled checked=true", () => {
		render(<Switch checked />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("data-state")).toBe("checked");
	});

	it("has data-state=unchecked when controlled checked=false", () => {
		render(<Switch checked={false} />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("data-state")).toBe("unchecked");
	});

	it("renders defaultChecked=true with aria-checked=true", () => {
		render(<Switch defaultChecked />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("true");
	});

	it("renders defaultChecked=false with aria-checked=false", () => {
		render(<Switch defaultChecked={false} />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("false");
	});

	it("toggles from unchecked to checked on click (uncontrolled)", () => {
		render(<Switch />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("false");
		fireEvent.click(btn);
		expect(btn.getAttribute("aria-checked")).toBe("true");
	});

	it("toggles from checked to unchecked on click (uncontrolled)", () => {
		render(<Switch defaultChecked />);
		const btn = screen.getByRole("switch");
		expect(btn.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(btn);
		expect(btn.getAttribute("aria-checked")).toBe("false");
	});

	it("calls onCheckedChange with new value on click", () => {
		const onCheckedChange = vi.fn();
		render(<Switch onCheckedChange={onCheckedChange} />);
		const btn = screen.getByRole("switch");
		fireEvent.click(btn);
		expect(onCheckedChange).toHaveBeenCalledWith(true);
	});

	it("calls onCheckedChange with false when toggling from checked", () => {
		const onCheckedChange = vi.fn();
		render(<Switch checked onCheckedChange={onCheckedChange} />);
		const btn = screen.getByRole("switch");
		fireEvent.click(btn);
		expect(onCheckedChange).toHaveBeenCalledWith(false);
	});

	it("does not call onCheckedChange when disabled", () => {
		const onCheckedChange = vi.fn();
		render(<Switch disabled onCheckedChange={onCheckedChange} />);
		const btn = screen.getByRole("switch");
		fireEvent.click(btn);
		expect(onCheckedChange).not.toHaveBeenCalled();
	});

	it("is disabled when disabled prop is set", () => {
		render(<Switch disabled />);
		const btn = screen.getByRole("switch") as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("applies custom className", () => {
		render(<Switch className="my-switch" />);
		const btn = screen.getByRole("switch");
		expect(btn.className).toContain("my-switch");
	});

	it("does not update aria-checked in controlled mode on click (parent controls state)", () => {
		const onCheckedChange = vi.fn();
		render(<Switch checked={false} onCheckedChange={onCheckedChange} />);
		const btn = screen.getByRole("switch");
		fireEvent.click(btn);
		expect(onCheckedChange).toHaveBeenCalledWith(true);
		expect(btn.getAttribute("aria-checked")).toBe("false");
	});
});
