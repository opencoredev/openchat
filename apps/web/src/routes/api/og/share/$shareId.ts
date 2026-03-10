import { createFileRoute } from "@tanstack/react-router";
import { api } from "@server/convex/_generated/api";
import { getConvexServerClient } from "@/lib/convex-server";
import {
	buildShareDescription,
	encodeSvgText,
	truncatePreview,
} from "@/lib/share-preview";

const WIDTH = 1200;
const HEIGHT = 630;

function splitLines(value: string, maxChars: number, maxLines: number) {
	const words = value.split(/\s+/);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxChars) {
			current = candidate;
			continue;
		}
		if (current) {
			if (lines.length === maxLines - 1) {
				lines.push(candidate);
				return lines.map((line) => line.trim()).slice(0, maxLines);
			}
			lines.push(current);
		}
		current = word;
	}

	if (lines.length < maxLines && current) {
		lines.push(current);
	}

	return lines.slice(0, maxLines);
}

function renderLines(lines: string[], x: number, y: number, lineHeight: number) {
	return lines
		.map((line, index) => {
			const posY = y + index * lineHeight;
			return `<text x="${x}" y="${posY}" fill="#F5F7FF" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="34" font-weight="700">${encodeSvgText(line)}</text>`;
		})
		.join("");
}

function renderSmallLines(
	lines: string[],
	x: number,
	y: number,
	lineHeight: number,
	label: string,
	labelColor: string,
) {
	const labelText = `<text x="${x}" y="${y}" fill="${labelColor}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" font-weight="700">${encodeSvgText(label)}</text>`;
	const content = lines
		.map((line, index) => {
			const posY = y + 34 + index * lineHeight;
			return `<text x="${x}" y="${posY}" fill="#DDE3FF" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="500">${encodeSvgText(line)}</text>`;
		})
		.join("");
	return `${labelText}${content}`;
}

function buildSvg({
	title,
	firstUserPrompt,
	firstAssistantResponse,
}: {
	title: string;
	firstUserPrompt: string | null;
	firstAssistantResponse: string | null;
}) {
	const titleLines = splitLines(truncatePreview(title, 90) || "Shared Chat", 34, 2);
	const userLines = splitLines(truncatePreview(firstUserPrompt, 220) || "No prompt preview available.", 56, 3);
	const assistantLines = splitLines(
		truncatePreview(firstAssistantResponse, 220) || "No response preview available.",
		56,
		3,
	);
	const description = buildShareDescription({ title, firstUserPrompt, firstAssistantResponse });

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1026"/>
      <stop offset="1" stop-color="#172554"/>
    </linearGradient>
    <linearGradient id="card" x1="120" y1="128" x2="1080" y2="566" gradientUnits="userSpaceOnUse">
      <stop stop-color="#141D40" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#111A33" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="1020" cy="-30" r="230" fill="#3B82F6" fill-opacity="0.28"/>
  <circle cx="180" cy="700" r="260" fill="#22D3EE" fill-opacity="0.16"/>
  <rect x="72" y="72" width="1056" height="486" rx="28" fill="url(#card)" stroke="#8FA5FF" stroke-opacity="0.2"/>
  <text x="108" y="124" fill="#9BB4FF" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="700">Shared on osschat</text>
  ${renderLines(titleLines, 108, 188, 46)}
  ${renderSmallLines(userLines, 108, 288, 36, "Prompt", "#FBBF24")}
  ${renderSmallLines(assistantLines, 108, 436, 36, "AI Response", "#34D399")}
  <text x="108" y="592" fill="#A7B6E9" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="18">${encodeSvgText(description)}</text>
</svg>`;
}

export const Route = createFileRoute("/api/og/share/$shareId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const client = getConvexServerClient();
				const preview = await client.query(api.chatShares.getPreviewByShareId, {
					shareId: params.shareId,
				});

				const svg = buildSvg({
					title: preview?.title ?? "Shared Chat",
					firstUserPrompt: preview?.firstUserPrompt ?? null,
					firstAssistantResponse: preview?.firstAssistantResponse ?? null,
				});

				return new Response(svg, {
					status: 200,
					headers: {
						"Content-Type": "image/svg+xml; charset=utf-8",
						"Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
					},
				});
			},
		},
	},
});
