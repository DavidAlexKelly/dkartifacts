// symbols/catalog/individual/blob-atk-alt.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_ATK_ALT_NAME = "svg-blob-atk-alt" as const;

export const blobAtkAltSymbol: SymbolDefinition = { title: 'Attack Position (ATK, alt.)', params: { center: P(1050, 950), radius: 560, wobble: 0.32, label: 'ATK', labelSize: 150 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center', meta: { sidcTaskId: "attack-position" }, };
