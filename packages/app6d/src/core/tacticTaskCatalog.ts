// tacticTaskCatalog.ts — APP-6D / doctrinal tactical task definitions.
// Pure data + lookup helpers. No dependencies.

export type TaskEffect =
  | "destroy"
  | "neutralize"
  | "block"
  | "breach"
  | "fix"
  | "contain"
  | "isolate"
  | "seize"
  | "secure"
  | "occupy"
  | "screen"
  | "guard"
  | "cover"
  | "delay"
  | "withdraw"
  | "control-measure"
  | "obstacle"
  | "hazard"
  | "airspace"
  | "fires";

export interface TacticTaskDef {
  id: string;
  name: string;
  sidc: string;
  category: string;
  subcategory: string;
  description: string;
  effect: TaskEffect;
}

export const TACTIC_TASK_CATALOG: TacticTaskDef[] = [
  { id: "block", name: "Block", sidc: "GFTPB---------G", category: "Tasks", subcategory: "General Tasks", description: "An offensive or defensive tactical mission task that denies the enemy access to an area or prevents their advance in a direction or along an avenue of approach. The unit holds the position and may have to allow itself to be surrounded to accomplish this task. Used to shape enemy movement or protect a flank.", effect: "block" },
  { id: "breach", name: "Breach", sidc: "GFTPH---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit employs all available means to break through or secure a passage through an enemy defense, obstacle, minefield, or fortification, creating a lane for follow-on forces to pass through.", effect: "breach" },
  { id: "bypass", name: "Bypass", sidc: "GFTPY---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit deliberately avoids contact with an obstacle, enemy force, or contaminated area by maneuvering around it, in order to maintain the momentum of the operation while deviating as little as possible from the unit's original direction of travel.", effect: "control-measure" },
  { id: "canalize", name: "Canalize", sidc: "GFTPC---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that restricts enemy movement into a narrow zone or corridor by using existing or reinforcing obstacles, terrain, or fires, in order to direct the enemy force into an area where it can be more easily engaged and destroyed.", effect: "control-measure" },
  { id: "clear", name: "Clear", sidc: "GFTPX---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that requires the commander to remove all enemy forces and eliminate organized resistance within an assigned area, ensuring the enemy cannot interfere with the friendly unit's mission.", effect: "seize" },
  { id: "penetrate", name: "Penetrate", sidc: "GFTPP---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit attacks through a weak point in the enemy's defense to create a gap, splitting the defense and allowing exploitation or destruction of the position from the flank or rear.", effect: "seize" },
  { id: "disrupt", name: "Disrupt", sidc: "GFTPT---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that focuses fires and effects to break apart the enemy's formation and tempo, interrupt their timetable, cause premature commitment of forces, or prevent coordinated actions.", effect: "neutralize" },
  { id: "destroy", name: "Destroy", sidc: "GFTPD---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that physically renders an enemy force combat-ineffective until it is reconstituted; the enemy unit or equipment is damaged or destroyed to the point it cannot function as an organized force.", effect: "destroy" },
  { id: "interdict", name: "Interdict", sidc: "GFTPI---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that prevents, disrupts, or delays the enemy's use of an area or route, typically through fires, obstacles, or maneuver.", effect: "neutralize" },
  { id: "neutralize", name: "Neutralize", sidc: "GFTPN---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that renders enemy personnel or materiel incapable of interfering with an operation, without necessarily destroying them.", effect: "neutralize" },
  { id: "retain", name: "Retain", sidc: "GFTPQ---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit ensures that a terrain feature remains free of enemy occupation or use.", effect: "secure" },
  { id: "contain", name: "Contain", sidc: "GFTPJ---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that stops, holds, or surrounds enemy forces, or that causes them to center their activity on a given front and prevents them from withdrawing any part of their forces for use elsewhere.", effect: "contain" },
  { id: "counterattack-catk", name: "Counterattack (CATK)", sidc: "GFTPK---------G", category: "Tasks", subcategory: "General Tasks", description: "An attack conducted by a defending force against an enemy attacking force to regain lost ground, destroy an enemy penetration, or seize the initiative from the enemy.", effect: "seize" },
  { id: "counterattack-by-fire", name: "Counterattack By Fire", sidc: "GFTPKF--------G", category: "Tasks", subcategory: "Counterattack", description: "A variant of the counterattack in which the defending force engages the attacking enemy with concentrated direct and/or indirect fires from prepared positions.", effect: "neutralize" },
  { id: "fix", name: "Fix", sidc: "GFTPF---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which a unit prevents the enemy from moving any part of its force from a specific location for a specific period of time.", effect: "fix" },
  { id: "follow-and-assume", name: "Follow And Assume", sidc: "GFTPA---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which a follow-on unit trails a lead attacking unit and is prepared to continue the mission if the lead unit is fixed, halted, or rendered combat-ineffective.", effect: "control-measure" },
  { id: "follow-and-support", name: "Follow And Support", sidc: "GFTPAS--------G", category: "Tasks", subcategory: "Follow And Assume", description: "A tactical mission task in which a follow-on unit follows and supports a lead attacking unit, providing tasks such as securing the flanks and rear, clearing bypassed enemy, handling prisoners, and maintaining freedom of movement.", effect: "control-measure" },
  { id: "isolate", name: "Isolate", sidc: "GFTPE---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that seals off an enemy force (or objective area) from sources of support, deprives it of freedom of movement, and prevents it from having contact with other enemy forces or resupply.", effect: "isolate" },
  { id: "occupy", name: "Occupy", sidc: "GFTPO---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit moves a force onto an objective or terrain feature, physically controls it, and establishes a defensive or support posture without necessarily engaging the enemy.", effect: "occupy" },
  { id: "secure", name: "Secure", sidc: "GFTPS---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which the unit prevents a unit, facility, or geographic location from being damaged or destroyed as a result of enemy action.", effect: "secure" },
  { id: "screen", name: "Screen", sidc: "GFTPUS--------G", category: "Tasks", subcategory: "Security", description: "A security task that primarily provides early warning to the protected force; a screening force observes, identifies, and reports enemy actions.", effect: "screen" },
  { id: "guard", name: "Guard", sidc: "GFTPUG--------G", category: "Tasks", subcategory: "Security", description: "A security task that protects the main body from enemy observation and surprise attack, and that provides the protected force with reaction time and maneuver space.", effect: "guard" },
  { id: "cover", name: "Cover", sidc: "GFTPUC--------G", category: "Tasks", subcategory: "Security", description: "A security task that provides the most protection of any security mission, operating apart from the main body to intercept, engage, delay, disorganize, and deceive the enemy before it can attack the protected force.", effect: "cover" },
  { id: "seize", name: "Seize", sidc: "GFTPZ---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task that involves taking possession of a designated area by using overwhelming force, and establishing physical control through offensive action, typically resulting in the destruction or capture of the enemy occupying that terrain.", effect: "seize" },
  { id: "relief-in-place-rip", name: "Relief In Place (RIP)", sidc: "GFTPR---------G", category: "Tasks", subcategory: "General Tasks", description: "An operation in which, by direction of higher authority, all or part of a unit is replaced in an area by the incoming unit; the incoming unit assumes the responsibilities of the outgoing unit.", effect: "control-measure" },
  { id: "delay", name: "Delay", sidc: "GFTPL---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which a force under pressure trades space for time by slowing the enemy's momentum and inflicting maximum damage without, in principle, becoming decisively engaged.", effect: "delay" },
  { id: "retirement", name: "Retirement", sidc: "GFTPM---------G", category: "Tasks", subcategory: "General Tasks", description: "An operation in which a force out of contact with the enemy moves away from the enemy in an organized manner; a retirement is typically conducted to reposition a force for future operations.", effect: "withdraw" },
  { id: "withdraw", name: "Withdraw", sidc: "GFTPW---------G", category: "Tasks", subcategory: "General Tasks", description: "A tactical mission task in which a force in contact disengages from the enemy in a planned manner, moving away to a new position.", effect: "withdraw" },
  { id: "under-pressure", name: "Under Pressure", sidc: "GFTPWP--------G", category: "Tasks", subcategory: "Withdraw", description: "A variant of the withdrawal task conducted while the unit is in direct contact with, and under pressure from, the enemy, requiring the force to fight its way out while breaking contact under fire.", effect: "withdraw" },
  { id: "check-point", name: "Check Point", sidc: "GFGPGPPK-------", category: "Command And Control And General Maneuver", subcategory: "General - Action Points", description: "A control measure marking a predetermined point on the ground used to control movement, tie in units, or designate the location of a reporting requirement.", effect: "control-measure" },
  { id: "contact-point", name: "Contact Point", sidc: "GFGPGPPC-------", category: "Command And Control And General Maneuver", subcategory: "General - Action Points", description: "A control measure designating a specific point on the ground where two or more units are required to make physical contact with each other.", effect: "control-measure" },
  { id: "phase-line", name: "Phase Line", sidc: "GFGPGLP--------", category: "Command And Control And General Maneuver", subcategory: "General - Lines", description: "A control measure, usually a linear terrain feature, used to control and coordinate movement, report progress, or designate the timing/location of a shift in tactical activity.", effect: "control-measure" },
  { id: "line-of-departure", name: "Line Of Departure", sidc: "GFGPOLT--------", category: "Command And Control And General Maneuver", subcategory: "Offense - Lines", description: "A control measure, typically a phase line, designating the line a unit crosses at a prescribed time to begin an offensive operation.", effect: "control-measure" },
  { id: "forward-line-of-own-troops-flot", name: "Forward Line Of Own Troops (FLOT)", sidc: "GFGPGLF--------", category: "Command And Control And General Maneuver", subcategory: "General - Lines", description: "A control measure indicating the most forward positions of friendly forces at a given time.", effect: "control-measure" },
  { id: "objective", name: "Objective", sidc: "GFGPOAO--------", category: "Command And Control And General Maneuver", subcategory: "Offense - Areas", description: "A control measure identifying the specific physical location or force that is the target of an offensive operation.", effect: "control-measure" },
  { id: "assembly-area", name: "Assembly Area", sidc: "GFGPGAA--------", category: "Command And Control And General Maneuver", subcategory: "General - Areas", description: "A control measure designating an area, normally out of contact with the enemy, in which a unit prepares, organizes, and configures itself for an upcoming operation.", effect: "control-measure" },
  { id: "attack-position", name: "Attack Position", sidc: "GFGPOAK--------", category: "Command And Control And General Maneuver", subcategory: "Offense - Areas", description: "A control measure designating the last position an attacking unit occupies or passes through before crossing the line of departure.", effect: "control-measure" },
  { id: "assault-position", name: "Assault Position", sidc: "GFGPOAA--------", category: "Command And Control And General Maneuver", subcategory: "Offense - Areas", description: "A control measure designating the last covered and concealed position an attacking force occupies before assaulting the objective.", effect: "control-measure" },
  { id: "main-attack", name: "Main Attack", sidc: "GFGPOLAGM------", category: "Command And Control And General Maneuver", subcategory: "Offense - Lines", description: "A control measure graphic depicting the principal offensive effort of a force, directed at the objective whose seizure will most directly accomplish the mission.", effect: "control-measure" },
  { id: "supporting-attack", name: "Supporting Attack", sidc: "GFGPOLAGS------", category: "Command And Control And General Maneuver", subcategory: "Offense - Lines", description: "A control measure graphic depicting a secondary offensive effort that supports the main attack.", effect: "control-measure" },
  { id: "ambush", name: "Ambush", sidc: "GFGPSLA--------", category: "Command And Control And General Maneuver", subcategory: "Special - Line", description: "A surprise attack from a concealed position upon a moving or temporarily halted enemy force.", effect: "neutralize" },
  { id: "support-by-fire-position", name: "Support By Fire Position", sidc: "GFGPOAS--------", category: "Command And Control And General Maneuver", subcategory: "Offense - Areas", description: "A control measure designating a location from which a unit provides suppressive fires to support the maneuver of another friendly element.", effect: "control-measure" },
  { id: "strong-point", name: "Strong Point", sidc: "GFMPSP---------", category: "Mobility / Survivability", subcategory: "Survivability", description: "A heavily fortified key point in a defensive position, usually built into a defensive line, that is stocked with supplies and designed to be held even if surrounded.", effect: "obstacle" },
  { id: "fortified-line", name: "Fortified Line", sidc: "GFMPSL---------", category: "Mobility / Survivability", subcategory: "Survivability", description: "A defensive line reinforced with prepared fighting positions, obstacles, and fortifications intended to be held for an extended period.", effect: "obstacle" },
  { id: "unspecified-wire-obstacle", name: "Unspecified Wire Obstacle", sidc: "GFMPOWU--------", category: "Mobility / Survivability", subcategory: "Obstacles - Wire", description: "A graphic control measure depicting a generic or unspecified wire obstacle emplaced to impede enemy movement.", effect: "obstacle" },
  { id: "unspecified-mine", name: "Unspecified Mine", sidc: "GFMPOMU--------", category: "Mobility / Survivability", subcategory: "Obstacles - Mines", description: "A graphic marking the location of a landmine of unspecified type.", effect: "obstacle" },
  { id: "antitank-mine", name: "Antitank Mine", sidc: "GFMPOMT--------", category: "Mobility / Survivability", subcategory: "Obstacles - Mines", description: "A graphic marking the location of an antitank mine.", effect: "obstacle" },
  { id: "antipersonnel-mines", name: "Antipersonnel Mines", sidc: "GFMPOMP--------", category: "Mobility / Survivability", subcategory: "Obstacles - Mines", description: "A graphic marking the location of antipersonnel mines.", effect: "obstacle" },
  { id: "mined-area", name: "Mined Area", sidc: "GFMPOFA--------", category: "Mobility / Survivability", subcategory: "Obstacles - Minefields", description: "A graphic depicting an area of ground known or believed to contain mines.", effect: "obstacle" },
  { id: "static-depiction-minefield", name: "Static Depiction (Minefield)", sidc: "GFMPOFS--------", category: "Mobility / Survivability", subcategory: "Obstacles - Minefields", description: "A standardized graphic used to depict a minefield of unspecified pattern on a map for planning purposes.", effect: "obstacle" },
  { id: "complete-antitank-ditch", name: "Complete Antitank Ditch", sidc: "GFMPOADC-------", category: "Mobility / Survivability", subcategory: "Obstacles - Antitank", description: "A finished excavated obstacle designed to stop or channel enemy armored and wheeled vehicles.", effect: "obstacle" },
  { id: "line-general-obstacles", name: "Line (General Obstacles)", sidc: "GFMPOGL--------", category: "Mobility / Survivability", subcategory: "Obstacles - General", description: "A graphic depicting a linear arrangement of general, unspecified obstacles emplaced along a line to impede, block, or turn enemy movement.", effect: "obstacle" },
  { id: "zone", name: "Zone", sidc: "GFMPOGZ--------", category: "Mobility / Survivability", subcategory: "Obstacles - General", description: "A graphic control measure depicting a general obstacle zone.", effect: "obstacle" },
  { id: "radioactive-area", name: "Radioactive Area", sidc: "GFMPNR---------", category: "Mobility / Survivability", subcategory: "Nuclear Biological Chemical", description: "A graphic depicting an area contaminated by radioactive material or fallout.", effect: "hazard" },
  { id: "biologically-contaminated-area", name: "Biologically Contaminated Area", sidc: "GFMPNB---------", category: "Mobility / Survivability", subcategory: "Nuclear Biological Chemical", description: "A graphic depicting an area contaminated with biological agents.", effect: "hazard" },
  { id: "chemically-contaminated-area", name: "Chemically Contaminated Area", sidc: "GFMPNC---------", category: "Mobility / Survivability", subcategory: "Nuclear Biological Chemical", description: "A graphic depicting an area contaminated with chemical agents.", effect: "hazard" },
  { id: "airspace-coordination-area-aca-circular", name: "Airspace Coordination Area (ACA), Circular", sidc: "GFFPACAC-------", category: "Fire Support", subcategory: "Command & Control Areas", description: "A fire support coordination measure defining a circular block of airspace in the target area.", effect: "airspace" },
  { id: "missile-engagement-zone-mez", name: "Missile Engagement Zone (MEZ)", sidc: "GFGPAAM--------", category: "Command And Control And General Maneuver", subcategory: "Aviation - Areas", description: "An airspace control measure designating airspace within which the responsibility for engagement of air threats normally rests with surface-to-air missile systems.", effect: "airspace" },
  { id: "restricted-operations-zone-roz", name: "Restricted Operations Zone (ROZ)", sidc: "GFGPAAR--------", category: "Command And Control And General Maneuver", subcategory: "Aviation - Areas", description: "An airspace control measure establishing defined dimensions in the airspace used to restrict the activities of certain airspace users.", effect: "airspace" },
  { id: "air-corridor", name: "Air Corridor", sidc: "GFGPALC--------", category: "Command And Control And General Maneuver", subcategory: "Aviation - Lines", description: "An airspace control measure designating a route of defined dimensions established to facilitate the safe passage of friendly aircraft through friendly airspace.", effect: "airspace" },
  { id: "smoke", name: "Smoke", sidc: "GFFPATS--------", category: "Fire Support", subcategory: "Area Target", description: "A fire support area target graphic depicting a location where smoke munitions are to be employed.", effect: "fires" },
  { id: "bomb-area", name: "Bomb Area", sidc: "GFFPATB--------", category: "Fire Support", subcategory: "Area Target", description: "A fire support area target graphic depicting a target area designated for engagement by aerial bombing.", effect: "fires" },
  { id: "sector", name: "Sector", sidc: "GFFPAXS--------", category: "Fire Support", subcategory: "Weapons / Radar Range Fans", description: "A fire support control measure depicting the sector of fire or sector of observation assigned to a weapon system, radar, or unit.", effect: "fires" },
  { id: "ford-easy", name: "Ford Easy", sidc: "GFMPBCE--------", category: "Mobility / Survivability", subcategory: "Obstacle Bypass - Crossing Site", description: "A graphic marking a river or stream crossing site that is shallow and firm enough to be crossed on foot or by vehicle without special equipment.", effect: "control-measure" },
  { id: "bridge-or-gap", name: "Bridge Or Gap", sidc: "GFMPBCB--------", category: "Mobility / Survivability", subcategory: "Obstacle Bypass - Crossing Site", description: "A graphic marking the location of a bridge or a gap in terrain that must be crossed.", effect: "control-measure" },
  { id: "lane", name: "Lane", sidc: "GFMPBCL--------", category: "Mobility / Survivability", subcategory: "Obstacle Bypass - Crossing Site", description: "A graphic marking a cleared lane through an obstacle or minefield.", effect: "control-measure" },
];

