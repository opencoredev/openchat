export type AppErrorCode =
	| "auth_error"
	| "validation_error"
	| "transient_network_error"
	| "persistence_error"
	| "configuration_error"
	| "external_service_error";

export class AppError extends Error {
	readonly code: AppErrorCode;
	readonly recoverable: boolean;
	readonly context?: Record<string, unknown>;

	constructor(
		code: AppErrorCode,
		message: string,
		options?: { recoverable?: boolean; context?: Record<string, unknown>; cause?: unknown },
	) {
		super(message);
		this.name = "AppError";
		this.code = code;
		this.recoverable = options?.recoverable ?? false;
		this.context = options?.context;
		if (options?.cause !== undefined) {
			(this as Error & { cause?: unknown }).cause = options.cause;
		}
	}
}

export class AuthError extends AppError {
	constructor(message: string, options?: { recoverable?: boolean; context?: Record<string, unknown>; cause?: unknown }) {
		super("auth_error", message, { recoverable: options?.recoverable ?? false, context: options?.context, cause: options?.cause });
		this.name = "AuthError";
	}
}

export class ValidationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super("validation_error", message, { recoverable: false, context });
		this.name = "ValidationError";
	}
}

export class TransientNetworkError extends AppError {
	constructor(message: string, options?: { context?: Record<string, unknown>; cause?: unknown }) {
		super("transient_network_error", message, { recoverable: true, context: options?.context, cause: options?.cause });
		this.name = "TransientNetworkError";
	}
}

export class PersistenceError extends AppError {
	constructor(message: string, options?: { recoverable?: boolean; context?: Record<string, unknown>; cause?: unknown }) {
		super("persistence_error", message, {
			recoverable: options?.recoverable ?? false,
			context: options?.context,
			cause: options?.cause,
		});
		this.name = "PersistenceError";
	}
}

export class ConfigurationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super("configuration_error", message, { recoverable: false, context });
		this.name = "ConfigurationError";
	}
}
