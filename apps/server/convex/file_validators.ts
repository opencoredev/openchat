export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
export const MAX_USER_FILES = 150;

export const ALLOWED_IMAGE_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/bmp",
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
	"application/pdf",
	"text/plain",
	"text/markdown",
] as const;

export const ALLOWED_AUDIO_TYPES = [
	"audio/mpeg",
	"audio/mp3",
	"audio/wav",
	"audio/ogg",
	"audio/m4a",
	"audio/aac",
	"audio/webm",
] as const;

export const ALLOWED_VIDEO_TYPES = [
	"video/mp4",
	"video/mpeg",
	"video/quicktime",
	"video/webm",
	"video/x-msvideo",
	"video/x-ms-wmv",
] as const;

export const ALLOWED_TYPES = [
	...ALLOWED_IMAGE_TYPES,
	...ALLOWED_DOCUMENT_TYPES,
	...ALLOWED_AUDIO_TYPES,
	...ALLOWED_VIDEO_TYPES,
] as const;

export function validateFileType(contentType: string): void {
	const normalizedType = contentType.toLowerCase().trim();

	if (!(ALLOWED_TYPES as readonly string[]).includes(normalizedType)) {
		throw new Error(
			`File type "${contentType}" is not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`
		);
	}
}

export function validateFileSize(size: number, contentType: string): void {
	const normalizedType = contentType.toLowerCase().trim();

	if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalizedType)) {
		if (size > MAX_IMAGE_SIZE) {
			throw new Error(
				`Image file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`
			);
		}
	} else if (
		(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(normalizedType)
	) {
		if (size > MAX_DOCUMENT_SIZE) {
			throw new Error(
				`Document file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_DOCUMENT_SIZE / (1024 * 1024)}MB`
			);
		}
	} else if (
		(ALLOWED_AUDIO_TYPES as readonly string[]).includes(normalizedType)
	) {
		if (size > MAX_AUDIO_SIZE) {
			throw new Error(
				`Audio file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_AUDIO_SIZE / (1024 * 1024)}MB`
			);
		}
	} else if (
		(ALLOWED_VIDEO_TYPES as readonly string[]).includes(normalizedType)
	) {
		if (size > MAX_VIDEO_SIZE) {
			throw new Error(
				`Video file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`
			);
		}
	} else {
		if (size > MAX_FILE_SIZE) {
			throw new Error(
				`File size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
			);
		}
	}
}
