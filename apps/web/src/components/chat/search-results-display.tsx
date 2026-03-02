import { replaceUtmSource } from "./url-utils";

type SearchResult = {
	url?: string;
	link?: string;
	title?: string;
	name?: string;
	description?: string;
	snippet?: string;
	content?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asSearchResult(value: unknown): SearchResult | null {
	const rec = asRecord(value);
	if (!rec) return null;
	return {
		url: typeof rec.url === "string" ? rec.url : undefined,
		link: typeof rec.link === "string" ? rec.link : undefined,
		title: typeof rec.title === "string" ? rec.title : undefined,
		name: typeof rec.name === "string" ? rec.name : undefined,
		description: typeof rec.description === "string" ? rec.description : undefined,
		snippet: typeof rec.snippet === "string" ? rec.snippet : undefined,
		content: typeof rec.content === "string" ? rec.content : undefined,
	};
}

function normalizeSearchResults(results: unknown): SearchResult[] {
	const topLevel = Array.isArray(results) ? results : null;
	if (topLevel) {
		return topLevel
			.map(asSearchResult)
			.filter((result): result is SearchResult => result !== null);
	}

	const obj = asRecord(results);
	if (!obj) return [];

	const candidates = [obj.results, obj.data, obj.items, obj.hits, obj.organic];
	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) continue;
		return candidate
			.map(asSearchResult)
			.filter((result): result is SearchResult => result !== null);
	}

	return [];
}

export function SearchResultsDisplay({
	results,
	isExpanded,
}: {
	results: unknown;
	isExpanded: boolean;
}) {
	const searchResults = normalizeSearchResults(results);

	if (searchResults.length === 0) {
		return <p className="text-xs text-muted-foreground">No results found</p>;
	}

	if (!isExpanded) {
		return (
			<p className="text-xs text-muted-foreground">
				{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{searchResults.slice(0, 5).map((result, i: number) => {
				const rawUrl = result.url || result.link;
				const safeUrl = rawUrl ? replaceUtmSource(rawUrl) : null;
				const displayTitle = result.title || result.name || (safeUrl ? rawUrl : null) || "Result";

				return (
					<div key={i} className="p-2 rounded-md bg-muted/30 border border-border/50">
						<div className="flex items-start gap-2">
							<div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
							<div className="flex-1 min-w-0">
								{safeUrl ? (
									<a
										href={safeUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs font-medium text-primary hover:underline line-clamp-1"
									>
										{displayTitle}
									</a>
								) : (
									<span className="text-xs font-medium text-foreground line-clamp-1">
										{displayTitle}
									</span>
								)}
								{(result.description || result.snippet || result.content) && (
									<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
										{result.description || result.snippet || result.content}
									</p>
								)}
							</div>
						</div>
					</div>
				);
			})}
			{searchResults.length > 5 && (
				<p className="text-xs text-muted-foreground">
					+{String(searchResults.length - 5)} more results
				</p>
			)}
		</div>
	);
}
