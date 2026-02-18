import type { RefObject } from "react";
import { useMemo } from "react";
import type { Model } from "@/stores/model";
import { cn } from "@/lib/utils";
import { SearchIcon } from "@/components/icons";
import { ProviderLogo } from "./provider-logo";
import { StarIcon } from "./model-item";

export interface ProviderInfo {
	id: string;
	name: string;
	modelName: string;
	logoId: string;
	count: number;
}

export function useUniqueProviders(models: Model[]): ProviderInfo[] {
	return useMemo(() => {
		const providerMap = new Map<string, ProviderInfo>();
		for (const model of models) {
			const existing = providerMap.get(model.providerId);
			if (existing) {
				existing.count++;
			} else {
				providerMap.set(model.providerId, {
					id: model.providerId,
					name: model.provider,
					modelName: model.modelName,
					logoId: model.logoId,
					count: 1,
				});
			}
		}
		return Array.from(providerMap.values()).sort((a, b) => b.count - a.count);
	}, [models]);
}

export function useFilteredModels(
	models: Model[],
	deferredQuery: string,
	selectedProvider: string | null,
	showFavoritesOnly: boolean,
	favorites: Set<string>,
) {
	const filteredModels = useMemo(() => {
		if (deferredQuery.trim()) {
			const q = deferredQuery.toLowerCase().replace(/[-_\s]/g, "");
			const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "");
			return models.filter(
				(model) =>
					normalize(model.name).includes(q) ||
					normalize(model.provider).includes(q) ||
					normalize(model.id).includes(q) ||
					(model.family && normalize(model.family).includes(q)),
			);
		}
		let result = models;
		if (showFavoritesOnly) {
			result = result.filter((m) => favorites.has(m.id));
		}
		if (selectedProvider) {
			result = result.filter((m) => m.providerId === selectedProvider);
		}
		return result;
	}, [models, deferredQuery, selectedProvider, showFavoritesOnly, favorites]);

	const flatList = useMemo(() => {
		const popularModels = filteredModels.filter((m) => m.isPopular);
		const otherModels = filteredModels.filter((m) => !m.isPopular);
		return [...popularModels, ...otherModels];
	}, [filteredModels]);

	return { filteredModels, flatList };
}

export function CloseIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
		</svg>
	);
}

export function ModelSearchInput({
	query,
	onQueryChange,
	inputRef,
	variant = "desktop",
}: {
	query: string;
	onQueryChange: (query: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	variant?: "mobile" | "desktop";
}) {
	const isMobile = variant === "mobile";

	return (
		<div className={cn(
			"flex items-center border-b border-border/50",
			isMobile ? "gap-3 px-4 py-3" : "gap-2.5 px-4 py-3",
		)}>
			<SearchIcon className={cn("shrink-0 text-muted-foreground", isMobile ? "size-5" : "size-4")} />
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={(e) => onQueryChange(e.target.value)}
				placeholder="Search all models..."
				className={cn(
					"flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 outline-none",
					isMobile ? "min-h-[44px] text-base" : "text-sm",
				)}
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
			/>
			{query && (
				<button
					onClick={() => {
						onQueryChange("");
						inputRef.current?.focus();
					}}
					className={cn(
						"flex items-center justify-center text-muted-foreground transition-all duration-150",
						isMobile
							? "size-10 rounded-full active:bg-accent active:text-foreground"
							: "size-6 rounded-lg hover:bg-accent hover:text-foreground",
					)}
					title="Clear search"
				>
					<svg className={cn(isMobile ? "size-4" : "size-3.5")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			)}
		</div>
	);
}

export interface ProviderFilterProps {
	providers: ProviderInfo[];
	selectedProvider: string | null;
	onProviderChange: (providerId: string) => void;
	showFavoritesOnly: boolean;
	onToggleFavorites: () => void;
	hasFavorites: boolean;
	filterStyle: string;
}

export function DesktopProviderSidebar({
	providers,
	selectedProvider,
	onProviderChange,
	showFavoritesOnly,
	onToggleFavorites,
	hasFavorites,
	filterStyle,
}: ProviderFilterProps) {
	return (
		<div className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border/50 bg-muted/20 py-3">
			<button
				onClick={onToggleFavorites}
				className={cn(
					"flex size-9 items-center justify-center rounded-xl transition-all duration-200",
					showFavoritesOnly
						? "bg-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/10"
						: "text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-105",
				)}
				title={hasFavorites ? "Show favorites" : "Add suggested favorites"}
			>
				<StarIcon filled={showFavoritesOnly || hasFavorites} className="size-[18px]" />
			</button>

			<div className="my-1.5 h-px w-7 bg-border/60" />

			<div className="flex flex-col gap-1.5 px-1">
				{providers.slice(0, 6).map((provider) => (
					<button
						key={provider.id}
						onClick={() => onProviderChange(provider.id)}
						className={cn(
							"flex size-9 items-center justify-center rounded-xl transition-all duration-200",
							selectedProvider === provider.id
								? "bg-accent text-foreground shadow-sm"
								: "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:scale-105",
						)}
						title={filterStyle === "company" ? provider.name : provider.modelName}
					>
						<ProviderLogo providerId={provider.logoId} className="size-5" />
					</button>
				))}
			</div>
		</div>
	);
}

export function MobileProviderBar({
	providers,
	selectedProvider,
	onProviderChange,
	showFavoritesOnly,
	onToggleFavorites,
	hasFavorites,
	filterStyle,
}: ProviderFilterProps) {
	return (
		<div className="flex items-center gap-2 overflow-x-auto border-b border-border/50 px-4 py-2.5 scrollbar-none">
			<button
				onClick={onToggleFavorites}
				className={cn(
					"flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-all duration-200",
					showFavoritesOnly
						? "bg-amber-500/20 text-amber-400"
						: "bg-muted/50 text-muted-foreground active:bg-accent active:text-foreground",
				)}
			>
				<StarIcon filled={showFavoritesOnly || hasFavorites} className="size-4" />
				<span>Favorites</span>
			</button>

			<div className="mx-1 h-5 w-px shrink-0 bg-border/60" />

			{providers.slice(0, 8).map((provider) => (
				<button
					key={provider.id}
					onClick={() => onProviderChange(provider.id)}
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-200",
						selectedProvider === provider.id
							? "bg-accent text-foreground"
							: "bg-muted/50 text-muted-foreground active:bg-accent active:text-foreground",
					)}
					title={filterStyle === "company" ? provider.name : provider.modelName}
				>
					<ProviderLogo providerId={provider.logoId} className="size-5" />
				</button>
			))}
		</div>
	);
}

