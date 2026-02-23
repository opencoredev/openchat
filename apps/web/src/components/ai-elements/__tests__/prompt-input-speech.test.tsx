// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { PromptInputSpeechButton } from "../prompt-input-speech";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	MicIcon: () => <svg data-testid="mic-icon" />,
}));

vi.mock("../prompt-input-primitives", () => ({
	PromptInputButton: ({
		children,
		className,
		disabled,
		onClick,
		...rest
	}: {
		children?: React.ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button
			data-testid="speech-button"
			className={className}
			disabled={disabled}
			onClick={onClick}
			{...rest}
		>
			{children}
		</button>
	),
}));

interface MockResultList {
	readonly length: number;
	[index: number]: MockResult;
}

interface MockResult {
	readonly length: number;
	[index: number]: { transcript: string; confidence: number };
	isFinal: boolean;
}

interface MockResultEvent {
	resultIndex: number;
	results: MockResultList;
}

interface MockErrorEvent {
	error: string;
}

let latestInstance: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
	continuous = false;
	interimResults = false;
	lang = "";
	start = vi.fn();
	stop = vi.fn();
	onstart: ((ev: Event) => void) | null = null;
	onend: ((ev: Event) => void) | null = null;
	onresult: ((ev: MockResultEvent) => void) | null = null;
	onerror: ((ev: MockErrorEvent) => void) | null = null;
	constructor() {
		latestInstance = this;
	}
}

function SpeechWithTextarea({
	onTranscriptionChange,
}: {
	onTranscriptionChange?: (text: string) => void;
}) {
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	return (
		<>
			<textarea data-testid="target-textarea" ref={textareaRef} />
			<PromptInputSpeechButton
				textareaRef={textareaRef}
				onTranscriptionChange={onTranscriptionChange}
			/>
		</>
	);
}

