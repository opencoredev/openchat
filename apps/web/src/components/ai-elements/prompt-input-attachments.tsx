import { ImageIcon, PaperclipIcon, XIcon } from "lucide-react";
import { Fragment, useRef } from "react";
import type { ChangeEvent, ComponentProps, HTMLAttributes, ReactNode } from "react";
import type { FileUIPart } from "ai";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { usePromptInputAttachments } from "./prompt-input-context";
import { PromptInputHoverCard, PromptInputHoverCardContent } from "./prompt-input-hover-card";

export type PromptInputAttachmentProps = HTMLAttributes<HTMLDivElement> & {
	data: FileUIPart & { id: string };
	className?: string;
};

export function PromptInputAttachment({ data, className, ...props }: PromptInputAttachmentProps) {
	const attachments = usePromptInputAttachments();

	const filename = data.filename || "";

	const mediaType = data.mediaType.startsWith("image/") && data.url ? "image" : "file";
	const isImage = mediaType === "image";

	const attachmentLabel = filename || (isImage ? "Image" : "Attachment");

	return (
		<PromptInputHoverCard>
			<HoverCardTrigger
				render={
					<div
						className={cn(
							"group relative flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border border-border px-1.5 font-medium text-sm transition-all hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
							className,
						)}
						key={data.id}
						{...props}
					/>
				}
			>
				<div className="relative size-5 shrink-0">
					<div className="absolute inset-0 flex size-5 items-center justify-center overflow-hidden rounded bg-background transition-opacity group-hover:opacity-0">
						{isImage ? (
							<img
								alt={filename || "attachment"}
								className="size-5 object-cover"
								height={20}
								src={data.url}
								width={20}
							/>
						) : (
							<div className="flex size-5 items-center justify-center text-muted-foreground">
								<PaperclipIcon className="size-3" />
							</div>
						)}
					</div>
					<Button
						aria-label="Remove attachment"
						className="absolute inset-0 size-5 cursor-pointer rounded p-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&>svg]:size-2.5"
						onClick={(e) => {
							e.stopPropagation();
							attachments.remove(data.id);
						}}
						type="button"
						variant="ghost"
					>
						<XIcon />
						<span className="sr-only">Remove</span>
					</Button>
				</div>
				<span className="flex-1 truncate">{attachmentLabel}</span>
			</HoverCardTrigger>
			<PromptInputHoverCardContent className="w-auto p-2">
				<div className="w-auto space-y-3">
					{isImage && (
						<div className="flex max-h-96 w-96 items-center justify-center overflow-hidden rounded-md border">
							<img
								alt={filename || "attachment preview"}
								className="max-h-full max-w-full object-contain"
								height={384}
								src={data.url}
								width={448}
							/>
						</div>
					)}
					<div className="flex items-center gap-2.5">
						<div className="min-w-0 flex-1 space-y-1 px-0.5">
							<h4 className="truncate font-semibold text-sm leading-none">
								{filename || (isImage ? "Image" : "Attachment")}
							</h4>
							{data.mediaType && (
								<p className="truncate font-mono text-muted-foreground text-xs">{data.mediaType}</p>
							)}
						</div>
					</div>
				</div>
			</PromptInputHoverCardContent>
		</PromptInputHoverCard>
	);
}

export type PromptInputAttachmentsProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
	children: (attachment: FileUIPart & { id: string }) => ReactNode;
};

export function PromptInputAttachments({
	children,
	className,
	...props
}: PromptInputAttachmentsProps) {
	const attachments = usePromptInputAttachments();

	if (!attachments.files.length) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2 p-3 w-full", className)} {...props}>
			{attachments.files.map((file) => (
				<Fragment key={file.id}>{children(file)}</Fragment>
			))}
		</div>
	);
}

export type PromptInputActionAddAttachmentsProps = ComponentProps<typeof DropdownMenuItem> & {
	label?: string;
};

export const PromptInputActionAddAttachments = ({
	label = "Add photos or files",
	...props
}: PromptInputActionAddAttachmentsProps) => {
	const attachments = usePromptInputAttachments();

	return (
		<DropdownMenuItem
			{...props}
			onSelect={(e) => {
				e.preventDefault();
				attachments.openFileDialog();
			}}
		>
			<ImageIcon className="mr-2 size-4" /> {label}
		</DropdownMenuItem>
	);
};

export type PromptInputAttachmentButtonProps = ComponentProps<typeof InputGroupButton> & {
	accept?: string;
	multiple?: boolean;
	icon?: ReactNode;
	label?: string;
};

export const PromptInputAttachmentButton = ({
	accept = "image/*",
	multiple = true,
	icon,
	label,
	className,
	...props
}: PromptInputAttachmentButtonProps) => {
	const attachments = usePromptInputAttachments();
	const inputRef = useRef<HTMLInputElement>(null);

	const isImageOnly = accept.includes("image/") && !accept.includes("application/");

	const handleClick = () => {
		inputRef.current?.click();
	};

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			attachments.add(e.target.files);
		}
		e.target.value = "";
	};

	const defaultIcon = isImageOnly ? (
		<ImageIcon className="size-4" />
	) : (
		<PaperclipIcon className="size-4" />
	);

	const accessibleLabel = label ?? (isImageOnly ? "Add image" : "Add file");

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={handleChange}
				className="hidden"
				aria-label={accessibleLabel}
			/>
			<InputGroupButton
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={handleClick}
				className={cn("text-muted-foreground hover:text-foreground", className)}
				aria-label={accessibleLabel}
				{...props}
			>
				{icon ?? defaultIcon}
			</InputGroupButton>
		</>
	);
};
