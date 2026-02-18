import { cn } from "@/lib/utils";
import type { Model } from "@/stores/model";
import { ProviderLogo } from "./provider-logo";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function ThinkingIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
			/>
		</svg>
	);
}

function EyeIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
			/>
			<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
	);
}

function ToolIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3"
			/>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M3.375 19.5h17.25a1.125 1.125 0 0 0 1.125-1.125V5.625a1.125 1.125 0 0 0-1.125-1.125H3.375a1.125 1.125 0 0 0-1.125 1.125v12.75a1.125 1.125 0 0 0 1.125 1.125Z"
			/>
		</svg>
	);
}

function InfoIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
		>
			<circle cx="12" cy="12" r="9" />
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" />
			<circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
		</svg>
	);
}

export function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
			/>
		</svg>
	);
}

export interface ModelItemProps {
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
}

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
}: ModelItemProps) {
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
