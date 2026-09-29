/**
 * Ground COLOUR and ground TEXTURE over the archive's own tiles.
 *
 * Woodland gets trees, farmland wheat, wetland reeds, residential houses —
 * equally spaced icons over a colour plate, the way a paper map says what the
 * ground is rather than only what colour it is.
 *
 * Free in the same sense wetGaps(), going() and buildings3d() are free: every
 * feature it draws is already in the vector tiles the basemap is fetching, so
 * there is no dataset, no download and no dependency. The only new thing is
 * the artwork, and that is generated in the browser — see ./textures for why
 * it is path data and not a sprite.
 *
 * WHY IT PAINTS COLOUR AT ALL
 * ---------------------------
 * Because the flavor does not. Protomaps' `landuse` layers cover park,
 * urban_green, hospital, industrial, school, beach, zoo, aerodrome, runway,
 * pedestrian and pier — and nothing else. `farmland`, `orchard`, `farmyard`,
 * `wetland`, `heath`, `scrub` and `residential` get NO fill: they are the
 * `earth` colour, which is a grey. So an icon-only pattern printed wheat onto
 * the same grey the roads are drawn on, and a field had no extent at all.
 *
 * Hence two layers. The plate gives every textured kind a body; the pattern
 * prints on it. They have to be separate layers rather than one, because
 * `fill-color` is ignored on any layer that sets `fill-pattern`.
 *
 * THE PLATE IS NOT PART OF THE ICON TOGGLE
 * ----------------------------------------
 * `setVisible()` is the ICONS. The colour stays: "farmland is yellow" is a
 * fact about the map, not a texture overlay, and it is what should remain when
 * the icons are switched off or when the map zooms out past their floor.
 * `setPlateVisible()` is there for a caller who really does want the flavor's
 * bare ground back.
 *
 * IT ANCHORS AT "ground", NOT AT "labels"
 * ---------------------------------------
 * Every other extension in this package shades the ground and therefore sits
 * just under the labels, on top of everything else. These two layers ARE the
 * ground: an opaque plate at the label boundary covers the roads and the
 * buildings — the residential plate hid an entire town the first time this was
 * tried. "ground" resolves to the first line layer, which in every Protomaps
 * flavor is where the landuse fills stop and the things drawn on them start.
 *
 * Consequence worth knowing: relief lands ON these, because hillshade is
 * anchored at "labels". That is the right way round — the shading shades the
 * ground, textures included.
 *
 * SPACING IS IN SCREEN PIXELS, NOT METRES
 * ---------------------------------------
 * `fill-pattern` tiles in screen space, so the icons stay the same size and
 * the same distance apart at every zoom, and a forest gets denser on the
 * ground as you zoom out. That is how the reference image behaves and it is
 * also the only option: ground-fixed spacing would need one symbol per tree,
 * and MapLibre has no `symbol-placement: fill` to scatter them with.
 *
 * Which is why the ICONS are off below z10 — zoomed out far enough, every
 * polygon is a solid mat of them. The plate has no floor.
 *
 * ONE LAYER EACH, NOT EIGHT
 * -------------------------
 * `fill-pattern` and `fill-color` are both data-driven, so eight textures are
 * one `match` expression per layer — for the reason going() gives: eight
 * layers over one source-layer is eight draw passes for a single fill.
 *
 * The catch, and it is the only subtle thing here: a pattern is resolved when
 * a TILE IS PARSED, not when it is drawn. An image added after a tile has been
 * through the worker does not appear on it. So the images go on at attach,
 * which is before the first tiles finish, and `styleimagemissing` catches the
 * rest — MapLibre defers the tile until that handler has had its chance, which
 * is exactly what it is for.
 */
