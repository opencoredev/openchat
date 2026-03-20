import { cn } from "@/lib/utils";

type AppLoadingPlaceholderProps = {
	/** Announced to screen readers */
	message?: string;
	className?: string;
	/** Matches authenticated shell: sidebar stub + main pane */
	variant?: "app-shell" | "simple";
};

/**
 * Accessible loading placeholder for route-level and auth-gated suspense states.
 */
export function AppLoadingPlaceholder({
	message = "Loading",
	className,
	variant = "simple",
}: AppLoadingPlaceholderProps) {
	if (variant === "app-shell") {
		return (
			<div
				className={cn("flex h-screen w-full bg-sidebar", className)}
				role="status"
				aria-live="polite"
				aria-busy="true"
			>
				<span className="sr-only">{message}</span>
				<div className="w-64 shrink-0 bg-sidebar" aria-hidden="true" />
				<div className="flex-1 bg-background" aria-hidden="true" />
			</div>
		);
	}

	return (
		<div
			className={cn("flex h-full w-full bg-background", className)}
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<span className="sr-only">{message}</span>
		</div>
	);
}
