// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidebarUser } from "../sidebar-user";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

const testUser = {
	id: "user-1",
	name: "Test User",
	email: "test@example.com",
	image: null as string | null,
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("SidebarUser", () => {
	it("renders null when user is null", () => {
		const { container } = render(
			<SidebarUser user={null} isMobile={false} setOpen={vi.fn()} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders null when user is undefined", () => {
		const { container } = render(
			<SidebarUser user={undefined} isMobile={false} setOpen={vi.fn()} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders an accessible settings button when user is provided", () => {
		render(<SidebarUser user={testUser} isMobile={false} setOpen={vi.fn()} />);
		expect(screen.getByRole("button", { name: "Open settings" })).toBeTruthy();
	});

	it("shows first letter of name when no image", () => {
		render(<SidebarUser user={testUser} isMobile={false} setOpen={vi.fn()} />);
		expect(screen.getByText("T")).toBeTruthy();
	});

	it("shows first letter of email when name is null", () => {
		const userNoName = { ...testUser, name: null };
		render(<SidebarUser user={userNoName} isMobile={false} setOpen={vi.fn()} />);
		expect(screen.getByText("T")).toBeTruthy();
	});

	it("shows 'U' fallback when both name and email are null", () => {
		const userNoNameEmail = { ...testUser, name: null, email: null };
		render(<SidebarUser user={userNoNameEmail} isMobile={false} setOpen={vi.fn()} />);
		expect(screen.getByText("U")).toBeTruthy();
	});

	it("navigates to /settings when button is clicked on desktop (isMobile=false)", () => {
		const mockSetOpen = vi.fn();
		render(<SidebarUser user={testUser} isMobile={false} setOpen={mockSetOpen} />);
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
		expect(mockSetOpen).not.toHaveBeenCalled();
	});

	it("calls setOpen(false) and navigates when clicked on mobile (lines 25-26)", () => {
		const mockSetOpen = vi.fn();
		render(<SidebarUser user={testUser} isMobile={true} setOpen={mockSetOpen} />);
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
		expect(mockSetOpen).toHaveBeenCalledWith(false);
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
	});

	it("renders user image when image is provided", () => {
		const userWithImage = { ...testUser, image: "https://example.com/avatar.jpg" };
		render(<SidebarUser user={userWithImage} isMobile={false} setOpen={vi.fn()} />);
		const img = document.querySelector("img");
		expect(img).toBeTruthy();
		expect(img?.src).toBe("https://example.com/avatar.jpg");
	});
});
