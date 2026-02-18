import { nanoid } from "nanoid";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { FileUIPart } from "ai";
import type { PropsWithChildren, RefObject } from "react";

// ============================================================================
// Types
// ============================================================================

export type AttachmentsContext = {
	files: Array<FileUIPart & { id: string }>;
	add: (files: Array<File> | FileList) => void;
	remove: (id: string) => void;
	clear: () => void;
	openFileDialog: () => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
};

export type TextInputContext = {
	value: string;
	setInput: (v: string) => void;
	clear: () => void;
};

export type PromptInputControllerProps = {
	textInput: TextInputContext;
	attachments: AttachmentsContext;
	/** INTERNAL: Allows PromptInput to register its file textInput + "open" callback */
	__registerFileInput: (ref: RefObject<HTMLInputElement | null>, open: () => void) => void;
};

export type PromptInputMessage = {
	text: string;
	files: Array<FileUIPart>;
};

// ============================================================================
// Contexts
// ============================================================================

export const PromptInputController = createContext<PromptInputControllerProps | null>(null);
export const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(null);
export const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

// ============================================================================
// Hooks
// ============================================================================

export const usePromptInputController = () => {
	const ctx = useContext(PromptInputController);
	if (!ctx) {
		throw new Error(
			"Wrap your component inside <PromptInputProvider> to use usePromptInputController().",
		);
	}
	return ctx;
};

// Optional variant (does NOT throw). Useful for dual-mode components.
export const useOptionalPromptInputController = () => useContext(PromptInputController);

export const useProviderAttachments = () => {
	const ctx = useContext(ProviderAttachmentsContext);
	if (!ctx) {
		throw new Error(
			"Wrap your component inside <PromptInputProvider> to use useProviderAttachments().",
		);
	}
	return ctx;
};

export const useOptionalProviderAttachments = () => useContext(ProviderAttachmentsContext);

export const usePromptInputAttachments = () => {
	// Dual-mode: prefer provider if present, otherwise use local
	const provider = useOptionalProviderAttachments();
	const local = useContext(LocalAttachmentsContext);
	const context = provider ?? local;
	if (!context) {
		throw new Error(
			"usePromptInputAttachments must be used within a PromptInput or PromptInputProvider",
		);
	}
	return context;
};

// ============================================================================
// Provider
// ============================================================================

export type PromptInputProviderProps = PropsWithChildren<{
	initialInput?: string;
}>;

/**
 * Optional global provider that lifts PromptInput state outside of PromptInput.
 * If you don't use it, PromptInput stays fully self-managed.
 */
export function PromptInputProvider({
	initialInput: initialTextInput = "",
	children,
}: PromptInputProviderProps) {
	// ----- textInput state
	const [textInput, setTextInput] = useState(initialTextInput);
	const clearInput = useCallback(() => setTextInput(""), []);

	// ----- attachments state (global when wrapped)
	const [attachmentFiles, setAttachmentFiles] = useState<Array<FileUIPart & { id: string }>>([]);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const openRef = useRef<() => void>(() => {});

	const add = useCallback((files: Array<File> | FileList) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) {
			return;
		}

		setAttachmentFiles((prev) =>
			prev.concat(
				incoming.map((file) => ({
					id: nanoid(),
					type: "file" as const,
					url: URL.createObjectURL(file),
					mediaType: file.type,
					filename: file.name,
				})),
			),
		);
	}, []);

	const remove = useCallback((id: string) => {
		setAttachmentFiles((prev) => {
			const found = prev.find((f) => f.id === id);
			if (found?.url) {
				URL.revokeObjectURL(found.url);
			}
			return prev.filter((f) => f.id !== id);
		});
	}, []);

	const clear = useCallback(() => {
		setAttachmentFiles((prev) => {
			for (const f of prev) {
				if (f.url) {
					URL.revokeObjectURL(f.url);
				}
			}
			return [];
		});
	}, []);

	// Keep a ref to attachments for cleanup on unmount (avoids stale closure)
	const attachmentsRef = useRef(attachmentFiles);
	attachmentsRef.current = attachmentFiles;

	// Cleanup blob URLs on unmount to prevent memory leaks
	useEffect(() => {
		return () => {
			for (const f of attachmentsRef.current) {
				if (f.url) {
					URL.revokeObjectURL(f.url);
				}
			}
		};
	}, []);

	const openFileDialog = useCallback(() => {
		openRef.current();
	}, []);

	const attachments = useMemo<AttachmentsContext>(
		() => ({
			files: attachmentFiles,
			add,
			remove,
			clear,
			openFileDialog,
			fileInputRef,
		}),
		[attachmentFiles, add, remove, clear, openFileDialog],
	);

	const __registerFileInput = useCallback(
		(ref: RefObject<HTMLInputElement | null>, open: () => void) => {
			fileInputRef.current = ref.current;
			openRef.current = open;
		},
		[],
	);

	const controller = useMemo<PromptInputControllerProps>(
		() => ({
			textInput: {
				value: textInput,
				setInput: setTextInput,
				clear: clearInput,
			},
			attachments,
			__registerFileInput,
		}),
		[textInput, clearInput, attachments, __registerFileInput],
	);

	return (
		<PromptInputController.Provider value={controller}>
			<ProviderAttachmentsContext.Provider value={attachments}>
				{children}
			</ProviderAttachmentsContext.Provider>
		</PromptInputController.Provider>
	);
}
