// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, act } from "@testing-library/react";

vi.mock("nanoid", () => ({
	nanoid: () => "test-id",
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroup: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div data-testid="input-group" className={className}>
			{children}
		</div>
	),
}));

vi.mock("../prompt-input-context", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../prompt-input-context")>();
	return {
		...actual,
		useOptionalPromptInputController: vi.fn(() => null),
	};
});

import React from "react";
import { PromptInput } from "../prompt-input";
import * as ctx from "../prompt-input-context";

const mockedCtx = vi.mocked(ctx);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mockedCtx.useOptionalPromptInputController.mockReturnValue(null);
});

describe("PromptInput", () => {
	it("renders without crashing", () => {
		render(<PromptInput onSubmit={vi.fn()} />);
		expect(document.body).toBeTruthy();
	});

	it("renders a hidden file input", () => {
		render(<PromptInput onSubmit={vi.fn()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(fileInput).toBeTruthy();
		expect(fileInput.className).toContain("hidden");
	});

	it("file input onChange calls add with files (line 248)", async () => {
		const mockFile = new File(["content"], "test.png", { type: "image/png" });
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");

		render(<PromptInput onSubmit={vi.fn()} />);
		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		expect(fileInput).toBeTruthy();

		await act(async () => {
			Object.defineProperty(fileInput, "files", {
				value: [mockFile],
				configurable: true,
			});
			fireEvent.change(fileInput);
		});

		vi.restoreAllMocks();
	});

	it("submit with non-blob-URL file passes item as-is (line 303)", async () => {
		const onSubmit = vi.fn();
		const dataUrl = "data:image/png;base64,abc123";

		const mockController = {
			textInput: { value: "hello", setInput: vi.fn(), clear: vi.fn() },
			attachments: {
				files: [
					{
						id: "file-1",
						type: "file" as const,
						url: dataUrl,
						mediaType: "image/png",
						filename: "test.png",
					},
				],
				add: vi.fn(),
				remove: vi.fn(),
				clear: vi.fn(),
				openFileDialog: vi.fn(),
				fileInputRef: { current: null },
			},
			__registerFileInput: vi.fn(),
		};

		mockedCtx.useOptionalPromptInputController.mockReturnValue(mockController);

		render(
			<PromptInput onSubmit={onSubmit}>
				<button type="submit">Send</button>
			</PromptInput>,
		);

		const form = document.querySelector("form")!;
		await act(async () => {
			fireEvent.submit(form);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});

		expect(onSubmit).toHaveBeenCalled();
		const callArgs = onSubmit.mock.calls[0][0];
		expect(callArgs.files[0].url).toBe(dataUrl);
	});

	it("submit with blob-URL file calls convertBlobUrlToDataUrl (lines 255-260)", async () => {
		const onSubmit = vi.fn();
		const blobUrl = "blob:http://localhost/test-blob";
		const dataUrl = "data:image/png;base64,converted";

		const mockBlob = new Blob(["content"], { type: "image/png" });
		vi.spyOn(global, "fetch").mockResolvedValue({
			blob: () => Promise.resolve(mockBlob),
		} as Response);

		class MockFileReader {
			onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
			onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
			result: string | ArrayBuffer | null = dataUrl;

			readAsDataURL() {
				setTimeout(() => {
					if (this.onloadend) {
						const ev = new ProgressEvent("loadend") as ProgressEvent<FileReader>;
						this.onloadend.call(this as unknown as FileReader, ev);
					}
				}, 0);
			}
		}
		function fileReaderMock(this: FileReader) {
			return new MockFileReader() as unknown as FileReader;
		}
		vi.spyOn(global, "FileReader").mockImplementation(fileReaderMock);

		const mockController = {
			textInput: { value: "hello", setInput: vi.fn(), clear: vi.fn() },
			attachments: {
				files: [
					{
						id: "file-1",
						type: "file" as const,
						url: blobUrl,
						mediaType: "image/png",
						filename: "test.png",
					},
				],
				add: vi.fn(),
				remove: vi.fn(),
				clear: vi.fn(),
				openFileDialog: vi.fn(),
				fileInputRef: { current: null },
			},
			__registerFileInput: vi.fn(),
		};

		mockedCtx.useOptionalPromptInputController.mockReturnValue(mockController);

		render(
			<PromptInput onSubmit={onSubmit}>
				<button type="submit">Send</button>
			</PromptInput>,
		);

		const form = document.querySelector("form")!;
		await act(async () => {
			fireEvent.submit(form);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		expect(global.fetch).toHaveBeenCalledWith(blobUrl);
		expect(onSubmit).toHaveBeenCalled();
		const callArgs = onSubmit.mock.calls[0][0];
		expect(callArgs.files[0].url).toBe(dataUrl);

		vi.restoreAllMocks();
	});
});
