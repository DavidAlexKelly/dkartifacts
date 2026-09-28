// symbols/catalog/individual/blob-aa.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_AA_NAME = "svg-blob-aa" as const;

export const blobAaSymbol: SymbolDefinition = { title: 'Assembly Area (AA)', params: { center: P(1050, 950), radius: 560, wobble: 0.26, label: 'AA', labelSize: 180 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center', meta: { sidcTaskId: "assembly-area" }, };
