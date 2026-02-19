import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Model } from "@/stores/model";
import { cn } from "@/lib/utils";
import { getModelById, useModelStore, useModels } from "@/stores/model";
import { useFavoriteModels } from "@/hooks/use-favorite-models";
import { useUIStore } from "@/stores/ui";
import { ChevronDownIcon } from "@/components/icons";
import { ModelInfoPanel } from "@/components/model-info-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ModelItem } from "./model-selector/model-item";
import { ProviderLogo } from "./model-selector/provider-logo";
import {
	useUniqueProviders,
	useFilteredModels,
	CloseIcon,
	ModelSearchInput,
	DesktopProviderSidebar,
	MobileProviderBar,
	ModelListEmpty,
	ModelListFooter,
} from "./model-selector/model-filter";

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	return isMobile;
}

interface ModelSelectorProps {
	value: string;
	onValueChange: (modelId: string) => void;
	onInfoOpen?: (model: Model) => void;
	className?: string;
	disabled?: boolean;
}

export function ModelSelector({
	value,
	onValueChange,
	onInfoOpen,
	className,
	disabled = false,
}: ModelSelectorProps) {
	const [query, setQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
	const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
	const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, openAbove: false });
	const [hasEverOpened, setHasEverOpened] = useState(false);
	const [visible, setVisible] = useState(false);
	const [hoveredInfoModel, setHoveredInfoModel] = useState<Model | null>(null);

	const infoHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const showInfoPanel = useCallback((model: Model) => {
		if (infoHoverTimerRef.current) clearTimeout(infoHoverTimerRef.current);
		infoHoverTimerRef.current = setTimeout(() => setHoveredInfoModel(model), 250);
	}, []);

	const hideInfoPanel = useCallback(() => {
		if (infoHoverTimerRef.current) clearTimeout(infoHoverTimerRef.current);
		infoHoverTimerRef.current = null;
		setHoveredInfoModel(null);
	}, []);

	const isMobile = useIsMobile();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	const open = visible;

	const { models, isLoading } = useModels();
	const { favorites, toggleFavorite, isFavorite, addDefaults, missingDefaultsCount } = useFavoriteModels();
	const filterStyle = useUIStore((s) => s.filterStyle);

	const deferredQuery = useDeferredValue(query);
	const isSearching = deferredQuery.trim().length > 0;

	const selectedModel = getModelById(models, value);

	const uniqueProviders = useUniqueProviders(models);
	const { flatList } = useFilteredModels(models, deferredQuery, selectedProvider, showFavoritesOnly, favorites);

	useEffect(() => {
		setHighlightedIndex(-1);
	}, [deferredQuery, selectedProvider, showFavoritesOnly]);

	const calculateDropdownPosition = useCallback(() => {
		if (!triggerRef.current || isMobile) return;
		const rect = triggerRef.current.getBoundingClientRect();
		const dropdownHeight = 520;
		const spaceAbove = rect.top;
		const spaceBelow = window.innerHeight - rect.bottom;

		if (spaceAbove > spaceBelow && spaceAbove >= dropdownHeight) {
			setDropdownPosition({ top: rect.top - dropdownHeight - 8, left: rect.left, openAbove: true });
		} else {
			setDropdownPosition({ top: rect.bottom + 8, left: rect.left, openAbove: false });
		}
	}, [isMobile]);

	useLayoutEffect(() => {
		if (open) calculateDropdownPosition();
	}, [open, calculateDropdownPosition]);

	const handleOpen = useCallback(() => {
		if (disabled) return;
		calculateDropdownPosition();
		flushSync(() => {
			setHasEverOpened(true);
			setVisible(true);
		});
		setQuery("");
		setHighlightedIndex(-1);
		setSelectedProvider(null);
		setShowFavoritesOnly(favorites.size > 0);
		requestAnimationFrame(() => { inputRef.current?.focus(); });
	}, [disabled, favorites.size, calculateDropdownPosition]);

	const handleClose = useCallback(() => {
		flushSync(() => { setVisible(false); });
		hideInfoPanel();
		triggerRef.current?.focus();
	}, [hideInfoPanel]);

	const handleSelect = useCallback(
		(modelId: string) => { onValueChange(modelId); handleClose(); },
		[onValueChange, handleClose],
	);

	const handleToggleFavorite = useCallback(
		(e: React.MouseEvent, modelId: string) => { e.stopPropagation(); toggleFavorite(modelId); },
		[toggleFavorite],
	);

	useEffect(() => {
		if (!open) return;
		function handleKeyDown(e: KeyboardEvent) {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setHighlightedIndex((prev) => (prev < flatList.length - 1 ? Math.max(0, prev + 1) : prev));
					break;
				case "ArrowUp":
					e.preventDefault();
					setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
					break;
				case "Enter":
					e.preventDefault();
					if (flatList[highlightedIndex]) handleSelect(flatList[highlightedIndex].id);
					break;
				case "Escape":
				case "Tab":
					e.preventDefault();
					handleClose();
					break;
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, flatList, highlightedIndex, handleSelect, handleClose]);

	useEffect(() => {
		if (!listRef.current || !open) return;
		const selectedElement = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
		if (selectedElement) selectedElement.scrollIntoView({ block: "nearest" });
	}, [highlightedIndex, open]);

	useEffect(() => {
		return () => { if (infoHoverTimerRef.current) clearTimeout(infoHoverTimerRef.current); };
	}, []);

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (target instanceof Element) {
				const infoPanel = target.closest("[data-model-info-panel]");
				if (infoPanel) return;
			}
			if (
				contentRef.current && !contentRef.current.contains(target) &&
				triggerRef.current && !triggerRef.current.contains(target)
			) {
				handleClose();
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open, handleClose]);

	const hasFavorites = favorites.size > 0;

	const handleToggleFavoritesFilter = useCallback(() => {
		if (hasFavorites) {
			setShowFavoritesOnly(true);
			setSelectedProvider(null);
		} else {
			addDefaults();
		}
	}, [hasFavorites, addDefaults]);

	const handleProviderChange = useCallback((providerId: string) => {
		if (selectedProvider !== providerId) {
			setSelectedProvider(providerId);
			setShowFavoritesOnly(false);
		}
	}, [selectedProvider]);

	const renderModelList = (variant: "mobile" | "desktop") => (
		<TooltipProvider delay={100}>
			{flatList.map((model, index) => (
				<ModelItem
					key={model.id}
					model={model}
					isSelected={model.id === value}
					isHighlighted={index === highlightedIndex}
					isFavorite={isFavorite(model.id)}
					onSelect={() => handleSelect(model.id)}
					onHover={() => setHighlightedIndex(index)}
					onInfoClick={() => onInfoOpen?.(model)}
					onInfoHover={variant === "desktop" ? () => showInfoPanel(model) : () => {}}
					onInfoClear={variant === "desktop" ? hideInfoPanel : () => {}}
					onToggleFavorite={(e) => handleToggleFavorite(e, model.id)}
					dataIndex={index}
				/>
			))}
		</TooltipProvider>
	);

	return (
		<div className={cn("relative inline-block", className)}>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => (open ? handleClose() : handleOpen())}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label="Select model"
				className={cn(
					"group flex items-center gap-1.5 md:gap-2",
					"h-10 md:h-9 px-3 md:px-3.5 rounded-xl",
					"text-sm text-muted-foreground",
					"bg-muted/40 hover:bg-muted/70 hover:text-foreground",
					"border border-border/40 hover:border-border/60",
					"shadow-sm shadow-black/5",
					"transition-all duration-200 ease-out",
					"disabled:cursor-not-allowed disabled:opacity-50",
					open && "bg-muted/70 text-foreground border-border/60",
				)}
			>
				{selectedModel ? (
					<>
						<ProviderLogo providerId={selectedModel.logoId} className="size-4" />
						<span className="truncate max-w-[80px] md:max-w-[140px] font-medium">{selectedModel.name}</span>
					</>
				) : (
					<span className="font-medium">{isLoading ? "Loading..." : "Select model"}</span>
				)}
				<ChevronDownIcon className={cn(
					"size-3.5 text-muted-foreground/60 transition-transform duration-200 shrink-0",
					open && "rotate-180"
				)} />
			</button>

			{hasEverOpened && createPortal(
				isMobile ? (
					<>
						<div
							className={cn(
								"fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm",
								"transition-opacity duration-150 ease-out",
								visible ? "opacity-100" : "opacity-0 pointer-events-none",
							)}
							onClick={handleClose}
						/>
						<div
							ref={contentRef}
							className={cn(
								"fixed inset-x-0 bottom-0 z-[9999] flex max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-popover text-popover-foreground shadow-2xl",
								"transition-all duration-200 ease-out",
								visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
							)}
							role="listbox"
							aria-label="Models"
						>
							<div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
								<h2 className="text-base font-semibold text-foreground">Select Model</h2>
								<button
									type="button"
									onClick={handleClose}
									className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent active:text-foreground"
									aria-label="Close"
								>
									<CloseIcon className="size-5" />
								</button>
							</div>

							<ModelSearchInput
								query={query}
								onQueryChange={setQuery}
								inputRef={inputRef}
								variant="mobile"
							/>

							{!isSearching && (
								<MobileProviderBar
									providers={uniqueProviders}
									selectedProvider={selectedProvider}
									onProviderChange={handleProviderChange}
									showFavoritesOnly={showFavoritesOnly}
									onToggleFavorites={handleToggleFavoritesFilter}
									hasFavorites={hasFavorites}
									filterStyle={filterStyle}
								/>
							)}

							<div ref={listRef} className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 scrollbar-thin">
								{isLoading ? (
									<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading models...</div>
								) : flatList.length === 0 ? (
									<ModelListEmpty
										isSearching={isSearching}
										showFavoritesOnly={showFavoritesOnly}
										onClearSearch={() => setQuery("")}
										onAddDefaults={addDefaults}
										variant="mobile"
									/>
								) : renderModelList("mobile")}
							</div>

							<ModelListFooter
								count={flatList.length}
								showFavoritesOnly={showFavoritesOnly}
								missingDefaultsCount={missingDefaultsCount}
								onAddDefaults={addDefaults}
								variant="mobile"
							/>
						</div>
					</>
				) : (
					<div
						ref={contentRef}
						style={{ position: "fixed", top: dropdownPosition.top, left: dropdownPosition.left }}
						className={cn(
							"z-[9999] flex items-start",
							"transition-all duration-150 ease-out",
							visible ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none",
							dropdownPosition.openAbove ? "origin-bottom-left" : "origin-top-left",
						)}
						onMouseLeave={hideInfoPanel}
					>
						<div
							style={{ height: Math.min(520, window.innerHeight - 80) }}
							className="flex w-[480px] rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
							role="listbox"
							aria-label="Models"
						>
							{!isSearching && (
								<DesktopProviderSidebar
									providers={uniqueProviders}
									selectedProvider={selectedProvider}
									onProviderChange={handleProviderChange}
									showFavoritesOnly={showFavoritesOnly}
									onToggleFavorites={handleToggleFavoritesFilter}
									hasFavorites={hasFavorites}
									filterStyle={filterStyle}
								/>
							)}

							<div className="flex min-w-0 flex-1 flex-col">
								<ModelSearchInput
									query={query}
									onQueryChange={setQuery}
									inputRef={inputRef}
									variant="desktop"
								/>

								<div ref={listRef} onMouseLeave={() => setHighlightedIndex(-1)} className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2 scrollbar-thin">
									{isLoading ? (
										<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading models...</div>
									) : flatList.length === 0 ? (
										<ModelListEmpty
											isSearching={isSearching}
											showFavoritesOnly={showFavoritesOnly}
											onClearSearch={() => setQuery("")}
											onAddDefaults={addDefaults}
											variant="desktop"
										/>
									) : renderModelList("desktop")}
								</div>

								<ModelListFooter
									count={flatList.length}
									showFavoritesOnly={showFavoritesOnly}
									missingDefaultsCount={missingDefaultsCount}
									onAddDefaults={addDefaults}
									variant="desktop"
								/>
							</div>
						</div>
						{hoveredInfoModel && (
							<div className="ml-2" data-model-info-panel>
								<ModelInfoPanel model={hoveredInfoModel} />
							</div>
						)}
					</div>
				),
				document.body
			)}
		</div>
	);
}

