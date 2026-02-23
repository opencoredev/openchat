// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	Loader2Icon: ({ className }: { className?: string }) => (
		<svg data-testid="loader-icon" className={className} />
	),
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		className,
	}: {
		children?: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		className?: string;
		[key: string]: unknown;
	}) => (
		<button
			data-testid="retry-button"
			onClick={onClick}
			disabled={disabled}
			className={className}
		>
			{children}
		</button>
	),
}));

import { InlineErrorMessage } from "../inline-error-message";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
});

const baseError = {
	code: "model_error",
	message: "Something went wrong.",
};

describe("InlineErrorMessage", () => {
	it("renders without crashing", () => {
		render(<InlineErrorMessage error={baseError} />);
		expect(document.body).toBeTruthy();
	});

	it("displays the error message", () => {
		render(<InlineErrorMessage error={baseError} />);
		expect(screen.getByText("Something went wrong.")).toBeTruthy();
	});

	it("shows correct title for rate_limit code", () => {
		render(<InlineErrorMessage error={{ code: "rate_limit", message: "Slow down." }} />);
		expect(screen.getByText("Rate Limit Exceeded")).toBeTruthy();
	});

	it("shows correct title for auth_error code", () => {
		render(<InlineErrorMessage error={{ code: "auth_error", message: "Auth failed." }} />);
		expect(screen.getByText("Authentication Error")).toBeTruthy();
	});

	it("shows correct title for context_length code", () => {
		render(<InlineErrorMessage error={{ code: "context_length", message: "Too long." }} />);
		expect(screen.getByText("Context Too Long")).toBeTruthy();
	});

	it("shows correct title for content_filter code", () => {
		render(<InlineErrorMessage error={{ code: "content_filter", message: "Filtered." }} />);
		expect(screen.getByText("Content Filtered")).toBeTruthy();
	});

	it("shows correct title for network_error code", () => {
		render(<InlineErrorMessage error={{ code: "network_error", message: "No connection." }} />);
		expect(screen.getByText("Network Error")).toBeTruthy();
	});

	it("shows generic Error title for unknown code", () => {
		render(<InlineErrorMessage error={{ code: "unknown_xyz", message: "Unknown." }} />);
		expect(screen.getByText("Error")).toBeTruthy();
	});

	it("shows provider when provided", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, provider: "openai" }}
			/>,
		);
		expect(screen.getByText("Provider: openai")).toBeTruthy();
	});

	it("does not show provider when absent", () => {
		render(<InlineErrorMessage error={baseError} />);
		expect(screen.queryByText(/Provider:/)).toBeNull();
	});

	it("does not show retry button when retryable is false", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, retryable: false }}
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("retry-button")).toBeNull();
	});

	it("does not show retry button when onRetry is missing", () => {
		render(
			<InlineErrorMessage error={{ ...baseError, retryable: true }} />,
		);
		expect(screen.queryByTestId("retry-button")).toBeNull();
	});

	it("shows retry button when retryable and onRetry are provided", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, retryable: true }}
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("retry-button")).toBeTruthy();
	});

	it("shows retries remaining in the retry button label", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, retryable: true }}
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.getByText("Retry (3 left)")).toBeTruthy();
	});

	it("shows details toggle button when details are present", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, details: "Stack trace here" }}
			/>,
		);
		expect(screen.getByText("Show details")).toBeTruthy();
	});

	it("does not show details toggle when details are absent", () => {
		render(<InlineErrorMessage error={baseError} />);
		expect(screen.queryByText("Show details")).toBeNull();
	});

	it("reveals details content after clicking show details", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, details: "Stack trace here" }}
			/>,
		);
		const toggle = screen.getByText("Show details");
		fireEvent.click(toggle);
		expect(screen.getByText("Stack trace here")).toBeTruthy();
		expect(screen.getByText("Hide details")).toBeTruthy();
	});

	it("hides details again after clicking hide details", () => {
		render(
			<InlineErrorMessage
				error={{ ...baseError, details: "Some details" }}
			/>,
		);
		fireEvent.click(screen.getByText("Show details"));
		expect(screen.getByText("Hide details")).toBeTruthy();
		fireEvent.click(screen.getByText("Hide details"));
		expect(screen.getByText("Show details")).toBeTruthy();
		expect(screen.queryByText("Some details")).toBeNull();
	});
	it("calls onRetry after backoff delay", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		fireEvent.click(screen.getByTestId("retry-button"));
		await act(async () => {
			await vi.runAllTimersAsync();
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("shows Retrying... while backoff delay is pending", () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		act(() => {
			fireEvent.click(screen.getByTestId("retry-button"));
		});
		expect(screen.getByText("Retrying...")).toBeTruthy();
	});

	it("disables retry button while retrying", () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		act(() => {
			fireEvent.click(screen.getByTestId("retry-button"));
		});
		expect((screen.getByTestId("retry-button") as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows loader icon while retrying", () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		act(() => {
			fireEvent.click(screen.getByTestId("retry-button"));
		});
		expect(screen.getByTestId("loader-icon")).toBeTruthy();
	});

	it("clears Retrying... state and decrements retriesRemaining after retry completes", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		fireEvent.click(screen.getByTestId("retry-button"));
		await act(async () => {
			await vi.runAllTimersAsync();
		});
		expect(screen.queryByText("Retrying...")).toBeNull();
		expect(screen.getByText("Retry (2 left)")).toBeTruthy();
	});

	it("does not call onRetry twice when clicked again during retry", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		render(<InlineErrorMessage error={{ ...baseError, retryable: true }} onRetry={onRetry} />);
		fireEvent.click(screen.getByTestId("retry-button"));

		fireEvent.click(screen.getByTestId("retry-button"));
		await act(async () => {
			await vi.runAllTimersAsync();
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
