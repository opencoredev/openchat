import { nanoid } from "nanoid";
import { useCallback, useMemo, useRef, useState } from "react";
import { useEffectOnDeps } from "@/hooks/use-mount-effect";
import type { FileUIPart } from "ai";
import type { ChangeEventHandler, FormEvent, FormEventHandler, HTMLAttributes } from "react";
import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import {
	type AttachmentsContext,
	LocalAttachmentsContext,
	useOptionalPromptInputController,
} from "./prompt-input-context";

export * from "./prompt-input-context";
export * from "./prompt-input-hover-card";
export * from "./prompt-input-attachments";
export * from "./prompt-input-primitives";
export * from "./prompt-input-action-menu";
export * from "./prompt-input-submit";
export * from "./prompt-input-speech";
export * from "./prompt-input-select";
export * from "./prompt-input-tabs";
export * from "./prompt-input-command";

export type PromptInputMessage = {
	text: string;
	files: Array<FileUIPart>;
};

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
	accept?: string;
	multiple?: boolean;
	globalDrop?: boolean;
	syncHiddenInput?: boolean;
	maxFiles?: number;
	maxFileSize?: number;
	onError?: (err: { code: "max_files" | "max_file_size" | "accept"; message: string }) => void;
	onSubmit: (
		message: PromptInputMessage,
		event: FormEvent<HTMLFormElement>,
	) => void | Promise<void>;
};

