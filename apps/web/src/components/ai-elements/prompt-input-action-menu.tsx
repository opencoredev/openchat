import { PlusIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PromptInputButton, type PromptInputButtonProps } from "./prompt-input-primitives";

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;
export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
	<DropdownMenu {...props} />
);

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export const PromptInputActionMenuTrigger = ({
	className,
	children,
	...props
}: PromptInputActionMenuTriggerProps) => (
	<DropdownMenuTrigger render={<PromptInputButton className={className} {...props} />}>
		{children ?? <PlusIcon className="size-4" />}
	</DropdownMenuTrigger>
);

export type PromptInputActionMenuContentProps = ComponentProps<typeof DropdownMenuContent>;
export const PromptInputActionMenuContent = ({
	className,
	...props
}: PromptInputActionMenuContentProps) => (
	<DropdownMenuContent align="start" className={cn(className)} {...props} />
);

export type PromptInputActionMenuItemProps = ComponentProps<typeof DropdownMenuItem>;
export const PromptInputActionMenuItem = ({
	className,
	...props
}: PromptInputActionMenuItemProps) => <DropdownMenuItem className={cn(className)} {...props} />;
