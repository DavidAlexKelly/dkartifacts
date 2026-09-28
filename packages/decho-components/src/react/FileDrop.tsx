/**
 * Files in: a drop zone that is also a button, and a gallery for what came out.
 *
 * WHY THE BUTTON MATTERS AS MUCH AS THE DROP ZONE
 * -----------------------------------------------
 * A drop zone with no file input cannot be used by anyone who is not dragging
 * a file with a mouse — which includes every keyboard user and every tablet.
 * The hidden `<input type="file">` here is not a fallback; it is the primary
 * control, and the drop zone is the shortcut.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not upload. It hands the caller a list of files, because uploading
 * in this estate means a Foundry media set and an OSDK client, and this
 * package deliberately knows about neither. Progress is a prop for the same
 * reason — the caller has the request, so the caller has the number.
 */

import React from "react";
import { focusRingStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { Icon } from "./Icon.js";
import {
  acceptAttribute,
  describeFile,
  validateFiles,
  type FileRules,
  type RejectedFile,
} from "./fileValidation.js";

export interface FileDropProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrop"> {
  onFiles: (files: File[]) => void;
  /** Reported so the caller can toast or list them; never swallowed. */
  onRejected?: (rejected: RejectedFile[]) => void;
  rules?: FileRules;
  /** 0–100 while the caller is uploading. */
  progress?: number;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  tokens?: DechoTokenSet;
}

