// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputAttachmentButton,
	PromptInputActionAddAttachments,
} from "../prompt-input-attachments";
import * as ctx from "../prompt-input-context";

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
	ImageIcon: () => <svg data-testid="image-icon" />,
	PaperclipIcon: () => <svg data-testid="paperclip-icon" />,
	XIcon: () => <svg data-testid="x-icon" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		className,
		type,
		variant,
		"aria-label": ariaLabel,
	}: {
		children?: ReactNode;
		onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
		className?: string;
		type?: string;
		variant?: string;
		"aria-label"?: string;
	}) => (
		<button
			data-testid="remove-btn"
			onClick={onClick}
			className={className}
			type={type as "button" | "submit" | "reset" | undefined}
			aria-label={ariaLabel}
		>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenuItem: ({
		children,
		onSelect,
	}: {
		children?: ReactNode;
		onSelect?: (e: Event) => void;
	}) => (
		<div
			data-testid="dropdown-item"
			onClick={() => {
				const e = new Event("select");
				Object.defineProperty(e, "preventDefault", { value: vi.fn() });
				onSelect?.(e);
			}}
		>
			{children}
		</div>
	),
}));

vi.mock("@/components/ui/input-group", () => ({
	InputGroupButton: ({
		children,
		onClick,
		className,
		"aria-label": ariaLabel,
	}: {
		children?: ReactNode;
		onClick?: () => void;
		className?: string;
		"aria-label"?: string;
	}) => (
		<button
			data-testid="attachment-btn"
			onClick={onClick}
			className={className}
			aria-label={ariaLabel}
			type="button"
		>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/hover-card", () => ({
	HoverCardTrigger: ({
		children,
	}: {
		children?: ReactNode;
		render?: ReactNode;
	}) => <div data-testid="hover-trigger">{children}</div>,
}));

vi.mock("../prompt-input-hover-card", () => ({
	PromptInputHoverCard: ({ children }: { children?: ReactNode }) => (
		<div data-testid="hover-card">{children}</div>
	),
	PromptInputHoverCardContent: ({ children }: { children?: ReactNode }) => (
		<div data-testid="hover-card-content">{children}</div>
	),
}));

vi.mock("../prompt-input-context", () => ({
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

Object.defineProperty(URL, "createObjectURL", {
	value: vi.fn(() => "blob:test-url"),
	writable: true,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mockedCtx.usePromptInputAttachments.mockReturnValue({
		files: [],
		add: vi.fn(),
		remove: vi.fn(),
		clear: vi.fn(),
		openFileDialog: vi.fn(),
		fileInputRef: { current: null },
	});
});

const imageFile = {
	id: "file-1",
	type: "file" as const,
	url: "blob:test-url",
	mediaType: "image/png",
	filename: "photo.png",
};

const nonImageFile = {
	id: "file-2",
	type: "file" as const,
	url: "blob:test-url",
	mediaType: "application/pdf",
	filename: "doc.pdf",
};

describe("PromptInputAttachment", () => {
	it("renders the attachment label (line 42 area)", () => {
		const removeMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [imageFile],
			add: vi.fn(),
			remove: removeMock,
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={imageFile} />);
		expect(screen.getByTestId("hover-card")).toBeTruthy();
	});

	it("renders file label for image type", () => {
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [imageFile],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={imageFile} />);
		expect(screen.getAllByText("photo.png").length).toBeGreaterThan(0);
	});

	it("shows fallback label for image without filename", () => {
		const noNameImage = { ...imageFile, filename: "" };
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [noNameImage],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={noNameImage} />);
		expect(screen.getAllByText("Image").length).toBeGreaterThan(0);
	});

	it("renders non-image attachment with paperclip icon area", () => {
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [nonImageFile],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={nonImageFile} />);
		expect(screen.getAllByText("doc.pdf").length).toBeGreaterThan(0);
	});

	it("shows fallback label for non-image without filename", () => {
		const noNameFile = { ...nonImageFile, filename: "" };
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [noNameFile],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={noNameFile} />);
		expect(screen.getAllByText("Attachment").length).toBeGreaterThan(0);
	});

	it("calls remove when remove button clicked", () => {
		const removeMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [imageFile],
			add: vi.fn(),
			remove: removeMock,
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(<PromptInputAttachment data={imageFile} />);
		const removeBtn = screen.getByTestId("remove-btn");
		fireEvent.click(removeBtn);
		expect(removeMock).toHaveBeenCalledWith("file-1");
	});
});

