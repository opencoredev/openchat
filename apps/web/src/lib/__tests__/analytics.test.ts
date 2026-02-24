import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analytics } from "@/lib/analytics";

describe("analytics", () => {
	let stonksEvent: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		stonksEvent = vi.fn();
		(window as Window & { stonks?: { event: typeof stonksEvent } }).stonks = { event: stonksEvent };
	});

	afterEach(() => {
		delete (window as Window & { stonks?: unknown }).stonks;
	});

	describe("modelSwitched", () => {
		it("calls window.stonks.event with 'Model Switched' and model prop", () => {
			analytics.modelSwitched("gpt-4o");
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Model Switched", { model: "gpt-4o" });
		});

		it("passes the exact modelId provided", () => {
			analytics.modelSwitched("anthropic/claude-3-5-sonnet");
			expect(stonksEvent).toHaveBeenCalledWith("Model Switched", {
				model: "anthropic/claude-3-5-sonnet",
			});
		});
	});

	describe("messageSent", () => {
		it("calls window.stonks.event with 'Message Sent' and model prop", () => {
			analytics.messageSent("llama-3");
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Message Sent", { model: "llama-3" });
		});
	});

	describe("chatCreated", () => {
		it("calls window.stonks.event with 'Chat Created' and no props", () => {
			analytics.chatCreated();
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Chat Created", undefined);
		});
	});

	describe("signedIn", () => {
		it("calls window.stonks.event with 'Signed In' and no props", () => {
			analytics.signedIn();
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Signed In", undefined);
		});
	});

	describe("thinkingModeChanged", () => {
		it("calls window.stonks.event with 'Thinking Mode Changed' and effort prop", () => {
			analytics.thinkingModeChanged("high");
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Thinking Mode Changed", { effort: "high" });
		});

		it("passes the exact effort string provided", () => {
			analytics.thinkingModeChanged("low");
			expect(stonksEvent).toHaveBeenCalledWith("Thinking Mode Changed", { effort: "low" });
		});
	});

	describe("searchToggled", () => {
		it("sends 'true' string when enabled is true", () => {
			analytics.searchToggled(true);
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Search Toggled", { enabled: "true" });
		});

		it("sends 'false' string when enabled is false", () => {
			analytics.searchToggled(false);
			expect(stonksEvent).toHaveBeenCalledOnce();
			expect(stonksEvent).toHaveBeenCalledWith("Search Toggled", { enabled: "false" });
		});
	});

	describe("when window.stonks is undefined", () => {
		beforeEach(() => {
			delete (window as Window & { stonks?: unknown }).stonks;
		});

		it("does not throw when stonks is not present", () => {
			expect(() => analytics.modelSwitched("gpt-4o")).not.toThrow();
		});

		it("does not throw for messageSent", () => {
			expect(() => analytics.messageSent("gpt-4o")).not.toThrow();
		});

		it("does not throw for chatCreated", () => {
			expect(() => analytics.chatCreated()).not.toThrow();
		});

		it("does not throw for signedIn", () => {
			expect(() => analytics.signedIn()).not.toThrow();
		});

		it("does not throw for thinkingModeChanged", () => {
			expect(() => analytics.thinkingModeChanged("medium")).not.toThrow();
		});

		it("does not throw for searchToggled", () => {
			expect(() => analytics.searchToggled(true)).not.toThrow();
		});
	});
});
