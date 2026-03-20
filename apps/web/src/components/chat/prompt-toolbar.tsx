import { useEffectOnDeps } from "@/hooks/use-mount-effect";
import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { ArrowUpIcon, BrainIcon, GlobeIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getModelById, getModelCapabilities, useModelStore, useModels } from "@/stores/model";
import { useWebSearch } from "@/stores/provider";
import { useAuth } from "@/lib/auth-client";

export interface ToolbarToggleProps {
	disabled?: boolean;
}

export interface PillButtonProps {
	icon: React.ReactNode;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	active?: boolean;
	className?: string;
	hideLabel?: boolean;
}

export function PillButton({
	icon,
	label,
	onClick,
	disabled,
	active,
	className,
	hideLabel,
}: PillButtonProps) {
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

export function ReasoningToggleButton({ disabled }: ToolbarToggleProps) {
	const { selectedModelId, reasoningEnabled, setReasoningEnabled } = useModelStore();
	const { models } = useModels();
	const currentModel = getModelById(models, selectedModelId);
	const capabilities = getModelCapabilities(selectedModelId, currentModel);
	const supportsReasoning = capabilities.supportsReasoning;

	useEffectOnDeps(() => {
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

export function WebSearchToggleButton({ disabled }: ToolbarToggleProps) {
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

	useEffectOnDeps(() => {
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
			disabled={
				disabled ||
				(!isConfigured && !webSearchEnabled) ||
				(isLimitReached && !webSearchEnabled)
			}
			onClick={handleClick}
		/>
	);
}

export interface SendButtonProps {
	isLoading: boolean;
	hasContent: boolean;
	onStop: () => void;
}

export function SendButton({ isLoading, hasContent, onStop }: SendButtonProps) {
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
