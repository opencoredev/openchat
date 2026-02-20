import { cn } from "@/lib/utils";

export function CloseIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
		</svg>
	);
}

export function ThinkingIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
			/>
		</svg>
	);
}

export function EyeIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
			/>
			<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
	);
}

export function ToolIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3"
			/>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M3.375 19.5h17.25a1.125 1.125 0 0 0 1.125-1.125V5.625a1.125 1.125 0 0 0-1.125-1.125H3.375a1.125 1.125 0 0 0-1.125 1.125v12.75a1.125 1.125 0 0 0 1.125 1.125Z"
			/>
		</svg>
	);
}

export function InfoIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
		>
			<circle cx="12" cy="12" r="9" />
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" />
			<circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
		</svg>
	);
}

export function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
	return (
		<svg
			className={cn("size-3.5", className)}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
			/>
		</svg>
	);
}
