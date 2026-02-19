import type { UIMessage } from "ai";
import { toast } from "sonner";
import { getModelById, getModelCapabilities, useModelStore } from "@/stores/model";
import { useProviderStore } from "@/stores/provider";
import type { ReasoningPartWithState } from "./use-streaming-state";

export function getUserFriendlyError(message: string): string {
	const lowerMessage = message.toLowerCase();

	if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
		return "You're sending messages too quickly. Please wait a moment.";
	}
	if (lowerMessage.includes("unauthorized") || lowerMessage.includes("authentication")) {
		return "Session expired. Please refresh the page.";
	}
	if (lowerMessage.includes("not found")) {
		return "The requested resource could not be found.";
	}
	if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
		return "The request took too long. Please try again.";
	}
	if (lowerMessage.includes("network") || lowerMessage.includes("connection")) {
		return "Network error. Please check your connection and try again.";
	}

	return "An unexpected error occurred. Please try again.";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRuntimeModelConfig(models: any[], overrideModelId?: string) {
	const modelState = useModelStore.getState();
	const runtimeModelId = overrideModelId || modelState.selectedModelId;
	const runtimeReasoningEnabled = modelState.reasoningEnabled;
	const runtimeReasoningEffort = runtimeReasoningEnabled ? "medium" : "none";
	const runtimeModel = getModelById(models, runtimeModelId);
	const runtimeSupportsToolCalls = getModelCapabilities(
		runtimeModelId,
		runtimeModel,
	).supportsTools;
	return { runtimeModelId, runtimeReasoningEnabled, runtimeReasoningEffort, runtimeSupportsToolCalls };
}

export function checkProviderLimit(): boolean {
	const providerState = useProviderStore.getState();
	if (providerState.activeProvider === "osschat" && providerState.isOverLimit()) {
		toast.error("Daily limit reached", { description: "Add your OpenRouter API key to continue." });
		return true;
	}
	return false;
}

export function createInitialStreamParts(reasoningEffort: string): UIMessage["parts"] {
	const parts: UIMessage["parts"] = [];
	if (reasoningEffort !== "none") {
		const reasoningPart: ReasoningPartWithState = { type: "reasoning", text: "", state: "streaming" };
		parts.push(reasoningPart as UIMessage["parts"][number]);
	}
	parts.push({ type: "text", text: "", state: "streaming" });
	return parts;
}

export function messagesToTextHistory(msgs: Array<UIMessage>): Array<{ role: string; content: string }> {
	return msgs
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => {
			const textPart = m.parts.find((p): p is { type: "text"; text: string } => p.type === "text");
			return { role: m.role, content: textPart?.text || "" };
		});
}

export function createStreamMetadata(
	runtimeReasoningEffort: string,
	runtimeModelId: string,
	activeProvider: string,
	webSearchEnabled: boolean,
) {
	return {
		reasoningRequested: runtimeReasoningEffort !== "none",
		modelId: runtimeModelId,
		provider: activeProvider,
		reasoningEffort: runtimeReasoningEffort,
		webSearchEnabled,
		resumedFromActiveStream: false,
	};
}
