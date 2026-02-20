import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useOpenRouterKey } from "@/stores/openrouter";
import { DAILY_LIMIT_CENTS, isPreviewDeployment, useProviderStore } from "@/stores/provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OpenRouterConnectModal } from "@/components/openrouter-connect-modal";

export function ProvidersSection() {
	const { hasApiKey, clearApiKey, initialize, isInitialized } = useOpenRouterKey();
	const activeProvider = useProviderStore((s) => s.activeProvider);
	const setActiveProvider = useProviderStore((s) => s.setActiveProvider);
	const dailyUsageCents = useProviderStore((s) => s.dailyUsageCents);
	const remainingBudget = useProviderStore((s) => s.remainingBudgetCents());
	const [connectModalOpen, setConnectModalOpen] = useState(false);

	useEffect(() => {
		if (!isInitialized) {
			void initialize();
		}
	}, [isInitialized, initialize]);

	const handleDisconnect = (e: MouseEvent) => {
		e.stopPropagation();
		void clearApiKey();
		if (activeProvider === "openrouter") {
			setActiveProvider("osschat");
		}
	};

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					AI Provider
				</h2>
				<div className="grid gap-3">
					<button
						onClick={() => !isPreviewDeployment() && setActiveProvider("osschat")}
						disabled={isPreviewDeployment()}
						className={cn(
							"flex items-start gap-4 rounded-xl border p-4 text-left transition-all",
							isPreviewDeployment()
								? "cursor-not-allowed border-border bg-muted/50 opacity-60"
								: activeProvider === "osschat"
									? "border-primary bg-primary/5 ring-1 ring-primary/20"
									: "border-border bg-card hover:border-primary/50",
						)}
					>
						<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-cyan-500">
							<img
								src="https://models.dev/logos/openrouter.svg"
								alt="OpenRouter"
								className="size-6 invert"
								onError={(e) => {
									e.currentTarget.style.display = "none";
								}}
							/>
						</div>
						<div className="flex-1 space-y-1">
							<div className="flex items-center gap-2">
								<p className="font-semibold">OSSChat Cloud</p>
								<span className="rounded-full bg-success/10 px-2 py-0.5 text-caption font-medium text-success">
									FREE
								</span>
							</div>
							<p className="text-sm text-muted-foreground">
								350+ AI models with {DAILY_LIMIT_CENTS}¢ daily limit
							</p>
							{isPreviewDeployment() ? (
								<p className="mt-2 text-xs text-warning">
									Not available on preview deployments. Please use your own OpenRouter API key.
								</p>
							) : activeProvider === "osschat" ? (
								<div className="mt-3 space-y-2">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Daily Usage</span>
										<span className="font-medium">
											{dailyUsageCents.toFixed(2)}¢ / {DAILY_LIMIT_CENTS}¢
										</span>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className={cn(
												"h-full rounded-full transition-all",
												remainingBudget <= 0
													? "bg-destructive"
													: remainingBudget < DAILY_LIMIT_CENTS * 0.3
														? "bg-warning"
														: "bg-success",
											)}
											style={{
												width: `${Math.min(100, (dailyUsageCents / DAILY_LIMIT_CENTS) * 100)}%`,
											}}
										/>
									</div>
									{remainingBudget <= 0 && (
										<p className="text-xs text-destructive">
											Daily limit reached. Connect your own OpenRouter account for unlimited usage.
										</p>
									)}
								</div>
							) : null}
						</div>
						{activeProvider === "osschat" && !isPreviewDeployment() && (
							<svg
								className="size-5 shrink-0 text-primary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						)}
					</button>

					<div
						className={cn(
							"rounded-xl border p-4 transition-all",
							activeProvider === "openrouter"
								? "border-primary bg-primary/5 ring-1 ring-primary/20"
								: hasApiKey
									? "border-border bg-card"
									: "border-dashed border-border bg-card",
						)}
					>
						<button
							onClick={() => hasApiKey && setActiveProvider("openrouter")}
							disabled={!hasApiKey}
							className={cn("flex w-full items-start gap-4 text-left", !hasApiKey && "cursor-default")}
						>
							<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600">
								<img
									src="https://models.dev/logos/openrouter.svg"
									alt="OpenRouter"
									className="size-6 invert"
									onError={(e) => {
										e.currentTarget.style.display = "none";
									}}
								/>
							</div>
							<div className="flex-1 space-y-1">
								<div className="flex items-center gap-2">
									<p className="font-semibold">Personal OpenRouter</p>
									{hasApiKey && (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
											CONNECTED
										</span>
									)}
								</div>
								<p className="text-sm text-muted-foreground">
									{hasApiKey
										? "Unlimited access with your own API key"
										: "Use your own OpenRouter account for unlimited access"}
								</p>
							</div>
							{activeProvider === "openrouter" && (
								<svg
									className="size-5 shrink-0 text-primary"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
							)}
						</button>

						<div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
							{hasApiKey ? (
								<>
									<a
										href="https://openrouter.ai/settings/keys"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
										onClick={(e) => e.stopPropagation()}
									>
										Manage keys
										<svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
											/>
										</svg>
									</a>
									<Button
										variant="ghost"
										size="sm"
										onClick={handleDisconnect}
										className="h-7 text-xs"
									>
										Disconnect
									</Button>
								</>
							) : (
								<Button onClick={() => setConnectModalOpen(true)} size="sm" className="w-full h-8">
									Connect OpenRouter Account
								</Button>
							)}
						</div>
					</div>
				</div>
			</section>

			<OpenRouterConnectModal open={connectModalOpen} onOpenChange={setConnectModalOpen} />
		</div>
	);
}
