// Allowed URL schemes for search result links (security: prevent XSS via javascript:/data: URLs)
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:"]);

function getSafeUrl(url: string): string | null {
	try {
		const urlObj = new URL(url);
		if (!ALLOWED_URL_SCHEMES.has(urlObj.protocol)) {
			return null;
		}
		return urlObj.toString();
	} catch {
		return null;
	}
}

function replaceUtmSource(url: string): string | null {
	const safeUrl = getSafeUrl(url);
	if (!safeUrl) {
		return null;
	}

	try {
		const urlObj = new URL(safeUrl);
		if (urlObj.searchParams.has("utm_source")) {
			urlObj.searchParams.set("utm_source", "osschat.dev");
		}
		if (urlObj.searchParams.has("utm_medium")) {
			urlObj.searchParams.set("utm_medium", "referral");
		}
		return urlObj.toString();
	} catch {
		return safeUrl;
	}
}

export function SearchResultsDisplay({ results, isExpanded }: { results: unknown; isExpanded: boolean }) {
	let searchResults: Array<any> = [];

	if (Array.isArray(results)) {
		searchResults = results;
	} else if (results && typeof results === "object") {
		const obj = results as Record<string, unknown>;
		if (Array.isArray(obj.results)) {
			searchResults = obj.results;
		} else if (Array.isArray(obj.data)) {
			searchResults = obj.data;
		} else if (Array.isArray(obj.items)) {
			searchResults = obj.items;
		} else if (Array.isArray(obj.hits)) {
			searchResults = obj.hits;
		} else if (Array.isArray(obj.organic)) {
			searchResults = obj.organic;
		}
	}

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
			{searchResults.slice(0, 5).map((result: any, i: number) => {
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
