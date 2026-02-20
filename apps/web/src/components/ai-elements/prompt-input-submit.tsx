import { CornerDownLeftIcon, Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";
import { InputGroupButton } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import type { ComponentProps } from "react";

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
	status?: ChatStatus;
};

export const PromptInputSubmit = ({
	className,
	variant = "default",
	size = "icon-sm",
	status,
	children,
	...props
}: PromptInputSubmitProps) => {
	let Icon = <CornerDownLeftIcon className="size-4" />;

	if (status === "submitted") {
		Icon = <Loader2Icon className="size-4 animate-spin" />;
	} else if (status === "streaming") {
		Icon = <SquareIcon className="size-4" />;
	} else if (status === "error") {
		Icon = <XIcon className="size-4" />;
	}

	return (
		<motion.div
			whileTap={{ scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 17 }}
			className="inline-flex"
		>
			<InputGroupButton
				aria-label="Submit"
				className={cn(className)}
				size={size}
				type="submit"
				variant={variant}
				{...props}
			>
				{children ?? Icon}
			</InputGroupButton>
		</motion.div>
	);
};