describe("PromptInputAttachments", () => {
	it("returns null when no files", () => {
		const { container } = render(
			<PromptInputAttachments>{(f) => <span key={f.id}>{f.filename}</span>}</PromptInputAttachments>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders children for each file when files present", () => {
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [imageFile, nonImageFile],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		render(
			<PromptInputAttachments>
				{(f) => <span data-testid={`file-${f.id}`}>{f.filename}</span>}
			</PromptInputAttachments>,
		);
		expect(screen.getByTestId("file-file-1")).toBeTruthy();
		expect(screen.getByTestId("file-file-2")).toBeTruthy();
	});

	it("applies className when files present", () => {
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [imageFile],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		const { container } = render(
			<PromptInputAttachments className="custom-class">
				{(f) => <span key={f.id}>{f.filename}</span>}
			</PromptInputAttachments>,
		);
		expect(container.querySelector(".custom-class")).toBeTruthy();
	});
});

describe("PromptInputActionAddAttachments", () => {
	it("renders with default label", () => {
		render(<PromptInputActionAddAttachments />);
		expect(screen.getByText("Add photos or files")).toBeTruthy();
	});

	it("renders with custom label", () => {
		render(<PromptInputActionAddAttachments label="Upload files" />);
		expect(screen.getByText("Upload files")).toBeTruthy();
	});

	it("calls openFileDialog when selected", () => {
		const openMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [],
			add: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: openMock,
			fileInputRef: { current: null },
		});

		render(<PromptInputActionAddAttachments />);
		const item = screen.getByTestId("dropdown-item");
		fireEvent.click(item);
		expect(openMock).toHaveBeenCalled();
	});
});

describe("PromptInputAttachmentButton", () => {
	it("renders a button and hidden file input", () => {
		const { container } = render(<PromptInputAttachmentButton />);
		expect(screen.getByTestId("attachment-btn")).toBeTruthy();
		expect(container.querySelector('input[type="file"]')).toBeTruthy();
	});

	it("hidden file input click is called when button clicked (line 171)", () => {
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		render(<PromptInputAttachmentButton />);
		fireEvent.click(screen.getByTestId("attachment-btn"));
		expect(clickSpy).toHaveBeenCalled();
		clickSpy.mockRestore();
	});

	it("adds files when file input changes with files (lines 175-177)", () => {
		const addMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [],
			add: addMock,
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		const { container } = render(<PromptInputAttachmentButton />);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["img"], "img.png", { type: "image/png" });
		Object.defineProperty(input, "files", { value: [file], configurable: true });
		fireEvent.change(input);
		expect(addMock).toHaveBeenCalled();
	});

	it("resets input value after file change (line 178)", () => {
		const { container } = render(<PromptInputAttachmentButton />);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["img"], "img.png", { type: "image/png" });
		Object.defineProperty(input, "files", { value: [file], configurable: true });
		fireEvent.change(input);
		expect(input.value).toBe("");
	});

	it("forwards accept prop to file input", () => {
		const { container } = render(<PromptInputAttachmentButton accept="application/pdf" />);
		const input = container.querySelector('input[type="file"]');
		expect(input?.getAttribute("accept")).toBe("application/pdf");
	});

	it("renders ImageIcon for image-only accept", () => {
		render(<PromptInputAttachmentButton accept="image/*" />);
		expect(screen.getByTestId("image-icon")).toBeTruthy();
	});

	it("renders PaperclipIcon for non-image-only accept", () => {
		render(<PromptInputAttachmentButton accept="application/pdf" />);
		expect(screen.getByTestId("paperclip-icon")).toBeTruthy();
	});

	it("uses custom icon when provided", () => {
		render(<PromptInputAttachmentButton icon={<svg data-testid="custom-icon" />} />);
		expect(screen.getByTestId("custom-icon")).toBeTruthy();
	});

	it("does not call add when no files selected", () => {
		const addMock = vi.fn();
		mockedCtx.usePromptInputAttachments.mockReturnValue({
			files: [],
			add: addMock,
			remove: vi.fn(),
			clear: vi.fn(),
			openFileDialog: vi.fn(),
			fileInputRef: { current: null },
		});

		const { container } = render(<PromptInputAttachmentButton />);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		fireEvent.change(input);
		expect(addMock).not.toHaveBeenCalled();
	});
});
