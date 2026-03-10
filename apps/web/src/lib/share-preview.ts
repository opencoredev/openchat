const ELLIPSIS = "...";

function normalize(value: string | null | undefined) {
	if (!value) return "";
	return value.replace(/\s+/g, " ").trim();
}

export function truncatePreview(value: string | null | undefined, maxLength: number) {
	const normalized = normalize(value);
	if (!normalized) return "";
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`;
}

export function buildShareDescription({
	title,
	firstUserPrompt,
	firstAssistantResponse,
}: {
	title: string;
	firstUserPrompt?: string | null;
	firstAssistantResponse?: string | null;
}) {
	const user = truncatePreview(firstUserPrompt, 120);
	const assistant = truncatePreview(firstAssistantResponse, 140);

	if (user && assistant) {
		return `Chat: ${truncatePreview(title, 70)} • Prompt: ${user} • Response: ${assistant}`;
	}
	if (user) {
		return `Chat: ${truncatePreview(title, 70)} • Prompt: ${user}`;
	}
	if (assistant) {
		return `Chat: ${truncatePreview(title, 70)} • Response: ${assistant}`;
	}
	return `Shared chat from osschat: ${truncatePreview(title, 120)}`;
}

export function encodeSvgText(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
