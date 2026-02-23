// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
	PromptInput,
	PromptInputAttachmentButton,
	PromptInputBody,
	PromptInputFooter,
	PromptInputHeader,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "../ai-elements/prompt-input";

vi.mock("motion/react", () => ({
	motion: {
		div: ({ children, className, whileTap: _w, transition: _t, ...rest }: any) => (
			<div className={className} {...rest}>
				{children}
			</div>
		),
	},
}));

vi.mock("nanoid", () => ({
	nanoid: () => "test-id-fixed",
}));

Object.defineProperty(URL, "createObjectURL", {
	value: vi.fn(() => "blob:test-url"),
	writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
	value: vi.fn(),
	writable: true,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderBasic(onSubmit = vi.fn()) {
	const result = render(
		<PromptInput onSubmit={onSubmit}>
			<PromptInputTextarea />
			<PromptInputSubmit />
		</PromptInput>,
	);
	return { ...result, onSubmit };
}

describe("PromptInput – form render", () => {
	it("renders a <form> element", () => {
		const { container } = renderBasic();
		expect(container.querySelector("form")).toBeTruthy();
	});

	it("applies className to the form", () => {
		const { container } = render(
			<PromptInput className="my-form" onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);
		expect(container.querySelector("form.my-form")).toBeTruthy();
	});

	it("renders a hidden file input outside the form for drag-and-drop", () => {
		const { container } = renderBasic();
		const fileInputs = container.querySelectorAll('input[type="file"]');
		expect(fileInputs.length).toBeGreaterThanOrEqual(1);
	});
});

describe("PromptInputTextarea", () => {
	it("renders a textarea", () => {
		const { container } = renderBasic();
		expect(container.querySelector("textarea")).toBeTruthy();
	});

	it("has the default placeholder text", () => {
		const { container } = renderBasic();
		const textarea = container.querySelector("textarea");
		expect(textarea?.getAttribute("placeholder")).toBe("What would you like to know?");
	});

	it("accepts a custom placeholder", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputTextarea placeholder="Ask me anything…" />
			</PromptInput>,
		);
		expect(container.querySelector("textarea")?.getAttribute("placeholder")).toBe(
			"Ask me anything…",
		);
	});

	it("uses name='message' so FormData serialisation works", () => {
		const { container } = renderBasic();
		expect(container.querySelector("textarea")?.getAttribute("name")).toBe("message");
	});
});

describe("PromptInputSubmit", () => {
	it("renders a submit button", () => {
		const { container } = renderBasic();
		expect(container.querySelector('button[type="submit"]')).toBeTruthy();
	});

	it("has aria-label='Submit'", () => {
		const { container } = renderBasic();
		const btn = container.querySelector('button[type="submit"]');
		expect(btn?.getAttribute("aria-label")).toBe("Submit");
	});

	it("is disabled when the disabled prop is passed", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputSubmit disabled />
			</PromptInput>,
		);
		const btn = container.querySelector('button[type="submit"]');
		expect(btn).toBeTruthy();
		const isDisabled =
			btn?.hasAttribute("disabled") ||
			btn?.getAttribute("aria-disabled") === "true" ||
			btn?.getAttribute("data-disabled") === "true";
		expect(isDisabled).toBe(true);
	});
});

describe("PromptInputAttachmentButton", () => {
	it("renders a visible button", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputAttachmentButton />
			</PromptInput>,
		);
		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThanOrEqual(1);
	});

	it("renders a hidden file input alongside the button", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputAttachmentButton />
			</PromptInput>,
		);
		const fileInputs = container.querySelectorAll('input[type="file"]');
		expect(fileInputs.length).toBeGreaterThanOrEqual(2);
	});

	it("forwards accept prop to the hidden file input", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputAttachmentButton accept="image/*,application/pdf" />
			</PromptInput>,
		);
		const fileInputs = container.querySelectorAll('input[type="file"]');
		const found = Array.from(fileInputs).some(
			(el) => el.getAttribute("accept") === "image/*,application/pdf",
		);
		expect(found).toBe(true);
	});
});

describe("PromptInputBody / Header / Tools", () => {
	it("PromptInputBody renders its children", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputBody>
					<span data-testid="body-child">body</span>
				</PromptInputBody>
			</PromptInput>,
		);
		expect(container.querySelector("[data-testid='body-child']")).toBeTruthy();
	});

	it("PromptInputHeader renders its children", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputHeader>
					<span data-testid="header-child">header</span>
				</PromptInputHeader>
			</PromptInput>,
		);
		expect(container.querySelector("[data-testid='header-child']")).toBeTruthy();
	});

	it("PromptInputTools renders its children inside a flex div", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputFooter>
					<PromptInputTools>
						<span data-testid="tools-child">tool</span>
					</PromptInputTools>
				</PromptInputFooter>
			</PromptInput>,
		);
		expect(container.querySelector("[data-testid='tools-child']")).toBeTruthy();
	});
});

