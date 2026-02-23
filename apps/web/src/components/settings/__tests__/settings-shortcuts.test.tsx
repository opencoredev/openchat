// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useShortcutsStore } from "@/stores/shortcuts";
import { bindingHasModifier, bindingToTokens, eventToBinding, getConflictingShortcutIds, isReservedShortcutBinding } from "@/lib/shortcuts";
import type { ShortcutActionId } from "@/lib/shortcuts";

vi.mock("@/stores/shortcuts", () => ({
	useShortcutsStore: vi.fn((selector?: any) => {
		const state = {
			bindings: {},
			setBinding: vi.fn(),
			resetBinding: vi.fn(),
			resetAllBindings: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, variant, size }: any) => (
		<button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size}>
			{children}
		</button>
	),
}));

vi.mock("@/lib/shortcuts", () => ({
	SHORTCUT_CATEGORIES: [
		{ id: "general", label: "General" },
		{ id: "chat", label: "Chat" },
	],
	SHORTCUT_DEFINITIONS: [
		{
			id: "toggle-sidebar",
			category: "general",
			label: "Toggle sidebar",
			description: "Show or hide the sidebar",
			defaultBinding: { mac: "meta+b", other: "ctrl+b" },
		},
		{
			id: "new-chat",
			category: "chat",
			label: "New chat",
			description: "Start a new conversation",
			defaultBinding: { mac: "meta+n", other: "ctrl+n" },
		},
	],
	bindingHasModifier: vi.fn(() => true),
	bindingToTokens: vi.fn(() => ["Ctrl", "B"]),
	eventToBinding: vi.fn(() => "ctrl+b"),
	getConflictingShortcutIds: vi.fn(() => []),
	getEffectiveBinding: vi.fn(() => "ctrl+b"),
	getShortcutById: vi.fn(() => null),
	isMacPlatform: vi.fn(() => false),
	isReservedShortcutBinding: vi.fn(() => false),
	normalizeBinding: vi.fn((b: string) => b),
}));

import { ShortcutsSection } from "../settings-shortcuts";

const mockUseShortcutsStore = vi.mocked(useShortcutsStore);
const mockBindingToTokens = vi.mocked(bindingToTokens);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mockUseShortcutsStore.mockImplementation((selector?: any) => {
		const state = {
			bindings: {},
			setBinding: vi.fn(),
			resetBinding: vi.fn(),
			resetAllBindings: vi.fn(),
		};
		return selector ? selector(state) : state;
	});
	mockBindingToTokens.mockReturnValue(["Ctrl", "B"]);
});

