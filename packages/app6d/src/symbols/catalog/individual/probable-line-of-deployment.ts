// symbols/catalog/individual/probable-line-of-deployment.ts — standalone,
// tree-shakeable.
//
// Reference #98. "A line selected on the ground, usually the last covered and
// concealed position, where an attacking force deploys into assault
// formation."
//
// Solid, on the evidence: the example crop draws the line as one unbroken
// path, and a dashed line comes out of the PDF as one path per dash. The text
// blocks sit at both ends, as with the rest of the line family.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const PROBABLE_LINE_OF_DEPLOYMENT_NAME = "svg-probable-line-of-deployment" as const;

export const probableLineOfDeploymentSymbol: SymbolDefinition = {
  title: 'Probable Line of Deployment (PLD)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'PLD', labelSize: 240, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
