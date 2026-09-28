// symbols/catalog/individual/index.ts — barrel exporting each individually
// tree-shakeable symbol definition, PLUS a ready-made name->definition map
// (INDIVIDUAL_SYMBOLS) for convenient composition into a SymbolCatalog.
// Importing this file pulls in the full built-in catalog; importing a single
// file (e.g. "./block") pulls in only that one symbol and its geometry
// dependencies — every built-in APP-6D symbol is individually tree-shakeable.
import { BLOCK_NAME, blockSymbol } from "./block";
import { SEIZE_NAME, seizeSymbol } from "./seize";
import { SCREEN_NAME, screenSymbol } from "./screen";
import { DESTROY_NAME, destroySymbol } from "./destroy";
import { COUNTERATTACK_NAME, counterattackSymbol } from "./counterattack";
import { BREACH_NAME, breachSymbol } from "./breach";
import { BYPASS_NAME, bypassSymbol } from "./bypass";
import { CANALIZE_NAME, canalizeSymbol } from "./canalize";
import { CLEAR_NAME, clearSymbol } from "./clear";
import { PENETRATE_NAME, penetrateSymbol } from "./penetrate";
import { DISRUPT_NAME, disruptSymbol } from "./disrupt";
import { INTERDICT_NAME, interdictSymbol } from "./interdict";
import { NEUTRALIZE_NAME, neutralizeSymbol } from "./neutralize";
import { RETAIN_NAME, retainSymbol } from "./retain";
import { CONTAIN_NAME, containSymbol } from "./contain";
import { COUNTERATTACK_BY_FIRE_NAME, counterattackByFireSymbol } from "./counterattack-by-fire";
import { FIX_NAME, fixSymbol } from "./fix";
import { FOLLOW_AND_ASSUME_NAME, followAndAssumeSymbol } from "./follow-and-assume";
import { FOLLOW_AND_SUPPORT_NAME, followAndSupportSymbol } from "./follow-and-support";
import { ISOLATE_NAME, isolateSymbol } from "./isolate";
import { OCCUPY_NAME, occupySymbol } from "./occupy";
import { SECURE_NAME, secureSymbol } from "./secure";
import { RETIREMENT_ARC_NAME, retirementArcSymbol } from "./retirement-arc";
import { DELAY_ARC_NAME, delayArcSymbol } from "./delay-arc";
import { WITHDRAW_ARC_NAME, withdrawArcSymbol } from "./withdraw-arc";
import { WITHDRAW_PRESSURE_ARC_NAME, withdrawPressureArcSymbol } from "./withdraw-pressure-arc";
import { RETROGRADE_NOTCH_NAME, retrogradeNotchSymbol } from "./retrograde-notch";
import { SCREEN_POST_NAME, screenPostSymbol } from "./screen-post";
import { BLOB_ATK_NAME, blobAtkSymbol } from "./blob-atk";
import { BLOB_ATK_ALT_NAME, blobAtkAltSymbol } from "./blob-atk-alt";
import { BLOB_OBJ_NAME, blobObjSymbol } from "./blob-obj";
import { BLOB_AA_NAME, blobAaSymbol } from "./blob-aa";
import { BLOB_ASLT_PSN_NAME, blobAsltPsnSymbol } from "./blob-aslt-psn";
import { BLOB_PENETRATION_BOX_NAME, blobPenetrationBoxSymbol } from "./blob-penetration-box";
import { WIRE_X_NAME, wireXSymbol } from "./wire-x";
import { MINEFIELD_SQUARE_NAME, minefieldSquareSymbol } from "./minefield-square";
import { ABATIS_TRIANGLE_NAME, abatisTriangleSymbol } from "./abatis-triangle";
import { WIRE_CHEVRON_NAME, wireChevronSymbol } from "./wire-chevron";
import { WIRE_TICK_LINE_NAME, wireTickLineSymbol } from "./wire-tick-line";
import { FORTIFIED_AREA_NAME, fortifiedAreaSymbol } from "./fortified-area";
import { AXIS_NOTCHED_NAME, axisNotchedSymbol } from "./axis-notched";
import { AXIS_NOTCHED_SIMPLE_NAME, axisNotchedSimpleSymbol } from "./axis-notched-simple";
import { AXIS_NOTCHED_WIDE_NAME, axisNotchedWideSymbol } from "./axis-notched-wide";
import { GATE_CROSSING_NAME, gateCrossingSymbol } from "./gate-crossing";
import { LANE_MARKER_NAME, laneMarkerSymbol } from "./lane-marker";
import { TWO_WAY_ROUTE_NAME, twoWayRouteSymbol } from "./two-way-route";
import { MAIN_ATTACK_NAME, mainAttackSymbol } from "./main-attack";
import { SUPPORTING_ATTACK_NAME, supportingAttackSymbol } from "./supporting-attack";
import { AVIATION_AXIS_OF_ADVANCE_NAME, aviationAxisOfAdvanceSymbol } from "./aviation-axis-of-advance";
import { AMBUSH_NAME, ambushSymbol } from "./ambush";
import { SUPPORT_BY_FIRE_POSITION_NAME, supportByFirePositionSymbol } from "./support-by-fire-position";
import { GUARD_GG_NAME, guardGgSymbol } from "./guard-gg";
import { COVER_CC_NAME, coverCcSymbol } from "./cover-cc";
// Inverted-cone point markers (control measures #1, #2, #3, #9, #10, #11,
// #105, #264, #265, #266) — one anchor at the tip, static shape.
import { CONTROL_POINT_NAME, controlPointSymbol } from "./control-point";
import { AMNESTY_POINT_NAME, amnestyPointSymbol } from "./amnesty-point";
import { CHECKPOINT_NAME, checkpointSymbol } from "./checkpoint";
import { LINKUP_POINT_NAME, linkupPointSymbol } from "./linkup-point";
import { PASSAGE_POINT_NAME, passagePointSymbol } from "./passage-point";
import { POINT_OF_INTEREST_NAME, pointOfInterestSymbol } from "./point-of-interest";
import { POINT_OF_DEPARTURE_NAME, pointOfDepartureSymbol } from "./point-of-departure";
import { FIRING_POINT_NAME, firingPointSymbol } from "./firing-point";
import { HIDE_POINT_NAME, hidePointSymbol } from "./hide-point";
import { LAUNCH_POINT_NAME, launchPointSymbol } from "./launch-point";
// More of the same family, identified from the extracted geometry rather than
// from draw rules the page crop lost (#13, #14, #16, #109, #270, #271).
import { RALLY_POINT_NAME, rallyPointSymbol } from "./rally-point";
import { RELEASE_POINT_NAME, releasePointSymbol } from "./release-point";
import { START_POINT_NAME, startPointSymbol } from "./start-point";
import { RELOAD_POINT_NAME, reloadPointSymbol } from "./reload-point";
import { SURVEY_CONTROL_POINT_NAME, surveyControlPointSymbol } from "./survey-control-point";
import { DOWNED_AIRCREW_PICKUP_POINT_NAME, downedAircrewPickupPointSymbol } from "./downed-aircrew-pickup-point";
// Centre-anchored static point graphics (#6, #7, #8, #19, #107).
import { CONTACT_POINT_NAME, contactPointSymbol } from "./contact-point";
import { COORDINATING_POINT_NAME, coordinatingPointSymbol } from "./coordinating-point";
import { DECISION_POINT_NAME, decisionPointSymbol } from "./decision-point";
import { WAYPOINT_NAME, waypointSymbol } from "./waypoint";
import { AIR_CONTROL_POINT_NAME, airControlPointSymbol } from "./air-control-point";
// Labelled lines — same draw rules word for word, different text (#30, #51,
// #93, #95, #96, #97, #111, #235).
import { PHASE_LINE_NAME, phaseLineSymbol } from "./phase-line";
import { BRIDGEHEAD_LINE_NAME, bridgeheadLineSymbol } from "./bridgehead-line";
import { FINAL_COORDINATION_LINE_NAME, finalCoordinationLineSymbol } from "./final-coordination-line";
import { LIMIT_OF_ADVANCE_NAME, limitOfAdvanceSymbol } from "./limit-of-advance";
import { LINE_OF_DEPARTURE_NAME, lineOfDepartureSymbol } from "./line-of-departure";
import { LINE_OF_DEPARTURE_LINE_OF_CONTACT_NAME, lineOfDepartureLineOfContactSymbol } from "./line-of-departure-line-of-contact";
import { IFF_OFF_LINE_NAME, iffOffLineSymbol } from "./iff-off-line";
import { FIRE_SUPPORT_COORDINATION_LINE_NAME, fireSupportCoordinationLineSymbol } from "./fire-support-coordination-line";
// Drawn areas with a movable label block (#240, #241, #242, #274, #275, #277,
// #279, #280, #281, #282).
import { FREE_FIRE_AREA_NAME, freeFireAreaSymbol } from "./free-fire-area";
import { NO_FIRE_AREA_NAME, noFireAreaSymbol } from "./no-fire-area";
import { RESTRICTED_FIRE_AREA_NAME, restrictedFireAreaSymbol } from "./restricted-fire-area";
import { ARTILLERY_TARGET_INTELLIGENCE_ZONE_NAME, artilleryTargetIntelligenceZoneSymbol } from "./artillery-target-intelligence-zone";
import { CALL_FOR_FIRE_ZONE_NAME, callForFireZoneSymbol } from "./call-for-fire-zone";
import { CRITICAL_FRIENDLY_ZONE_NAME, criticalFriendlyZoneSymbol } from "./critical-friendly-zone";
import { SENSOR_ZONE_NAME, sensorZoneSymbol } from "./sensor-zone";
import { TARGET_BUILD_UP_AREA_NAME, targetBuildUpAreaSymbol } from "./target-build-up-area";
import { TARGET_VALUE_AREA_NAME, targetValueAreaSymbol } from "./target-value-area";
import { ZONE_OF_RESPONSIBILITY_NAME, zoneOfResponsibilitySymbol } from "./zone-of-responsibility";
import { OBSTACLE_ZONE_NAME, obstacleZoneSymbol } from "./obstacle-zone";
import { OBSTACLE_FREE_ZONE_NAME, obstacleFreeZoneSymbol } from "./obstacle-free-zone";
import { OBSTACLE_RESTRICTED_ZONE_NAME, obstacleRestrictedZoneSymbol } from "./obstacle-restricted-zone";
// More labelled lines, including the fire-support ones capped at each end
// (#52, #53, #98, #236, #237).
import { HOLDING_LINE_NAME, holdingLineSymbol } from "./holding-line";
import { RELEASE_LINE_NAME, releaseLineSymbol } from "./release-line";
import { PROBABLE_LINE_OF_DEPLOYMENT_NAME, probableLineOfDeploymentSymbol } from "./probable-line-of-deployment";
import { FIRE_SUPPORT_SAFETY_LINE_NAME, fireSupportSafetyLineSymbol } from "./fire-support-safety-line";
import { NO_FIRE_LINE_NAME, noFireLineSymbol } from "./no-fire-line";
// Obstacle lines — the tick row with teeth and posts (#293, #294, #304, #305).
import { ANTITANK_DITCH_UNDER_CONSTRUCTION_NAME, antitankDitchUnderConstructionSymbol } from "./antitank-ditch-under-construction";
import { ANTITANK_DITCH_COMPLETED_NAME, antitankDitchCompletedSymbol } from "./antitank-ditch-completed";
import { SINGLE_FENCE_NAME, singleFenceSymbol } from "./single-fence";
import { DOUBLE_FENCE_NAME, doubleFenceSymbol } from "./double-fence";
// Scalloped lines (#68, #69, and the FLOT the task catalog was waiting on).
import { FORWARD_EDGE_OF_BATTLE_AREA_NAME, forwardEdgeOfBattleAreaSymbol } from "./forward-edge-of-battle-area";
import { FORWARD_EDGE_OF_BATTLE_AREA_PLANNED_NAME, forwardEdgeOfBattleAreaPlannedSymbol } from "./forward-edge-of-battle-area-planned";
import { FORWARD_LINE_OF_OWN_TROOPS_NAME, forwardLineOfOwnTroopsSymbol } from "./forward-line-of-own-troops";
// Airspace engagement zones and the remaining labelled areas (#136, #137,
// #138, #142, #165, #276, #278).
import { MISSILE_ENGAGEMENT_ZONE_NAME, missileEngagementZoneSymbol } from "./missile-engagement-zone";
import { LOW_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME, lowAltitudeMissileEngagementZoneSymbol } from "./low-altitude-missile-engagement-zone";
import { HIGH_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME, highAltitudeMissileEngagementZoneSymbol } from "./high-altitude-missile-engagement-zone";
import { SHORT_RANGE_AIR_DEFENCE_ENGAGEMENT_ZONE_NAME, shortRangeAirDefenceEngagementZoneSymbol } from "./short-range-air-defence-engagement-zone";
import { CENSOR_ZONE_NAME, censorZoneSymbol } from "./censor-zone";
import { DEAD_SPACE_AREA_NAME, deadSpaceAreaSymbol } from "./dead-space-area";
import { SEARCH_AREA_NAME, searchAreaSymbol } from "./search-area";
// Targets and range fans (#252, #253, #283, #284).
import { CIRCULAR_TARGET_NAME, circularTargetSymbol } from "./circular-target";
import { RECTANGULAR_TARGET_NAME, rectangularTargetSymbol } from "./rectangular-target";
import { CIRCULAR_RANGE_FAN_NAME, circularRangeFanSymbol } from "./circular-range-fan";
import { SECTOR_RANGE_FAN_NAME, sectorRangeFanSymbol } from "./sector-range-fan";
// Not extracted rows: tasks TACTIC_TASK_CATALOG has carried with no graphic.
import { RESTRICTED_OPERATIONS_ZONE_NAME, restrictedOperationsZoneSymbol } from "./restricted-operations-zone";
import { AIRSPACE_COORDINATION_AREA_CIRCULAR_NAME, airspaceCoordinationAreaCircularSymbol } from "./airspace-coordination-area-circular";
import { OBSTACLE_LINE_NAME, obstacleLineSymbol } from "./obstacle-line";
import { LINE_OF_CONTACT_NAME, lineOfContactSymbol } from "./line-of-contact";
import { FORWARD_LINE_OF_OWN_TROOPS_PLANNED_NAME, forwardLineOfOwnTroopsPlannedSymbol } from "./forward-line-of-own-troops-planned";
// Drawn zones and areas — three or more anchors, one label each (#41, #42,
// #43, #58, #121, #122, #130, #131, #132, #143, #239, #263).
import { DROP_ZONE_NAME, dropZoneSymbol } from "./drop-zone";
import { EXTRACTION_ZONE_NAME, extractionZoneSymbol } from "./extraction-zone";
import { LANDING_ZONE_NAME, landingZoneSymbol } from "./landing-zone";
import { ENGAGEMENT_AREA_NAME, engagementAreaSymbol } from "./engagement-area";
import { BASE_DEFENCE_ZONE_NAME, baseDefenceZoneSymbol } from "./base-defence-zone";
import { HIGH_DENSITY_AIRSPACE_CONTROL_ZONE_NAME, highDensityAirspaceControlZoneSymbol } from "./high-density-airspace-control-zone";
import { WEAPON_ENGAGEMENT_ZONE_NAME, weaponEngagementZoneSymbol } from "./weapon-engagement-zone";
import { FIGHTER_ENGAGEMENT_ZONE_NAME, fighterEngagementZoneSymbol } from "./fighter-engagement-zone";
import { JOINT_ENGAGEMENT_ZONE_NAME, jointEngagementZoneSymbol } from "./joint-engagement-zone";
import { WEAPONS_FREE_ZONE_NAME, weaponsFreeZoneSymbol } from "./weapons-free-zone";
import { AIRSPACE_COORDINATION_AREA_NAME, airspaceCoordinationAreaSymbol } from "./airspace-coordination-area";
import { FIRE_SUPPORT_AREA_NAME, fireSupportAreaSymbol } from "./fire-support-area";
// More drawn zones, targets by area, and one line among them (#21, #46, #50,
// #125, #126, #254, #255, #257, #261, #289, #335).
import { AIRFIELD_ZONE_NAME, airfieldZoneSymbol } from "./airfield-zone";
import { LIMITED_ACCESS_AREA_NAME, limitedAccessAreaSymbol } from "./limited-access-area";
import { AIRHEAD_LINE_NAME, airheadLineSymbol } from "./airhead-line";
import { AIR_TO_AIR_RESTRICTED_OPERATIONS_ZONE_NAME, airToAirRestrictedOperationsZoneSymbol } from "./air-to-air-restricted-operations-zone";
import { UAV_RESTRICTED_OPERATIONS_ZONE_NAME, uavRestrictedOperationsZoneSymbol } from "./uav-restricted-operations-zone";
import { IRREGULAR_TARGET_NAME, irregularTargetSymbol } from "./irregular-target";
import { SERIES_OF_TARGETS_NAME, seriesOfTargetsSymbol } from "./series-of-targets";
import { GROUP_OF_TARGETS_NAME, groupOfTargetsSymbol } from "./group-of-targets";
import { BOMB_AREA_NAME, bombAreaSymbol } from "./bomb-area";
import { OBSTACLE_BELT_NAME, obstacleBeltSymbol } from "./obstacle-belt";
import { UNEXPLODED_ORDNANCE_AREA_NAME, unexplodedOrdnanceAreaSymbol } from "./unexploded-ordnance-area";
import { FERRY_NAME, ferrySymbol } from "./ferry";
import { GENERAL_AREA_NAME, generalAreaSymbol } from "./general-area";
import { GENERAL_AREA_PLANNED_NAME, generalAreaPlannedSymbol } from "./general-area-planned";
import type { SymbolDefinition } from "../../../engine/types";