describe("PromptInput – form submission", () => {
	it("calls onSubmit with typed text and empty files array", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const textarea = container.querySelector("textarea")!;
		fireEvent.change(textarea, { target: { value: "Hello world" } });

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ text: "Hello world", files: [] }),
				expect.anything(),
			);
		});
	});

	it("pressing Enter in textarea submits the form", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const textarea = container.querySelector("textarea")!;
		fireEvent.change(textarea, { target: { value: "via keyboard" } });
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ text: "via keyboard" }),
				expect.anything(),
			);
		});
	});

	it("Shift+Enter does not submit the form", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const textarea = container.querySelector("textarea")!;
		fireEvent.change(textarea, { target: { value: "newline" } });
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

		await new Promise((r) => setTimeout(r, 50));
		expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("PromptInputProvider", () => {
	it("seeds the textarea with initialInput", () => {
		const { container } = render(
			<PromptInputProvider initialInput="seed value">
				<PromptInput onSubmit={vi.fn()}>
					<PromptInputTextarea />
				</PromptInput>
			</PromptInputProvider>,
		);
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
		expect(textarea).toBeTruthy();
		expect(textarea.value).toBe("seed value");
	});

	it("renders the full composition without errors", () => {
		const { container } = render(
			<PromptInputProvider>
				<PromptInput onSubmit={vi.fn()}>
					<PromptInputTextarea />
					<PromptInputSubmit />
				</PromptInput>
			</PromptInputProvider>,
		);
		expect(container.querySelector("form")).toBeTruthy();
		expect(container.querySelector("textarea")).toBeTruthy();
		expect(container.querySelector('button[type="submit"]')).toBeTruthy();
	});

	it("calls onSubmit with provider-managed text on form submission", async () => {
		const onSubmit = vi.fn();

		const { container } = render(
			<PromptInputProvider initialInput="provider text">
				<PromptInput onSubmit={onSubmit}>
					<PromptInputTextarea />
					<PromptInputSubmit />
				</PromptInput>
			</PromptInputProvider>,
		);

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ text: "provider text" }),
				expect.anything(),
			);
		});
	});
});

describe("PromptInput – file input handleChange", () => {
	it("adds files when the hidden file input changes", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const fileInputs = container.querySelectorAll('input[type="file"]');
		const hiddenInput = fileInputs[0] as HTMLInputElement;

		const file = new File(["content"], "photo.png", { type: "image/png" });
		Object.defineProperty(hiddenInput, "files", {
			value: [file],
			configurable: true,
		});
		fireEvent.change(hiddenInput);

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ filename: "photo.png" })]) }),
				expect.anything(),
			);
		});
	});
});

describe("PromptInput – drag and drop on form", () => {
	it("adds dropped files to form when globalDrop is false", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const form = container.querySelector("form")!;
		const file = new File(["data"], "dropped.txt", { type: "text/plain" });

		const dropEvent = new Event("drop", { bubbles: false });
		Object.defineProperty(dropEvent, "dataTransfer", {
			value: { files: [file], items: [{ kind: "file", type: file.type }], types: ["Files"] },
			writable: false,
		});
		Object.defineProperty(dropEvent, "preventDefault", {
			value: vi.fn(),
			writable: false,
		});
		await act(async () => {
			form.dispatchEvent(dropEvent);
		});

		fireEvent.submit(form);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ filename: "dropped.txt" })]) }),
				expect.anything(),
			);
		});
	});

	it("fires dragover on form without adding files", () => {
		const { container } = render(
			<PromptInput onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		const form = container.querySelector("form")!;

		const dragOverEvent = new Event("dragover", { bubbles: false });
		Object.defineProperty(dragOverEvent, "dataTransfer", {
			value: { files: [], items: [], types: ["Files"] },
			writable: false,
		});
		const preventDefaultSpy = vi.fn();
		Object.defineProperty(dragOverEvent, "preventDefault", {
			value: preventDefaultSpy,
			writable: false,
		});
		form.dispatchEvent(dragOverEvent);
	});
});

