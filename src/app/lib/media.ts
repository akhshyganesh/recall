import type { MediaKind } from "@/modules/tabs";

export function dirname(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

export function mediaKindForPath(path: string): MediaKind | null {
  const ext = path.split(/[\\/.]/).pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}