export { blockSymbol, BLOCK_NAME } from "./block";
export { seizeSymbol, SEIZE_NAME } from "./seize";
export { screenSymbol, SCREEN_NAME } from "./screen";
export { destroySymbol, DESTROY_NAME } from "./destroy";
export { counterattackSymbol, COUNTERATTACK_NAME } from "./counterattack";
export { breachSymbol, BREACH_NAME } from "./breach";
export { bypassSymbol, BYPASS_NAME } from "./bypass";
export { canalizeSymbol, CANALIZE_NAME } from "./canalize";
export { clearSymbol, CLEAR_NAME } from "./clear";
export { penetrateSymbol, PENETRATE_NAME } from "./penetrate";
export { disruptSymbol, DISRUPT_NAME } from "./disrupt";
export { interdictSymbol, INTERDICT_NAME } from "./interdict";
export { neutralizeSymbol, NEUTRALIZE_NAME } from "./neutralize";
export { retainSymbol, RETAIN_NAME } from "./retain";
export { containSymbol, CONTAIN_NAME } from "./contain";
export { counterattackByFireSymbol, COUNTERATTACK_BY_FIRE_NAME } from "./counterattack-by-fire";
export { fixSymbol, FIX_NAME } from "./fix";
export { followAndAssumeSymbol, FOLLOW_AND_ASSUME_NAME } from "./follow-and-assume";
export { followAndSupportSymbol, FOLLOW_AND_SUPPORT_NAME } from "./follow-and-support";
export { isolateSymbol, ISOLATE_NAME } from "./isolate";
export { occupySymbol, OCCUPY_NAME } from "./occupy";
export { secureSymbol, SECURE_NAME } from "./secure";
export { retirementArcSymbol, RETIREMENT_ARC_NAME } from "./retirement-arc";
export { delayArcSymbol, DELAY_ARC_NAME } from "./delay-arc";
export { withdrawArcSymbol, WITHDRAW_ARC_NAME } from "./withdraw-arc";
export { withdrawPressureArcSymbol, WITHDRAW_PRESSURE_ARC_NAME } from "./withdraw-pressure-arc";
export { retrogradeNotchSymbol, RETROGRADE_NOTCH_NAME } from "./retrograde-notch";
export { screenPostSymbol, SCREEN_POST_NAME } from "./screen-post";
export { blobAtkSymbol, BLOB_ATK_NAME } from "./blob-atk";
export { blobAtkAltSymbol, BLOB_ATK_ALT_NAME } from "./blob-atk-alt";
export { blobObjSymbol, BLOB_OBJ_NAME } from "./blob-obj";
export { blobAaSymbol, BLOB_AA_NAME } from "./blob-aa";
export { blobAsltPsnSymbol, BLOB_ASLT_PSN_NAME } from "./blob-aslt-psn";
export { blobPenetrationBoxSymbol, BLOB_PENETRATION_BOX_NAME } from "./blob-penetration-box";
export { wireXSymbol, WIRE_X_NAME } from "./wire-x";
export { minefieldSquareSymbol, MINEFIELD_SQUARE_NAME } from "./minefield-square";
export { abatisTriangleSymbol, ABATIS_TRIANGLE_NAME } from "./abatis-triangle";
export { wireChevronSymbol, WIRE_CHEVRON_NAME } from "./wire-chevron";
export { wireTickLineSymbol, WIRE_TICK_LINE_NAME } from "./wire-tick-line";
export { fortifiedAreaSymbol, FORTIFIED_AREA_NAME } from "./fortified-area";
export { axisNotchedSymbol, AXIS_NOTCHED_NAME } from "./axis-notched";
export { axisNotchedSimpleSymbol, AXIS_NOTCHED_SIMPLE_NAME } from "./axis-notched-simple";
export { axisNotchedWideSymbol, AXIS_NOTCHED_WIDE_NAME } from "./axis-notched-wide";
export { gateCrossingSymbol, GATE_CROSSING_NAME } from "./gate-crossing";
export { laneMarkerSymbol, LANE_MARKER_NAME } from "./lane-marker";
export { twoWayRouteSymbol, TWO_WAY_ROUTE_NAME } from "./two-way-route";
export { mainAttackSymbol, MAIN_ATTACK_NAME } from "./main-attack";
export { supportingAttackSymbol, SUPPORTING_ATTACK_NAME } from "./supporting-attack";
export { aviationAxisOfAdvanceSymbol, AVIATION_AXIS_OF_ADVANCE_NAME } from "./aviation-axis-of-advance";
export { ambushSymbol, AMBUSH_NAME } from "./ambush";
export { supportByFirePositionSymbol, SUPPORT_BY_FIRE_POSITION_NAME } from "./support-by-fire-position";
export { guardGgSymbol, GUARD_GG_NAME } from "./guard-gg";
export { coverCcSymbol, COVER_CC_NAME } from "./cover-cc";
export { controlPointSymbol, CONTROL_POINT_NAME } from "./control-point";
export { amnestyPointSymbol, AMNESTY_POINT_NAME } from "./amnesty-point";
export { checkpointSymbol, CHECKPOINT_NAME } from "./checkpoint";
export { linkupPointSymbol, LINKUP_POINT_NAME } from "./linkup-point";
export { passagePointSymbol, PASSAGE_POINT_NAME } from "./passage-point";
export { pointOfInterestSymbol, POINT_OF_INTEREST_NAME } from "./point-of-interest";
export { pointOfDepartureSymbol, POINT_OF_DEPARTURE_NAME } from "./point-of-departure";
export { firingPointSymbol, FIRING_POINT_NAME } from "./firing-point";
export { hidePointSymbol, HIDE_POINT_NAME } from "./hide-point";
export { launchPointSymbol, LAUNCH_POINT_NAME } from "./launch-point";
export { rallyPointSymbol, RALLY_POINT_NAME } from "./rally-point";
export { releasePointSymbol, RELEASE_POINT_NAME } from "./release-point";
export { startPointSymbol, START_POINT_NAME } from "./start-point";
export { reloadPointSymbol, RELOAD_POINT_NAME } from "./reload-point";
export { surveyControlPointSymbol, SURVEY_CONTROL_POINT_NAME } from "./survey-control-point";
export { downedAircrewPickupPointSymbol, DOWNED_AIRCREW_PICKUP_POINT_NAME } from "./downed-aircrew-pickup-point";
export { contactPointSymbol, CONTACT_POINT_NAME } from "./contact-point";
export { coordinatingPointSymbol, COORDINATING_POINT_NAME } from "./coordinating-point";
export { decisionPointSymbol, DECISION_POINT_NAME } from "./decision-point";
export { waypointSymbol, WAYPOINT_NAME } from "./waypoint";
export { airControlPointSymbol, AIR_CONTROL_POINT_NAME } from "./air-control-point";
export { phaseLineSymbol, PHASE_LINE_NAME } from "./phase-line";
export { bridgeheadLineSymbol, BRIDGEHEAD_LINE_NAME } from "./bridgehead-line";
export { finalCoordinationLineSymbol, FINAL_COORDINATION_LINE_NAME } from "./final-coordination-line";
export { limitOfAdvanceSymbol, LIMIT_OF_ADVANCE_NAME } from "./limit-of-advance";
export { lineOfDepartureSymbol, LINE_OF_DEPARTURE_NAME } from "./line-of-departure";
export { lineOfDepartureLineOfContactSymbol, LINE_OF_DEPARTURE_LINE_OF_CONTACT_NAME } from "./line-of-departure-line-of-contact";
export { iffOffLineSymbol, IFF_OFF_LINE_NAME } from "./iff-off-line";
export { fireSupportCoordinationLineSymbol, FIRE_SUPPORT_COORDINATION_LINE_NAME } from "./fire-support-coordination-line";
export { freeFireAreaSymbol, FREE_FIRE_AREA_NAME } from "./free-fire-area";
export { noFireAreaSymbol, NO_FIRE_AREA_NAME } from "./no-fire-area";
export { restrictedFireAreaSymbol, RESTRICTED_FIRE_AREA_NAME } from "./restricted-fire-area";
export { artilleryTargetIntelligenceZoneSymbol, ARTILLERY_TARGET_INTELLIGENCE_ZONE_NAME } from "./artillery-target-intelligence-zone";
export { callForFireZoneSymbol, CALL_FOR_FIRE_ZONE_NAME } from "./call-for-fire-zone";
export { criticalFriendlyZoneSymbol, CRITICAL_FRIENDLY_ZONE_NAME } from "./critical-friendly-zone";
export { sensorZoneSymbol, SENSOR_ZONE_NAME } from "./sensor-zone";
export { targetBuildUpAreaSymbol, TARGET_BUILD_UP_AREA_NAME } from "./target-build-up-area";
export { targetValueAreaSymbol, TARGET_VALUE_AREA_NAME } from "./target-value-area";
export { zoneOfResponsibilitySymbol, ZONE_OF_RESPONSIBILITY_NAME } from "./zone-of-responsibility";
export { obstacleZoneSymbol, OBSTACLE_ZONE_NAME } from "./obstacle-zone";
export { obstacleFreeZoneSymbol, OBSTACLE_FREE_ZONE_NAME } from "./obstacle-free-zone";
export { obstacleRestrictedZoneSymbol, OBSTACLE_RESTRICTED_ZONE_NAME } from "./obstacle-restricted-zone";
export { holdingLineSymbol, HOLDING_LINE_NAME } from "./holding-line";
export { releaseLineSymbol, RELEASE_LINE_NAME } from "./release-line";
export { probableLineOfDeploymentSymbol, PROBABLE_LINE_OF_DEPLOYMENT_NAME } from "./probable-line-of-deployment";
export { fireSupportSafetyLineSymbol, FIRE_SUPPORT_SAFETY_LINE_NAME } from "./fire-support-safety-line";
export { noFireLineSymbol, NO_FIRE_LINE_NAME } from "./no-fire-line";
export { antitankDitchUnderConstructionSymbol, ANTITANK_DITCH_UNDER_CONSTRUCTION_NAME } from "./antitank-ditch-under-construction";
export { antitankDitchCompletedSymbol, ANTITANK_DITCH_COMPLETED_NAME } from "./antitank-ditch-completed";
export { singleFenceSymbol, SINGLE_FENCE_NAME } from "./single-fence";
export { doubleFenceSymbol, DOUBLE_FENCE_NAME } from "./double-fence";
export { forwardEdgeOfBattleAreaSymbol, FORWARD_EDGE_OF_BATTLE_AREA_NAME } from "./forward-edge-of-battle-area";
export { forwardEdgeOfBattleAreaPlannedSymbol, FORWARD_EDGE_OF_BATTLE_AREA_PLANNED_NAME } from "./forward-edge-of-battle-area-planned";
export { forwardLineOfOwnTroopsSymbol, FORWARD_LINE_OF_OWN_TROOPS_NAME } from "./forward-line-of-own-troops";
export { missileEngagementZoneSymbol, MISSILE_ENGAGEMENT_ZONE_NAME } from "./missile-engagement-zone";
export { lowAltitudeMissileEngagementZoneSymbol, LOW_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME } from "./low-altitude-missile-engagement-zone";
export { highAltitudeMissileEngagementZoneSymbol, HIGH_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME } from "./high-altitude-missile-engagement-zone";
export { shortRangeAirDefenceEngagementZoneSymbol, SHORT_RANGE_AIR_DEFENCE_ENGAGEMENT_ZONE_NAME } from "./short-range-air-defence-engagement-zone";
export { censorZoneSymbol, CENSOR_ZONE_NAME } from "./censor-zone";
export { deadSpaceAreaSymbol, DEAD_SPACE_AREA_NAME } from "./dead-space-area";
export { searchAreaSymbol, SEARCH_AREA_NAME } from "./search-area";
export { circularTargetSymbol, CIRCULAR_TARGET_NAME } from "./circular-target";
export { rectangularTargetSymbol, RECTANGULAR_TARGET_NAME } from "./rectangular-target";
export { circularRangeFanSymbol, CIRCULAR_RANGE_FAN_NAME } from "./circular-range-fan";
export { sectorRangeFanSymbol, SECTOR_RANGE_FAN_NAME } from "./sector-range-fan";
export { restrictedOperationsZoneSymbol, RESTRICTED_OPERATIONS_ZONE_NAME } from "./restricted-operations-zone";
export { airspaceCoordinationAreaCircularSymbol, AIRSPACE_COORDINATION_AREA_CIRCULAR_NAME } from "./airspace-coordination-area-circular";
export { obstacleLineSymbol, OBSTACLE_LINE_NAME } from "./obstacle-line";
export { lineOfContactSymbol, LINE_OF_CONTACT_NAME } from "./line-of-contact";
export { forwardLineOfOwnTroopsPlannedSymbol, FORWARD_LINE_OF_OWN_TROOPS_PLANNED_NAME } from "./forward-line-of-own-troops-planned";
export { dropZoneSymbol, DROP_ZONE_NAME } from "./drop-zone";
export { extractionZoneSymbol, EXTRACTION_ZONE_NAME } from "./extraction-zone";
export { landingZoneSymbol, LANDING_ZONE_NAME } from "./landing-zone";
export { engagementAreaSymbol, ENGAGEMENT_AREA_NAME } from "./engagement-area";
export { baseDefenceZoneSymbol, BASE_DEFENCE_ZONE_NAME } from "./base-defence-zone";
export { highDensityAirspaceControlZoneSymbol, HIGH_DENSITY_AIRSPACE_CONTROL_ZONE_NAME } from "./high-density-airspace-control-zone";
export { weaponEngagementZoneSymbol, WEAPON_ENGAGEMENT_ZONE_NAME } from "./weapon-engagement-zone";
export { fighterEngagementZoneSymbol, FIGHTER_ENGAGEMENT_ZONE_NAME } from "./fighter-engagement-zone";
export { jointEngagementZoneSymbol, JOINT_ENGAGEMENT_ZONE_NAME } from "./joint-engagement-zone";
export { weaponsFreeZoneSymbol, WEAPONS_FREE_ZONE_NAME } from "./weapons-free-zone";
export { airspaceCoordinationAreaSymbol, AIRSPACE_COORDINATION_AREA_NAME } from "./airspace-coordination-area";
export { fireSupportAreaSymbol, FIRE_SUPPORT_AREA_NAME } from "./fire-support-area";
export { airfieldZoneSymbol, AIRFIELD_ZONE_NAME } from "./airfield-zone";
export { limitedAccessAreaSymbol, LIMITED_ACCESS_AREA_NAME } from "./limited-access-area";
export { airheadLineSymbol, AIRHEAD_LINE_NAME } from "./airhead-line";
export { airToAirRestrictedOperationsZoneSymbol, AIR_TO_AIR_RESTRICTED_OPERATIONS_ZONE_NAME } from "./air-to-air-restricted-operations-zone";
export { uavRestrictedOperationsZoneSymbol, UAV_RESTRICTED_OPERATIONS_ZONE_NAME } from "./uav-restricted-operations-zone";
export { irregularTargetSymbol, IRREGULAR_TARGET_NAME } from "./irregular-target";
export { seriesOfTargetsSymbol, SERIES_OF_TARGETS_NAME } from "./series-of-targets";
export { groupOfTargetsSymbol, GROUP_OF_TARGETS_NAME } from "./group-of-targets";
export { bombAreaSymbol, BOMB_AREA_NAME } from "./bomb-area";
export { obstacleBeltSymbol, OBSTACLE_BELT_NAME } from "./obstacle-belt";
export { unexplodedOrdnanceAreaSymbol, UNEXPLODED_ORDNANCE_AREA_NAME } from "./unexploded-ordnance-area";
export { ferrySymbol, FERRY_NAME } from "./ferry";
export { generalAreaSymbol, GENERAL_AREA_NAME } from "./general-area";
export { generalAreaPlannedSymbol, GENERAL_AREA_PLANNED_NAME } from "./general-area-planned";

