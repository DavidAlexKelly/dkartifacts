/**
 * Media item references in a record, and what kind of file one points at.
 *
 * A dataset column can point at media — photos of an incident, a video clip,
 * a PDF report — and the details panel previews them. Recognised shapes:
 *
 *   Foundry media reference   {"mimeType": "image/jpeg", "reference": {"type":
 *                             "mediaSetViewItem", "mediaSetViewItem":
 *                             {"mediaSetRid": …, "mediaSetViewRid": …,
 *                             "mediaItemRid": …}}} — how a media reference
 *                             column comes out of a table read, as JSON text
 *   a flat object             {mediaSetRid, mediaItemRid}
 *   text                      ri.mio.main.media-set.…::ri.mio.main.media-item.…
 *   a bare item RID           ri.mio.main.media-item.… — only when the same
 *                             record carries a media set RID in another column,
 *                             since reading an item needs both
 *
 * Parsed by scanning, not regular expressions: every value here comes from
 * someone's dataset.
 */

export interface MediaRef {
  /** The column it came from, as the source names it. */
  field: string;
  mediaSetRid: string;
  mediaItemRid: string;
  /** From the reference itself when it says; otherwise sniffed on load. */
  mimeType?: string;
}

const MEDIA_SET_PREFIX = "ri.mio.main.media-set.";
const MEDIA_ITEM_PREFIX = "ri.mio.main.media-item.";

/** A UUID: 36 characters of hex digits and dashes. */
function isUuid(text: string): boolean {
  if (text.length !== 36) {return false;}
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const dash = i === 8 || i === 13 || i === 18 || i === 23;
    if (dash ? ch !== "-" : !((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F"))) {
      return false;
    }
  }
  return true;
}

function isRid(text: unknown, prefix: string): text is string {
  return typeof text === "string" && text.startsWith(prefix) && isUuid(text.slice(prefix.length));
}

export function isMediaSetRid(text: unknown): text is string {
  return isRid(text, MEDIA_SET_PREFIX);
}

export function isMediaItemRid(text: unknown): text is string {
  return isRid(text, MEDIA_ITEM_PREFIX);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("{")) {return null;}
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Whether a value is a media reference object (as opposed to text naming one). */
export function isMediaReferenceObject(value: unknown): boolean {
  const object = asObject(value);
  if (!object) {return false;}
  const reference = asObject(object.reference);
  const item = reference ? asObject(reference.mediaSetViewItem) : null;
  return (
    (item != null && isMediaSetRid(item.mediaSetRid) && isMediaItemRid(item.mediaItemRid)) ||
    (isMediaSetRid(object.mediaSetRid) && isMediaItemRid(object.mediaItemRid))
  );
}

/** A media set RID anywhere in the record, for bare item RIDs to be read against. */
export function recordMediaSet(record: Record<string, unknown>): string | undefined {
  for (const value of Object.values(record)) {
    if (isMediaSetRid(value)) {return value;}
  }
  return undefined;
}

export function parseMediaRef(
  value: unknown,
  field: string,
  mediaSetFallback?: string,
): MediaRef | null {
  if (value == null || value === "") {return null;}

  const object = asObject(value);
  if (object) {
    const mimeType = typeof object.mimeType === "string" ? object.mimeType : undefined;
    const reference = asObject(object.reference);
    const item = reference ? asObject(reference.mediaSetViewItem) : null;
    if (item && isMediaSetRid(item.mediaSetRid) && isMediaItemRid(item.mediaItemRid)) {
      return { field, mediaSetRid: item.mediaSetRid, mediaItemRid: item.mediaItemRid, mimeType };
    }
    if (isMediaSetRid(object.mediaSetRid) && isMediaItemRid(object.mediaItemRid)) {
      return { field, mediaSetRid: object.mediaSetRid, mediaItemRid: object.mediaItemRid, mimeType };
    }
    return null;
  }

  if (typeof value !== "string") {return null;}
  const text = value.trim();
  const separator = text.indexOf("::");
  if (separator > 0) {
    const set = text.slice(0, separator).trim();
    const item = text.slice(separator + 2).trim();
    return isMediaSetRid(set) && isMediaItemRid(item)
      ? { field, mediaSetRid: set, mediaItemRid: item }
      : null;
  }
  if (isMediaItemRid(text) && mediaSetFallback && isMediaSetRid(mediaSetFallback)) {
    return { field, mediaSetRid: mediaSetFallback, mediaItemRid: text };
  }
  return null;
}

/** Every media reference in a record's listed columns. */
export function mediaRefsIn(record: Record<string, unknown>, fields: string[]): MediaRef[] {
  if (fields.length === 0) {return [];}
  const fallback = recordMediaSet(record);
  const refs: MediaRef[] = [];
  for (const field of fields) {
    const value = record[field];
    // A column can hold a list of references (several photos of one event).
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      const ref = parseMediaRef(entry, field, fallback);
      if (ref) {refs.push(ref);}
    }
  }
  return refs;
}

// ── What kind of file ───────────────────────────────────────────────────────

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {return false;}
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  return startsWith(bytes, [...text].map((ch) => ch.charCodeAt(0)), offset);
}

/**
 * The type a file's first bytes declare, for items whose reference did not
 * say. Only formats a browser can show inline; anything else is offered as a
 * download.
 */
export function sniffMimeType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {return "image/png";}
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {return "image/jpeg";}
  if (ascii(bytes, 0, "GIF8")) {return "image/gif";}
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {return "image/webp";}
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) {return "audio/wav";}
  if (ascii(bytes, 0, "%PDF")) {return "application/pdf";}
  if (ascii(bytes, 4, "ftyp")) {return ascii(bytes, 8, "M4A") ? "audio/mp4" : "video/mp4";}
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {return "video/webm";}
  if (ascii(bytes, 0, "ID3") || startsWith(bytes, [0xff, 0xfb])) {return "audio/mpeg";}
  if (ascii(bytes, 0, "OggS")) {return "audio/ogg";}
  if (ascii(bytes, 0, "<svg") || ascii(bytes, 0, "<?xml")) {return "image/svg+xml";}
  return undefined;
}

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "download";

export function previewKind(mimeType: string | undefined): PreviewKind {
  if (!mimeType) {return "download";}
  // SVG can carry script; shown as <img>, which never runs it.
  if (mimeType.startsWith("image/")) {return "image";}
  if (mimeType.startsWith("video/")) {return "video";}
  if (mimeType.startsWith("audio/")) {return "audio";}
  if (mimeType === "application/pdf") {return "pdf";}
  return "download";
}
