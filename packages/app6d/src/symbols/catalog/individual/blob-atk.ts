// symbols/catalog/individual/blob-atk.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_ATK_NAME = "svg-blob-atk" as const;

export const blobAtkSymbol: SymbolDefinition = { title: 'Attack Position (ATK)', params: { center: P(1050, 950), radius: 480, wobble: 0.22, label: 'ATK', labelSize: 150 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center', meta: { sidcTaskId: "attack-position" }, };
