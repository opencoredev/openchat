import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProviderLogo({ providerId, className }: { providerId: string; className?: string }) {
	const [hasError, setHasError] = useState(false);

	if (hasError) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-md bg-muted/80 text-[10px] font-semibold uppercase text-muted-foreground",
					className || "size-4",
				)}
			>
				{providerId.charAt(0)}
			</div>
		);
	}

	return (
		<img
			alt={`${providerId} logo`}
			className={cn("size-4 dark:invert", className)}
			height={16}
			width={16}
			src={`https://models.dev/logos/${providerId}.svg`}
			onError={() => setHasError(true)}
		/>
	);
}