export const PromptInput = ({
	className,
	accept,
	multiple,
	globalDrop,
	syncHiddenInput,
	maxFiles,
	maxFileSize,
	onError,
	onSubmit,
	children,
	...props
}: PromptInputProps) => {
	const controller = useOptionalPromptInputController();
	const usingProvider = !!controller;

	const inputRef = useRef<HTMLInputElement | null>(null);
	const formRef = useRef<HTMLFormElement | null>(null);

	const [items, setItems] = useState<Array<FileUIPart & { id: string }>>([]);
	const files = usingProvider ? controller.attachments.files : items;

	const filesRef = useRef(files);
	filesRef.current = files;

	const openFileDialogLocal = useCallback(() => {
		inputRef.current?.click();
	}, []);

	const matchesAccept = useCallback(
		(f: File) => {
			if (!accept || accept.trim() === "") {
				return true;
			}

			const patterns = accept
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

			return patterns.some((pattern) => {
				if (pattern.endsWith("/*")) {
					const prefix = pattern.slice(0, -1);
					return f.type.startsWith(prefix);
				}
				return f.type === pattern;
			});
		},
		[accept],
	);

	const addLocal = useCallback(
		(fileList: Array<File> | FileList) => {
			const incoming = Array.from(fileList);
			const accepted = incoming.filter((f) => matchesAccept(f));
			if (incoming.length && accepted.length === 0) {
				onError?.({
					code: "accept",
					message: "No files match the accepted types.",
				});
				return;
			}
			const withinSize = (f: File) => (maxFileSize ? f.size <= maxFileSize : true);
			const sized = accepted.filter(withinSize);
			if (accepted.length > 0 && sized.length === 0) {
				onError?.({
					code: "max_file_size",
					message: "All files exceed the maximum size.",
				});
				return;
			}

			setItems((prev) => {
				const capacity =
					typeof maxFiles === "number" ? Math.max(0, maxFiles - prev.length) : undefined;
				const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;
				if (typeof capacity === "number" && sized.length > capacity) {
					onError?.({
						code: "max_files",
						message: "Too many files. Some were not added.",
					});
				}
				const next: Array<FileUIPart & { id: string }> = [];
				for (const file of capped) {
					next.push({
						id: nanoid(),
						type: "file",
						url: URL.createObjectURL(file),
						mediaType: file.type,
						filename: file.name,
					});
				}
				return prev.concat(next);
			});
		},
		[matchesAccept, maxFiles, maxFileSize, onError],
	);

	const removeLocal = useCallback(
		(id: string) =>
			setItems((prev) => {
				const found = prev.find((file) => file.id === id);
				if (found?.url) {
					URL.revokeObjectURL(found.url);
				}
				return prev.filter((file) => file.id !== id);
			}),
		[],
	);

	const clearLocal = useCallback(
		() =>
			setItems((prev) => {
				for (const file of prev) {
					if (file.url) {
						URL.revokeObjectURL(file.url);
					}
				}
				return [];
			}),
		[],
	);

	const add = usingProvider ? controller.attachments.add : addLocal;
	const remove = usingProvider ? controller.attachments.remove : removeLocal;
	const clear = usingProvider ? controller.attachments.clear : clearLocal;
	const openFileDialog = usingProvider
		? controller.attachments.openFileDialog
		: openFileDialogLocal;

	useEffectOnDeps(() => {
		if (!usingProvider) return;
		controller.__registerFileInput(inputRef, () => inputRef.current?.click());
	}, [usingProvider, controller]);

	useEffectOnDeps(() => {
		if (syncHiddenInput && inputRef.current && files.length === 0) {
			inputRef.current.value = "";
		}
	}, [files, syncHiddenInput]);

	useEffectOnDeps(() => {
		const form = formRef.current;
		if (!form) return;
		if (globalDrop) return;

		const onDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
		};
		const onDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				add(e.dataTransfer.files);
			}
		};
		form.addEventListener("dragover", onDragOver);
		form.addEventListener("drop", onDrop);
		return () => {
			form.removeEventListener("dragover", onDragOver);
			form.removeEventListener("drop", onDrop);
		};
	}, [add, globalDrop]);

	useEffectOnDeps(() => {
		if (!globalDrop) return;

		const onDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
		};
		const onDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				add(e.dataTransfer.files);
			}
		};
		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
		};
	}, [add, globalDrop]);

	useEffectOnDeps(
		() => () => {
			if (!usingProvider) {
				for (const f of filesRef.current) {
					if (f.url) URL.revokeObjectURL(f.url);
				}
			}
		},
		[usingProvider],
	);

	const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
		if (event.currentTarget.files) {
			add(event.currentTarget.files);
		}
		event.currentTarget.value = "";
	};

	const convertBlobUrlToDataUrl = async (url: string): Promise<string | null> => {
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(blob);
			});
		} catch (error) {
			console.warn("[PromptInput] Failed to convert blob URL", error);
			return null;
		}
	};

	const ctx = useMemo<AttachmentsContext>(
		() => ({
			files: files.map((item) => ({ ...item, id: item.id })),
			add,
			remove,
			clear,
			openFileDialog,
			fileInputRef: inputRef,
		}),
		[files, add, remove, clear, openFileDialog],
	);

	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		event.preventDefault();

		const form = event.currentTarget;
		const text = usingProvider
			? controller.textInput.value
			: (() => {
					const formData = new FormData(form);
					return (formData.get("message") as string) || "";
				})();

		if (!usingProvider) {
			form.reset();
		}

		Promise.all(
			files.map(async ({ id: _id, ...item }) => {
				if (item.url && item.url.startsWith("blob:")) {
					const dataUrl = await convertBlobUrlToDataUrl(item.url);
					return {
						...item,
						url: dataUrl ?? item.url,
					};
				}
				return item;
			}),
		)
			.then((convertedFiles: Array<FileUIPart>) => {
				try {
					const result = onSubmit({ text, files: convertedFiles }, event);

					if (result instanceof Promise) {
						result
							.then(() => {
								clear();
								if (usingProvider) {
									controller.textInput.clear();
								}
							})
							.catch((submitError) => {
								console.warn("[PromptInput] Async submit failed", submitError);
							});
					} else {
						clear();
						if (usingProvider) {
							controller.textInput.clear();
						}
					}
				} catch (submitError) {
					console.warn("[PromptInput] Submit handler threw", submitError);
				}
			})
			.catch((conversionError) => {
				console.warn("[PromptInput] File conversion failed", conversionError);
			});
	};

	const inner = (
		<>
			<input
				accept={accept}
				aria-label="Upload files"
				className="hidden"
				multiple={multiple}
				onChange={handleChange}
				ref={inputRef}
				title="Upload files"
				type="file"
			/>
			<form className={cn("w-full", className)} onSubmit={handleSubmit} ref={formRef} {...props}>
				<InputGroup className="overflow-hidden">{children}</InputGroup>
			</form>
		</>
	);

	return usingProvider ? (
		inner
	) : (
		<LocalAttachmentsContext.Provider value={ctx}>{inner}</LocalAttachmentsContext.Provider>
	);
};
