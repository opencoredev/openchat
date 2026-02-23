// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useChatTitleStore } from "@/stores/chat-title";

vi.mock("@/stores/chat-title", () => ({
	useChatTitleStore: vi.fn((selector?: any) => {
		const state = {
			length: "standard" as const,
			setLength: vi.fn(),
			confirmDelete: true,
			setConfirmDelete: vi.fn(),
		};
		return selector ? selector(state) : state;
	}),
}));

vi.mock("@/components/ui/switch", () => ({
	Switch: ({ checked, onCheckedChange, id }: any) => (
		<input
			type="checkbox"
			id={id}
			checked={checked}
			onChange={(e) => onCheckedChange(e.target.checked)}
			data-testid="switch"
		/>
	),
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import { ChatSection } from "../settings-chat";

const mockUseChatTitleStore = vi.mocked(useChatTitleStore);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mockUseChatTitleStore.mockImplementation((selector?: any) => {
		const state = {
			length: "standard" as const,
			setLength: vi.fn(),
			confirmDelete: true,
			setConfirmDelete: vi.fn(),
		};
		return selector ? selector(state) : state;
	});
});

describe("ChatSection", () => {
	it("renders without crashing", () => {
		render(<ChatSection />);
		expect(document.body).toBeTruthy();
	});

	it("shows 'Chat Titles' heading", () => {
		render(<ChatSection />);
		expect(screen.getByText("Chat Titles")).toBeDefined();
	});

	it("shows 'Auto title length' label", () => {
		render(<ChatSection />);
		expect(screen.getByText("Auto title length")).toBeDefined();
	});

	it("shows current length label badge", () => {
		render(<ChatSection />);
		const elements = screen.getAllByText("Standard (4-6 words)");
		expect(elements.length).toBeGreaterThan(0);
	});

	it("shows all three label options", () => {
		render(<ChatSection />);
		expect(screen.getByText("Concise (2-4 words)")).toBeDefined();
		expect(screen.getAllByText("Standard (4-6 words)").length).toBeGreaterThan(0);
		expect(screen.getByText("Descriptive (7-10 words)")).toBeDefined();
	});

	it("shows 'Deletion' heading", () => {
		render(<ChatSection />);
		expect(screen.getByText("Deletion")).toBeDefined();
	});

	it("shows 'Delete confirmation' setting", () => {
		render(<ChatSection />);
		expect(screen.getByText("Delete confirmation")).toBeDefined();
	});

	it("renders the confirmation switch as checked when confirmDelete is true", () => {
		render(<ChatSection />);
		const switchEl = screen.getByTestId("switch") as HTMLInputElement;
		expect(switchEl.checked).toBe(true);
	});


	it("clicking a label button calls setLength", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		fireEvent.click(screen.getByText("Concise (2-4 words)"));
		expect(mockSetLength).toHaveBeenCalledWith("short");
	});

	it("clicking 'Descriptive' label button calls setLength with 'long'", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		fireEvent.click(screen.getByText("Descriptive (7-10 words)"));
		expect(mockSetLength).toHaveBeenCalledWith("long");
	});

	it("renders slider with aria attributes", () => {
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]');
		expect(slider).toBeTruthy();
		expect(slider?.getAttribute("aria-valuemin")).toBe("0");
		expect(slider?.getAttribute("aria-valuemax")).toBe("2");
		expect(slider?.getAttribute("aria-valuenow")).toBe("1");
	});

	it("handles ArrowLeft key on slider", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.keyDown(slider, { key: "ArrowLeft" });
		expect(mockSetLength).toHaveBeenCalledWith("short");
	});

	it("handles ArrowRight key on slider", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.keyDown(slider, { key: "ArrowRight" });
		expect(mockSetLength).toHaveBeenCalledWith("long");
	});

	it("handles Home key on slider", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.keyDown(slider, { key: "Home" });
		expect(mockSetLength).toHaveBeenCalledWith("short");
	});

	it("handles End key on slider", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.keyDown(slider, { key: "End" });
		expect(mockSetLength).toHaveBeenCalledWith("long");
	});

	it("renders with 'short' length selected", () => {
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "short" as const,
				setLength: vi.fn(),
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const elements = screen.getAllByText("Concise (2-4 words)");
		expect(elements.length).toBeGreaterThan(0);
	});

	it("renders switch unchecked when confirmDelete is false", () => {
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: vi.fn(),
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const switchEl = screen.getByTestId("switch") as HTMLInputElement;
		expect(switchEl.checked).toBe(false);
	});

	it("clicking the slider track calls setLength", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.click(slider, { clientX: 50 });
		expect(mockSetLength).toHaveBeenCalledWith("long");
	});

	it("pressing an unrecognized key on slider does nothing", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		fireEvent.keyDown(slider, { key: "Tab" });
		expect(mockSetLength).not.toHaveBeenCalled();
	});

	it("clicking inner slider overlay button calls setLength", () => {
		const mockSetLength = vi.fn();
		mockUseChatTitleStore.mockImplementation((selector?: any) => {
			const state = {
				length: "standard" as const,
				setLength: mockSetLength,
				confirmDelete: false,
				setConfirmDelete: vi.fn(),
			};
			return selector ? selector(state) : state;
		});
		render(<ChatSection />);
		const slider = document.querySelector('[role="slider"]')!;
		const overlayButtons = slider.querySelectorAll('button[type="button"]');
		expect(overlayButtons.length).toBe(3);
		fireEvent.click(overlayButtons[0]);
		expect(mockSetLength).toHaveBeenCalledWith("short");
	});
});