export function ConnectedModelSelector({
	className,
	disabled,
}: {
	className?: string;
	disabled?: boolean;
}) {
	const isMobile = useIsMobile();
	const selectedModelId = useModelStore((state) => state.selectedModelId);
	const setSelectedModel = useModelStore((state) => state.setSelectedModel);
	const [infoModel, setInfoModel] = useState<Model | null>(null);

	const handleInfoOpen = useCallback(
		(model: Model) => { if (!isMobile) return; setInfoModel(model); },
		[isMobile],
	);

	return (
		<>
			<ModelSelector
				value={selectedModelId}
				onValueChange={setSelectedModel}
				onInfoOpen={handleInfoOpen}
				className={className}
				disabled={disabled}
			/>

			<Dialog
				open={infoModel !== null}
				onOpenChange={(nextOpen) => { if (!nextOpen) setInfoModel(null); }}
			>
				<DialogContent className="max-w-[calc(100%-1rem)] gap-3 rounded-3xl p-4 sm:max-w-lg" showCloseButton>
					<DialogHeader className="pr-10">
						<DialogTitle>Model info</DialogTitle>
					</DialogHeader>
					{infoModel && (
						<div data-model-info-panel className="overflow-auto">
							<ModelInfoPanel model={infoModel} className="w-full max-w-none shadow-none" />
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