import type {
  ExtensionContext,
  ExtensionMap,
  StyleContribution,
} from "./extensions.js";
import type { OverlayExtension, OverlayOptions } from "./overlays.js";
import {
  NATURAL_GROUND,
  TEXTURE_COLOURS,
  TEXTURE_ICONS,
  TEXTURE_KINDS,
  TEXTURE_PLATE_COLOURS,
  placementsForTexture,
  renderTexturePattern,
  type LandTexture,
  type TextureIcon,
  type TexturePlacement,
} from "./textures.js";

// Layer specifications are `any` for the reason StyleFragment.sources is: core
// does not import maplibre-gl, so it cannot name LayerSpecification, and
// MapLibre validates the assembled style at construction.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LandusePatternsOptions extends OverlayOptions {
  /**
   * How strongly the icons print. 1 is full ink; the default is deliberately
   * short of it, because this is background.
   */
  opacity?: number;
  /** Pattern tile side in CSS pixels. Bigger tile, sparser icons. */
  tileSize?: number;
  /** Icon side in CSS pixels, before each icon's own scale. */
  iconSize?: number;
  /** Multiplier on every stroke width, for a heavier or lighter line. */
  boldness?: number;
  /** Override any texture's ink colour. */
  colours?: Partial<Record<LandTexture, string>>;
  /**
   * The colour plate under the icons.
   *
   * On by default, and it is doing real work: the flavor paints none of
   * `farmland`, `orchard`, `wetland`, `heath`, `scrub` or `residential`, so
   * without this they are all the same grey and the icons have nothing behind
   * them. Pass `false` for a flavor that colours everything itself, or an
   * object to override single colours.
   */
  plate?: boolean | Partial<Record<LandTexture, string>>;
  /**
   * How strongly the plate prints. 1 by default — where the flavor painted
   * nothing, this IS the ground colour, and a wash of it is not.
   */
  plateOpacity?: number;
  /**
   * Repaint the base ground — the flavor's `earth` fill and `background` —
   * which is what shows wherever there is no landuse polygon at all.
   *
   * Off by default: an extension quietly restyling a layer it did not
   * contribute is a surprise, and the flavor is the proper place to set this
   * (`flavor={{ ...namedFlavor("light"), earth: "#e2ecd5" }}`). But the
   * default grey reads as pavement under a natural-coloured map, so `true`
   * takes NATURAL_GROUND and a string takes yours.
   *
   * Not restored on teardown: by then the map is being removed.
   */
  ground?: boolean | string;
  /** Swap the artwork for a texture — see TextureIcon in ./textures. */
  icons?: Partial<Record<LandTexture, TextureIcon>>;
  /**
   * Replace the `landuse.kind` → texture map wholesale. Merged, not replaced,
   * would make it impossible to REMOVE a mapping, and "stop drawing houses on
   * `neighbourhood`" is a thing an enrollment will want.
   */
  kinds?: Record<string, LandTexture>;
  /**
   * Where the icons sit within one tile. Defaults to two slots from the
   * lattice, DIFFERENT ONES PER TEXTURE — passing this puts every texture in
   * the same place, which is what makes two of them collide where their
   * polygons overlap. Worth it only for a single-texture map.
   */
  placements?: readonly TexturePlacement[];
  /**
   * Device pixel ratio to rasterise at. Defaults to the window's. Only worth
   * passing to pin it for a screenshot test.
   */
  pixelRatio?: number;
}

export interface LandusePatternsExtension extends OverlayExtension {
  /** Whether the ICONS are shown. The plate has its own switch. */
  readonly visible: boolean;
  /** Show or hide the icons. One layout property, no restyle. */
  setVisible(visible: boolean): void;
  /** Whether the colour plate is shown. */
  readonly plateVisible: boolean;
  /** Show or hide the colour plate, independently of the icons. */
  setPlateVisible(visible: boolean): void;
  /** Image ids this extension owns, in texture order. */
  readonly imageIds: readonly string[];
}

