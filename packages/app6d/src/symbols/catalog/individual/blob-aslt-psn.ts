// symbols/catalog/individual/blob-aslt-psn.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_ASLT_PSN_NAME = "svg-blob-aslt-psn" as const;

export const blobAsltPsnSymbol: SymbolDefinition = { title: 'Assault Position (ASLT PSN)', params: { center: P(1050, 950), radius: 620, wobble: 0.24, label: ['ASLT', 'PSN'], labelSize: 190 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center', meta: { sidcTaskId: "assault-position" }, };
