import { readFile } from "fs/promises";
import { basename, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function toBase64(data: Uint8Array): string {
  // Works in both Node.js and Bun
  return Buffer.from(data).toString("base64");
}

function buildDataUri(
  base64: string,
  contentType: string,
  filename?: string,
): string {
  const parts = [`data:${contentType}`];
  if (filename) parts.push(`filename=${filename}`);
  parts.push("base64");
  return parts.join(";") + "," + base64;
}

export interface EncodeAttachmentOptions {
  /** Override the auto-detected MIME type. */
  contentType?: string;
  /** Override the filename (defaults to basename of filePath). */
  filename?: string;
}

/**
 * Read a file from disk and encode it as a data URI for sending.
 *
 * @example
 * const attachment = await encodeAttachment("./photo.jpg");
 * await ctx.reply("Check this out!", { base64Attachments: [attachment] });
 */
export async function encodeAttachment(
  filePath: string,
  options?: EncodeAttachmentOptions,
): Promise<string> {
  const data = await readFile(filePath);
  const contentType = options?.contentType ?? guessContentType(filePath);
  const filename = options?.filename ?? basename(filePath);
  return buildDataUri(toBase64(new Uint8Array(data)), contentType, filename);
}

/**
 * Encode a buffer as a data URI for sending.
 *
 * @example
 * const data = new Uint8Array([...]); // or downloaded attachment bytes
 * const attachment = encodeAttachmentBuffer(data, "image/png", "screenshot.png");
 * await ctx.reply("Here you go!", { base64Attachments: [attachment] });
 */
export function encodeAttachmentBuffer(
  data: Uint8Array,
  contentType: string,
  filename?: string,
): string {
  return buildDataUri(toBase64(data), contentType, filename);
}
