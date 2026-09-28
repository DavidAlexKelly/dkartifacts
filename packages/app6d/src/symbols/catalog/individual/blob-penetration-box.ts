// symbols/catalog/individual/blob-penetration-box.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_PENETRATION_BOX_NAME = "svg-blob-penetration-box" as const;

export const blobPenetrationBoxSymbol: SymbolDefinition = { title: 'Penetration Box', params: { center: P(1050, 950), radius: 480, wobble: 0.22, label: '', labelSize: 150 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center' };
