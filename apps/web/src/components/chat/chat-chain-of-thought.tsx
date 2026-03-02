import { BrainIcon, SearchIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import {
	ChainOfThought as AiChainOfThought,
	ChainOfThoughtContent as AiChainOfThoughtContent,
	ChainOfThoughtHeader as AiChainOfThoughtHeader,
	ChainOfThoughtStep as AiChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { SearchResultsDisplay } from "./search-results-display";

export interface ChainOfThoughtStep {
	id: string;
	type: "reasoning" | "tool";
	label: string;
	content?: string;
	toolName?: string;
	toolInput?: unknown;
	toolOutput?: unknown;
	toolState?: "input-streaming" | "input-available" | "output-available" | "output-error";
	errorText?: string;
	status: "complete" | "active" | "pending" | "error";
}

type ChainPart = {
	type: string;
	state?: string;
	text?: string;
	toolCallId?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asChainPart(value: unknown): ChainPart | null {
	const rec = asRecord(value);
	if (!rec || typeof rec.type !== "string") return null;
	return {
		type: rec.type,
		state: typeof rec.state === "string" ? rec.state : undefined,
		text: typeof rec.text === "string" ? rec.text : undefined,
		toolCallId: typeof rec.toolCallId === "string" ? rec.toolCallId : undefined,
		input: rec.input,
		output: rec.output,
		errorText: typeof rec.errorText === "string" ? rec.errorText : undefined,
	};
}

function asToolState(
	state: string | undefined,
): "input-streaming" | "input-available" | "output-available" | "output-error" | undefined {
	if (
		state === "input-streaming" ||
		state === "input-available" ||
		state === "output-available" ||
		state === "output-error"
	) {
		return state;
	}
	return undefined;
}

function getToolQuery(input: unknown): string | undefined {
	const rec = asRecord(input);
	return rec && typeof rec.query === "string" ? rec.query : undefined;
}

export function buildChainOfThoughtSteps(
	parts: Array<unknown>,
	reasoningRequested = false,
): {
	steps: Array<ChainOfThoughtStep>;
	isAnyStreaming: boolean;
	hasTextContent: boolean;
} {
	const steps: Array<ChainOfThoughtStep> = [];
	let isAnyStreaming = false;
	let hasTextContent = false;

	for (let i = 0; i < parts.length; i++) {
		const part = asChainPart(parts[i]);
		if (!part) continue;

		if (part.type === "text") {
			hasTextContent = true;
			continue;
		}

		if (part.type === "reasoning") {
			if (!reasoningRequested) {
				continue;
			}
			const isStreaming = part.state === "streaming";
			if (isStreaming) isAnyStreaming = true;

			steps.push({
				id: `reasoning-${i}`,
				type: "reasoning",
				label: isStreaming ? "Thinking..." : "Thought process",
				content: part.text || "",
				status: isStreaming ? "active" : "complete",
			});
		} else if (
			typeof part.type === "string" &&
			part.type.startsWith("tool-") &&
			part.type !== "tool-call" &&
			part.type !== "tool-result"
		) {
			const toolName = part.type.replace("tool-", "");
			const isStreaming = part.state === "input-streaming";
			const isComplete = part.state === "output-available";
			const isError = part.state === "output-error";

			if (isStreaming) isAnyStreaming = true;

			steps.push({
				id: `tool-${part.toolCallId || i}`,
				type: "tool",
				label: toolName,
				toolName: toolName,
				toolInput: part.input,
				toolOutput: part.output,
				toolState: asToolState(part.state),
				errorText: part.errorText,
				status: isError ? "error" : isComplete ? "complete" : "active",
			});
		}
	}

	if (steps.length === 0 && reasoningRequested) {
		steps.push({
			id: "reasoning-requested-no-content",
			type: "reasoning",
			label: "Thought process",
			content: "",
			status: "complete",
		});
	}

	return { steps, isAnyStreaming, hasTextContent };
}

export interface ChainOfThoughtProps {
	steps: Array<ChainOfThoughtStep>;
	isStreaming?: boolean;
	hasTextContent?: boolean;
	thinkingTimeSec?: number;
	reasoningRequested?: boolean;
	reasoningTokenCount?: number;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function ChainOfThought({
	steps,
	isStreaming = false,
	thinkingTimeSec,
	reasoningRequested = false,
	reasoningTokenCount,
	open,
	onOpenChange,
}: ChainOfThoughtProps) {
	const hasToolSteps = steps.some((step) => step.type === "tool");
	const reasoningText = steps
		.filter((step) => step.type === "reasoning" && step.content)
		.map((step) => step.content ?? "")
		.join("\n\n")
		.trim();
	const shouldShowHiddenReasoning =
		reasoningRequested &&
		!reasoningText &&
		!isStreaming &&
		typeof reasoningTokenCount === "number" &&
		reasoningTokenCount > 0;
	const shouldShowNoReasoningTokens =
		reasoningRequested &&
		!reasoningText &&
		!isStreaming &&
		typeof reasoningTokenCount === "number" &&
		reasoningTokenCount === 0;
	const shouldShowUnavailableReasoning =
		reasoningRequested &&
		!reasoningText &&
		!isStreaming &&
		!shouldShowHiddenReasoning &&
		!shouldShowNoReasoningTokens;
	const reasoningContent =
		reasoningText ||
		(shouldShowHiddenReasoning
			? "Reasoning was used for this response, but the provider returned it in a hidden/encrypted format."
			: shouldShowNoReasoningTokens
				? "Reasoning was enabled, but this response used 0 reasoning tokens."
				: shouldShowUnavailableReasoning
					? "Reasoning was requested, but this provider did not return visible reasoning text for this response."
					: "Thinking...");

	if (!hasToolSteps) {
		if (
			!reasoningText &&
			!isStreaming &&
			!shouldShowUnavailableReasoning &&
			!shouldShowHiddenReasoning &&
			!shouldShowNoReasoningTokens
		) {
			return null;
		}

		return (
			<Reasoning
				isStreaming={isStreaming}
				open={open}
				defaultOpen={isStreaming}
				onOpenChange={onOpenChange}
				duration={thinkingTimeSec}
			>
				<ReasoningTrigger
					getThinkingMessage={(streaming, duration) => {
						if (shouldShowUnavailableReasoning) {
							return <p>Reasoning unavailable</p>;
						}
						if (shouldShowHiddenReasoning) {
							return <p>Reasoning hidden</p>;
						}
						if (shouldShowNoReasoningTokens) {
							return <p>No reasoning used</p>;
						}
						if (streaming) {
							return <p>Thinking...</p>;
						}
						if (duration === undefined || duration === 0) {
							return <p>Thought process</p>;
						}
						return <p>Thought for {duration} seconds</p>;
					}}
				/>
				<ReasoningContent>{reasoningContent}</ReasoningContent>
			</Reasoning>
		);
	}

	const getToolLabel = (step: ChainOfThoughtStep) => {
		const query = getToolQuery(step.toolInput);
		if (step.toolState === "output-available") {
			return `Search: ${query || step.toolName || "tool"}`;
		}
		if (step.toolState === "output-error") {
			return `Search failed: ${query || step.toolName || "tool"}`;
		}
		return `Searching: ${query || step.toolName || "tool"}...`;
	};

	return (
		<AiChainOfThought
			open={open}
			defaultOpen={isStreaming}
			onOpenChange={onOpenChange}
			className="mb-3 max-w-none"
		>
			<AiChainOfThoughtHeader>
				{isStreaming ? "Thinking..." : `Thought through ${steps.length} steps`}
			</AiChainOfThoughtHeader>
			<AiChainOfThoughtContent>
				{steps.map((step) => {
					const mappedStatus =
						step.status === "active"
							? "active"
							: step.status === "pending"
								? "pending"
								: "complete";
					const label = step.type === "tool" ? getToolLabel(step) : "Thought process";
					return (
						<AiChainOfThoughtStep
							key={step.id}
							icon={step.type === "tool" ? SearchIcon : BrainIcon}
							label={label}
							status={mappedStatus}
							className={cn(step.status === "error" && "text-destructive")}
						>
							{step.type === "reasoning" && step.content && (
								<div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
									<Streamdown>{step.content}</Streamdown>
								</div>
							)}
							{step.type === "tool" &&
								step.toolState === "output-available" &&
								!!step.toolOutput && (
									<SearchResultsDisplay results={step.toolOutput} isExpanded />
								)}
							{step.type === "tool" &&
								step.toolState === "output-error" &&
								step.errorText && (
									<p className="text-xs text-destructive">{step.errorText}</p>
								)}
						</AiChainOfThoughtStep>
					);
				})}
			</AiChainOfThoughtContent>
		</AiChainOfThought>
	);
}
