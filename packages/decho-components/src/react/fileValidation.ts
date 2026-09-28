/**
 * Which dropped files are acceptable, and why the others are not.
 *
 * Pure, and separate from `FileDrop`, because the rejection *message* is the
 * part that matters and the part that is always weakest. "Invalid file" tells
 * a user nothing; "plan.xlsx is 4.2 MB — the limit is 2.0 MB" tells them
 * exactly what to do next. Everything here exists to produce the second kind.
 */

export interface FileRules {
  /**
   * Extensions (`".csv"`) or MIME types (`"text/csv"`, `"image/*"`).
   *
   * Both, because an `accept` attribute takes both and because a file dragged
   * from some applications arrives with an empty `type` — so extension
   * matching is the only thing that works, and MIME matching is the only thing
   * that works for a file named without one.
   */
  accept?: string[];
  maxBytes?: number;
  maxFiles?: number;
}

export interface RejectedFile {
  file: File;
  name: string;
  reason: string;
}

export interface ValidationResult {
  accepted: File[];
  rejected: RejectedFile[];
}

/** A size a person reads: `512 B`, `2.0 kB`, `4.2 MB`. */
export function describeFile(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown size";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Whether one file satisfies one `accept` entry. */
function matches(file: File, rule: string): boolean {
  const pattern = rule.trim().toLowerCase();
  if (pattern === "") {
    return false;
  }
  if (pattern.startsWith(".")) {
    return extensionOf(file.name) === pattern;
  }
  const type = file.type.toLowerCase();
  if (pattern.endsWith("/*")) {
    return type.startsWith(pattern.slice(0, -1));
  }
  return type === pattern;
}

export function validateFiles(files: readonly File[], rules: FileRules): ValidationResult {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    if (rules.maxFiles != null && accepted.length >= rules.maxFiles) {
      // The first N are kept rather than the last: a user who selected twelve
      // files and can have two expects the two at the top of the list.
      rejected.push({
        file,
        name: file.name,
        reason: `Only ${rules.maxFiles} file${rules.maxFiles === 1 ? "" : "s"} can be added at once.`,
      });
      continue;
    }

    if (rules.accept != null && rules.accept.length > 0) {
      const ok = rules.accept.some((rule) => matches(file, rule));
      if (!ok) {
        rejected.push({
          file,
          name: file.name,
          reason: `${file.name} is not an accepted type. Expected: ${rules.accept.join(", ")}.`,
        });
        continue;
      }
    }

    if (rules.maxBytes != null && file.size > rules.maxBytes) {
      rejected.push({
        file,
        name: file.name,
        // Both numbers, in the same units the user will see elsewhere.
        reason: `${file.name} is ${describeFile(file.size)} — the limit is ${describeFile(rules.maxBytes)}.`,
      });
      continue;
    }

    accepted.push(file);
  }

  return { accepted, rejected };
}

/** The `accept` attribute for an `<input type="file">`, from the same rules. */
export function acceptAttribute(rules: FileRules): string | undefined {
  return rules.accept != null && rules.accept.length > 0 ? rules.accept.join(",") : undefined;
}
