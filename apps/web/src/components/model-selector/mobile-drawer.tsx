import type React from "react";
import type { Model } from "@/stores/model";
import { cn } from "@/lib/utils";
import { SearchIcon } from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProviderLogo } from "./provider-logo";
import { ModelItem } from "./model-item";
import { CloseIcon, StarIcon } from "./icons";
import type { UniqueProvider } from "./use-model-filter";

export interface MobileDrawerProps {
	contentRef: React.RefObject<HTMLDivElement | null>;
	visible: boolean;
	isLoading: boolean;
	flatList: Model[];
	value: string;
	uniqueProviders: UniqueProvider[];
	query: string;
	setQuery: (q: string) => void;
	isSearching: boolean;
	hasFavorites: boolean;
	showFavoritesOnly: boolean;
	setShowFavoritesOnly: (v: boolean) => void;
	selectedProvider: string | null;
	setSelectedProvider: (p: string | null) => void;
	addDefaults: () => void;
	filterStyle: string;
	highlightedIndex: number;
	setHighlightedIndex: (i: number) => void;
	isFavorite: (id: string) => boolean;
	missingDefaultsCount: number;
	onSelect: (id: string) => void;
	onClose: () => void;
	onInfoOpen?: (model: Model) => void;
	onToggleFavorite: (e: React.MouseEvent, modelId: string) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	listRef: React.RefObject<HTMLDivElement | null>;
}

export function MobileDrawer({
	contentRef,
	visible,
	isLoading,
	flatList,
	value,
	uniqueProviders,
	query,
	setQuery,
	isSearching,
	hasFavorites,
	showFavoritesOnly,
	setShowFavoritesOnly,
	selectedProvider,
	setSelectedProvider,
	addDefaults,
	filterStyle,
	highlightedIndex,
	setHighlightedIndex,
	isFavorite,
	missingDefaultsCount,
	onSelect,
	onClose,
	onInfoOpen,
	onToggleFavorite,
	inputRef,
	listRef,
}: MobileDrawerProps) {
	return (
		<>
			<div
				className={cn(
					"fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm",
					"transition-opacity duration-150 ease-out",
					visible ? "opacity-100" : "opacity-0 pointer-events-none",
				)}
				onClick={onClose}
			/>
			<div
				ref={contentRef}
				className={cn(
					"fixed inset-x-0 bottom-0 z-[9999] flex max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-popover text-popover-foreground shadow-2xl",
					"transition-all duration-200 ease-out",
					visible
						? "translate-y-0 opacity-100"
						: "translate-y-full opacity-0 pointer-events-none",
				)}
				role="listbox"
				aria-label="Models"
			>
				<div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
					<h2 className="text-base font-semibold text-foreground">Select Model</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent active:text-foreground"
						aria-label="Close"
					>
						<CloseIcon className="size-5" />
					</button>
				</div>

				<div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
					<SearchIcon className="size-5 shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search all models..."
						className="min-h-[44px] flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground/60 outline-none"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
					/>
					{query && (
						<button
							onClick={() => {
								setQuery("");
								inputRef.current?.focus();
							}}
							className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent active:text-foreground"
						>
							<CloseIcon className="size-4" />
						</button>
					)}
				</div>

				{!isSearching && (
					<div className="flex items-center gap-2 overflow-x-auto border-b border-border/50 px-4 py-2.5 scrollbar-none">
						<button
							onClick={() => {
								if (hasFavorites) {
									setShowFavoritesOnly(true);
									setSelectedProvider(null);
								} else {
									addDefaults();
								}
							}}
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

						{uniqueProviders.slice(0, 8).map((provider) => (
							<button
								key={provider.id}
								onClick={() => {
									if (selectedProvider !== provider.id) {
										setSelectedProvider(provider.id);
										setShowFavoritesOnly(false);
									}
								}}
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
				)}

				<div ref={listRef} className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 scrollbar-thin">
					{isLoading ? (
						<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
							Loading models...
						</div>
					) : flatList.length === 0 ? (
						<div className="flex h-32 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
							<span className="text-muted-foreground/70">
								{isSearching ? "No models found" : showFavoritesOnly ? "No favorites yet" : "No models found"}
							</span>
							{isSearching ? (
								<button
									type="button"
									onClick={() => setQuery("")}
									className="min-h-[44px] rounded-xl bg-primary/10 px-4 text-sm font-medium text-primary transition-colors active:bg-primary/20"
								>
									Clear search
								</button>
							) : showFavoritesOnly ? (
								<button
									type="button"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										addDefaults();
									}}
									className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary/10 px-4 text-sm font-medium text-primary transition-colors active:bg-primary/20"
								>
									<StarIcon filled className="size-4" />
									Add suggested models
								</button>
							) : null}
						</div>
					) : (
						<TooltipProvider delay={100}>
							{flatList.map((model, index) => (
								<ModelItem
									key={model.id}
									model={model}
									isSelected={model.id === value}
									isHighlighted={index === highlightedIndex}
									isFavorite={isFavorite(model.id)}
									onSelect={() => onSelect(model.id)}
									onHover={() => setHighlightedIndex(index)}
									onInfoClick={() => onInfoOpen?.(model)}
									onInfoHover={() => {}}
									onInfoClear={() => {}}
									onToggleFavorite={(e) => onToggleFavorite(e, model.id)}
									dataIndex={index}
								/>
							))}
						</TooltipProvider>
					)}
				</div>

				<div className="flex items-center justify-between border-t border-border/50 bg-muted/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					{showFavoritesOnly && missingDefaultsCount > 0 ? (
						<button
							type="button"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								addDefaults();
							}}
							className="flex min-h-[44px] items-center gap-1.5 text-sm text-primary transition-colors active:text-primary/80"
						>
							<StarIcon filled className="size-3.5" />
							Add {missingDefaultsCount} suggested
						</button>
					) : (
						<span className="text-xs text-muted-foreground/60">Tap to select</span>
					)}
					<span className="text-sm tabular-nums text-muted-foreground/50">
						{flatList.length} model{flatList.length !== 1 ? "s" : ""}
					</span>
				</div>
			</div>
		</>
	);
}
