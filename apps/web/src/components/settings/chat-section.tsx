/**
 * Chat Section — title length, delete confirmation
 */

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";
import type { ChatTitleLength } from "@/stores/chat-title";
import { useChatTitleStore } from "@/stores/chat-title";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TITLE_LENGTH_OPTIONS: Array<ChatTitleLength> = ["short", "standard", "long"];
const TITLE_LENGTH_LABELS: Record<ChatTitleLength, string> = {
	short: "Concise (2-4 words)",
	standard: "Standard (4-6 words)",
	long: "Descriptive (7-10 words)",
};

export function ChatSection() {
	const length = useChatTitleStore((s) => s.length);
	const setLength = useChatTitleStore((s) => s.setLength);
	const confirmDelete = useChatTitleStore((s) => s.confirmDelete);
	const setConfirmDelete = useChatTitleStore((s) => s.setConfirmDelete);
	const currentIndex = TITLE_LENGTH_OPTIONS.indexOf(length);
	const percentage = (currentIndex / (TITLE_LENGTH_OPTIONS.length - 1)) * 100;

	const handleClick = (index: number) => {
		setLength(TITLE_LENGTH_OPTIONS[index]);
	};

	const handleTrackClick = (e: MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const position = x / rect.width;
		const index = Math.round(position * (TITLE_LENGTH_OPTIONS.length - 1));
		handleClick(Math.max(0, Math.min(index, TITLE_LENGTH_OPTIONS.length - 1)));
	};

	const handleTrackKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const lastIndex = TITLE_LENGTH_OPTIONS.length - 1;
		let nextIndex = currentIndex;

		if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
			nextIndex = Math.max(0, currentIndex - 1);
		} else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
			nextIndex = Math.min(lastIndex, currentIndex + 1);
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = lastIndex;
		} else {
			return;
		}

		event.preventDefault();
		handleClick(nextIndex);
	};

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Chat Titles
				</h2>
				<div className="rounded-xl border bg-card p-4 space-y-3">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Auto title length</p>
							<p className="text-sm text-muted-foreground">
								Controls how short or descriptive the AI chat names are.
							</p>
						</div>
						<span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
							{TITLE_LENGTH_LABELS[length]}
						</span>
					</div>

					<div className="space-y-2">
						<div
							className="relative h-2 cursor-pointer"
							onClick={handleTrackClick}
							onKeyDown={handleTrackKeyDown}
							role="slider"
							tabIndex={0}
							aria-valuemin={0}
							aria-valuemax={TITLE_LENGTH_OPTIONS.length - 1}
							aria-valuenow={currentIndex}
							aria-valuetext={TITLE_LENGTH_LABELS[length]}
						>
							<div className="absolute inset-0 bg-muted rounded-full" />
							<div
								className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-150"
								style={{ width: `${percentage}%` }}
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-md border-2 border-background transition-all duration-150"
								style={{ left: `calc(${percentage}% - 8px)` }}
							/>
							<div className="absolute inset-0 flex justify-between">
								{TITLE_LENGTH_OPTIONS.map((_, index) => (
									<button
										key={index}
										type="button"
										className="w-4 h-full z-10"
										onClick={(e) => {
											e.stopPropagation();
											handleClick(index);
										}}
									/>
								))}
							</div>
						</div>

						<div className="flex justify-between text-xs text-muted-foreground">
							{TITLE_LENGTH_OPTIONS.map((option, index) => (
								<button
									key={option}
									type="button"
									onClick={() => handleClick(index)}
									className={cn(
										"transition-colors hover:text-foreground",
										length === option && "text-foreground font-medium",
									)}
								>
									{TITLE_LENGTH_LABELS[option]}
								</button>
							))}
						</div>
					</div>
				</div>

				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Deletion
				</h2>
				<div className="rounded-xl border bg-card p-4 space-y-3">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Delete confirmation</p>
							<p className="text-sm text-muted-foreground">
								Require confirmation before deleting a chat.
							</p>
						</div>
						<Switch
							id="confirm-delete"
							checked={confirmDelete}
							onCheckedChange={setConfirmDelete}
						/>
					</div>
				</div>


			</section>
		</div>
	);
}
