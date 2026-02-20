import {
	Children,
	useState,
} from "react";
import type {
	ChangeEvent,
	ClipboardEventHandler,
	ComponentProps,
	HTMLAttributes,
	KeyboardEventHandler,
} from "react";
import {
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { useOptionalPromptInputController, usePromptInputAttachments } from "./prompt-input-context";

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
	<div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
	onChange,
	className,
	placeholder = "What would you like to know?",
	...props
}: PromptInputTextareaProps) => {
	const controller = useOptionalPromptInputController();
	const attachments = usePromptInputAttachments();
	const [isComposing, setIsComposing] = useState(false);

	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
		if (e.key === "Enter") {
			if (isComposing || e.nativeEvent.isComposing) {
				return;
			}
			if (e.shiftKey) {
				return;
			}
			e.preventDefault();

			const form = e.currentTarget.form;
			const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (submitButton?.disabled) {
				return;
			}

			form?.requestSubmit();
		}

		if (e.key === "Backspace" && e.currentTarget.value === "" && attachments.files.length > 0) {
			e.preventDefault();
			const lastAttachment = attachments.files.at(-1);
			if (lastAttachment) {
				attachments.remove(lastAttachment.id);
			}
		}
	};

	const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
		const items = event.clipboardData.items;

		const files: Array<File> = [];

		for (const item of items) {
			if (item.kind === "file") {
				const file = item.getAsFile();
				if (file) {
					files.push(file);
				}
			}
		}

		if (files.length > 0) {
			event.preventDefault();
			attachments.add(files);
		}
	};

	const controlledProps = controller
		? {
				value: controller.textInput.value,
				onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
					controller.textInput.setInput(e.currentTarget.value);
					onChange?.(e);
				},
			}
		: {
				onChange,
			};

	return (
		<InputGroupTextarea
			className={cn("field-sizing-content max-h-48 min-h-16", className)}
			name="message"
			onCompositionEnd={() => setIsComposing(false)}
			onCompositionStart={() => setIsComposing(true)}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			placeholder={placeholder}
			{...props}
			{...controlledProps}
		/>
	);
};

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
	<InputGroupAddon
		align="block-end"
		className={cn("order-first flex-wrap gap-1", className)}
		{...props}
	/>
);

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
	<InputGroupAddon
		align="block-end"
		className={cn("justify-between gap-1", className)}
		{...props}
	/>
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
	<div className={cn("flex items-center gap-1", className)} {...props} />
);

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

export const PromptInputButton = ({
	variant = "ghost",
	className,
	size,
	...props
}: PromptInputButtonProps) => {
	const newSize = size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm");

	return (
		<InputGroupButton
			className={cn(className)}
			size={newSize}
			type="button"
			variant={variant}
			{...props}
		/>
	);
};
