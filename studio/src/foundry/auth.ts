/**
 * Foundry hosting, when there is any.
 *
 * Three ways to get a token, in order:
 *
 *   OAuth        the OSDK template's meta tags (enrollment URL, client id,
 *                redirect). The normal, hosted case.
 *   dev token    VITE_FOUNDRY_TOKEN in .env.local, in `npm run dev` only:
 *                a personal token for working locally against a real
 *                enrollment, or "fake" against the dev fake-Foundry server.
 *                Never read by a production build.
 *   none         no Foundry at all: the studio reads local folders only.
 *
 * Scopes: dataset reads, ontology reads and writes. Every dataset and object
 * type must ALSO be a Resource on the application in Developer Console.
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
  getToken(): Promise<string>;
  /** Present for OAuth; absent for a dev token. */
  auth?: PublicOauthClient;
}

export const SCOPES = [
  "api:use-datasets-read",
  "api:use-ontologies-read",
  "api:use-ontologies-write",
];

function create(): FoundryConfig | null {
  const foundryUrl = meta("osdk-foundryUrl")?.replace(/\/$/, "");
  if (!foundryUrl) {return null;}
  const devToken = import.meta.env.DEV ? (import.meta.env.VITE_FOUNDRY_TOKEN as string | undefined) : undefined;
  if (devToken) {
    return { foundryUrl, getToken: async () => devToken };
  }
  const clientId = meta("osdk-clientId");
  const redirectUrl = meta("osdk-redirectUrl");
  if (!clientId || !redirectUrl) {return null;}
  const auth = createPublicOauthClient(clientId, foundryUrl, redirectUrl, { scopes: SCOPES });
  return { foundryUrl, auth, getToken: () => auth() };
}

export const foundry: FoundryConfig | null = create();

/** The catalog dataset the build was configured with, if any. */
export const configuredCatalogRid: string | null = meta("studio-catalogRid");

/** True on the OAuth redirect page, which must finish signing in first. */
export function isAuthCallback(): boolean {
  const redirect = meta("osdk-redirectUrl");
  if (!redirect || !foundry?.auth) {return false;}
  try {
    return new URL(redirect).pathname === window.location.pathname;
  } catch {
    return false;
  }
}
