// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	PaperclipIcon: () => <svg data-testid="paperclip-icon" />,
}));

vi.mock("@/components/ai-elements/prompt-input", () => ({
	PromptInput: ({
		children,
		className,
	}: {
		children?: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="prompt-input" className={className}>
			{children}
		</div>
	),
	PromptInputAttachment: () => <div data-testid="prompt-input-attachment" />,
	PromptInputAttachments: ({
		children,
	}: {
		children?: ((attachment: unknown) => React.ReactNode) | React.ReactNode;
	}) => {
		const content = typeof children === "function" ? children({}) : null;
		return <div data-testid="prompt-input-attachments">{content}</div>;
	},
	PromptInputFooter: ({
		children,
		className,
	}: {
		children?: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="prompt-footer" className={className}>
			{children}
		</div>
	),
	PromptInputTextarea: ({
		placeholder,
		disabled,
		className,
	}: {
		placeholder?: string;
		disabled?: boolean;
		className?: string;
		[key: string]: unknown;
	}) => (
		<textarea
			data-testid="prompt-textarea"
			placeholder={placeholder}
			disabled={disabled}
			className={className}
		/>
	),
	PromptInputTools: ({
		children,
		className,
	}: {
		children?: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="prompt-tools" className={className}>
			{children}
		</div>
	),
	usePromptInputController: vi.fn(() => ({
		textInput: { value: "", setInput: vi.fn() },
		attachments: { add: vi.fn() },
	})),
}));

vi.mock("@/components/model-selector", () => ({
	ConnectedModelSelector: ({ disabled }: { disabled?: boolean }) => (
		<div data-testid="model-selector" data-disabled={disabled} />
	),
}));

vi.mock("../prompt-toolbar", () => ({
	PillButton: ({
		label,
		disabled,
		onClick,
	}: {
		icon?: React.ReactNode;
		label: string;
		onClick?: () => void;
		disabled?: boolean;
		active?: boolean;
		className?: string;
		hideLabel?: boolean;
	}) => (
		<button data-testid={`pill-${label.toLowerCase()}`} onClick={onClick} disabled={disabled}>
			{label}
		</button>
	),
	ReasoningToggleButton: ({ disabled }: { disabled?: boolean }) => (
		<button data-testid="reasoning-toggle" disabled={disabled}>
			Reasoning
		</button>
	),
	WebSearchToggleButton: ({ disabled }: { disabled?: boolean }) => (
		<button data-testid="web-search-toggle" disabled={disabled}>
			Web Search
		</button>
	),
	SendButton: ({
		isLoading,
		hasContent,
		onStop,
	}: {
		isLoading: boolean;
		hasContent: boolean;
		onStop: () => void;
	}) => (
		<button
			data-testid="send-button"
			data-loading={isLoading}
			data-has-content={hasContent}
			onClick={isLoading ? onStop : undefined}
		>
			{isLoading ? "Stop" : "Send"}
		</button>
	),
}));

import { PremiumPromptInputInner } from "../premium-prompt-input";
import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import React from "react";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function makeTextareaRef() {
	return { current: null } as React.RefObject<HTMLTextAreaElement | null>;
}

function makeDefaultProps() {
	return {
		onSubmit: vi.fn().mockResolvedValue(undefined),
		isLoading: false,
		onStop: vi.fn(),
		textareaRef: makeTextareaRef(),
		focusShortcut: "Ctrl+/",
	};
}

describe("PremiumPromptInputInner", () => {
	it("renders without crashing", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(document.body).toBeTruthy();
	});

	it("renders the prompt input container", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("prompt-input")).toBeTruthy();
	});

	it("renders the textarea with correct placeholder", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const textarea = screen.getByTestId("prompt-textarea");
		expect(textarea.getAttribute("placeholder")).toBe("Message... (Ctrl+/ to focus)");
	});

	it("disables textarea when isLoading is true", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} isLoading />);
		const textarea = screen.getByTestId("prompt-textarea") as HTMLTextAreaElement;
		expect(textarea.disabled).toBe(true);
	});

	it("enables textarea when isLoading is false", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} isLoading={false} />);
		const textarea = screen.getByTestId("prompt-textarea") as HTMLTextAreaElement;
		expect(textarea.disabled).toBe(false);
	});

	it("renders the model selector", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("model-selector")).toBeTruthy();
	});

	it("passes isLoading to model selector as disabled", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} isLoading />);
		expect(screen.getByTestId("model-selector").getAttribute("data-disabled")).toBe("true");
	});

	it("renders the reasoning toggle", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("reasoning-toggle")).toBeTruthy();
	});

	it("renders the web search toggle", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("web-search-toggle")).toBeTruthy();
	});

	it("renders the send button", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("send-button")).toBeTruthy();
	});

	it("passes isLoading=false to send button", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} isLoading={false} />);
		const btn = screen.getByTestId("send-button");
		expect(btn.getAttribute("data-loading")).toBe("false");
	});

	it("passes isLoading=true to send button", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} isLoading />);
		const btn = screen.getByTestId("send-button");
		expect(btn.getAttribute("data-loading")).toBe("true");
	});

	it("renders attach pill button", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("pill-attach")).toBeTruthy();
	});

	it("shows hasContent=false when text input is empty", () => {
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "", setInput: vi.fn() },
			attachments: { add: vi.fn() },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const btn = screen.getByTestId("send-button");
		expect(btn.getAttribute("data-has-content")).toBe("false");
	});

	it("shows hasContent=true when text input has content", () => {
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "Hello world", setInput: vi.fn() },
			attachments: { add: vi.fn() },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const btn = screen.getByTestId("send-button");
		expect(btn.getAttribute("data-has-content")).toBe("true");
	});

	it("shows hasContent=false when text input is only whitespace", () => {
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "   ", setInput: vi.fn() },
			attachments: { add: vi.fn() },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const btn = screen.getByTestId("send-button");
		expect(btn.getAttribute("data-has-content")).toBe("false");
	});

	it("handleAttachClick triggers file input click", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});
		fireEvent.click(screen.getByTestId("pill-attach"));
		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("handleFileChange with files calls attachments.add with the files", () => {
		const addMock = vi.fn();
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "", setInput: vi.fn() },
			attachments: { add: addMock },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["content"], "test.png", { type: "image/png" });
		Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
		fireEvent.change(fileInput);
		expect(addMock).toHaveBeenCalledWith([file]);
	});

	it("handleFileChange with no files does not call attachments.add", () => {
		const addMock = vi.fn();
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "", setInput: vi.fn() },
			attachments: { add: addMock },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		fireEvent.change(fileInput);
		expect(addMock).not.toHaveBeenCalled();
	});

	it("handleFileChange resets input value after processing", () => {
		vi.mocked(usePromptInputController).mockReturnValue({
			textInput: { value: "", setInput: vi.fn() },
			attachments: { add: vi.fn() },
		});
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["content"], "test.png", { type: "image/png" });
		Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
		fireEvent.change(fileInput);
		expect(fileInput.value).toBe("");
	});

	it("renders PromptInputAttachment via attachments render prop", () => {
		render(<PremiumPromptInputInner {...makeDefaultProps()} />);
		expect(screen.getByTestId("prompt-input-attachment")).toBeTruthy();
	});
});