export function ModelListEmpty({
	isSearching,
	showFavoritesOnly,
	onClearSearch,
	onAddDefaults,
	variant = "desktop",
}: {
	isSearching: boolean;
	showFavoritesOnly: boolean;
	onClearSearch: () => void;
	onAddDefaults: () => void;
	variant?: "mobile" | "desktop";
}) {
	const isMobile = variant === "mobile";

	return (
		<div className={cn(
			"flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground",
			isMobile ? "h-32" : "h-full",
		)}>
			<span className="text-muted-foreground/70">
				{isSearching ? "No models found" : showFavoritesOnly ? "No favorites yet" : "No models found"}
			</span>
			{isSearching ? (
				<button
					type="button"
					onClick={onClearSearch}
					className={cn(
						isMobile
							? "min-h-[44px] rounded-xl bg-primary/10 px-4 text-sm font-medium text-primary transition-colors active:bg-primary/20"
							: "text-xs text-primary transition-colors hover:text-primary/80",
					)}
				>
					Clear search
				</button>
			) : showFavoritesOnly ? (
				<button
					type="button"
					onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddDefaults(); }}
					className={cn(
						"flex items-center font-medium text-primary transition-colors",
						isMobile
							? "min-h-[44px] gap-2 rounded-xl bg-primary/10 px-4 text-sm active:bg-primary/20"
							: "gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs hover:bg-primary/20",
					)}
				>
					<StarIcon filled className={cn(isMobile ? "size-4" : "size-3")} />
					Add suggested models
				</button>
			) : null}
		</div>
	);
}

export function ModelListFooter({
	count,
	showFavoritesOnly,
	missingDefaultsCount,
	onAddDefaults,
	variant = "desktop",
}: {
	count: number;
	showFavoritesOnly: boolean;
	missingDefaultsCount: number;
	onAddDefaults: () => void;
	variant?: "mobile" | "desktop";
}) {
	const isMobile = variant === "mobile";

	return (
		<div className={cn(
			"flex items-center justify-between border-t border-border/50 bg-muted/10",
			isMobile ? "px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "px-4 py-2",
		)}>
			{showFavoritesOnly && missingDefaultsCount > 0 ? (
				<button
					type="button"
					onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddDefaults(); }}
					className={cn(
						"flex items-center text-primary transition-colors",
						isMobile
							? "min-h-[44px] gap-1.5 text-sm active:text-primary/80"
							: "gap-1 text-[11px] hover:text-primary/80",
					)}
				>
					<StarIcon filled className={cn(isMobile ? "size-3.5" : "size-3")} />
					Add {missingDefaultsCount} suggested
				</button>
			) : isMobile ? (
				<span className="text-xs text-muted-foreground/60">Tap to select</span>
			) : (
				<div className="flex items-center gap-1.5 text-muted-foreground/60">
					<kbd className="inline-flex h-5 items-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px]">↑↓</kbd>
					<span className="text-[10px]">navigate</span>
					<kbd className="ml-1 inline-flex h-5 items-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px]">↵</kbd>
					<span className="text-[10px]">select</span>
				</div>
			)}
			<span className={cn("tabular-nums text-muted-foreground/50", isMobile ? "text-sm" : "text-[11px]")}>
				{count} model{count !== 1 ? "s" : ""}
			</span>
		</div>
	);
}
