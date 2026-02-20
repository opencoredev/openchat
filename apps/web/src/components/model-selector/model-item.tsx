import type { Model } from "@/stores/model";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ProviderLogo } from "./provider-logo";
import { StarIcon, EyeIcon, ThinkingIcon, ToolIcon, InfoIcon } from "./icons";

export function ModelItem({
	model,
	isSelected,
	isHighlighted,
	isFavorite,
	onSelect,
	onHover,
	onInfoClick,
	onInfoHover,
	onInfoClear,
	onToggleFavorite,
	dataIndex,
}: {
	model: Model;
	isSelected: boolean;
	isHighlighted: boolean;
	isFavorite: boolean;
	onSelect: () => void;
	onHover: () => void;
	onInfoClick: (e: React.MouseEvent) => void;
	onInfoHover: () => void;
	onInfoClear: () => void;
	onToggleFavorite: (e: React.MouseEvent) => void;
	dataIndex: number;
}) {
	const hasVision = model.modality?.includes("image");
	const hasReasoning = model.reasoning;

	return (
		<div
			data-index={dataIndex}
			onClick={onSelect}
			onMouseEnter={() => { onHover(); onInfoClear(); }}
			onKeyDown={(e) => e.key === "Enter" && onSelect()}
			role="option"
			tabIndex={0}
			aria-selected={isSelected}
			className={cn(
				"group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left outline-none transition-all duration-150 ease-out",
				isHighlighted && !isSelected && "bg-accent/60",
				!isHighlighted && !isSelected && "hover:bg-accent/40 active:bg-accent/60",
				isSelected && "bg-accent/40",
			)}
		>
			<ProviderLogo providerId={model.logoId} className="size-6 shrink-0" />

			<span className={cn(
				"min-w-0 flex-1 truncate text-sm font-semibold leading-tight tracking-tight transition-colors duration-150",
				isSelected ? "text-foreground" : "text-foreground/90 group-hover:text-foreground",
			)}>
				{model.name}
			</span>

			<div className="flex shrink-0 items-center gap-1.5">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleFavorite(e);
					}}
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
						isFavorite
							? "text-amber-400 hover:text-amber-300"
							: "text-muted-foreground/20 hover:text-amber-400 opacity-0 group-hover:opacity-100",
					)}
					title={isFavorite ? "Remove from favorites" : "Add to favorites"}
				>
					<StarIcon filled={isFavorite} className="size-4" />
				</button>

				{model.isFree && (
					<span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-emerald-500">
						Free
					</span>
				)}

				{hasVision && (
					<Tooltip>
						<TooltipTrigger render={<span />} className="flex size-6 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
							<EyeIcon className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={6} positionerClassName="z-[10000]">Vision</TooltipContent>
					</Tooltip>
				)}
				{hasReasoning && (
					<Tooltip>
						<TooltipTrigger render={<span />} className="flex size-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
							<ThinkingIcon className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={6} positionerClassName="z-[10000]">Reasoning</TooltipContent>
					</Tooltip>
				)}
				{model.toolCall && (
					<Tooltip>
						<TooltipTrigger render={<span />} className="flex size-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
							<ToolIcon className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={6} positionerClassName="z-[10000]">Tool Use</TooltipContent>
					</Tooltip>
				)}

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onInfoClick(e);
					}}
					onMouseEnter={(e) => {
						e.stopPropagation();
						onInfoHover();
					}}
					className="flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-all duration-150 hover:text-foreground hover:bg-accent/80"
				>
					<InfoIcon className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
