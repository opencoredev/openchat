/**
 * CompareModelSelector - Model selector for the secondary comparison model.
 *
 * Wraps the existing ModelSelector component, connecting it to the compare store
 * instead of the primary model store.
 */

import { useCallback, useState } from "react";
import { ModelSelector } from "@/components/model-selector";
import { useCompareStore } from "@/stores/compare";
import type { Model } from "@/stores/model";
import { useIsMobile } from "@/components/model-selector/use-model-filter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModelInfoPanel } from "@/components/model-info-panel";

export function CompareModelSelector({
	className,
	disabled,
}: {
	className?: string;
	disabled?: boolean;
}) {
	const isMobile = useIsMobile();
	const compareModelId = useCompareStore((state) => state.compareModelId);
	const setCompareModel = useCompareStore((state) => state.setCompareModel);
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
				value={compareModelId}
				onValueChange={setCompareModel}
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
