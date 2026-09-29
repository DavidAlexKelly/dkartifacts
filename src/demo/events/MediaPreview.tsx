/**
 * A preview of one media item a record references: an image, a video or an
 * audio clip inline, a PDF in a frame, anything else as a download.
 *
 * Read through @acc/decho-foundry-bytes (`getMediaItemByRid`), so an item
 * opened twice is fetched once, and the bytes are handed to the element as a
 * blob URL — never a Foundry URL, which the browser could not authorise. The
 * type comes from the reference when it says, otherwise from the file's first
 * bytes. Needs the media sets read scope and the media set as a Resource,
 * like a media set source; a 403 says so.
 */

import React, { useEffect, useState } from "react";
import { getMediaItemByRid } from "@acc/decho-foundry-bytes";
import { panelFigures, panelMuted } from "@/components/mapPanel";
import { describeSourceError, type SourceProblem } from "./sources/foundry";
import { previewKind, sniffMimeType, type MediaRef, type PreviewKind } from "./sources/media";
import { actionButton, problemText } from "./styles";

type Loaded = { url: string; mimeType?: string; kind: PreviewKind; bytes: number };

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(0)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreview({ media }: { media: MediaRef }): React.ReactElement {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<SourceProblem | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setLoaded(null);
    setProblem(null);
    getMediaItemByRid(media.mediaSetRid, media.mediaItemRid)
      .then((buffer) => {
        if (cancelled) {return;}
        const mimeType = media.mimeType ?? sniffMimeType(new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength)));
        url = URL.createObjectURL(new Blob([buffer], mimeType ? { type: mimeType } : {}));
        setLoaded({ url, mimeType, kind: previewKind(mimeType), bytes: buffer.byteLength });
      })
      .catch((err: unknown) => {
        if (!cancelled) {setProblem(describeSourceError(err, "mediaset"));}
      });
    return () => {
      cancelled = true;
      if (url) {URL.revokeObjectURL(url);}
    };
  }, [media.mediaSetRid, media.mediaItemRid, media.mimeType]);

  const extension = loaded?.mimeType ? EXTENSIONS[loaded.mimeType] : undefined;
  const fileName = `${media.mediaItemRid.split(".").pop()}${extension ? `.${extension}` : ""}`;

  return (
    <figure style={figure}>
      <figcaption style={{ ...panelMuted, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{media.field}</span>
        {loaded && (
          <span style={panelFigures}>
            {loaded.mimeType ?? "unknown type"} · {formatBytes(loaded.bytes)}
          </span>
        )}
      </figcaption>

      {!loaded && !problem && <div style={placeholder}>Loading…</div>}

      {problem && (
        <div style={problemText}>
          <strong>{problem.title}.</strong> {problem.detail}
          {problem.remediation && <div style={{ marginTop: 2 }}>{problem.remediation}</div>}
        </div>
      )}

      {loaded?.kind === "image" && (
        <a href={loaded.url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={loaded.url} alt={media.field} style={image} />
        </a>
      )}
      {loaded?.kind === "video" && <video src={loaded.url} controls style={image} />}
      {loaded?.kind === "audio" && <audio src={loaded.url} controls style={{ width: "100%" }} />}
      {loaded?.kind === "pdf" && (
        <iframe src={loaded.url} title={media.field} style={{ ...image, height: 280, background: "#fff" }} />
      )}
      {loaded && (
        <a href={loaded.url} download={fileName} style={{ ...actionButton, textAlign: "center", textDecoration: "none" }}>
          {loaded.kind === "download" ? "Download file" : "Download"}
        </a>
      )}
    </figure>
  );
}

const figure: React.CSSProperties = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const image: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxHeight: 240,
  objectFit: "contain",
  borderRadius: 6,
  border: "none",
  background: "rgba(0,0,0,0.25)",
};

const placeholder: React.CSSProperties = {
  ...panelMuted,
  height: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  background: "rgba(0,0,0,0.2)",
};