beforeEach(() => {
	latestInstance = null;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("PromptInputSpeechButton - no SpeechRecognition available", () => {
	it("renders a button", () => {
		render(<PromptInputSpeechButton />);
		expect(screen.getByTestId("speech-button")).toBeTruthy();
	});

	it("renders disabled when no recognition available", () => {
		render(<PromptInputSpeechButton />);
		const btn = screen.getByTestId("speech-button") as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("renders the MicIcon", () => {
		render(<PromptInputSpeechButton />);
		expect(screen.getByTestId("mic-icon")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<PromptInputSpeechButton className="extra-class" />);
		const btn = screen.getByTestId("speech-button");
		expect(btn.className).toContain("extra-class");
	});

	it("no recognition instance is created", () => {
		render(<PromptInputSpeechButton />);
		expect(latestInstance).toBeNull();
	});
});

describe("PromptInputSpeechButton - with SpeechRecognition", () => {
	beforeEach(() => {
		vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
	});

	it("renders an enabled button", () => {
		render(<PromptInputSpeechButton />);
		const btn = screen.getByTestId("speech-button") as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
	});

	it("initializes recognition with continuous=true", () => {
		render(<PromptInputSpeechButton />);
		expect(latestInstance!.continuous).toBe(true);
	});

	it("initializes recognition with interimResults=true", () => {
		render(<PromptInputSpeechButton />);
		expect(latestInstance!.interimResults).toBe(true);
	});

	it("initializes recognition with lang=en-US", () => {
		render(<PromptInputSpeechButton />);
		expect(latestInstance!.lang).toBe("en-US");
	});

	it("calls start() when clicked while not listening", () => {
		render(<PromptInputSpeechButton />);
		fireEvent.click(screen.getByTestId("speech-button"));
		expect(latestInstance!.start).toHaveBeenCalledTimes(1);
	});

	it("onstart sets isListening to true (adds pulse class)", () => {
		render(<PromptInputSpeechButton />);
		act(() => {
			latestInstance!.onstart?.(new Event("start"));
		});
		const btn = screen.getByTestId("speech-button");
		expect(btn.className).toContain("animate-pulse");
	});

	it("calls stop() when clicked while listening", () => {
		render(<PromptInputSpeechButton />);
		act(() => {
			latestInstance!.onstart?.(new Event("start"));
		});
		fireEvent.click(screen.getByTestId("speech-button"));
		expect(latestInstance!.stop).toHaveBeenCalledTimes(1);
	});

	it("onend sets isListening to false (removes pulse class)", () => {
		render(<PromptInputSpeechButton />);
		act(() => {
			latestInstance!.onstart?.(new Event("start"));
		});
		act(() => {
			latestInstance!.onend?.(new Event("end"));
		});
		const btn = screen.getByTestId("speech-button");
		expect(btn.className).not.toContain("animate-pulse");
	});

	it("onerror logs error and sets isListening to false", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(<PromptInputSpeechButton />);
		act(() => {
			latestInstance!.onstart?.(new Event("start"));
		});
		act(() => {
			latestInstance!.onerror?.({ error: "no-speech" });
		});
		const btn = screen.getByTestId("speech-button");
		expect(btn.className).not.toContain("animate-pulse");
		expect(consoleSpy).toHaveBeenCalledWith("Speech recognition error:", "no-speech");
		consoleSpy.mockRestore();
	});

	it("stops recognition on component unmount", () => {
		const { unmount } = render(<PromptInputSpeechButton />);
		unmount();
		expect(latestInstance!.stop).toHaveBeenCalledTimes(1);
	});

	it("onresult appends final transcript to textarea", () => {
		const onTranscriptionChange = vi.fn();
		render(<SpeechWithTextarea onTranscriptionChange={onTranscriptionChange} />);

		const results: MockResultList = {
			length: 1,
			0: { isFinal: true, length: 1, 0: { transcript: "hello world", confidence: 1 } },
		};
		act(() => {
			latestInstance!.onresult?.({ resultIndex: 0, results });
		});

		const textarea = screen.getByTestId("target-textarea") as HTMLTextAreaElement;
		expect(textarea.value).toBe("hello world");
		expect(onTranscriptionChange).toHaveBeenCalledWith("hello world");
	});

	it("onresult does not update textarea for non-final results", () => {
		const onTranscriptionChange = vi.fn();
		render(<SpeechWithTextarea onTranscriptionChange={onTranscriptionChange} />);

		const results: MockResultList = {
			length: 1,
			0: { isFinal: false, length: 1, 0: { transcript: "interim", confidence: 0.5 } },
		};
		act(() => {
			latestInstance!.onresult?.({ resultIndex: 0, results });
		});

		const textarea = screen.getByTestId("target-textarea") as HTMLTextAreaElement;
		expect(textarea.value).toBe("");
		expect(onTranscriptionChange).not.toHaveBeenCalled();
	});

	it("onresult prepends space when textarea has existing content", () => {
		render(<SpeechWithTextarea />);

		const textarea = screen.getByTestId("target-textarea") as HTMLTextAreaElement;
		textarea.value = "existing";

		const results: MockResultList = {
			length: 1,
			0: { isFinal: true, length: 1, 0: { transcript: "appended", confidence: 1 } },
		};
		act(() => {
			latestInstance!.onresult?.({ resultIndex: 0, results });
		});

		expect(textarea.value).toBe("existing appended");
	});

	it("onresult dispatches input event on textarea", () => {
		render(<SpeechWithTextarea />);
		const textarea = screen.getByTestId("target-textarea") as HTMLTextAreaElement;
		const inputListener = vi.fn();
		textarea.addEventListener("input", inputListener);

		const results: MockResultList = {
			length: 1,
			0: { isFinal: true, length: 1, 0: { transcript: "test", confidence: 1 } },
		};
		act(() => {
			latestInstance!.onresult?.({ resultIndex: 0, results });
		});

		expect(inputListener).toHaveBeenCalledTimes(1);
		textarea.removeEventListener("input", inputListener);
	});

	it("onresult skips when no textareaRef provided", () => {
		const onTranscriptionChange = vi.fn();
		render(<PromptInputSpeechButton onTranscriptionChange={onTranscriptionChange} />);

		const results: MockResultList = {
			length: 1,
			0: { isFinal: true, length: 1, 0: { transcript: "hello", confidence: 1 } },
		};
		act(() => {
			latestInstance!.onresult?.({ resultIndex: 0, results });
		});

		expect(onTranscriptionChange).not.toHaveBeenCalled();
	});
});

describe("PromptInputSpeechButton - webkitSpeechRecognition fallback", () => {
	it("uses webkitSpeechRecognition when SpeechRecognition is absent", () => {
		vi.stubGlobal("webkitSpeechRecognition", MockSpeechRecognition);
		render(<PromptInputSpeechButton />);
		const btn = screen.getByTestId("speech-button") as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		expect(latestInstance).toBeTruthy();
	});
});
