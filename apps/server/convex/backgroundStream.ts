/**
 * Barrel re-export for backward compatibility.
 *
 * All functionality has been split into focused modules:
 * - streamJobs.ts      — job lifecycle (startStream, getStreamJob, completeStream, failStream, cleanupStaleJobs)
 * - streamExecution.ts  — the executeStream action (AI SDK integration, tool calls, web search)
 * - streamContent.ts    — content update mutations (updateStreamContent)
 */

export {
	startStream,
	getStreamJob,
	completeStream,
	failStream,
	getJobInternal,
	getPersistedDailyUsageForDateInternal,
	cleanupStaleJobs,
} from "./streamJobs";

export { getActiveStreamJob } from "./streamQueries";

export { executeStream } from "./streamExecution";

export { updateStreamContent } from "./streamContent";
