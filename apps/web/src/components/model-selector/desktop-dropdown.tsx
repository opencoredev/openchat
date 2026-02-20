import type React from "react";
import type { Model } from "@/stores/model";
import { cn } from "@/lib/utils";
import { SearchIcon } from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModelInfoPanel } from "@/components/model-info-panel";
import { ProviderLogo } from "./provider-logo";
import { ModelItem } from "./model-item";
import { CloseIcon, StarIcon } from "./icons";
import type { UniqueProvider } from "./use-model-filter";

export interface DesktopDropdownProps {
	contentRef: React.RefObject<HTMLDivElement | null>;
	visible: boolean;
	dropdownPosition: { top: number; left: number; openAbove: boolean };
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
	hoveredInfoModel: Model | null;
	onSelect: (id: string) => void;
	onClose: () => void;
	onInfoOpen?: (model: Model) => void;
	onToggleFavorite: (e: React.MouseEvent, modelId: string) => void;
	showInfoPanel: (model: Model) => void;
	hideInfoPanel: () => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	listRef: React.RefObject<HTMLDivElement | null>;
}

export function DesktopDropdown({
	contentRef,
	visible,
	dropdownPosition,
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
	hoveredInfoModel,
	onSelect,
	onInfoOpen,
	onToggleFavorite,
	showInfoPanel,
	hideInfoPanel,
	inputRef,
	listRef,
}: DesktopDropdownProps) {
	return (
		<div
			ref={contentRef}
			style={{
				position: "fixed",
				top: dropdownPosition.top,
				left: dropdownPosition.left,
			}}
			className={cn(
				"z-[9999] flex items-start",
				"transition-all duration-150 ease-out",
				visible
					? "scale-100 opacity-100"
					: "scale-95 opacity-0 pointer-events-none",
				dropdownPosition.openAbove ? "origin-bottom-left" : "origin-top-left",
			)}
			onMouseLeave={hideInfoPanel}
		>
			<div
				style={{
					height: Math.min(520, window.innerHeight - 80),
				}}
				className={cn(
					"flex w-[480px] rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl",
				)}
				role="listbox"
				aria-label="Models"
			>
				{!isSearching && (
					<div className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border/50 bg-muted/20 py-3">
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
							{uniqueProviders.slice(0, 6).map((provider) => (
								<button
									key={provider.id}
									onClick={() => {
										if (selectedProvider !== provider.id) {
											setSelectedProvider(provider.id);
											setShowFavoritesOnly(false);
										}
									}}
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
				)}

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
						<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search all models..."
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
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
								className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground"
								title="Clear search"
							>
								<CloseIcon className="size-3.5" />
							</button>
						)}
					</div>

					<div
						ref={listRef}
						onMouseLeave={() => setHighlightedIndex(-1)}
						className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2 scrollbar-thin"
					>
						{isLoading ? (
							<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
								Loading models...
							</div>
						) : flatList.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
								<span className="text-muted-foreground/70">
									{isSearching ? "No models found" : showFavoritesOnly ? "No favorites yet" : "No models found"}
								</span>
								{isSearching ? (
									<button
										type="button"
										onClick={() => setQuery("")}
										className="text-xs text-primary transition-colors hover:text-primary/80"
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
										className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
									>
										<StarIcon filled className="size-3" />
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
										onInfoHover={() => showInfoPanel(model)}
										onInfoClear={hideInfoPanel}
										onToggleFavorite={(e) => onToggleFavorite(e, model.id)}
										dataIndex={index}
									/>
								))}
							</TooltipProvider>
						)}
					</div>

					<div className="flex items-center justify-between border-t border-border/50 bg-muted/10 px-4 py-2">
						{showFavoritesOnly && missingDefaultsCount > 0 ? (
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									addDefaults();
								}}
								className="flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary/80"
							>
								<StarIcon filled className="size-3" />
								Add {missingDefaultsCount} suggested
							</button>
						) : (
							<div className="flex items-center gap-1.5 text-muted-foreground/60">
								<kbd className="inline-flex h-5 items-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px]">
									↑↓
								</kbd>
								<span className="text-[10px]">navigate</span>
								<kbd className="ml-1 inline-flex h-5 items-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px]">
									↵
								</kbd>
								<span className="text-[10px]">select</span>
							</div>
						)}
						<span className="text-[11px] tabular-nums text-muted-foreground/50">
							{flatList.length} model{flatList.length !== 1 ? "s" : ""}
						</span>
					</div>
				</div>
			</div>
			{hoveredInfoModel && (
				<div className="ml-2" data-model-info-panel>
					<ModelInfoPanel model={hoveredInfoModel} />
				</div>
			)}
		</div>
	);
}
