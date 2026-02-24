// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode, ChangeEvent, KeyboardEvent, ClipboardEvent } from "react";
import {
	PromptInputBody,
	PromptInputButton,
	PromptInputFooter,
	PromptInputHeader,
	PromptInputTextarea,
	PromptInputTools,
} from "../prompt-input-primitives";
import * as ctx from "../prompt-input-context";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroupTextarea: ({
		onCompositionEnd,
		onCompositionStart,
		onKeyDown,
		onPaste,
		onChange,
		value,
		placeholder,
		name,
		className,
	}: {
		onCompositionEnd?: () => void;
		onCompositionStart?: () => void;
		onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
		onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
		onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
		value?: string;
		placeholder?: string;
		name?: string;
		className?: string;
	}) => (
		<textarea
			data-testid="textarea"
			onCompositionEnd={onCompositionEnd}
			onCompositionStart={onCompositionStart}
			onKeyDown={onKeyDown}
			onPaste={onPaste}
			onChange={onChange}
			value={value}
			placeholder={placeholder}
			name={name}
			className={className}
		/>
	),
	InputGroupAddon: ({
		children,
		className,
	}: {
		children?: ReactNode;
		className?: string;
		align?: string;
	}) => (
		<div data-testid="input-group-addon" className={className}>
			{children}
		</div>
	),
	InputGroupButton: ({
		children,
		className,
		size,
		type,
		...rest
	}: {
		children?: ReactNode;
		className?: string;
		size?: string;
		type?: string;
		variant?: string;
	}) => (
		<button
			data-testid="input-group-button"
			data-size={size}
			className={className}
			type={type as "button" | "submit" | "reset" | undefined}
			{...rest}
		>
			{children}
		</button>
	),
}));

vi.mock("../prompt-input-context", () => ({
	useOptionalPromptInputController: vi.fn(() => null),
	usePromptInputAttachments: vi.fn(() => ({
		files: [],
		add: vi.fn(),
		remove: vi.fn(),
		clear: vi.fn(),
		openFileDialog: vi.fn(),
		fileInputRef: { current: null },
	})),
}));

const mockedCtx = vi.mocked(ctx);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mockedCtx.useOptionalPromptInputController.mockReturnValue(null);
	mockedCtx.usePromptInputAttachments.mockReturnValue({
		files: [],
		add: vi.fn(),
		remove: vi.fn(),
		clear: vi.fn(),
		openFileDialog: vi.fn(),
		fileInputRef: { current: null },
	});
});

describe("PromptInputBody", () => {
	it("renders children", () => {
		render(
			<PromptInputBody>
				<span data-testid="child">hello</span>
			</PromptInputBody>,
		);
		expect(screen.getByTestId("child")).toBeTruthy();
	});

	it("applies className", () => {
		const { container } = render(<PromptInputBody className="my-body">body</PromptInputBody>);
		expect(container.firstChild).toBeTruthy();
	});
});