export const INDIVIDUAL_SYMBOLS: Record<string, SymbolDefinition> = {
  [BLOCK_NAME]: blockSymbol,
  [SEIZE_NAME]: seizeSymbol,
  [SCREEN_NAME]: screenSymbol,
  [DESTROY_NAME]: destroySymbol,
  [COUNTERATTACK_NAME]: counterattackSymbol,
  [BREACH_NAME]: breachSymbol,
  [BYPASS_NAME]: bypassSymbol,
  [CANALIZE_NAME]: canalizeSymbol,
  [CLEAR_NAME]: clearSymbol,
  [PENETRATE_NAME]: penetrateSymbol,
  [DISRUPT_NAME]: disruptSymbol,
  [INTERDICT_NAME]: interdictSymbol,
  [NEUTRALIZE_NAME]: neutralizeSymbol,
  [RETAIN_NAME]: retainSymbol,
  [CONTAIN_NAME]: containSymbol,
  [COUNTERATTACK_BY_FIRE_NAME]: counterattackByFireSymbol,
  [FIX_NAME]: fixSymbol,
  [FOLLOW_AND_ASSUME_NAME]: followAndAssumeSymbol,
  [FOLLOW_AND_SUPPORT_NAME]: followAndSupportSymbol,
  [ISOLATE_NAME]: isolateSymbol,
  [OCCUPY_NAME]: occupySymbol,
  [SECURE_NAME]: secureSymbol,
  [RETIREMENT_ARC_NAME]: retirementArcSymbol,
  [DELAY_ARC_NAME]: delayArcSymbol,
  [WITHDRAW_ARC_NAME]: withdrawArcSymbol,
  [WITHDRAW_PRESSURE_ARC_NAME]: withdrawPressureArcSymbol,
  [RETROGRADE_NOTCH_NAME]: retrogradeNotchSymbol,
  [SCREEN_POST_NAME]: screenPostSymbol,
  [BLOB_ATK_NAME]: blobAtkSymbol,
  [BLOB_ATK_ALT_NAME]: blobAtkAltSymbol,
  [BLOB_OBJ_NAME]: blobObjSymbol,
  [BLOB_AA_NAME]: blobAaSymbol,
  [BLOB_ASLT_PSN_NAME]: blobAsltPsnSymbol,
  [BLOB_PENETRATION_BOX_NAME]: blobPenetrationBoxSymbol,
  [WIRE_X_NAME]: wireXSymbol,
  [MINEFIELD_SQUARE_NAME]: minefieldSquareSymbol,
  [ABATIS_TRIANGLE_NAME]: abatisTriangleSymbol,
  [WIRE_CHEVRON_NAME]: wireChevronSymbol,
  [WIRE_TICK_LINE_NAME]: wireTickLineSymbol,
  [FORTIFIED_AREA_NAME]: fortifiedAreaSymbol,
  [AXIS_NOTCHED_NAME]: axisNotchedSymbol,
  [AXIS_NOTCHED_SIMPLE_NAME]: axisNotchedSimpleSymbol,
  [AXIS_NOTCHED_WIDE_NAME]: axisNotchedWideSymbol,
  [GATE_CROSSING_NAME]: gateCrossingSymbol,
  [LANE_MARKER_NAME]: laneMarkerSymbol,
  [TWO_WAY_ROUTE_NAME]: twoWayRouteSymbol,
  [MAIN_ATTACK_NAME]: mainAttackSymbol,
  [SUPPORTING_ATTACK_NAME]: supportingAttackSymbol,
  [AVIATION_AXIS_OF_ADVANCE_NAME]: aviationAxisOfAdvanceSymbol,
  [AMBUSH_NAME]: ambushSymbol,
  [SUPPORT_BY_FIRE_POSITION_NAME]: supportByFirePositionSymbol,
  [GUARD_GG_NAME]: guardGgSymbol,
  [COVER_CC_NAME]: coverCcSymbol,
  [CONTROL_POINT_NAME]: controlPointSymbol,
  [AMNESTY_POINT_NAME]: amnestyPointSymbol,
  [CHECKPOINT_NAME]: checkpointSymbol,
  [LINKUP_POINT_NAME]: linkupPointSymbol,
  [PASSAGE_POINT_NAME]: passagePointSymbol,
  [POINT_OF_INTEREST_NAME]: pointOfInterestSymbol,
  [POINT_OF_DEPARTURE_NAME]: pointOfDepartureSymbol,
  [FIRING_POINT_NAME]: firingPointSymbol,
  [HIDE_POINT_NAME]: hidePointSymbol,
  [LAUNCH_POINT_NAME]: launchPointSymbol,
  [RALLY_POINT_NAME]: rallyPointSymbol,
  [RELEASE_POINT_NAME]: releasePointSymbol,
  [START_POINT_NAME]: startPointSymbol,
  [RELOAD_POINT_NAME]: reloadPointSymbol,
  [SURVEY_CONTROL_POINT_NAME]: surveyControlPointSymbol,
  [DOWNED_AIRCREW_PICKUP_POINT_NAME]: downedAircrewPickupPointSymbol,
  [CONTACT_POINT_NAME]: contactPointSymbol,
  [COORDINATING_POINT_NAME]: coordinatingPointSymbol,
  [DECISION_POINT_NAME]: decisionPointSymbol,
  [WAYPOINT_NAME]: waypointSymbol,
  [AIR_CONTROL_POINT_NAME]: airControlPointSymbol,
  [PHASE_LINE_NAME]: phaseLineSymbol,
  [BRIDGEHEAD_LINE_NAME]: bridgeheadLineSymbol,
  [FINAL_COORDINATION_LINE_NAME]: finalCoordinationLineSymbol,
  [LIMIT_OF_ADVANCE_NAME]: limitOfAdvanceSymbol,
  [LINE_OF_DEPARTURE_NAME]: lineOfDepartureSymbol,
  [LINE_OF_DEPARTURE_LINE_OF_CONTACT_NAME]: lineOfDepartureLineOfContactSymbol,
  [IFF_OFF_LINE_NAME]: iffOffLineSymbol,
  [FIRE_SUPPORT_COORDINATION_LINE_NAME]: fireSupportCoordinationLineSymbol,
  [FREE_FIRE_AREA_NAME]: freeFireAreaSymbol,
  [NO_FIRE_AREA_NAME]: noFireAreaSymbol,
  [RESTRICTED_FIRE_AREA_NAME]: restrictedFireAreaSymbol,
  [ARTILLERY_TARGET_INTELLIGENCE_ZONE_NAME]: artilleryTargetIntelligenceZoneSymbol,
  [CALL_FOR_FIRE_ZONE_NAME]: callForFireZoneSymbol,
  [CRITICAL_FRIENDLY_ZONE_NAME]: criticalFriendlyZoneSymbol,
  [SENSOR_ZONE_NAME]: sensorZoneSymbol,
  [TARGET_BUILD_UP_AREA_NAME]: targetBuildUpAreaSymbol,
  [TARGET_VALUE_AREA_NAME]: targetValueAreaSymbol,
  [ZONE_OF_RESPONSIBILITY_NAME]: zoneOfResponsibilitySymbol,
  [OBSTACLE_ZONE_NAME]: obstacleZoneSymbol,
  [OBSTACLE_FREE_ZONE_NAME]: obstacleFreeZoneSymbol,
  [OBSTACLE_RESTRICTED_ZONE_NAME]: obstacleRestrictedZoneSymbol,
  [HOLDING_LINE_NAME]: holdingLineSymbol,
  [RELEASE_LINE_NAME]: releaseLineSymbol,
  [PROBABLE_LINE_OF_DEPLOYMENT_NAME]: probableLineOfDeploymentSymbol,
  [FIRE_SUPPORT_SAFETY_LINE_NAME]: fireSupportSafetyLineSymbol,
  [NO_FIRE_LINE_NAME]: noFireLineSymbol,
  [ANTITANK_DITCH_UNDER_CONSTRUCTION_NAME]: antitankDitchUnderConstructionSymbol,
  [ANTITANK_DITCH_COMPLETED_NAME]: antitankDitchCompletedSymbol,
  [SINGLE_FENCE_NAME]: singleFenceSymbol,
  [DOUBLE_FENCE_NAME]: doubleFenceSymbol,
  [FORWARD_EDGE_OF_BATTLE_AREA_NAME]: forwardEdgeOfBattleAreaSymbol,
  [FORWARD_EDGE_OF_BATTLE_AREA_PLANNED_NAME]: forwardEdgeOfBattleAreaPlannedSymbol,
  [FORWARD_LINE_OF_OWN_TROOPS_NAME]: forwardLineOfOwnTroopsSymbol,
  [MISSILE_ENGAGEMENT_ZONE_NAME]: missileEngagementZoneSymbol,
  [LOW_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME]: lowAltitudeMissileEngagementZoneSymbol,
  [HIGH_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME]: highAltitudeMissileEngagementZoneSymbol,
  [SHORT_RANGE_AIR_DEFENCE_ENGAGEMENT_ZONE_NAME]: shortRangeAirDefenceEngagementZoneSymbol,
  [CENSOR_ZONE_NAME]: censorZoneSymbol,
  [DEAD_SPACE_AREA_NAME]: deadSpaceAreaSymbol,
  [SEARCH_AREA_NAME]: searchAreaSymbol,
  [CIRCULAR_TARGET_NAME]: circularTargetSymbol,
  [RECTANGULAR_TARGET_NAME]: rectangularTargetSymbol,
  [CIRCULAR_RANGE_FAN_NAME]: circularRangeFanSymbol,
  [SECTOR_RANGE_FAN_NAME]: sectorRangeFanSymbol,
  [RESTRICTED_OPERATIONS_ZONE_NAME]: restrictedOperationsZoneSymbol,
  [AIRSPACE_COORDINATION_AREA_CIRCULAR_NAME]: airspaceCoordinationAreaCircularSymbol,
  [OBSTACLE_LINE_NAME]: obstacleLineSymbol,
  [LINE_OF_CONTACT_NAME]: lineOfContactSymbol,
  [FORWARD_LINE_OF_OWN_TROOPS_PLANNED_NAME]: forwardLineOfOwnTroopsPlannedSymbol,
  [DROP_ZONE_NAME]: dropZoneSymbol,
  [EXTRACTION_ZONE_NAME]: extractionZoneSymbol,
  [LANDING_ZONE_NAME]: landingZoneSymbol,
  [ENGAGEMENT_AREA_NAME]: engagementAreaSymbol,
  [BASE_DEFENCE_ZONE_NAME]: baseDefenceZoneSymbol,
  [HIGH_DENSITY_AIRSPACE_CONTROL_ZONE_NAME]: highDensityAirspaceControlZoneSymbol,
  [WEAPON_ENGAGEMENT_ZONE_NAME]: weaponEngagementZoneSymbol,
  [FIGHTER_ENGAGEMENT_ZONE_NAME]: fighterEngagementZoneSymbol,
  [JOINT_ENGAGEMENT_ZONE_NAME]: jointEngagementZoneSymbol,
  [WEAPONS_FREE_ZONE_NAME]: weaponsFreeZoneSymbol,
  [AIRSPACE_COORDINATION_AREA_NAME]: airspaceCoordinationAreaSymbol,
  [FIRE_SUPPORT_AREA_NAME]: fireSupportAreaSymbol,
  [AIRFIELD_ZONE_NAME]: airfieldZoneSymbol,
  [LIMITED_ACCESS_AREA_NAME]: limitedAccessAreaSymbol,
  [AIRHEAD_LINE_NAME]: airheadLineSymbol,
  [AIR_TO_AIR_RESTRICTED_OPERATIONS_ZONE_NAME]: airToAirRestrictedOperationsZoneSymbol,
  [UAV_RESTRICTED_OPERATIONS_ZONE_NAME]: uavRestrictedOperationsZoneSymbol,
  [IRREGULAR_TARGET_NAME]: irregularTargetSymbol,
  [SERIES_OF_TARGETS_NAME]: seriesOfTargetsSymbol,
  [GROUP_OF_TARGETS_NAME]: groupOfTargetsSymbol,
  [BOMB_AREA_NAME]: bombAreaSymbol,
  [OBSTACLE_BELT_NAME]: obstacleBeltSymbol,
  [UNEXPLODED_ORDNANCE_AREA_NAME]: unexplodedOrdnanceAreaSymbol,
  [FERRY_NAME]: ferrySymbol,
  [GENERAL_AREA_NAME]: generalAreaSymbol,
  [GENERAL_AREA_PLANNED_NAME]: generalAreaPlannedSymbol,
};
