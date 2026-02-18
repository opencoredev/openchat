import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { ArrowUpIcon, BrainIcon, GlobeIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController
} from "../ai-elements/prompt-input";
import { ConnectedModelSelector } from "../model-selector";

import type { PromptInputMessage } from "../ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { getModelById, getModelCapabilities, useModelStore, useModels } from "@/stores/model";
import { useWebSearch } from "@/stores/provider";
import { useAuth } from "@/lib/auth-client";

function useIsMac() {
	const [isMac, setIsMac] = useState(true);

	useEffect(() => {
		setIsMac(navigator.platform.toLowerCase().includes("mac"));
	}, []);

	return isMac;
}

interface PillButtonProps {
	icon: React.ReactNode;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	active?: boolean;
	className?: string;
	hideLabel?: boolean;
}

function PillButton({ icon, label, onClick, disabled, active, className, hideLabel }: PillButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={cn(
				"flex items-center justify-center gap-1.5",
				hideLabel ? "size-10 md:size-auto md:h-8 md:px-3" : "h-10 md:h-8 px-3",
				"rounded-full",
				"text-sm",
				"border transition-all duration-150",
				active
					? "bg-primary/10 text-primary border-primary/50 hover:bg-primary/20"
					: "text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground border-border/50",
				"disabled:opacity-50 disabled:cursor-not-allowed",
				className,
			)}
		>
			{icon}
			{!hideLabel && <span className="hidden md:inline">{label}</span>}
		</button>
	);
}

interface ToolbarToggleProps {
	disabled?: boolean;
}

function ReasoningToggleButton({ disabled }: ToolbarToggleProps) {
	const { selectedModelId, reasoningEnabled, setReasoningEnabled } = useModelStore();
	const { models } = useModels();
	const currentModel = getModelById(models, selectedModelId);
	const capabilities = getModelCapabilities(selectedModelId, currentModel);
	const supportsReasoning = capabilities.supportsReasoning;

	useEffect(() => {
		if (!supportsReasoning && reasoningEnabled) {
			setReasoningEnabled(false);
		}
	}, [supportsReasoning, reasoningEnabled, setReasoningEnabled]);

	if (!supportsReasoning) return null;

	return (
		<PillButton
			icon={<BrainIcon className="size-4" />}
			label="Reasoning"
			active={reasoningEnabled}
			disabled={disabled}
			onClick={() => setReasoningEnabled(!reasoningEnabled)}
		/>
	);
}

function WebSearchToggleButton({ disabled }: ToolbarToggleProps) {
	const {
		enabled: webSearchEnabled,
		toggle: toggleWebSearch,
		setEnabled: setWebSearchEnabled,
		remainingSearches: localRemainingSearches,
		isLimitReached: localIsLimitReached,
	} = useWebSearch();
	const { user } = useAuth();
	const convexUser = useQuery(
		api.users.getByExternalId,
		user?.id ? { externalId: user.id } : "skip",
	);
	const backendSearchAvailability = useQuery(
		api.search.getSearchAvailability,
		convexUser?._id ? { userId: convexUser._id } : "skip",
	);
	const isConfigured = backendSearchAvailability?.configured ?? true;
	const remainingSearches = backendSearchAvailability?.remaining ?? localRemainingSearches;
	const isLimitReached = backendSearchAvailability
		? !backendSearchAvailability.canSearch
		: localIsLimitReached;

	useEffect(() => {
		if (!isConfigured && webSearchEnabled) {
			setWebSearchEnabled(false);
		}
	}, [isConfigured, webSearchEnabled, setWebSearchEnabled]);

	const handleClick = () => {
		if (!isConfigured && !webSearchEnabled) {
			toast.error("Web search unavailable", {
				description: "Server search is not configured yet.",
			});
			return;
		}
		if (isLimitReached && !webSearchEnabled) {
			toast.error("Search limit reached", {
				description: "You've used your daily web searches. Limit resets tomorrow.",
			});
			return;
		}
		toggleWebSearch();
	};

	return (
		<PillButton
			icon={<GlobeIcon className="size-4" />}
			label={webSearchEnabled ? `Search (${remainingSearches})` : "Web Search"}
			active={webSearchEnabled}
			disabled={disabled || (!isConfigured && !webSearchEnabled) || (isLimitReached && !webSearchEnabled)}
			onClick={handleClick}
		/>
	);
}

interface SendButtonProps {
	isLoading: boolean;
	hasContent: boolean;
	onStop: () => void;
}

function SendButton({ isLoading, hasContent, onStop }: SendButtonProps) {
	if (isLoading) {
		return (
			<button
				type="button"
				onClick={onStop}
				className={cn(
					"flex items-center justify-center",
					"size-11 md:size-9 rounded-full",
					"bg-foreground text-background",
					"transition-all duration-150",
					"hover:scale-105 active:scale-95",
				)}
				aria-label="Stop generating"
			>
				<SquareIcon className="size-4" />
			</button>
		);
	}

	return (
		<button
			type="submit"
			disabled={!hasContent}
			className={cn(
				"flex items-center justify-center",
				"size-11 md:size-9 rounded-full",
				"transition-all duration-150",
				hasContent
					? "bg-primary text-primary-foreground hover:scale-105 active:scale-95"
					: "bg-muted text-muted-foreground cursor-not-allowed",
			)}
			aria-label="Send message"
		>
			<ArrowUpIcon className="size-4" />
		</button>
	);
}

export interface PremiumPromptInputProps {
	onSubmit: (message: PromptInputMessage) => Promise<void>;
	isLoading: boolean;
	onStop: () => void;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function PremiumPromptInputInner({
	onSubmit,
	isLoading,
	onStop,
	textareaRef,
}: PremiumPromptInputProps) {
	const controller = usePromptInputController();
	const hasContent = controller.textInput.value.trim().length > 0;
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isMac = useIsMac();
	const focusShortcut = isMac ? "⌘L" : "Ctrl+L";

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
