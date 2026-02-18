// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("motion/react", () => ({
	motion: {
		div: ({
			whileTap: _whileTap,
			transition: _transition,
			children,
			...rest
		}: React.PropsWithChildren<Record<string, unknown>>) => (
			<div {...rest}>{children}</div>
		),
	},
}));

vi.mock("nanoid", () => ({
	nanoid: () => "test-id-123",
}));

import {
	PromptInput,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputTools,
	PromptInputSubmit,
	PromptInputAttachmentButton,
	PromptInputBody,
	PromptInputHeader,
	PromptInputProvider,
} from "../prompt-input";

function renderPromptInput(
	overrides: {
		onSubmit?: (msg: { text: string; files: unknown[] }) => void;
		status?: "ready" | "submitted" | "streaming" | "error";
		withAttachmentButton?: boolean;
		submitDisabled?: boolean;
	} = {},
) {
	const onSubmit = overrides.onSubmit ?? vi.fn();
	const status = overrides.status ?? "ready";

	return render(
		<PromptInput onSubmit={onSubmit} data-testid="prompt-form">
			<PromptInputTextarea data-testid="prompt-textarea" />
			<PromptInputFooter>
				<PromptInputTools>
					{overrides.withAttachmentButton && (
						<PromptInputAttachmentButton data-testid="attachment-btn" />
					)}
				</PromptInputTools>
				<PromptInputSubmit
					status={status}
					disabled={overrides.submitDisabled}
					data-testid="submit-btn"
				/>
			</PromptInputFooter>
		</PromptInput>,
	);
}

describe("PromptInput", () => {
	beforeEach(() => {
		if (typeof URL.createObjectURL === "undefined") {
			(URL as any).createObjectURL = vi.fn(() => "blob:test");
		}
		if (typeof URL.revokeObjectURL === "undefined") {
			(URL as any).revokeObjectURL = vi.fn();
		}
	});

	it("renders a form element", () => {
		renderPromptInput();
		const form = screen.getByTestId("prompt-form");
		expect(form).toBeTruthy();
		expect(form.tagName).toBe("FORM");
	});

	it("renders textarea with default placeholder", () => {
		renderPromptInput();
		const textarea = screen.getByPlaceholderText(
			"What would you like to know?",
		);
		expect(textarea).toBeTruthy();
		expect(textarea.tagName).toBe("TEXTAREA");
	});

	it("renders textarea with custom placeholder", () => {
		render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputTextarea placeholder="Ask me anything" />
			</PromptInput>,
		);
		expect(screen.getByPlaceholderText("Ask me anything")).toBeTruthy();
	});

	it("renders a submit button with aria-label", () => {
		renderPromptInput();
		const btn = screen.getByRole("button", { name: /submit/i });
		expect(btn).toBeTruthy();
		expect(btn.getAttribute("type")).toBe("submit");
	});

	it("disables submit button when disabled prop is set", () => {
		renderPromptInput({ submitDisabled: true });
		const btn = screen.getByRole("button", {
			name: /submit/i,
		}) as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("renders attachment button with accessible label", () => {
		renderPromptInput({ withAttachmentButton: true });
		const btn = screen.getByRole("button", { name: /add image/i });
		expect(btn).toBeTruthy();
	});

	it("renders a hidden file input for attachments", () => {
		renderPromptInput({ withAttachmentButton: true });
		const fileInput = document.querySelector(
			'input[type="file"][accept="image/*"]',
		);
		expect(fileInput).toBeTruthy();
	});

	it("renders PromptInputBody with children", () => {
		render(
			<PromptInputBody data-testid="body">
				<span>body child</span>
			</PromptInputBody>,
		);
		expect(screen.getByTestId("body")).toBeTruthy();
		expect(screen.getByText("body child")).toBeTruthy();
	});

	it("renders PromptInputHeader with children", () => {
		render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputHeader data-testid="header">
					<span>header content</span>
				</PromptInputHeader>
				<PromptInputTextarea />
			</PromptInput>,
		);
		expect(screen.getByTestId("header")).toBeTruthy();
		expect(screen.getByText("header content")).toBeTruthy();
	});

	it("renders PromptInputTools with children", () => {
		render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputTextarea />
				<PromptInputFooter>
					<PromptInputTools data-testid="tools">
						<button type="button">Tool 1</button>
						<button type="button">Tool 2</button>
					</PromptInputTools>
				</PromptInputFooter>
			</PromptInput>,
		);
		expect(screen.getByTestId("tools")).toBeTruthy();
		expect(screen.getByText("Tool 1")).toBeTruthy();
		expect(screen.getByText("Tool 2")).toBeTruthy();
	});

	it("calls onSubmit with text when form is submitted", async () => {
		const onSubmit = vi.fn();
		render(
			<PromptInput onSubmit={onSubmit} data-testid="prompt-form">
				<PromptInputTextarea />
				<PromptInputFooter>
					<PromptInputSubmit status="ready" />
				</PromptInputFooter>
			</PromptInput>,
		);

		const textarea = screen.getByPlaceholderText(
			"What would you like to know?",
		);
		fireEvent.change(textarea, { target: { value: "Hello AI" } });
		fireEvent.submit(screen.getByTestId("prompt-form"));

		await vi.waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});

		const [message] = onSubmit.mock.calls[0];
		expect(message.text).toBe("Hello AI");
		expect(message.files).toEqual([]);
	});

	it("PromptInputProvider provides initial input value to textarea", () => {
		render(
			<PromptInputProvider initialInput="pre-filled text">
				<PromptInput onSubmit={vi.fn()}>
					<PromptInputTextarea data-testid="textarea-prov" />
				</PromptInput>
			</PromptInputProvider>,
		);

		const textarea = screen.getByTestId("textarea-prov") as HTMLTextAreaElement;
		expect(textarea.value).toBe("pre-filled text");
	});
});
