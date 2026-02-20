import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ComponentProps } from "react";

export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

export const PromptInputHoverCard = ({ ...props }: PromptInputHoverCardProps) => (
	<HoverCard {...props} />
);

export type PromptInputHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export const PromptInputHoverCardTrigger = (props: PromptInputHoverCardTriggerProps) => (
	<HoverCardTrigger {...props} />
);

export type PromptInputHoverCardContentProps = ComponentProps<typeof HoverCardContent>;

export const PromptInputHoverCardContent = ({
	align = "start",
	...props
}: PromptInputHoverCardContentProps) => <HoverCardContent align={align} {...props} />;
