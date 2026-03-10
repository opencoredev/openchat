import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { api } from "@server/convex/_generated/api";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { getConvexServerClient } from "@/lib/convex-server";
import { buildShareDescription } from "@/lib/share-preview";

const FALLBACK_ORIGIN = "https://osschat.dev";

type LoaderData = {
	origin: string;
	shareUrl: string;
	ogImageUrl: string;
	shared: {
		shareId: string;
		title: string;
		firstUserPrompt: string | null;
		firstAssistantResponse: string | null;
		messages: Array<{
			id: string;
			role: string;
			content: string;
			createdAt: number;
		}>;
	} | null;
};

const getSharedChatPageData = createServerFn({ method: "GET" })
	.validator((input: { shareId: string }) => input)
	.handler(async ({ data }): Promise<LoaderData> => {
		const origin =
			process.env.VITE_APP_URL ||
			(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
			FALLBACK_ORIGIN;

		const client = getConvexServerClient();
		const shared = await client.query(api.chatShares.getPublicByShareId, {
			shareId: data.shareId,
		});

		return {
			origin,
			shareUrl: `${origin}/share/${data.shareId}`,
			ogImageUrl: `${origin}/api/og/share/${data.shareId}`,
			shared,
		};
	});

export const Route = createFileRoute("/share/$shareId")({
	loader: ({ params }) =>
		getSharedChatPageData({
			data: { shareId: params.shareId },
		}),
	head: ({ loaderData }) => {
		const fallbackTitle = "Shared Chat - osschat";
		const title = loaderData?.shared?.title
			? `${loaderData.shared.title} - Shared Chat - osschat`
			: fallbackTitle;
		const description = loaderData?.shared
			? buildShareDescription({
					title: loaderData.shared.title,
					firstUserPrompt: loaderData.shared.firstUserPrompt,
					firstAssistantResponse: loaderData.shared.firstAssistantResponse,
				})
			: "View a shared chat conversation from osschat.";
		const ogImage = loaderData?.ogImageUrl ?? `${FALLBACK_ORIGIN}/og-image.png`;
		const shareUrl = loaderData?.shareUrl ?? FALLBACK_ORIGIN;

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ name: "robots", content: "index, follow" },
				{ property: "og:type", content: "article" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: shareUrl },
				{ property: "og:image", content: ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: ogImage },
			],
			links: [{ rel: "canonical", href: shareUrl }],
		};
	},
	component: SharedChatPage,
});

function SharedChatPage() {
	const { shared } = Route.useLoaderData();

	if (!shared) {
		return (
			<div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
				<h1 className="text-2xl font-semibold">Shared chat not found</h1>
				<p className="text-muted-foreground">
					This link may have expired, been revoked, or never existed.
				</p>
				<Link to="/">
					<Button>Go to osschat</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-6 md:px-6">
			<div className="mb-4 flex items-center justify-between gap-3">
				<Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
					<ArrowLeftIcon className="size-4" />
					Back to osschat
				</Link>
				<a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
					Open app
					<ExternalLinkIcon className="size-4" />
				</a>
			</div>

			<div className="mb-6 rounded-2xl border border-border/70 bg-card/60 p-4 md:p-6">
				<p className="text-xs font-semibold uppercase tracking-wide text-primary">Shared Chat</p>
				<h1 className="mt-2 text-2xl font-semibold md:text-3xl">{shared.title}</h1>
			</div>

			<div className="flex-1 overflow-y-auto rounded-2xl border border-border/70 bg-background/70 p-4 md:p-6">
				<div className="space-y-5">
					{shared.messages.map((message) => (
						<Message
							key={message.id}
							from={message.role === "assistant" ? "assistant" : "user"}
						>
							<MessageContent>
								<MessageResponse>{message.content || ""}</MessageResponse>
							</MessageContent>
						</Message>
					))}
				</div>
			</div>
		</div>
	);
}