// 64px tile, 11px icons, two per texture. The tile is sized by the SLOT
// LATTICE rather than by taste: sixteen slots across it means a quarter tile —
// 16px — between any two icons of any two textures, which is what keeps a wood
// inside a military area from printing trees through the sabres.
const DEFAULT_TILE_SIZE = 64;
const DEFAULT_ICON_SIZE = 11;
const DEFAULT_OPACITY = 0.65;
const DEFAULT_PLATE_OPACITY = 1;

/**
 * Below this the ICONS are off — not the plate.
 *
 * A pattern tiles in SCREEN pixels, so zooming out does not shrink the icons —
 * it packs more ground behind each one until a county of farmland is a solid
 * mat of wheat and the map underneath is unreadable. z10 is about where a
 * landuse polygon is still big enough to hold a few icons and mean something.
 * Raise it with `minZoom`; there is no sensible way to lower it.
 */
const DEFAULT_MIN_ZOOM = 10;

/** The flavor layers that carry the base ground colour. */
const EARTH_LAYER = "earth";
const BACKGROUND_LAYER = "background";

/** Kinds sharing one texture, in the order the textures are declared. */
function groupKindsByTexture(
  kinds: Record<string, LandTexture>,
): Map<LandTexture, string[]> {
  const grouped = new Map<LandTexture, string[]>();
  for (const [kind, texture] of Object.entries(kinds)) {
    const existing = grouped.get(texture);
    if (existing) {
      existing.push(kind);
    } else {
      grouped.set(texture, [kind]);
    }
  }
  return grouped;
}

/**
 * A `match` on `kind`, mapping each texture's kinds to one value.
 *
 * Shared by the pattern and the plate because they filter identically and
 * differ only in what they emit — an image id or a colour. Written once so the
 * two cannot drift, which would show up as a field with wheat on the wrong
 * colour.
 */
function matchByTexture(
  grouped: Map<LandTexture, string[]>,
  value: (texture: LandTexture) => string,
  fallback: string,
): any {
  const cases: any[] = [];
  let first: string | undefined;
  for (const [texture, kinds] of grouped) {
    cases.push(kinds.length === 1 ? kinds[0] : kinds, value(texture));
    first ??= value(texture);
  }
  // Unreachable: the layer's filter passes only the kinds above. A `match`
  // must have a fallback anyway.
  return ["match", ["get", "kind"], ...cases, first ?? fallback];
}

/** kind → pattern image id. */
export function patternExpression(
  grouped: Map<LandTexture, string[]>,
  imageId: (texture: LandTexture) => string,
): any {
  return matchByTexture(grouped, imageId, "");
}

/** kind → ground colour. */
export function plateExpression(
  grouped: Map<LandTexture, string[]>,
  colour: (texture: LandTexture) => string,
): any {
  return matchByTexture(grouped, colour, "transparent");
}

/** The plate colour for one texture, honouring an override object. */
function plateColour(
  texture: LandTexture,
  plate: LandusePatternsOptions["plate"],
): string {
  const override =
    plate && typeof plate === "object" ? plate[texture] : undefined;
  return override ?? TEXTURE_PLATE_COLOURS[texture];
}

