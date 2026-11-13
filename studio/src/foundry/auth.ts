/**
 * Foundry hosting, when there is any.
 *
 * The OSDK template's meta tags carry the enrollment URL, OAuth client and
 * redirect. When they are filled in, the studio reads its datasets from
 * Foundry with the signed-in user's token; when they are empty (local
 * development against a terrain-gen folder) it never touches OAuth at all.
 *
 * Scopes: dataset reads only. The datasets must ALSO be added as Resources on
 * the application in Developer Console, or every read returns 403 — the
 * scope alone is not enough.
 */
import { createPublicOauthClient, type PublicOauthClient } from "@osdk/oauth";

function meta(name: string): string | null {
  const el = document.querySelector(`meta[name="${name}"]`);
  const value = el?.getAttribute("content")?.trim() ?? "";
  // Unfilled placeholders look like %VITE_…%.
  return value === "" || /%.+%/.test(value) ? null : value;
}

export interface FoundryConfig {
  foundryUrl: string;
  auth: PublicOauthClient;
}

function create(): FoundryConfig | null {
  const foundryUrl = meta("osdk-foundryUrl");
  const clientId = meta("osdk-clientId");
  const redirectUrl = meta("osdk-redirectUrl");
  if (!foundryUrl || !clientId || !redirectUrl) {return null;}
  return {
    foundryUrl: foundryUrl.replace(/\/$/, ""),
    auth: createPublicOauthClient(clientId, foundryUrl, redirectUrl, {
      scopes: ["api:use-datasets-read"],
    }),
  };
}

export const foundry: FoundryConfig | null = create();

/** The catalog dataset the build was configured with, if any. */
export const configuredCatalogRid: string | null = meta("studio-catalogRid");

/** True on the OAuth redirect page, which must finish signing in first. */
export function isAuthCallback(): boolean {
  const redirect = meta("osdk-redirectUrl");
  if (!redirect) {return false;}
  try {
    return new URL(redirect).pathname === window.location.pathname;
  } catch {
    return false;
  }
}
