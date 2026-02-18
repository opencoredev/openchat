/**
 * Model Utilities — capability detection and lookup functions
 */

import type { Model } from "./model-data";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface ModelCapabilities {
	supportsReasoning: boolean;
	supportsEffortLevels: boolean;
	alwaysReasons: boolean;
	supportsTools: boolean;
}

export function getModelCapabilities(
	modelId: string,
	model?: Model | null,
): ModelCapabilities {
	const supportsReasoning = model?.reasoning === true;
	const alwaysReasons = /deepseek.*r1/i.test(modelId);
	const supportsEffort = supportsReasoning && !alwaysReasons;
	const supportsTools = model?.toolCall === true;

	return {
		supportsReasoning,
		supportsEffortLevels: supportsEffort,
		alwaysReasons,
		supportsTools,
	};
}

export function getModelById(
	modelList: Array<Model>,
	id: string,
): Model | undefined {
	return modelList.find((m) => m.id === id);
}
