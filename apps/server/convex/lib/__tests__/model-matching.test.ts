import { describe, expect, it } from "vitest";
import {
	MANUAL_OVERRIDES,
	POPULAR_MODEL_IDS,
	buildMatchingMap,
	matchAAtoOpenRouter,
	normalizeSlug,
	type AAModel,
} from "../model-matching";

function createAAModel(slug: string, creatorSlug: string): AAModel {
	return {
		slug,
		model_creator: {
			slug: creatorSlug,
			name: creatorSlug,
		},
		evaluations: {
			artificial_analysis_intelligence_index: 60,
			mmlu_pro: 0.7,
		},
	};
}

describe("normalizeSlug", () => {
	it("normalizes casing and separators", () => {
		expect(normalizeSlug(" Claude_3.5 Sonnet ")).toBe("claude-3-5-sonnet");
	});

	it("strips trailing numeric version suffixes", () => {
		expect(normalizeSlug("gemini-2.0-flash-001")).toBe("gemini-2-0-flash");
		expect(normalizeSlug("deepseek-v3-0324")).toBe("deepseek-v3");
	});
});

describe("matchAAtoOpenRouter", () => {
	it.each([
		["claude-3-5-sonnet", "anthropic", "anthropic/claude-3.5-sonnet"],
		["deepseek-v3", "deepseek", "deepseek/deepseek-chat"],
		["llama-3-3-70b", "meta-llama", "meta-llama/llama-3.3-70b-instruct"],
		["gpt-4o", "openai", "openai/gpt-4o"],
		["gemini-2-5-pro", "google", "google/gemini-2.5-pro"],
		["grok-3", "x-ai", "x-ai/grok-3"],
	])("matches manual override for %s", (aaSlug, creatorSlug, expected) => {
		expect(matchAAtoOpenRouter(aaSlug, creatorSlug)).toBe(expected);
	});

	it("matches with normalized fallback when exact slug does not exist", () => {
		expect(matchAAtoOpenRouter("gemini-2-0-flash-001", "google")).toBe("google/gemini-2.0-flash-001");
	});

	it("returns null for unknown models instead of throwing", () => {
		expect(() => matchAAtoOpenRouter("totally-unknown-model", "unknown")).not.toThrow();
		expect(matchAAtoOpenRouter("totally-unknown-model", "unknown")).toBeNull();
	});

	it("matches every popular model id", () => {
		const matchedIds = new Set<string>();

		for (const [aaSlug, openRouterId] of Object.entries(MANUAL_OVERRIDES)) {
			const creatorSlug = openRouterId.split("/")[0] ?? "";
			const result = matchAAtoOpenRouter(aaSlug, creatorSlug);
			if (result) {
				matchedIds.add(result);
			}
		}

		expect([...matchedIds].sort()).toEqual([...POPULAR_MODEL_IDS].sort());
	});
});

describe("buildMatchingMap", () => {
	it("builds an AA slug to OpenRouter id map", () => {
		const aaModels: AAModel[] = [
			createAAModel("claude-3-5-sonnet", "anthropic"),
			createAAModel("gemini 2_5.flash", "google"),
			createAAModel("unlisted-model", "unknown"),
		];

		const openRouterIds = [
			"anthropic/claude-3.5-sonnet",
			"google/gemini-2.5-flash",
			"openai/gpt-4o",
		];

		const map = buildMatchingMap(aaModels, openRouterIds);

		expect(map.get("claude-3-5-sonnet")).toBe("anthropic/claude-3.5-sonnet");
		expect(map.get("gemini 2_5.flash")).toBe("google/gemini-2.5-flash");
		expect(map.has("unlisted-model")).toBe(false);
	});

	it("only matches against the provided OpenRouter ids", () => {
		const aaModels: AAModel[] = [createAAModel("claude-3-5-sonnet", "anthropic")];
		const openRouterIds = ["openai/gpt-4o"];

		const map = buildMatchingMap(aaModels, openRouterIds);

		expect(map.size).toBe(0);
	});
});