export function landusePatterns(
  options: LandusePatternsOptions = {},
): LandusePatternsExtension {
  const id = options.id ?? "landuse-patterns";
  const sourceLayer = options.sourceLayer ?? "landuse";
  const kinds = options.kinds ?? TEXTURE_KINDS;
  const grouped = groupKindsByTexture(kinds);

  const imageId = (texture: LandTexture) => `${id}-${texture}`;
  const imageIds = [...grouped.keys()].map(imageId);

  const plateLayerId = `${id}-plate`;
  const iconLayerId = `${id}-fill`;
  const platePainted = options.plate !== false;

  let icons = options.visible ?? true;
  let plate = true;
  let attached: ExtensionMap | null = null;

  const kindFilter: any = [
    "match",
    ["get", "kind"],
    Object.keys(kinds),
    true,
    false,
  ];

  const applyVisibility = (map: ExtensionMap): void => {
    const set = (layerId: string, shown: boolean) => {
      if (!map.getLayer(layerId)) {
        return;
      }
      map.setLayoutProperty(layerId, "visibility", shown ? "visible" : "none");
    };
    if (platePainted) {
      set(plateLayerId, plate);
    }
    set(iconLayerId, icons);
  };

  const extension: LandusePatternsExtension = {
    id,

    get visible() {
      return icons;
    },

    get plateVisible() {
      return plate;
    },

    get layerIds() {
      return platePainted ? [plateLayerId, iconLayerId] : [iconLayerId];
    },

    get imageIds() {
      return imageIds;
    },

    setVisible(next) {
      if (next === icons) {
        return;
      }
      icons = next;
      if (attached) {
        applyVisibility(attached);
      }
    },

    setPlateVisible(next) {
      if (next === plate) {
        return;
      }
      plate = next;
      if (attached) {
        applyVisibility(attached);
      }
    },

    style(ctx: ExtensionContext): StyleContribution {
      const layers: any[] = [];

      // The plate first, so it lands UNDER the icons it backs. No minzoom on
      // it: a colour that says "this is a field" is worth having at every zoom,
      // and it is what remains when the icons switch off.
      if (platePainted) {
        layers.push({
          id: plateLayerId,
          type: "fill",
          source: ctx.basemapSourceId,
          "source-layer": sourceLayer,
          filter: kindFilter,
          layout: { visibility: plate ? "visible" : "none" },
          paint: {
            "fill-color": plateExpression(grouped, (texture) =>
              plateColour(texture, options.plate),
            ),
            "fill-opacity": options.plateOpacity ?? DEFAULT_PLATE_OPACITY,
          },
        });
      }

      layers.push({
        id: iconLayerId,
        type: "fill",
        source: ctx.basemapSourceId,
        "source-layer": sourceLayer,
        filter: kindFilter,
        minzoom: options.minZoom ?? DEFAULT_MIN_ZOOM,
        layout: { visibility: icons ? "visible" : "none" },
        paint: {
          "fill-pattern": patternExpression(grouped, imageId),
          "fill-opacity": options.opacity ?? DEFAULT_OPACITY,
        },
      });

      // "ground", not "labels". Both of these ARE the ground — an opaque plate
      // anchored at the label boundary sits on top of the roads and the
      // buildings and hides them, which is exactly what it did the first time.
      return { layers, before: options.before ?? "ground" };
    },

    attach(map) {
      attached = map;
      applyVisibility(map);
      const releaseImages = attachImages(map, grouped, imageId, options);
      paintGround(map, options.ground);

      return () => {
        attached = null;
        releaseImages();
      };
    },
  };

  return extension;
}

/**
 * Repaint the flavor's base ground.
 *
 * `earth` is the fill under everything that is not a named landuse, and in
 * every Protomaps flavor it is a grey — which reads as pavement once the
 * fields, woods and marshes around it are natural colours. `background` is
 * what shows where even `earth` has no polygon, at the edges of the archive.
 *
 * Both are the FLAVOR's layers, not this extension's, so both are guarded:
 * a custom layer list need not have either, and neither is worth an error.
 * buildings3d sets this precedent — it hands the flavor's flat building fill
 * over to its extrusion the same way.
 */
function paintGround(
  map: ExtensionMap,
  ground: LandusePatternsOptions["ground"],
): void {
  if (!ground) {
    return;
  }
  const colour = ground === true ? NATURAL_GROUND : ground;

  if (map.getLayer(EARTH_LAYER)) {
    map.setPaintProperty(EARTH_LAYER, "fill-color", colour);
  }
  if (map.getLayer(BACKGROUND_LAYER)) {
    map.setPaintProperty(BACKGROUND_LAYER, "background-color", colour);
  }
  if (!map.getLayer(EARTH_LAYER) && !map.getLayer(BACKGROUND_LAYER)) {
    console.warn(
      `[decho-basemap] landusePatterns was asked to repaint the ground, but this ` +
        `style has neither an "${EARTH_LAYER}" nor a "${BACKGROUND_LAYER}" layer. ` +
        "Set the colour in the flavor instead.",
    );
  }
}

