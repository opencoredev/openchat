// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("streamdown", () => ({
	Streamdown: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock("@/components/ai-elements/chain-of-thought", () => ({
	ChainOfThought: ({ children, ...props }: any) => (
		<div data-testid="cot" {...props}>
			{children}
		</div>
	),
	ChainOfThoughtContent: ({ children }: any) => (
		<div data-testid="cot-content">{children}</div>
	),
	ChainOfThoughtHeader: ({ children }: any) => (
		<div data-testid="cot-header">{children}</div>
	),
	ChainOfThoughtStep: ({ children, label }: any) => (
		<div data-testid="cot-step" data-label={label}>
			{children}
		</div>
	),
}));

vi.mock("@/components/ai-elements/reasoning", () => ({
	Reasoning: ({ children }: any) => <div data-testid="reasoning">{children}</div>,
	ReasoningContent: ({ children }: any) => (
		<div data-testid="reasoning-content">{children}</div>
	),
	ReasoningTrigger: ({ getThinkingMessage }: any) => (
		<div data-testid="reasoning-trigger">
			<span data-testid="trigger-default">{getThinkingMessage(false, undefined)}</span>
			<span data-testid="trigger-streaming">{getThinkingMessage(true, undefined)}</span>
			<span data-testid="trigger-with-duration">{getThinkingMessage(false, 5)}</span>
		</div>
	),
}));

vi.mock("./url-utils", () => ({
	replaceUtmSource: (url: string) => url,
}));

