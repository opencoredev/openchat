import { useRef } from "react";
import { PaperclipIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ConnectedModelSelector } from "@/components/model-selector";
import { PillButton, ReasoningToggleButton, WebSearchToggleButton, SendButton } from "./prompt-toolbar";

export interface PremiumPromptInputProps {
	onSubmit: (message: PromptInputMessage) => Promise<void>;
	isLoading: boolean;
	onStop: () => void;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	focusShortcut: string;
}

export function PremiumPromptInputInner({
	onSubmit,
	isLoading,
	onStop,
	textareaRef,
	focusShortcut,
}: PremiumPromptInputProps) {
	const controller = usePromptInputController();
	const hasContent = controller.textInput.value.trim().length > 0;
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleAttachClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			controller.attachments.add(Array.from(files));
		}
		e.target.value = "";
	};

	return (
		<div
			className={cn(
				"relative rounded-2xl",
				"bg-background/90 backdrop-blur-xl",
				"border border-border/40",
				"shadow-lg shadow-black/5",
			)}
		>
			<PromptInput
				onSubmit={onSubmit}
				accept="image/*,application/pdf"
				multiple
				className="gap-0 border-0 bg-transparent shadow-none"
			>
				<PromptInputAttachments>
					{(attachment) => <PromptInputAttachment data={attachment} />}
				</PromptInputAttachments>

				<PromptInputTextarea
					ref={textareaRef}
					placeholder={`Message... (${focusShortcut} to focus)`}
					disabled={isLoading}
					className={cn(
						"min-h-[72px] md:min-h-[100px] py-3 md:py-4 px-4",
						"text-[15px] leading-relaxed",
						"placeholder:text-muted-foreground/50",
						"resize-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0",
					)}
				/>

				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.json"
					multiple
					className="hidden"
					onChange={handleFileChange}
				/>

				<PromptInputFooter className="px-2 md:px-3 pb-2 md:pb-3 pt-1 gap-1.5 md:gap-2">
					<PromptInputTools className="gap-1.5 md:gap-2 flex-1 min-w-0">
						<ConnectedModelSelector disabled={isLoading} />
						<ReasoningToggleButton disabled={isLoading} />
						<WebSearchToggleButton disabled={isLoading} />
						<PillButton
							icon={<PaperclipIcon className="size-4" />}
							label="Attach"
							onClick={handleAttachClick}
							disabled={isLoading}
							hideLabel
						/>
					</PromptInputTools>

					<PromptInputTools className="shrink-0">
						<SendButton isLoading={isLoading} hasContent={hasContent} onStop={onStop} />
					</PromptInputTools>
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