/**
 * Put the pattern images on the map, and keep putting them on.
 *
 * Every failure here is survivable and none of them is worth taking the map
 * down for: no canvas, no addImage, a texture that will not rasterise. Both
 * layers are already contributed either way, and a fill with a missing pattern
 * draws nothing — so the ground keeps its plate and loses only the icons.
 */
function attachImages(
  map: ExtensionMap,
  grouped: Map<LandTexture, string[]>,
  imageId: (texture: LandTexture) => string,
  options: LandusePatternsOptions,
): () => void {
  if (typeof map.addImage !== "function") {
    console.warn(
      "[decho-basemap] landusePatterns needs map.addImage, which this map does " +
        "not provide; the ground keeps its colour but gets no icons.",
    );
    return () => undefined;
  }

  const pixelRatio =
    options.pixelRatio ??
    (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
  const iconSize = options.iconSize ?? DEFAULT_ICON_SIZE;
  const added: string[] = [];

  // Slots are dealt by POSITION IN THE TEXTURE ORDER, which is what stops two
  // textures printing on the same pixel where their polygons overlap. An
  // explicit `placements` overrides that and puts them all in one place — the
  // caller's business, and documented as such.
  const byImageId = new Map<string, { texture: LandTexture; index: number }>();
  let index = 0;
  for (const texture of grouped.keys()) {
    byImageId.set(imageId(texture), { texture, index });
    index += 1;
  }

  const add = (targetId: string): void => {
    const entry = byImageId.get(targetId);
    if (!entry || map.hasImage?.(targetId)) {
      return;
    }
    const { texture } = entry;
    const icon = options.icons?.[texture] ?? TEXTURE_ICONS[texture];
    const image = renderTexturePattern({
      icon,
      colour: options.colours?.[texture] ?? TEXTURE_COLOURS[texture],
      tileSize,
      iconSize,
      pixelRatio,
      placements: options.placements ?? placementsForTexture(entry.index),
      boldness: options.boldness,
    });
    if (!image) {
      return;
    }
    map.addImage?.(targetId, image, { pixelRatio });
    added.push(targetId);
  };

  for (const targetId of byImageId.keys()) {
    add(targetId);
  }

  if (added.length === 0) {
    console.warn(
      "[decho-basemap] landusePatterns could not rasterise its textures — no " +
        "canvas in this environment. The ground keeps its colour but gets no icons.",
    );
  }

  // A tile resolves its patterns when it is parsed, so anything that finished
  // parsing before the loop above asks for its image through this event rather
  // than going without. It is also the path a style reload comes back on.
  //
  // maplibre-gl 6 split that: the event only reports, and a resolver supplies.
  // The resolver is one per map, so this takes it for as long as it is
  // attached — nothing else in this package sets one.
  const onMissing = (event: { id?: string }) => {
    if (event?.id) {
      add(event.id);
    }
  };
  const useResolver = typeof map.setMissingStyleImageResolver === "function";
  if (useResolver) {
    map.setMissingStyleImageResolver!((id) => add(id));
  } else {
    map.on("styleimagemissing", onMissing);
  }

  return () => {
    if (useResolver) {
      map.setMissingStyleImageResolver!(null);
    } else {
      map.off("styleimagemissing", onMissing);
    }
    for (const targetId of added) {
      try {
        map.removeImage?.(targetId);
      } catch {
        // The map is usually being removed underneath us, and an image on a
        // destroyed style is not a leak worth reporting.
      }
    }
    added.length = 0;
  };
}
