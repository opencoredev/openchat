import { useState } from "react";
import { CheckCircleIcon, DatabaseIcon, RefreshCwIcon, ZapIcon } from "lucide-react";
import { getCacheStatus, useModels } from "@/stores/model";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function formatAge(ms: number | null) {
	if (!ms) return "Never";
	const minutes = Math.floor(ms / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function ModelsSection() {
	const { models, isLoading, reload, totalCount, error } = useModels();
	const cacheStatus = getCacheStatus();
	const [isReloading, setIsReloading] = useState(false);
	const filterStyle = useUIStore((s) => s.filterStyle);
	const setFilterStyle = useUIStore((s) => s.setFilterStyle);

	const handleReload = async () => {
		setIsReloading(true);
		try {
			await reload();
		} finally {
			setIsReloading(false);
		}
	};

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Filter Display
				</h2>
				<div className="rounded-xl border bg-card p-4 space-y-3">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Provider filter labels</p>
							<p className="text-sm text-muted-foreground">
								Show company names (OpenAI, Meta Llama) or model names (GPT, Llama) in filters.
							</p>
						</div>
						<div className="flex items-center gap-1 rounded-lg bg-muted p-1">
							<button
								onClick={() => setFilterStyle("model")}
								className={cn(
									"rounded-md px-3 py-1.5 text-xs font-medium transition-all",
									filterStyle === "model"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Model
							</button>
							<button
								onClick={() => setFilterStyle("company")}
								className={cn(
									"rounded-md px-3 py-1.5 text-xs font-medium transition-all",
									filterStyle === "company"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Company
							</button>
						</div>
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Model Source
				</h2>
				<div className="rounded-xl border bg-card p-4">
					<div className="flex items-start gap-4">
						<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600">
							<ZapIcon className="size-6 text-white" />
						</div>
						<div className="flex-1 space-y-1">
							<div className="flex items-center gap-2">
								<p className="font-semibold">OpenRouter</p>
								<span className="rounded-full px-2 py-0.5 text-caption font-medium bg-info/10 text-info">
									FULL CATALOG
								</span>
							</div>
							<p className="text-sm text-muted-foreground">
								Full access to 350+ models via OpenRouter API
							</p>
						</div>
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Model Cache
				</h2>
				<div className="rounded-xl border bg-card">
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
								<DatabaseIcon className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm font-medium">Models Loaded</p>
								<p className="text-sm text-muted-foreground">
									{isLoading ? "Loading..." : `${totalCount} models available`}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							{cacheStatus.hasData && !cacheStatus.isStale && (
								<span className="flex items-center gap-1 text-xs text-success">
									<CheckCircleIcon className="size-3.5" />
									Fresh
								</span>
							)}
							{cacheStatus.isStale && <span className="text-xs text-warning">Stale</span>}
						</div>
					</div>

					<Separator />

					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
								<RefreshCwIcon className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm font-medium">Last Updated</p>
								<p className="text-sm text-muted-foreground">{formatAge(cacheStatus.age)}</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleReload}
							disabled={isReloading || isLoading}
							className="gap-2"
						>
							<RefreshCwIcon
								className={cn("size-4", (isReloading || isLoading) && "animate-spin")}
							/>
							{isReloading ? "Refreshing..." : "Refresh"}
						</Button>
					</div>

					{error && (
						<>
							<Separator />
							<div className="p-4">
								<p className="text-sm text-destructive">Error loading models: {error.message}</p>
							</div>
						</>
					)}
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Available Models
				</h2>
				<div className="rounded-xl border bg-card">
					{isLoading ? (
						<div className="p-4 text-center text-sm text-muted-foreground">Loading models...</div>
					) : (
						<div className="divide-y divide-border">
							{models.slice(0, 8).map((model) => (
								<div key={model.id} className="flex items-center gap-3 p-3">
									<img
										src={`https://models.dev/logos/${model.logoId}.svg`}
										alt={model.provider}
										className="size-5 dark:invert"
										onError={(e) => {
											e.currentTarget.style.display = "none";
										}}
									/>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate">{model.name}</p>
										<p className="text-xs text-muted-foreground">{model.provider}</p>
									</div>
									{model.isPopular && (
										<span className="rounded-full bg-warning/10 px-2 py-0.5 text-caption font-medium text-warning">
											POPULAR
										</span>
									)}
									{model.isFree && (
										<span className="rounded-full bg-success/10 px-2 py-0.5 text-caption font-medium text-success">
											FREE
										</span>
									)}
								</div>
							))}
							{totalCount > 8 && (
								<div className="p-3 text-center text-xs text-muted-foreground">
									+{totalCount - 8} more models available
								</div>
							)}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
