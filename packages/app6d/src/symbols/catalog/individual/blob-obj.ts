// symbols/catalog/individual/blob-obj.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blobFamily, blobHandles } from "../../families";

export const BLOB_OBJ_NAME = "svg-blob-obj" as const;

export const blobObjSymbol: SymbolDefinition = { title: 'Objective (OBJ)', params: { center: P(1050, 950), radius: 480, wobble: 0.22, label: 'OBJ', labelSize: 150 }, generate: blobFamily, handles: blobHandles, unitAnchor: 'center', meta: { sidcTaskId: "objective" }, };
