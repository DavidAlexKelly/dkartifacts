// symbols/catalog/individual/checkpoint.ts — standalone, tree-shakeable.
//
// Reference #3. "A predetermined point on the surface of the earth used as a
// means of controlling movement, a registration target for fire adjustment, or
// reference for location." (AAP-6) One anchor at the tip of the inverted cone.
//
// The cone is labelled "CKP", read out of the template with
// tools/control-measures/text.mjs: 16pt, against the 12pt H, W, T and W1 field
// placeholders around it. The example's "A" — which earlier reading took for
// the whole label — is the T field, the checkpoint's own designation, and it
// belongs to the caller.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const CHECKPOINT_NAME = "svg-checkpoint" as const;

export const checkpointSymbol: SymbolDefinition = {
  title: 'Checkpoint',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'CKP', labelSize: 330 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "check-point" },
};