describe("PromptInputTextarea", () => {
	it("renders a textarea with default placeholder", () => {
		render(<PromptInputTextarea />);
		expect(screen.getByTestId("textarea").getAttribute("placeholder")).toBe(
			"What would you like to know?",
		);
	});

	it("renders with custom placeholder", () => {
		render(<PromptInputTextarea placeholder="Ask anything" />);
		expect(screen.getByTestId("textarea").getAttribute("placeholder")).toBe("Ask anything");
	});

	it("has name=message", () => {
		render(<PromptInputTextarea />);
		expect(screen.getByTestId("textarea").getAttribute("name")).toBe("message");
	});

	it("fires onCompositionStart setting isComposing to true", () => {
		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea");
		fireEvent.compositionStart(textarea);
	});

	it("fires onCompositionEnd resetting isComposing to false", () => {
		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea");
		fireEvent.compositionStart(textarea);
		fireEvent.compositionEnd(textarea);
	});

	it("Enter during composition does not trigger submit", () => {
		const submitHandler = vi.fn();
		render(
			<form onSubmit={submitHandler}>
				<PromptInputTextarea />
				<button type="submit">Submit</button>
			</form>,
		);
		const textarea = screen.getByTestId("textarea");
		fireEvent.compositionStart(textarea);
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it("Shift+Enter does not trigger submit", () => {
		const submitHandler = vi.fn();
		render(
			<form onSubmit={submitHandler}>
				<PromptInputTextarea />
				<button type="submit">Submit</button>
			</form>,
		);
		const textarea = screen.getByTestId("textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it("Backspace on empty value removes last attachment", () => {
		const removeMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [
				{
					id: "attach-1",
					type: "file",
					url: "blob:x",
					mediaType: "image/png",
					filename: "f.png",
				},
			],
			add: vi.fn(),
			remove: removeMock,
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea") as HTMLTextAreaElement;
		Object.defineProperty(textarea, "value", { get: () => "", configurable: true });
		fireEvent.keyDown(textarea, { key: "Backspace" });
		expect(removeMock).toHaveBeenCalledWith("attach-1");
	});

	it("pastes non-image files does not call add", () => {
		const addMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [],
			add: addMock,
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea");
		fireEvent.paste(textarea, { clipboardData: { files: [], items: [] } });
		expect(addMock).not.toHaveBeenCalled();
	});

	it("uses controlled value from controller when present", () => {
		const setInputMock = vi.fn();
		mockedCtx.useOptionalPromptInputController.mockReturnValue({
			textInput: { value: "hello", setInput: setInputMock, clear: vi.fn() },
			attachments: {
				files: [],
				add: vi.fn(),
				remove: vi.fn(),
				clear: vi.fn(),
				openFileDialog: vi.fn(),
				fileInputRef: { current: null },
			},
			__registerFileInput: vi.fn(),
		});

		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea") as HTMLTextAreaElement;
		expect(textarea.value).toBe("hello");
	});

	it("onChange calls controller.textInput.setInput when controller present", () => {
		const setInputMock = vi.fn();
		mockedCtx.useOptionalPromptInputController.mockReturnValue({
			textInput: { value: "", setInput: setInputMock, clear: vi.fn() },
			attachments: {
				files: [],
				add: vi.fn(),
				remove: vi.fn(),
				clear: vi.fn(),
				openFileDialog: vi.fn(),
				fileInputRef: { current: null },
			},
			__registerFileInput: vi.fn(),
		});

		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea");
		fireEvent.change(textarea, { target: { value: "typed" } });
		expect(setInputMock).toHaveBeenCalledWith("typed");
	});

	it("Enter key returns early when submit button is disabled (line 51)", () => {
		const submitHandler = vi.fn();
		render(
			<form onSubmit={submitHandler}>
				<PromptInputTextarea />
				<button type="submit" disabled>Submit</button>
			</form>,
		);
		const textarea = screen.getByTestId("textarea");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it("paste with file item calls attachments.add with the file (lines 72-75, 81-82)", () => {
		const addMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [],
			add: addMock,
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});
		render(<PromptInputTextarea />);
		const textarea = screen.getByTestId("textarea");
		const mockFile = new File(["content"], "test.png", { type: "image/png" });
		const mockItem = { kind: "file", getAsFile: () => mockFile };
		fireEvent.paste(textarea, {
			cliboardData: {},
			clipboardData: { items: [mockItem], files: [] },
		});
		expect(addMock).toHaveBeenCalledWith([mockFile]);
	});
});

describe("PromptInputHeader", () => {
	it("renders children", () => {
		render(
			<PromptInputHeader>
				<span data-testid="h">header</span>
			</PromptInputHeader>,
		);
		expect(screen.getByTestId("h")).toBeTruthy();
	});

	it("merges className onto addon", () => {
		render(<PromptInputHeader className="hdr-cls">content</PromptInputHeader>);
		expect(screen.getByTestId("input-group-addon").className).toContain("hdr-cls");
	});
});

describe("PromptInputFooter", () => {
	it("renders children", () => {
		render(
			<PromptInputFooter>
				<span data-testid="f">footer</span>
			</PromptInputFooter>,
		);
		expect(screen.getByTestId("f")).toBeTruthy();
	});

	it("merges className onto addon", () => {
		render(<PromptInputFooter className="ftr-cls">content</PromptInputFooter>);
		expect(screen.getByTestId("input-group-addon").className).toContain("ftr-cls");
	});
});

describe("PromptInputTools", () => {
	it("renders children", () => {
		render(
			<PromptInputTools>
				<span data-testid="t">tool</span>
			</PromptInputTools>,
		);
		expect(screen.getByTestId("t")).toBeTruthy();
	});

	it("merges className", () => {
		const { container } = render(
			<PromptInputTools className="tool-cls">t</PromptInputTools>,
		);
		expect(container.querySelector(".tool-cls")).toBeTruthy();
	});
});

describe("PromptInputButton", () => {
	it("renders with icon-sm size when no children", () => {
		render(<PromptInputButton />);
		expect(screen.getByTestId("input-group-button").getAttribute("data-size")).toBe("icon-sm");
	});

	it("uses sm size when multiple children", () => {
		render(
			<PromptInputButton>
				<span>A</span>
				<span>B</span>
			</PromptInputButton>,
		);
		expect(screen.getByTestId("input-group-button").getAttribute("data-size")).toBe("sm");
	});

	it("respects explicit size prop over auto-detection", () => {
		render(<PromptInputButton size="xs">click</PromptInputButton>);
		expect(screen.getByTestId("input-group-button").getAttribute("data-size")).toBe("xs");
	});

	it("single child also gets icon-sm", () => {
		render(
			<PromptInputButton>
				<span>one</span>
			</PromptInputButton>,
		);
		expect(screen.getByTestId("input-group-button").getAttribute("data-size")).toBe("icon-sm");
	});

	it("renders children", () => {
		render(<PromptInputButton>Label</PromptInputButton>);
		expect(screen.getByText("Label")).toBeTruthy();
	});

	it("merges className", () => {
		render(<PromptInputButton className="btn-cls">x</PromptInputButton>);
		expect(screen.getByTestId("input-group-button").className).toContain("btn-cls");
	});
});
