import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type PromptInputSelectProps = ComponentProps<typeof Select>;

export const PromptInputSelect = (props: PromptInputSelectProps) => <Select {...props} />;

export type PromptInputSelectTriggerProps = ComponentProps<typeof SelectTrigger>;

export const PromptInputSelectTrigger = ({
	className,
	...props
}: PromptInputSelectTriggerProps) => (
	<SelectTrigger
		className={cn(
			"border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
			"hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
			className,
		)}
		{...props}
	/>
);

export type PromptInputSelectContentProps = ComponentProps<typeof SelectContent>;

export const PromptInputSelectContent = ({
	className,
	...props
}: PromptInputSelectContentProps) => <SelectContent className={cn(className)} {...props} />;

export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputSelectItem = ({ className, ...props }: PromptInputSelectItemProps) => (
	<SelectItem className={cn(className)} {...props} />
);

export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

export const PromptInputSelectValue = ({ className, ...props }: PromptInputSelectValueProps) => (
	<SelectValue className={cn(className)} {...props} />
);