// ── Lookup indices ────────────────────────────────────────────────────────────
function normalizeTaskName(name: string): string {
  return name.trim().toLowerCase();
}

const BY_NAME: Map<string, TacticTaskDef> = new Map(
  TACTIC_TASK_CATALOG.map((t) => [normalizeTaskName(t.name), t]),
);
const BY_SIDC: Map<string, TacticTaskDef> = new Map(
  TACTIC_TASK_CATALOG.map((t) => [t.sidc, t]),
);

const TACTIC_ORDER_LABEL_ALIASES: Record<string, string> = {
  "delay (d, arc)": "delay",
  "withdraw (w, arc)": "withdraw",
  "withdraw under pressure (wp, arc)": "under pressure",
  "screen (ss)": "screen",
  "guard (gg)": "guard",
  "cover (cc)": "cover",
  "screen (with observation post)": "screen",
  "attack position (atk)": "attack position",
  "attack position (atk, alt.)": "attack position",
  "objective (obj)": "objective",
  "assembly area (aa)": "assembly area",
  "assault position (aslt psn)": "assault position",
  "counterattack": "counterattack (catk)",
  "wire obstacle (x row)": "unspecified wire obstacle",
  "wire obstacle (chevron wave)": "unspecified wire obstacle",
  "minefield marker (square row)": "static depiction (minefield)",
  "abatis / obstacle row (triangle)": "line (general obstacles)",
  "wire line (ticked, with arrow)": "line (general obstacles)",
  "fortified area (ticked loop)": "fortified line",
  "crossing point / gate": "bridge or gap",
  "lane marker": "lane",
};

export function lookupTaskByName(name: string): TacticTaskDef | undefined {
  const key = normalizeTaskName(name);
  return BY_NAME.get(key) ?? BY_NAME.get(TACTIC_ORDER_LABEL_ALIASES[key] ?? "");
}

export function lookupTaskBySidc(sidc: string): TacticTaskDef | undefined {
  return BY_SIDC.get(sidc);
}

export function lookupTaskForOrder(label: string | undefined): TacticTaskDef | undefined {
  if (!label) {return undefined;}
  return lookupTaskByName(label);
}