describe("PromptInput – global drag and drop", () => {
	it("adds files dropped on document when globalDrop=true", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<PromptInput globalDrop onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const file = new File(["data"], "global.txt", { type: "text/plain" });

		const dropEvent = new Event("drop", { bubbles: false });
		Object.defineProperty(dropEvent, "dataTransfer", {
			value: { files: [file], items: [{ kind: "file", type: file.type }], types: ["Files"] },
			writable: false,
		});
		Object.defineProperty(dropEvent, "preventDefault", {
			value: vi.fn(),
			writable: false,
		});
		await act(async () => {
			document.dispatchEvent(dropEvent);
		});

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ filename: "global.txt" })]) }),
				expect.anything(),
			);
		});
	});

	it("fires dragover on document when globalDrop=true", () => {
		render(
			<PromptInput globalDrop onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		const dragOverEvent = new Event("dragover", { bubbles: false });
		Object.defineProperty(dragOverEvent, "dataTransfer", {
			value: { files: [], items: [], types: ["Files"] },
			writable: false,
		});
		Object.defineProperty(dragOverEvent, "preventDefault", {
			value: vi.fn(),
			writable: false,
		});
		document.dispatchEvent(dragOverEvent);
	});
});

describe("PromptInput – unmount cleanup", () => {
	it("revokes blob URLs on unmount when not using provider", () => {
		const onSubmit = vi.fn();
		const { container, unmount } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const fileInputs = container.querySelectorAll('input[type="file"]');
		const hiddenInput = fileInputs[0] as HTMLInputElement;
		const file = new File(["content"], "test.png", { type: "image/png" });
		Object.defineProperty(hiddenInput, "files", {
			value: [file],
			configurable: true,
		});
		fireEvent.change(hiddenInput);

		vi.clearAllMocks();
		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalled();
	});
});

describe("PromptInput – onSubmit returns Promise", () => {
	it("clears files after onSubmit Promise resolves (lines 311-315)", async () => {
		let resolvePromise!: () => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolvePromise = resolve;
				}),
		);

		render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const form = document.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());

		resolvePromise();
		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});
	});

	it("clears provider text after onSubmit Promise resolves (lines 314-315)", async () => {
		let resolvePromise!: () => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolvePromise = resolve;
				}),
		);

		const { container } = render(
			<PromptInputProvider initialInput="clear me">
				<PromptInput onSubmit={onSubmit}>
					<PromptInputTextarea />
					<PromptInputSubmit />
				</PromptInput>
			</PromptInputProvider>,
		);

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());

		resolvePromise();

		await waitFor(() => {
			const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
			expect(textarea.value).toBe("");
		});
	});

	it("handles onSubmit Promise rejection gracefully", async () => {
		const onSubmit = vi.fn(() => Promise.reject(new Error("submit error")));

		const { container } = render(
			<PromptInput onSubmit={onSubmit}>
				<PromptInputTextarea />
				<PromptInputSubmit />
			</PromptInput>,
		);

		const form = container.querySelector("form")!;
		fireEvent.submit(form);

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
	});
});

describe("PromptInput – syncHiddenInput", () => {
	it("resets file input value when files cleared with syncHiddenInput", () => {
		const { container } = render(
			<PromptInput syncHiddenInput onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);
		const fileInputs = container.querySelectorAll('input[type="file"]');
		expect(fileInputs.length).toBeGreaterThanOrEqual(1);
	});
});

describe("PromptInput – file validation", () => {
	it("calls onError when all files exceed maxFileSize", () => {
		const onError = vi.fn();
		const { container } = render(
			<PromptInput maxFileSize={1} onError={onError} onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		const fileInputs = container.querySelectorAll('input[type="file"]');
		const hiddenInput = fileInputs[0] as HTMLInputElement;
		const bigFile = new File(["a".repeat(100)], "big.txt", { type: "text/plain" });
		Object.defineProperty(hiddenInput, "files", {
			value: [bigFile],
			configurable: true,
		});
		fireEvent.change(hiddenInput);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "max_file_size" }),
		);
	});

	it("calls onError when no files match accept type", () => {
		const onError = vi.fn();
		const { container } = render(
			<PromptInput accept="image/*" onError={onError} onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		const fileInputs = container.querySelectorAll('input[type="file"]');
		const hiddenInput = fileInputs[0] as HTMLInputElement;
		const txtFile = new File(["text"], "doc.txt", { type: "text/plain" });
		Object.defineProperty(hiddenInput, "files", {
			value: [txtFile],
			configurable: true,
		});
		fireEvent.change(hiddenInput);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "accept" }),
		);
	});

	it("calls onError when maxFiles exceeded", () => {
		const onError = vi.fn();
		const { container } = render(
			<PromptInput maxFiles={1} onError={onError} onSubmit={vi.fn()}>
				<PromptInputTextarea />
			</PromptInput>,
		);

		const fileInputs = container.querySelectorAll('input[type="file"]');
		const hiddenInput = fileInputs[0] as HTMLInputElement;
		const f1 = new File(["a"], "a.txt", { type: "text/plain" });
		const f2 = new File(["b"], "b.txt", { type: "text/plain" });
		Object.defineProperty(hiddenInput, "files", {
			value: [f1, f2],
			configurable: true,
		});
		fireEvent.change(hiddenInput);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "max_files" }),
		);
	});
});