vi.mock("lucide-react", () => ({
	BrainIcon: () => <span>brain</span>,
	SearchIcon: () => <span>search</span>,
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { buildChainOfThoughtSteps, ChainOfThought } from "../chat-chain-of-thought";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});


describe("buildChainOfThoughtSteps", () => {
	it("empty array returns empty steps, no streaming, no text", () => {
		const result = buildChainOfThoughtSteps([]);
		expect(result.steps).toEqual([]);
		expect(result.isAnyStreaming).toBe(false);
		expect(result.hasTextContent).toBe(false);
	});

	it("text part sets hasTextContent=true, steps remain empty", () => {
		const result = buildChainOfThoughtSteps([{ type: "text", text: "hello" }]);
		expect(result.hasTextContent).toBe(true);
		expect(result.steps).toHaveLength(0);
	});

	it("text part does not set isAnyStreaming", () => {
		const result = buildChainOfThoughtSteps([{ type: "text", text: "hi" }]);
		expect(result.isAnyStreaming).toBe(false);
	});

	it("reasoning part with reasoningRequested=false is ignored", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "thought" }],
			false,
		);
		expect(result.steps).toHaveLength(0);
	});

	it("reasoning part with reasoningRequested=true, state=streaming → active step, isAnyStreaming=true", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "streaming", text: "..." }],
			true,
		);
		expect(result.steps).toHaveLength(1);
		expect(result.steps[0].status).toBe("active");
		expect(result.isAnyStreaming).toBe(true);
	});

	it("reasoning part with reasoningRequested=true, state=complete → complete step", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "done" }],
			true,
		);
		expect(result.steps[0].status).toBe("complete");
		expect(result.isAnyStreaming).toBe(false);
	});

	it("reasoning part streaming → label='Thinking...'", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "streaming", text: "..." }],
			true,
		);
		expect(result.steps[0].label).toBe("Thinking...");
	});

	it("reasoning part complete → label='Thought process'", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "done" }],
			true,
		);
		expect(result.steps[0].label).toBe("Thought process");
	});

	it("reasoning step has type='reasoning'", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "done" }],
			true,
		);
		expect(result.steps[0].type).toBe("reasoning");
	});

	it("reasoning step id uses index", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "done" }],
			true,
		);
		expect(result.steps[0].id).toBe("reasoning-0");
	});

	it("reasoning step content is set from part.text", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "my thought" }],
			true,
		);
		expect(result.steps[0].content).toBe("my thought");
	});

	it("reasoning step with empty text still creates step with content=''", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete", text: "" }],
			true,
		);
		expect(result.steps).toHaveLength(1);
		expect(result.steps[0].content).toBe("");
	});

	it("tool part with state=input-streaming → isAnyStreaming=true, status=active", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-streaming", toolCallId: "abc" },
		]);
		expect(result.isAnyStreaming).toBe(true);
		expect(result.steps[0].status).toBe("active");
	});

	it("tool part with state=input-available → status=active", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-available", toolCallId: "abc" },
		]);
		expect(result.steps[0].status).toBe("active");
		expect(result.isAnyStreaming).toBe(false);
	});

	it("tool part with state=output-available → status=complete", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "output-available", toolCallId: "abc" },
		]);
		expect(result.steps[0].status).toBe("complete");
	});

	it("tool part with state=output-error → status=error", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "output-error", toolCallId: "abc" },
		]);
		expect(result.steps[0].status).toBe("error");
	});

	it("tool part uses toolCallId for id when present", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-available", toolCallId: "myid" },
		]);
		expect(result.steps[0].id).toBe("tool-myid");
	});

	it("tool part falls back to index for id when toolCallId absent", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-available" },
		]);
		expect(result.steps[0].id).toBe("tool-0");
	});

	it("tool-call type is ignored", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-call", state: "input-available" },
		]);
		expect(result.steps).toHaveLength(0);
	});

	it("tool-result type is ignored", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-result", state: "output-available" },
		]);
		expect(result.steps).toHaveLength(0);
	});

	it("tool step has type='tool'", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-available" },
		]);
		expect(result.steps[0].type).toBe("tool");
	});

	it("tool step toolName is extracted from type", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-available" },
		]);
		expect(result.steps[0].toolName).toBe("search");
	});

	it("tool step stores toolInput and toolOutput", () => {
		const input = { query: "test" };
		const output = { results: [] };
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "output-available", input, output },
		]);
		expect(result.steps[0].toolInput).toEqual(input);
		expect(result.steps[0].toolOutput).toEqual(output);
	});

	it("tool step stores errorText", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "output-error", errorText: "failed" },
		]);
		expect(result.steps[0].errorText).toBe("failed");
	});

	it("mixed parts: text + reasoning + tool → correct steps array", () => {
		const result = buildChainOfThoughtSteps(
			[
				{ type: "text", text: "hello" },
				{ type: "reasoning", state: "complete", text: "thought" },
				{ type: "tool-search", state: "output-available", toolCallId: "t1" },
			],
			true,
		);
		expect(result.hasTextContent).toBe(true);
		expect(result.steps).toHaveLength(2);
		expect(result.steps[0].type).toBe("reasoning");
		expect(result.steps[1].type).toBe("tool");
	});

	it("empty steps + reasoningRequested=true → injects placeholder step", () => {
		const result = buildChainOfThoughtSteps([], true);
		expect(result.steps).toHaveLength(1);
		expect(result.steps[0].id).toBe("reasoning-requested-no-content");
	});

	it("placeholder step has correct shape", () => {
		const result = buildChainOfThoughtSteps([], true);
		const step = result.steps[0];
		expect(step.type).toBe("reasoning");
		expect(step.label).toBe("Thought process");
		expect(step.content).toBe("");
		expect(step.status).toBe("complete");
	});

	it("empty steps + reasoningRequested=false → no placeholder", () => {
		const result = buildChainOfThoughtSteps([], false);
		expect(result.steps).toHaveLength(0);
	});

	it("multiple reasoning parts → multiple steps", () => {
		const result = buildChainOfThoughtSteps(
			[
				{ type: "reasoning", state: "complete", text: "first" },
				{ type: "reasoning", state: "complete", text: "second" },
			],
			true,
		);
		expect(result.steps).toHaveLength(2);
	});

	it("multiple reasoning parts have correct ids", () => {
		const result = buildChainOfThoughtSteps(
			[
				{ type: "reasoning", state: "complete", text: "first" },
				{ type: "reasoning", state: "complete", text: "second" },
			],
			true,
		);
		expect(result.steps[0].id).toBe("reasoning-0");
		expect(result.steps[1].id).toBe("reasoning-1");
	});

	it("isAnyStreaming is false when no streaming parts", () => {
		const result = buildChainOfThoughtSteps(
			[
				{ type: "reasoning", state: "complete", text: "done" },
				{ type: "tool-search", state: "output-available" },
			],
			true,
		);
		expect(result.isAnyStreaming).toBe(false);
	});

	it("isAnyStreaming is true when tool is streaming", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "input-streaming" },
		]);
		expect(result.isAnyStreaming).toBe(true);
	});

	it("tool step toolState is stored", () => {
		const result = buildChainOfThoughtSteps([
			{ type: "tool-search", state: "output-available" },
		]);
		expect(result.steps[0].toolState).toBe("output-available");
	});

	it("unknown part type is ignored", () => {
		const result = buildChainOfThoughtSteps([{ type: "image", data: "..." }]);
		expect(result.steps).toHaveLength(0);
		expect(result.hasTextContent).toBe(false);
	});
});


