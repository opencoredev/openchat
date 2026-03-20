import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Model } from "@/stores/model";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getModelById, useModelStore, useModels } from "@/stores/model";
import { useFavoriteModels } from "@/hooks/use-favorite-models";
import { useUIStore } from "@/stores/ui";
import { ChevronDownIcon } from "@/components/icons";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModelInfoPanel } from "@/components/model-info-panel";

import { ProviderLogo } from "./model-selector/provider-logo";
import { MobileDrawer } from "./model-selector/mobile-drawer";
import { DesktopDropdown } from "./model-selector/desktop-dropdown";
import { useUniqueProviders, useFilteredModels, useFlatList } from "./model-selector/use-model-filter";

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
	const filteredModels = useFilteredModels(models, deferredQuery, selectedProvider, showFavoritesOnly, favorites);
	const flatList = useFlatList(filteredModels);

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
			setDropdownPosition({
				top: rect.top - dropdownHeight - 8,
				left: rect.left,
				openAbove: true,
			});
		} else {
			setDropdownPosition({
				top: rect.bottom + 8,
				left: rect.left,
				openAbove: false,
			});
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

		requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
	}, [disabled, favorites.size, calculateDropdownPosition]);

	const handleClose = useCallback(() => {
		flushSync(() => {
			setVisible(false);
		});
		hideInfoPanel();
		triggerRef.current?.focus();
	}, [hideInfoPanel]);

	const handleSelect = useCallback(
		(modelId: string) => {
			onValueChange(modelId);
			handleClose();
		},
		[onValueChange, handleClose],
	);

	const handleToggleFavorite = useCallback(
		(e: React.MouseEvent, modelId: string) => {
			e.stopPropagation();
			toggleFavorite(modelId);
		},
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
					if (flatList[highlightedIndex]) {
						handleSelect(flatList[highlightedIndex].id);
					}
					break;
				case "Escape":
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
		if (selectedElement) {
			selectedElement.scrollIntoView({ block: "nearest" });
		}
	}, [highlightedIndex, open]);

	useEffect(() => {
		return () => {
			if (infoHoverTimerRef.current) clearTimeout(infoHoverTimerRef.current);
		};
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
				contentRef.current &&
				!contentRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				handleClose();
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open, handleClose]);

	const hasFavorites = favorites.size > 0;

	const sharedProps = {
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
		onSelect: handleSelect,
		onClose: handleClose,
		onInfoOpen,
		onToggleFavorite: handleToggleFavorite,
		inputRef,
		listRef,
	};

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
					<MobileDrawer {...sharedProps} />
				) : (
					<DesktopDropdown
						{...sharedProps}
						dropdownPosition={dropdownPosition}
						hoveredInfoModel={hoveredInfoModel}
						showInfoPanel={showInfoPanel}
						hideInfoPanel={hideInfoPanel}
					/>
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
		(model: Model) => {
			if (!isMobile) return;
			setInfoModel(model);
		},
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
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setInfoModel(null);
					}
				}}
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