describe("ShortcutsSection", () => {
	it("renders without crashing", () => {
		render(<ShortcutsSection />);
		expect(document.body).toBeTruthy();
	});

	it("shows 'Keyboard Shortcuts' heading", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText("Keyboard Shortcuts")).toBeDefined();
	});

	it("shows 'Reset all' button", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText("Reset all")).toBeDefined();
	});

	it("shows instructions text", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText(/Click any shortcut to remap it/)).toBeDefined();
	});

	it("shows shortcut category labels", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText("General")).toBeDefined();
		expect(screen.getByText("Chat")).toBeDefined();
	});

	it("shows shortcut item labels", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText("Toggle sidebar")).toBeDefined();
		expect(screen.getByText("New chat")).toBeDefined();
	});

	it("shows shortcut descriptions", () => {
		render(<ShortcutsSection />);
		expect(screen.getByText("Show or hide the sidebar")).toBeDefined();
		expect(screen.getByText("Start a new conversation")).toBeDefined();
	});

	it("shows 'Change' buttons for each shortcut", () => {
		render(<ShortcutsSection />);
		const changeButtons = screen.getAllByText("Change");
		expect(changeButtons.length).toBe(2);
	});

	it("shows 'Reset' buttons for each shortcut", () => {
		render(<ShortcutsSection />);
		const resetButtons = screen.getAllByText("Reset");
		expect(resetButtons.length).toBe(2);
	});

	it("shows key tokens as kbd elements", () => {
		render(<ShortcutsSection />);
		const kbdElements = document.querySelectorAll("kbd");
		expect(kbdElements.length).toBeGreaterThan(0);
	});

	it("calls resetAllBindings when 'Reset all' is clicked", () => {
		const mockResetAll = vi.fn();
		mockUseShortcutsStore.mockImplementation((selector?: any) => {
			const state = {
				bindings: {},
				setBinding: vi.fn(),
				resetBinding: vi.fn(),
				resetAllBindings: mockResetAll,
			};
			return selector ? selector(state) : state;
		});
		render(<ShortcutsSection />);
		fireEvent.click(screen.getByText("Reset all"));
		expect(mockResetAll).toHaveBeenCalled();
	});

	it("clicking 'Change' switches button to 'Press keys...'", () => {
		render(<ShortcutsSection />);
		const changeButtons = screen.getAllByText("Change");
		fireEvent.click(changeButtons[0]);
		expect(screen.getByText("Press keys...")).toBeDefined();
	});

	it("shows capture error when displayed", () => {
		render(<ShortcutsSection />);
		const changeButtons = screen.getAllByText("Change");
		fireEvent.click(changeButtons[0]);
		fireEvent.keyDown(window, { key: "a", code: "KeyA", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
		expect(screen.queryByText("Press keys...")).toBeDefined();
	});

	it("clicking 'Change' again cancels recording", () => {
		render(<ShortcutsSection />);
		const changeButtons = screen.getAllByText("Change");
		fireEvent.click(changeButtons[0]);
		expect(screen.getByText("Press keys...")).toBeDefined();
		fireEvent.click(screen.getByText("Press keys..."));
		expect(screen.queryByText("Press keys...")).toBeNull();
	});

	it("Reset button is disabled when no override binding exists", () => {
		mockUseShortcutsStore.mockImplementation((selector?: any) => {
			const state = {
				bindings: {},
				setBinding: vi.fn(),
				resetBinding: vi.fn(),
				resetAllBindings: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ShortcutsSection />);
		const resetButtons = screen.getAllByText("Reset");
		resetButtons.forEach((btn) => {
			expect((btn as HTMLButtonElement).disabled).toBe(true);
		});
	});

	it("shows 'Not set' when tokens array is empty", () => {
		mockBindingToTokens.mockReturnValue([]);
		render(<ShortcutsSection />);
		const notSetElements = screen.getAllByText("Not set");
		expect(notSetElements.length).toBeGreaterThan(0);
	});

	it("pressing Escape while recording cancels recording", () => {
		render(<ShortcutsSection />);
		fireEvent.click(screen.getAllByText("Change")[0]);
		expect(screen.getByText("Press keys...")).toBeDefined();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByText("Press keys...")).toBeNull();
	});

	it("pressing modifier-only key shows error 'Press a full shortcut, not only modifier keys.'", () => {
		vi.mocked(eventToBinding).mockReturnValueOnce("ctrl");
		render(<ShortcutsSection />);
		fireEvent.click(screen.getAllByText("Change")[0]);
		fireEvent.keyDown(window, { key: "Control" });
		expect(screen.getByText("Press a full shortcut, not only modifier keys.")).toBeDefined();
	});

	it("conflict with existing shortcut shows conflict error", () => {
		vi.mocked(getConflictingShortcutIds).mockReturnValueOnce(["toggle-sidebar" as ShortcutActionId]);
		render(<ShortcutsSection />);
		fireEvent.click(screen.getAllByText("Change")[0]);
		fireEvent.keyDown(window, { key: "b", ctrlKey: true });
		expect(screen.getByText('Already used by "another shortcut".')).toBeDefined();
	});

	it("shows no-modifier error when binding has key but no modifier (not escape)", () => {
		vi.mocked(eventToBinding).mockReturnValueOnce("a");
		vi.mocked(bindingHasModifier).mockReturnValueOnce(false);
		render(<ShortcutsSection />);
		fireEvent.click(screen.getAllByText("Change")[0]);
		fireEvent.keyDown(window, { key: "a" });
		expect(screen.getByText("Shortcuts need at least one modifier key (Ctrl/Cmd, Alt, Shift).")).toBeDefined();
	});

	it("shows reserved-shortcut error when isReservedShortcutBinding returns true", () => {
		vi.mocked(isReservedShortcutBinding).mockReturnValueOnce(true);
		render(<ShortcutsSection />);
		fireEvent.click(screen.getAllByText("Change")[0]);
		fireEvent.keyDown(window, { key: "b", ctrlKey: true });
		expect(screen.getByText("That shortcut is reserved by the browser. Pick another one.")).toBeDefined();
	});

	it("clicking Reset while recording cancels recording", () => {
		const mockResetBinding = vi.fn();
		mockUseShortcutsStore.mockImplementation((selector?: any) => {
			const state = {
				bindings: { "toggle-sidebar": "ctrl+t" } as Record<ShortcutActionId, string | undefined>,
				setBinding: vi.fn(),
				resetBinding: mockResetBinding,
				resetAllBindings: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ShortcutsSection />);

		fireEvent.click(screen.getAllByText("Change")[0]);
		expect(screen.getByText("Press keys...")).toBeDefined();

		const resetButtons = screen.getAllByText("Reset");
		fireEvent.click(resetButtons[0]);

		expect(screen.queryByText("Press keys...")).toBeNull();
		expect(mockResetBinding).toHaveBeenCalledWith("toggle-sidebar");
	});
});
