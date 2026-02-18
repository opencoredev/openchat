import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

// Inline error message component (like T3.chat) - displayed in message thread
export interface InlineErrorMessageProps {
	error: {
		code: string;
		message: string;
		details?: string;
		provider?: string;
		retryable?: boolean;
	};
	onRetry?: () => void;
}

export function InlineErrorMessage({ error, onRetry }: InlineErrorMessageProps) {
	const [showDetails, setShowDetails] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [isRetrying, setIsRetrying] = useState(false);

	const MAX_RETRIES = 3;
	const retriesRemaining = MAX_RETRIES - retryCount;
	const canRetry = error.retryable && onRetry && retryCount < MAX_RETRIES;

	// Exponential backoff: 1s, 2s, 4s
	const getBackoffDelay = (attempt: number) => Math.pow(2, attempt) * 1000;

	const handleRetry = async () => {
		if (!canRetry || isRetrying) return;

		setIsRetrying(true);
		const delay = getBackoffDelay(retryCount);

		// Wait for backoff delay
		await new Promise((resolve) => setTimeout(resolve, delay));

		setRetryCount((prev) => prev + 1);
		setIsRetrying(false);

		onRetry();
	};

	// Get human-readable error title based on code
	const getErrorTitle = (code: string) => {
		switch (code) {
			case "rate_limit":
				return "Rate Limit Exceeded";
			case "auth_error":
				return "Authentication Error";
			case "context_length":
				return "Context Too Long";
			case "content_filter":
				return "Content Filtered";
			case "model_error":
				return "Model Error";
			case "network_error":
				return "Network Error";
			default:
				return "Error";
		}
	};

	return (
		<div className="w-full rounded-xl border border-destructive/30 bg-destructive/10 p-4">
			<div className="flex items-start gap-3">
				<div className="flex-shrink-0 mt-0.5">
					<svg
						className="size-5 text-destructive"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-medium text-destructive">{getErrorTitle(error.code)}</h4>
					<p className="mt-1 text-sm text-destructive/80">{error.message}</p>
					{error.provider && (
						<p className="mt-1 text-xs text-destructive/60">Provider: {error.provider}</p>
					)}
					{error.details && (
						<div className="mt-2">
							<button
								onClick={() => setShowDetails(!showDetails)}
								className="text-xs text-destructive/60 hover:text-destructive transition-colors"
							>
								{showDetails ? "Hide details" : "Show details"}
							</button>
							{showDetails && (
								<pre className="mt-2 p-2 rounded bg-destructive/20 text-xs text-destructive/70 overflow-x-auto max-h-32 overflow-y-auto">
									{error.details}
								</pre>
							)}
						</div>
					)}
					{error.retryable && onRetry && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handleRetry}
							disabled={!canRetry || isRetrying}
							className={cn(
								"mt-3 transition-all",
								canRetry
									? "text-destructive hover:text-destructive/80 hover:bg-destructive/20"
									: "text-destructive/40 cursor-not-allowed",
							)}
						>
							{isRetrying ? (
								<>
									<Loader2Icon className="mr-1.5 size-3 animate-spin" />
									Retrying...
								</>
							) : retryCount >= MAX_RETRIES ? (
								"Max retries reached"
							) : (
								`Retry (${retriesRemaining} left)`
							)}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
