import { createPlatformClient, type PlatformClient } from "@osdk/client";
import { createPublicOauthClient, type PublicOauthClient } from "@osdk/oauth";

function getMetaTagContent(tagName: string): string {
  const elements = document.querySelectorAll(`meta[name="${tagName}"]`);
  const element = elements.item(elements.length - 1);
  const value = element ? element.getAttribute("content") : null;
  if (value == null || value === "") {
    throw new Error(`Meta tag ${tagName} not found or empty`);
  }
  if (value.match(/%.+%/)) {
    throw new Error(
      `Meta tag ${tagName} contains placeholder value. Please add ${value.replace(
        /%/g,
        ""
      )} to your .env files`
    );
  }
  return value;
}

/**
 * Exported so @acc/decho-basemap can build Foundry REST URLs against the same
 * origin the OSDK clients use. The basemap reads dataset files with fetch()
 * rather than the OSDK Files API, because that API returns a Blob and gives no
 * way to set a Range header — but it must never hardcode a host.
 */
export const foundryUrl = getMetaTagContent("osdk-foundryUrl");
const clientId = getMetaTagContent("osdk-clientId");
const redirectUrl = getMetaTagContent("osdk-redirectUrl");

/**
 * The template's default scopes do not cover the Platform APIs the offline
 * basemap uses.
 *
 * NOTE: these scopes are necessary but NOT sufficient. The tile and glyph
 * datasets must ALSO be added as Resources on this application in Developer
 * Console (Developer Console > your app > Resources). With the scopes alone,
 * every tile request returns 403.
 */
const scopes = [
  "api:use-datasets-read", // dataset file content (PMTiles archives, glyphs)
  // NOTE: only request scopes this application is actually granted in
  // Developer Console. Asking for an ungranted scope fails the OAuth
  // authorization outright, which looks like "the app won't load" rather than
  // like a permissions problem.
  //
  // "api:mediasets-read" is deliberately NOT requested: this example points at
  // a dataset tile store, and the media-set path is unused. Add it only if you
  // switch to `mediaSetRid`, and enable it on the app registration first.
];

export const auth: PublicOauthClient = createPublicOauthClient(
  clientId,
  foundryUrl,
  redirectUrl,
  { scopes }
);

/**
 * Initialize the client to interact with the Platform SDK
 *
 * If you later add an Ontology SDK to your application, follow the steps in
 * https://accenture.palantirfoundry.com/docs/foundry/ontology-sdk/add-osdk-to-bootstrapped-repository/
 * to correctly set it up in this project.
 */
export const client: PlatformClient = createPlatformClient(foundryUrl, auth);

export default client;
