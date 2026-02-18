import { shouldTriggerAutoTitle } from "@/lib/title-generation";

interface AutoTitleParams {
	chatId: string;
	userId: string;
	seedText: string;
	existingMessageCount: number;
	startedWithoutChatId: boolean;
	activeProvider: string;
}

/**
 * Triggers auto-title generation for a chat if conditions are met.
 * Fire-and-forget: errors are logged but never thrown.
 */
export function triggerAutoTitle({
	chatId,
	userId,
	seedText,
	existingMessageCount,
	startedWithoutChatId,
	activeProvider,
}: AutoTitleParams): void {
	const shouldQueue = shouldTriggerAutoTitle({
		startedWithoutChatId,
		existingMessageCount,
		seedText,
	});
	if (!shouldQueue) return;

	void fetch("/api/workflow/generate-title", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chatId,
			userId,
			seedText: seedText.trim().slice(0, 300),
			length: "standard",
			provider: activeProvider,
			mode: "auto",
		}),
	})
		.then(async (response) => {
			if (response.ok) return;
			const payload = await response.json().catch(() => null);
			console.warn("[AutoTitle] Workflow request failed", {
				status: response.status,
				payload,
			});
		})
		.catch((autoTitleError) => {
			console.warn("[AutoTitle] Workflow request failed", autoTitleError);
		});
}