export function FileDrop({
  onFiles,
  onRejected,
  rules = {},
  progress,
  disabled = false,
  label = "Drop files here",
  hint,
  tokens,
  style,
  ...rest
}: FileDropProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [rejected, setRejected] = React.useState<RejectedFile[]>([]);

  const take = (files: FileList | null): void => {
    if (files == null || disabled) {
      return;
    }
    const result = validateFiles([...files], rules);
    setRejected(result.rejected);
    onRejected?.(result.rejected);
    if (result.accepted.length > 0) {
      onFiles(result.accepted);
    }
  };

  const describeRules = (): string => {
    const parts: string[] = [];
    if (rules.accept != null && rules.accept.length > 0) {
      parts.push(rules.accept.join(", "));
    }
    if (rules.maxBytes != null) {
      parts.push(`up to ${describeFile(rules.maxBytes)}`);
    }
    if (rules.maxFiles != null) {
      parts.push(`${rules.maxFiles} file${rules.maxFiles === 1 ? "" : "s"} at a time`);
    }
    return parts.join(" · ");
  };

  return (
    <div {...rest} style={{ display: "grid", gap: t.space[3], ...style }}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        style={{
          display: "grid",
          justifyItems: "center",
          gap: t.space[3],
          padding: t.space[7],
          border: `1px dashed ${over ? t.color.accent : t.color.border}`,
          borderRadius: t.radius.lg,
          background: over ? t.color.accentTint : t.color.bg,
          color: t.color.textMuted,
          fontFamily: t.fontFamily.sans,
          fontSize: t.fontSize.md,
          textAlign: "center",
          opacity: disabled ? 0.55 : 1,
          transition: t.effect.transition,
        }}
      >
        <Icon name="download" size={20} style={{ color: t.color.textFaint, transform: "rotate(180deg)" }} />
        <div style={{ color: t.color.text }}>{label}</div>

        {/*
          The real control. Hidden visually, not from the keyboard: it is what
          makes this usable without a mouse, and a `<label>` wrapping a button
          would nest two interactive elements.
        */}
        <input
          ref={input}
          type="file"
          multiple={rules.maxFiles !== 1}
          accept={acceptAttribute(rules)}
          disabled={disabled}
          onChange={(event) => {
            take(event.target.files);
            // Cleared so that choosing the same file twice in a row fires
            // `change` the second time.
            event.target.value = "";
          }}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            padding: `${t.space[2]} ${t.space[5]}`,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.sm,
            background: t.color.surface,
            color: t.color.text,
            font: "inherit",
            fontSize: t.fontSize.sm,
            cursor: disabled ? "not-allowed" : "pointer",
            outline: "none",
            ...(focused ? focusRingStyle({ tokens }) : {}),
          }}
        >
          Choose files
        </button>

        {(hint != null || describeRules() !== "") && (
          <div style={{ fontSize: t.fontSize.sm, color: t.color.textFaint }}>
            {hint ?? describeRules()}
          </div>
        )}

        {progress != null && (
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              width: "100%",
              height: 4,
              borderRadius: t.radius.pill,
              background: t.color.neutralTint,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                width: `${Math.min(100, Math.max(0, progress))}%`,
                height: "100%",
                background: t.color.accent,
                transition: t.effect.transition,
              }}
            />
          </div>
        )}
      </div>

      {rejected.length > 0 && (
        // Named, and live: a file silently not arriving is the failure mode
        // this component exists to prevent.
        <ul
          role="status"
          aria-live="polite"
          style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: t.space[2] }}
        >
          {rejected.map((entry) => (
            <li
              key={`${entry.name}-${entry.reason}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: t.space[3],
                fontSize: t.fontSize.sm,
                color: t.color.danger,
              }}
            >
              <Icon name="warning" size={13} style={{ marginTop: 1 }} />
              {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface GalleryItem {
  id: string;
  /** An object URL, a media-set URL — whatever the caller has. */
  src: string;
  caption?: string;
  /** Shown under the caption: a size, a date, a filename. */
  meta?: string;
}

export interface ImageGalleryProps extends Omit<React.HTMLAttributes<HTMLUListElement>, "onSelect"> {
  items: GalleryItem[];
  /** Opens the item; pair with a `Dialog` for a lightbox. */
  onSelect?: (item: GalleryItem) => void;
  onRemove?: (item: GalleryItem) => void;
  thumbnail?: number;
  empty?: React.ReactNode;
  tokens?: DechoTokenSet;
}

/**
 * Thumbnails for whatever came back from the upload.
 *
 * No lightbox of its own: `Dialog` already exists, and a second overlay
 * implementation in this package would be a second focus-management bug
 * waiting to happen. `onSelect` plus a Dialog is four lines at the call site.
 */
export function ImageGallery({
  items,
  onSelect,
  onRemove,
  thumbnail = 96,
  empty = "No files",
  tokens,
  style,
  ...rest
}: ImageGalleryProps): React.ReactElement {
  const t = resolveTokens(tokens);

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: t.space[6],
          textAlign: "center",
          color: t.color.textFaint,
          fontFamily: t.fontFamily.sans,
          fontSize: t.fontSize.sm,
          ...style,
        }}
      >
        {empty}
      </div>
    );
  }

  return (
    <ul
      {...rest}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnail}px, 1fr))`,
        gap: t.space[4],
        margin: 0,
        padding: 0,
        listStyle: "none",
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {items.map((item) => (
        <li key={item.id} style={{ display: "grid", gap: t.space[2], position: "relative" }}>
          <button
            type="button"
            onClick={() => onSelect?.(item)}
            disabled={onSelect == null}
            style={{
              padding: 0,
              border: `1px solid ${t.color.borderSubtle}`,
              borderRadius: t.radius.md,
              background: t.color.bg,
              cursor: onSelect != null ? "zoom-in" : "default",
              overflow: "hidden",
              aspectRatio: "1 / 1",
            }}
          >
            <img
              src={item.src}
              // The caption is the alt text when there is one; an empty alt
              // where there is not, because a filename read aloud is noise.
              alt={item.caption ?? ""}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </button>

          {(item.caption != null || item.meta != null) && (
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              {item.caption != null && (
                <span
                  style={{
                    fontSize: t.fontSize.sm,
                    color: t.color.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.caption}
                </span>
              )}
              {item.meta != null && (
                <span style={{ fontSize: t.fontSize.xs, color: t.color.textFaint }}>{item.meta}</span>
              )}
            </span>
          )}

          {onRemove != null && (
            <button
              type="button"
              aria-label={`Remove ${item.caption ?? "file"}`}
              onClick={() => onRemove(item)}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                display: "flex",
                padding: 3,
                border: "none",
                borderRadius: t.radius.sm,
                background: t.color.surfaceOverlay,
                color: t.color.text,
                cursor: "pointer",
              }}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
