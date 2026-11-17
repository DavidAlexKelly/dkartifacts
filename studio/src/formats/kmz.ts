/** KMZ: zipped KML, with the main document at doc.kml. */
import type { StudioFeature } from "../project/types";
import { parseKml, toKml, type Imported } from "./vector";
import { readZip, writeZip } from "./zip";

/** The KMZ's doc.kml (or its first .kml) as a layer. Images and other files inside are ignored. */
export async function readKmz(bytes: Uint8Array, title = "layer"): Promise<Imported> {
  const files = await readZip(bytes);
  const names = [...files.keys()].filter((n) => /\.kml$/i.test(n) && !n.startsWith("__MACOSX/"));
  const main = names.find((n) => n.toLowerCase() === "doc.kml") ?? names.sort()[0];
  if (!main) {throw new Error("No .kml document inside the KMZ");}
  const text = new TextDecoder("utf-8").decode(files.get(main)!);
  return { title, ...parseKml(text) };
}

export async function writeKmz(title: string, features: StudioFeature[], fields: string[], nameField?: string | null): Promise<Uint8Array> {
  return writeZip({ "doc.kml": toKml(title, features, fields, nameField) });
}
