// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInput, PromptInputTextarea, PromptInputTools } from "../prompt-input";
import * as ctx from "../prompt-input-context";

vi.mock("nanoid", () => ({
	nanoid: () => "test-id",
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroup: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div className={className} data-testid="input-group">
			{children}
		</div>
	),
	InputGroupTextarea: ({
		name,
		placeholder,
		value,
		onChange,
	}: {
		name?: string;
		placeholder?: string;
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
	}) => (
		<textarea
			data-testid="message-textarea"
			name={name}
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
	InputGroupAddon: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	InputGroupButton: ({
		children,
		type,
		...props
	}: {
		children?: React.ReactNode;
		type?: "button" | "submit" | "reset";
	}) => (
		<button type={type} {...props}>
			{children}
		</button>
	),
}));

vi.mock("../prompt-input-context", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../prompt-input-context")>();
	return {
		...actual,
		useOptionalPromptInputController: vi.fn(() => null),
		usePromptInputAttachments: vi.fn(() => ({
			files: [],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		})),
	};
});

const mockedCtx = vi.mocked(ctx);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	mockedCtx.useOptionalPromptInputController.mockReturnValue(null);
});

describe("PromptInput", () => {
	it("renders textarea with default placeholder and hidden file input", () => {
		render(
			<PromptInput accept="image/*" multiple onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		expect(screen.getByTestId("message-textarea").getAttribute("placeholder")).toBe(
			"What would you like to know?",
		);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(fileInput).toBeTruthy();
		expect(fileInput.className).toContain("hidden");
		expect(fileInput.getAttribute("accept")).toBe("image/*");
		expect(fileInput.multiple).toBe(true);
	});

	it("submits typed text from local textarea", async () => {
		const onSubmit = vi.fn();

		render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<button type="submit">Send</button>
			</PromptInput>,
		);

		fireEvent.change(screen.getByTestId("message-textarea"), {
			target: { value: "Hello world" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				{ files: [], text: "Hello world" },
				expect.anything(),
			);
		});
	});

	it("shows tool content when tools are provided", () => {
		render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputTools>
					<button type="button">Tool A</button>
				</PromptInputTools>
			</PromptInput>,
		);

		expect(screen.getByRole("button", { name: "Tool A" })).toBeTruthy();
	});

	it("adds selected file via hidden file input", () => {
		const mockFile = new File(["content"], "test.png", { type: "image/png" });
		const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");

		render(
			<PromptInput onSubmit={vi.fn()}>
				<button type="submit">Send</button>
			</PromptInput>,
		);

		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(fileInput, "files", {
			configurable: true,
			value: [mockFile],
		});
		fireEvent.change(fileInput);

		expect(createObjectURL).toHaveBeenCalledWith(mockFile);
	});

	it("uses provider-managed input on submit and clears provider state after success", async () => {
		const onSubmit = vi.fn();
		const clearAttachments = vi.fn();
		const clearText = vi.fn();

		mockedCtx.useOptionalPromptInputController.mockReturnValue({
			textInput: { clear: clearText, setInput: vi.fn(), value: "from-controller" },
			attachments: {
				add: vi.fn(),
				clear: clearAttachments,
				fileInputRef: { current: null },
				files: [],
				openFileDialog: vi.fn(),
				remove: vi.fn(),
			},
			__registerFileInput: vi.fn(),
		});

		render(
			<PromptInput onSubmit={onSubmit}>
				<button type="submit">Send</button>
			</PromptInput>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				{ files: [], text: "from-controller" },
				expect.anything(),
			);
		});

		expect(clearAttachments).toHaveBeenCalledTimes(1);
		expect(clearText).toHaveBeenCalledTimes(1);
	});
});
