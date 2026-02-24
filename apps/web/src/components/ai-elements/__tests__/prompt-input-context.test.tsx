// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import {
	LocalAttachmentsContext,
	PromptInputProvider,
	useOptionalPromptInputController,
	usePromptInputAttachments,
	usePromptInputController,
	useProviderAttachments,
} from "../prompt-input-context";
import type { AttachmentsContext } from "../prompt-input-context";

vi.mock("nanoid", () => ({
	nanoid: () => "test-id",
}));

const createObjectURLMock = vi.fn(() => "blob:test-url");
const revokeObjectURLMock = vi.fn();

Object.defineProperty(URL, "createObjectURL", {
	value: createObjectURLMock,
	writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
	value: revokeObjectURLMock,
	writable: true,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function SafeControllerConsumer() {
	try {
		usePromptInputController();
		return <div data-testid="ok">ok</div>;
	} catch (e) {
		return <div data-testid="error">{(e as Error).message}</div>;
	}
}

function SafeProviderAttachmentsConsumer() {
	try {
		useProviderAttachments();
		return <div data-testid="ok">ok</div>;
	} catch (e) {
		return <div data-testid="error">{(e as Error).message}</div>;
	}
}

function SafePromptInputAttachmentsConsumer() {
	try {
		usePromptInputAttachments();
		return <div data-testid="ok">ok</div>;
	} catch (e) {
		return <div data-testid="error">{(e as Error).message}</div>;
	}
}

function AttachmentsConsumer() {
	const ctx = useProviderAttachments();
	return (
		<div>
			<span data-testid="count">{ctx.files.length}</span>
			<button
				data-testid="add"
				onClick={() => ctx.add([new File(["content"], "test.txt", { type: "image/png" })])}
			>
				add
			</button>
			<button data-testid="remove" onClick={() => ctx.remove("test-id")}>
				remove
			</button>
			<button data-testid="clear" onClick={() => ctx.clear()}>
				clear
			</button>
		</div>
	);
}

function ControllerTextConsumer() {
	const ctx = usePromptInputController();
	return (
		<div>
			<span data-testid="val">{ctx.textInput.value}</span>
			<button data-testid="set" onClick={() => ctx.textInput.setInput("updated")}>
				set
			</button>
			<button data-testid="clr" onClick={() => ctx.textInput.clear()}>
				clear
			</button>
		</div>
	);
}

describe("usePromptInputController", () => {
	it("throws when not wrapped in PromptInputProvider", () => {
		const { container } = render(<SafeControllerConsumer />);
		expect(container.querySelector("[data-testid='error']")?.textContent).toContain(
			"PromptInputProvider",
		);
	});

	it("returns context when inside PromptInputProvider", () => {
		const { container } = render(
			<PromptInputProvider>
				<SafeControllerConsumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='ok']")).toBeTruthy();
	});
});

describe("useOptionalPromptInputController", () => {
	it("returns null when no provider", () => {
		function Consumer() {
			const ctx = useOptionalPromptInputController();
			return <div data-testid="val">{ctx === null ? "null" : "present"}</div>;
		}
		const { container } = render(<Consumer />);
		expect(container.querySelector("[data-testid='val']")?.textContent).toBe("null");
	});

	it("returns context when inside provider", () => {
		function Consumer() {
			const ctx = useOptionalPromptInputController();
			return <div data-testid="val">{ctx === null ? "null" : "present"}</div>;
		}
		const { container } = render(
			<PromptInputProvider>
				<Consumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='val']")?.textContent).toBe("present");
	});
});

describe("useProviderAttachments", () => {
	it("throws when not wrapped in PromptInputProvider", () => {
		const { container } = render(<SafeProviderAttachmentsConsumer />);
		expect(container.querySelector("[data-testid='error']")?.textContent).toContain(
			"PromptInputProvider",
		);
	});

	it("returns context when inside PromptInputProvider", () => {
		const { container } = render(
			<PromptInputProvider>
				<SafeProviderAttachmentsConsumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='ok']")).toBeTruthy();
	});
});

describe("usePromptInputAttachments", () => {
	it("throws when neither provider nor local context present", () => {
		const { container } = render(<SafePromptInputAttachmentsConsumer />);
		expect(container.querySelector("[data-testid='error']")?.textContent).toContain(
			"usePromptInputAttachments",
		);
	});

	it("uses provider context when available", () => {
		function Consumer() {
			const ctx = usePromptInputAttachments();
			return <div data-testid="count">{ctx.files.length}</div>;
		}
		const { container } = render(
			<PromptInputProvider>
				<Consumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
	});

	it("falls back to LocalAttachmentsContext when no provider", () => {
		const mockCtx: AttachmentsContext = {
			files: [],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		};

		function Consumer() {
			const ctx = usePromptInputAttachments();
			return <div data-testid="count">{ctx.files.length}</div>;
		}
		const { container } = render(
			<LocalAttachmentsContext.Provider value={mockCtx}>
				<Consumer />
			</LocalAttachmentsContext.Provider>,
		);
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
	});
});

describe("PromptInputProvider text input", () => {
	it("renders children", () => {
		const { container } = render(
			<PromptInputProvider>
				<div data-testid="child">child</div>
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='child']")).toBeTruthy();
	});

	it("seeds textInput with initialInput", () => {
		const { container } = render(
			<PromptInputProvider initialInput="seed">
				<ControllerTextConsumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='val']")?.textContent).toBe("seed");
	});

	it("setInput updates the text value", () => {
		const { container } = render(
			<PromptInputProvider>
				<ControllerTextConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='set']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='val']")?.textContent).toBe("updated");
	});

	it("clear resets the text value", () => {
		const { container } = render(
			<PromptInputProvider initialInput="text">
				<ControllerTextConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='clr']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='val']")?.textContent).toBe("");
	});
});

describe("PromptInputProvider attachments", () => {
	it("starts with zero files", () => {
		const { container } = render(
			<PromptInputProvider>
				<AttachmentsConsumer />
			</PromptInputProvider>,
		);
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
	});

	it("add appends files and creates object URLs", () => {
		const { container } = render(
			<PromptInputProvider>
				<AttachmentsConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("1");
		expect(URL.createObjectURL).toHaveBeenCalled();
	});

	it("add with empty array does nothing", () => {
		function Consumer() {
			const ctx = useProviderAttachments();
			return (
				<div>
					<span data-testid="count">{ctx.files.length}</span>
					<button data-testid="add-empty" onClick={() => ctx.add([])}>
						add-empty
					</button>
				</div>
			);
		}
		const { container } = render(
			<PromptInputProvider>
				<Consumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add-empty']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
	});

	it("remove removes a file by id and revokes its URL", () => {
		const { container } = render(
			<PromptInputProvider>
				<AttachmentsConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("1");
		act(() => {
			(container.querySelector("[data-testid='remove']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
	});

	it("remove is a no-op for unknown id", () => {
		function RemoveConsumer() {
			const ctx = useProviderAttachments();
			return (
				<div>
					<span data-testid="count">{ctx.files.length}</span>
					<button
						data-testid="add"
						onClick={() =>
							ctx.add([new File(["content"], "test.txt", { type: "image/png" })])
						}
					>
						add
					</button>
					<button
						data-testid="remove-unknown"
						onClick={() => ctx.remove("nonexistent-id")}
					>
						remove unknown
					</button>
				</div>
			);
		}
		const { container } = render(
			<PromptInputProvider>
				<RemoveConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add']") as HTMLButtonElement).click();
		});
		act(() => {
			(container.querySelector("[data-testid='remove-unknown']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("1");
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();
	});

	it("clear removes all files and revokes their URLs", () => {
		const { container } = render(
			<PromptInputProvider>
				<AttachmentsConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add']") as HTMLButtonElement).click();
		});
		vi.clearAllMocks();
		act(() => {
			(container.querySelector("[data-testid='clear']") as HTMLButtonElement).click();
		});
		expect(container.querySelector("[data-testid='count']")?.textContent).toBe("0");
		expect(URL.revokeObjectURL).toHaveBeenCalled();
	});

	it("unmount revokes blob URLs for remaining files", () => {
		const { container, unmount } = render(
			<PromptInputProvider>
				<AttachmentsConsumer />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='add']") as HTMLButtonElement).click();
		});
		vi.clearAllMocks();
		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
	});

	it("openFileDialog calls the registered open function", () => {
		const openFn = vi.fn();

		function OpenConsumer() {
			const ctx = usePromptInputController();
			return (
				<button data-testid="open" onClick={() => ctx.attachments.openFileDialog()}>
					open
				</button>
			);
		}

		function Registrar() {
			const ctx = usePromptInputController();
			const ref = useRef<HTMLInputElement | null>(null);
			useEffect(() => {
				ctx.__registerFileInput(ref, openFn);
			}, [ctx]);
			return null;
		}

		const { container } = render(
			<PromptInputProvider>
				<OpenConsumer />
				<Registrar />
			</PromptInputProvider>,
		);
		act(() => {
			(container.querySelector("[data-testid='open']") as HTMLButtonElement).click();
		});
		expect(openFn).toHaveBeenCalled();
	});
});
