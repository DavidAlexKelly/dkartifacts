/**
 * Typed errors.
 *
 * WHY THESE EXIST
 * ---------------
 * The most common failure by far is a 403 on the dataset, because the OAuth
 * scopes are necessary but not sufficient — the resource must ALSO be added to
 * the application in Developer Console under Resources. That used to surface as
 * a generic Error with a message, so a consumer wanting to render "ask your
 * admin to grant this dataset" had to string-match on it.
 *
 * Each error carries the RID and path, so a consumer can name the resource that
 * needs granting rather than telling the user "something failed".
 *
 * NAMING
 * ------
 * These were `BasemapError` and friends when this layer lived inside
 * @acc/decho-basemap. Nothing about them is map-specific — a 403 on a
 * pathfinding chunk is the same failure with the same remediation — so the
 * names lost the "Basemap" prefix on extraction. @acc/decho-basemap re-exports
 * every one of them under its old name, so no consumer had to change.
 */

export type FoundryBytesErrorKind =
  | "not-configured"
  | "access-denied"
  | "not-found"
  | "transfer"
  | "malformed-request";

export class FoundryBytesError extends Error {
  readonly kind: FoundryBytesErrorKind;
  readonly rid?: string;
  readonly path?: string;
  readonly status?: number;

  constructor(
    kind: FoundryBytesErrorKind,
    message: string,
    context: { rid?: string; path?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "FoundryBytesError";
    this.kind = kind;
    this.rid = context.rid;
    this.path = context.path;
    this.status = context.status;
  }
}

/** configureFoundryBytes() has not been called. */
export class FoundryNotConfiguredError extends FoundryBytesError {
  constructor(detail: string) {
    super("not-configured", detail);
    this.name = "FoundryNotConfiguredError";
  }
}

/**
 * 401/403. Almost always the Resources omission described above, which is why
 * the remediation is in the message rather than left to the consumer to guess.
 */
export class FoundryAccessError extends FoundryBytesError {
  constructor(rid: string, path: string, status: number) {
    super(
      "access-denied",
      `Access denied (${status}) reading "${path}" from ${rid}. The OAuth scopes ` +
        `(api:use-datasets-read, or api:mediasets-read for a media set) are ` +
        `necessary but not sufficient: the resource must also be added to this ` +
        `application in Developer Console under Resources.`,
      { rid, path, status },
    );
    this.name = "FoundryAccessError";
  }
}

/**
 * 404. Routine for chunked stores — most of the globe is ocean and those cells
 * were never written — which is why this layer has an "optional" read that
 * returns null instead of throwing. This is for the cases where absence really
 * is an error, such as a missing manifest.
 */
export class FoundryNotFoundError extends FoundryBytesError {
  constructor(rid: string, path: string) {
    super("not-found", `Not found: "${path}" in ${rid}.`, {
      rid,
      path,
      status: 404,
    });
    this.name = "FoundryNotFoundError";
  }
}

/** Any other non-OK response. */
export class FoundryTransferError extends FoundryBytesError {
  constructor(rid: string, path: string, status: number, statusText: string) {
    super(
      "transfer",
      `Read failed: ${status} ${statusText} for "${path}" in ${rid}.`,
      { rid, path, status },
    );
    this.name = "FoundryTransferError";
  }
}

/** A RID or path that could not be turned into a safe URL. */
export class FoundryMalformedRequestError extends FoundryBytesError {
  constructor(message: string, context: { rid?: string; path?: string } = {}) {
    super("malformed-request", message, context);
    this.name = "FoundryMalformedRequestError";
  }
}

/**
 * Map an HTTP response onto the right error type.
 *
 * Kept in one place so every call site classifies identically — the predecessor
 * of this function produced the same generic Error for a permissions problem
 * and a corrupt archive.
 */
export function errorForResponse(
  status: number,
  statusText: string,
  rid: string,
  path: string,
): FoundryBytesError {
  if (status === 401 || status === 403) {
    return new FoundryAccessError(rid, path, status);
  }
  if (status === 404) {return new FoundryNotFoundError(rid, path);}
  return new FoundryTransferError(rid, path, status, statusText);
}

/** True for a cancellation, which is never a failure worth reporting. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// ── Human-facing guidance ───────────────────────────────────────────────────

export interface FoundryErrorGuidance {
  /** Short headline, safe to render in a small overlay. */
  title: string;
  /** What went wrong, in one sentence. */
  detail: string;
  /**
   * What to do about it, when there is a known answer. Absent when the error
   * is not actionable by the person looking at the screen.
   */
  remediation?: string;
  /** The resource involved, when known — worth naming so it can be granted. */
  rid?: string;
  path?: string;
}

/**
 * Turn any thrown value into something worth showing a user.
 *
 * This exists so the remediation copy lives in ONE place. Every consumer was
 * otherwise going to write its own guess at what a failure means, and the
 * guesses were already drifting: one app hardcoded "the dataset has probably
 * not been added as a Resource" into its error overlay and displayed it for
 * every failure, including ones where it was untrue.
 */
export function describeFoundryError(err: unknown): FoundryErrorGuidance {
  if (err instanceof FoundryAccessError) {
    return {
      title: "Access denied",
      detail: `This application is not permitted to read ${err.path ?? "the requested data"}.`,
      remediation:
        "In Developer Console, open this application and add the dataset under " +
        "Resources. The OAuth scopes alone are not sufficient — that is what " +
        "produces this 403.",
      rid: err.rid,
      path: err.path,
    };
  }

  if (err instanceof FoundryNotFoundError) {
    return {
      title: "Data not found",
      detail: `${err.path ?? "A required file"} is missing from ${err.rid ?? "the configured store"}.`,
      remediation:
        "Check the configured RID, and that the transform that writes these " +
        "files has run — for a chunked store, that includes its manifest.",
      rid: err.rid,
      path: err.path,
    };
  }

  if (err instanceof FoundryNotConfiguredError) {
    return {
      title: "Foundry access not configured",
      detail: err.message,
      remediation:
        "Call configureFoundryBytes({ foundryUrl, getToken, platformClient }) " +
        "once at application startup, before anything reads. " +
        "@acc/decho-basemap exports the same call as configureBasemap.",
    };
  }

  if (err instanceof FoundryMalformedRequestError) {
    return {
      title: "Misconfigured",
      detail: err.message,
      remediation:
        "A configured RID or path is not well formed. This is a configuration " +
        "error rather than something the user can resolve.",
      rid: err.rid,
      path: err.path,
    };
  }

  if (err instanceof FoundryBytesError) {
    return {
      title: "Data unavailable",
      detail: err.message,
      rid: err.rid,
      path: err.path,
    };
  }

  return {
    title: "Data unavailable",
    detail: err instanceof Error ? err.message : String(err),
  };
}
