import { useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";

export function useBenchmark(openRouterModelId: string) {
	const benchmark = useQuery(api.benchmarks.getBenchmarkByOpenRouterId, {
		openRouterModelId,
	});
	return {
		benchmark: benchmark ?? null,
		isLoading: benchmark === undefined,
	};
}
