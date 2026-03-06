// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("convex/react", () => ({
	useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		users: {
			getByExternalId: "users:getByExternalId",
			updateName: "users:updateName",
		},
	},
}));

vi.mock("lucide-react", () => ({
	CheckIcon: () => <span data-testid="check-icon" />,
	Loader2Icon: ({ className }: any) => <span data-testid="loader-icon" className={className} />,
	PencilIcon: () => <span data-testid="pencil-icon" />,
	XIcon: () => <span data-testid="x-icon" />,
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		updateUser: vi.fn().mockResolvedValue({}),
		signOut: vi.fn().mockResolvedValue({}),
	},
}));

let mockConvexUser: { _id: string; name?: string } | null = null;

vi.mock("@/lib/convex-user", () => ({
	useConvexUser: () => ({ convexUser: mockConvexUser }),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, variant, size, className }: any) => (
		<button onClick={onClick} disabled={disabled} className={className}>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/separator", () => ({
	Separator: () => <hr />,
}));

vi.mock("@/components/ui/input", () => ({
	Input: ({ value, onChange, placeholder, className, autoFocus, onKeyDown }: any) => (
		<input
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			className={className}
			autoFocus={autoFocus}
			onKeyDown={onKeyDown}
			data-testid="name-input"
		/>
	),
}));

vi.mock("@/components/delete-account-modal", () => ({
	DeleteAccountModal: ({ open }: any) =>
		open ? <div data-testid="delete-modal">DeleteModal</div> : null,
}));

import { AccountSection } from "../settings-account";
import { authClient } from "@/lib/auth-client";

const defaultUser = {
	id: "user-123",
	name: "Test User",
	email: "test@example.com",
};

const mockRefetchSession = vi.fn().mockResolvedValue(undefined);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mockConvexUser = null;
});

describe("AccountSection", () => {
	it("renders without crashing", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(document.body).toBeTruthy();
	});

	it("shows 'Profile' heading", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Profile")).toBeDefined();
	});

	it("shows 'Authentication' heading", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Authentication")).toBeDefined();
	});

	it("shows 'Danger Zone' heading", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Danger Zone")).toBeDefined();
	});

	it("shows Name label", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Name")).toBeDefined();
	});

	it("shows Email label", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Email")).toBeDefined();
	});

	it("shows user email", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("test@example.com")).toBeDefined();
	});

	it("shows 'Not set' when email is missing", () => {
		const user = { id: "u1", name: "User", email: null };
		render(<AccountSection user={user} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Not set")).toBeDefined();
	});

	it("shows GitHub authentication section", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("GitHub")).toBeDefined();
		expect(screen.getByText("Connected via OAuth")).toBeDefined();
		expect(screen.getByText("Connected")).toBeDefined();
	});

	it("shows Delete Account button", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Delete")).toBeDefined();
	});

	it("Delete Account button is disabled when no convexUser", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		const deleteBtn = screen.getByText("Delete");
		expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows Edit button when not editing", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Edit")).toBeDefined();
	});

	it("Edit button is disabled when no convexUser", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		const editBtn = screen.getByText("Edit");
		expect((editBtn as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows convex user name when convexUser is loaded", () => {
		mockConvexUser = { _id: "conv-user-1", name: "Convex User Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Convex User Name")).toBeDefined();
	});

	it("falls back to user.name when convexUser is null", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Test User")).toBeDefined();
	});

	it("clicking Edit when convexUser exists shows input", () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		fireEvent.click(screen.getByText("Edit"));
		expect(screen.getByTestId("name-input")).toBeDefined();
	});

	it("clicking cancel button during editing reverts to view mode", () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		fireEvent.click(screen.getByText("Edit"));
		expect(screen.getByTestId("name-input")).toBeDefined();
		fireEvent.click(screen.getByTestId("x-icon").closest("button")!);
		expect(screen.queryByTestId("name-input")).toBeNull();
	});

	it("pressing Escape in input cancels editing", () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		fireEvent.click(screen.getByText("Edit"));
		const input = screen.getByTestId("name-input");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByTestId("name-input")).toBeNull();
	});

	it("opens delete modal when Delete button is clicked and convexUser exists", () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.queryByTestId("delete-modal")).toBeNull();
		fireEvent.click(screen.getByText("Delete"));
		expect(screen.getByTestId("delete-modal")).toBeDefined();
	});

	it("shows 'Delete Account' label", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText("Delete Account")).toBeDefined();
	});

	it("shows 'Permanently delete your account...' description", () => {
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);
		expect(screen.getByText(/Permanently delete your account/)).toBeDefined();
	});

	it("clicking Save after editing calls handleSaveName and exits edit mode", async () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);

		fireEvent.click(screen.getByText("Edit"));
		expect(screen.getByTestId("name-input")).toBeDefined();

		fireEvent.click(screen.getByTestId("check-icon").closest("button")!);

		await waitFor(() => {
			expect(screen.queryByTestId("name-input")).toBeNull();
		});

		expect(mockRefetchSession).toHaveBeenCalled();
		expect(vi.mocked(authClient.updateUser)).toHaveBeenCalledWith({ name: "My Name" });
	});

	it("pressing Enter in name input triggers handleSaveName", async () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);

		fireEvent.click(screen.getByText("Edit"));
		const input = screen.getByTestId("name-input");

		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => {
			expect(screen.queryByTestId("name-input")).toBeNull();
		});

		expect(mockRefetchSession).toHaveBeenCalled();
	});

	it("clicking Cancel resets name value and exits edit mode", () => {
		mockConvexUser = { _id: "conv-user-1", name: "Original Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);

		fireEvent.click(screen.getByText("Edit"));
		const input = screen.getByTestId("name-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Changed Name" } });
		expect(input.value).toBe("Changed Name");

		fireEvent.click(screen.getByTestId("x-icon").closest("button")!);
		expect(screen.queryByTestId("name-input")).toBeNull();

		fireEvent.click(screen.getByText("Edit"));
		const newInput = screen.getByTestId("name-input") as HTMLInputElement;
		expect(newInput.value).toBe("Original Name");
	});

	it("handleSaveName with whitespace-only name does nothing (early return)", () => {
		mockConvexUser = { _id: "conv-user-1", name: "My Name" };
		render(<AccountSection user={defaultUser} refetchSession={mockRefetchSession} />);

		fireEvent.click(screen.getByText("Edit"));
		const input = screen.getByTestId("name-input");
		fireEvent.change(input, { target: { value: "   " } });

		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByTestId("name-input")).toBeDefined();
		expect(vi.mocked(authClient.updateUser)).not.toHaveBeenCalled();
		expect(mockRefetchSession).not.toHaveBeenCalled();
	});
});