describe("ChainOfThought component", () => {
	it("renders null when steps=[] and reasoningRequested=false and not streaming", () => {
		const { container } = render(
			<ChainOfThought steps={[]} reasoningRequested={false} isStreaming={false} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders when steps=[] and isStreaming=true", () => {
		render(<ChainOfThought steps={[]} isStreaming={true} />);
		expect(screen.getByTestId("reasoning")).toBeTruthy();
	});

	it("renders Reasoning wrapper when no tool steps", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("reasoning")).toBeTruthy();
	});

	it("renders ReasoningTrigger with reasoning step", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("reasoning-trigger")).toBeTruthy();
	});

	it("renders ReasoningContent with reasoning step", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("reasoning-content")).toBeTruthy();
	});

	it("renders chain-of-thought header when tool steps present", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={false} />);
		expect(screen.getByTestId("cot-header")).toBeTruthy();
	});

	it("header shows 'Thinking...' when isStreaming=true with tool steps", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "input-streaming" as const,
				status: "active" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={true} />);
		expect(screen.getByTestId("cot-header").textContent).toBe("Thinking...");
	});

	it("header shows 'Thought through N steps' when not streaming", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={false} />);
		expect(screen.getByTestId("cot-header").textContent).toBe(
			"Thought through 1 steps",
		);
	});

	it("renders cot-step for each step when tool steps present", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
			},
			{
				id: "tool-1",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={false} />);
		expect(screen.getAllByTestId("cot-step")).toHaveLength(2);
	});

	it("renders cot wrapper element when tool steps present", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={false} />);
		expect(screen.getByTestId("cot")).toBeTruthy();
	});

	it("renders reasoning trigger text 'Thought process' when not streaming and no duration", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		const trigger = screen.getByTestId("trigger-default");
		expect(trigger.textContent).toBe("Thought process");
	});

	it("renders reasoning content text", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "my reasoning text",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("reasoning-content").textContent).toBe(
			"my reasoning text",
		);
	});

	it("reasoning step with text undefined creates step with content=''", () => {
		const result = buildChainOfThoughtSteps(
			[{ type: "reasoning", state: "complete" }],
			true,
		);
		expect(result.steps[0].content).toBe("");
	});

	it("trigger shows 'Thinking...' when streaming=true passed to getThinkingMessage", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("trigger-streaming").textContent).toBe("Thinking...");
	});

	it("trigger shows 'Thought for N seconds' when duration>0 passed to getThinkingMessage", () => {
		const steps = [
			{
				id: "reasoning-0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "some thought",
				status: "complete" as const,
			},
		];
		render(<ChainOfThought steps={steps} reasoningRequested={true} />);
		expect(screen.getByTestId("trigger-with-duration").textContent).toBe("Thought for 5 seconds");
	});

	it("returns null when no tool steps and all shouldShow flags are false", () => {
		const { container } = render(
			<ChainOfThought
				steps={[{ id: "r0", type: "reasoning", label: "Thought process", content: "", status: "complete" }]}
				reasoningRequested={false}
				isStreaming={false}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("trigger shows 'Reasoning unavailable' when shouldShowUnavailableReasoning is true", () => {
		const steps = [
			{
				id: "r0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "",
				status: "complete" as const,
			},
		];
		render(
			<ChainOfThought
				steps={steps}
				reasoningRequested={true}
				isStreaming={false}
			/>,
		);
		expect(screen.getByTestId("trigger-default").textContent).toBe("Reasoning unavailable");
	});

	it("trigger shows 'Reasoning hidden' when shouldShowHiddenReasoning is true", () => {
		const steps = [
			{
				id: "r0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "",
				status: "complete" as const,
			},
		];
		render(
			<ChainOfThought
				steps={steps}
				reasoningRequested={true}
				isStreaming={false}
				reasoningTokenCount={50}
			/>,
		);
		expect(screen.getByTestId("trigger-default").textContent).toBe("Reasoning hidden");
	});

	it("trigger shows 'No reasoning used' when shouldShowNoReasoningTokens is true", () => {
		const steps = [
			{
				id: "r0",
				type: "reasoning" as const,
				label: "Thought process",
				content: "",
				status: "complete" as const,
			},
		];
		render(
			<ChainOfThought
				steps={steps}
				reasoningRequested={true}
				isStreaming={false}
				reasoningTokenCount={0}
			/>,
		);
		expect(screen.getByTestId("trigger-default").textContent).toBe("No reasoning used");
	});

	it("tool step with output-error state shows 'Search failed' label", () => {
		const steps = [
			{
				id: "tool-0",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolInput: { query: "my query" },
				toolState: "output-error" as const,
				status: "error" as const,
			},
		];
		render(<ChainOfThought steps={steps} isStreaming={false} />);
		expect(screen.getByTestId("cot-step").getAttribute("data-label")).toBe("Search failed: my query");
	});

	it("renders normalized search results from tool output", () => {
		const steps = [
			{
				id: "tool-search-1",
				type: "tool" as const,
				label: "search",
				toolName: "search",
				toolState: "output-available" as const,
				status: "complete" as const,
				toolOutput: {
					results: [
						{ title: "Result One", url: "https://example.com/1", snippet: "Snippet one" },
						{ name: "Result Two", link: "https://example.com/2", description: "Snippet two" },
					],
				},
			},
		];

		render(<ChainOfThought steps={steps} isStreaming={false} />);

		expect(screen.getByText("Result One")).toBeTruthy();
		expect(screen.getByText("Result Two")).toBeTruthy();
		expect(screen.getByText("Snippet one")).toBeTruthy();
		expect(screen.getByText("Snippet two")).toBeTruthy();
	});
});
