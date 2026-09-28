/**
 * Ground textures — the icons a landuse pattern is tiled from.
 *
 * WHY THE ARTWORK IS PATH DATA AND NOT A SPRITE
 * ---------------------------------------------
 * The obvious home for an icon in a MapLibre style is the sprite. This package
 * cannot use it:
 *
 *   - the sprite lives in a Foundry DATASET this package does not own, and
 *     there is one sheet per flavor (sprites/light, sprites/dark, ...). Adding
 *     four icons means regenerating and re-uploading five sheets, and any
 *     consumer who passes their own `assetsRid` gets "image could not be
 *     loaded" for every one of them;
 *   - a sprite entry is a fixed-colour PNG at a fixed density, so the same
 *     artwork cannot follow the flavor or sharpen on a retina display.
 *
 * So the artwork is SVG PATH DATA, drawn with Path2D onto a canvas at attach
 * time and handed to `map.addImage`. That also sidesteps two repository rules
 * that rule out the other obvious implementations: the CI code scan blocks
 * `dangerouslySetInnerHTML`, so the icons cannot be inlined as SVG elements,
 * and an SVG data-URI through `new Image()` is asynchronous and blocked by the
 * default Content Security Policy in the exact deployment this package exists
 * to serve. Path2D is synchronous, offline, and needs neither.
 *
 * NOTHING IN THIS FILE TOUCHES A MAP
 * ----------------------------------
 * Icon definitions and tile arithmetic are pure and unit-tested;
 * `renderTexturePattern` is the single function that needs a DOM and it
 * returns null rather than throwing when there is not one. Same split as
 * options.ts against useBasemap, and for the same reason.
 */

/** One piece of artwork, authored in a square viewBox. */
export interface TextureIcon {
  /** Side of the square viewBox the path data is authored in. */
  readonly size: number;
  /** Path `d` strings, drawn in order. */
  readonly paths: readonly string[];
  /**
   * How the paths are painted. Stroke icons are line art at any size; fill
   * icons carry their own weight and ignore `strokeWidth`.
   */
  readonly paint: "stroke" | "fill";
  /**
   * Stroke width in viewBox units. Deliberately NOT the width the source SVG
   * declared: several of these were authored as hairlines for a 24px UI icon
   * (the tree is 0.696, the wheat 0.552), and a hairline drawn at pattern
   * scale over a coloured plate disappears. These are the weights that read.
   */
  readonly strokeWidth?: number;
  /**
   * Size multiplier applied on top of the caller's `iconSize`. The detailed
   * fill icons carry small features — the bush's berries, the reed's heads —
   * that smear below about 20px, so they are drawn a little larger than the
   * line art they sit beside.
   */
  readonly scale?: number;
}

// ── The catalog ─────────────────────────────────────────────────────────────
//
// Six of these are the artwork supplied for this feature; `industry` and
// `military` were authored here to match, because the same request asked for
// those two kinds and no artwork came with them. They are one path-data string
// each and are meant to be replaced — pass `icons: { military: ... }` to
// landusePatterns() rather than editing this table.

/** Conifer/broadleaf outline. Woodland. */
export const TREE_ICON: TextureIcon = {
  size: 24,
  paint: "stroke",
  strokeWidth: 1.5,
  paths: ["M12 17H19L14.5 10.5H17.5L12 3L6.5 10.5H9.5L5 17H12ZM12 17V21"],
};

/** Ears of wheat. Farmland. */
export const WHEAT_ICON: TextureIcon = {
  size: 24,
  paint: "stroke",
  strokeWidth: 1.05,
  scale: 1.05,
  paths: [
    "M15.2109 8.78899L3.4653 20.5347M8.90748 15.0925L9.10982 14.9292C9.30611 14.7589 9.48392 14.5681 9.64012 14.3598C10.854 12.7413 10.526 10.4451 8.90748 9.23119L8.70514 9.39448C8.50885 9.56474 8.33104 9.75557 8.17484 9.96383C6.96092 11.5824 7.28893 13.8786 8.90748 15.0925ZM8.90748 15.0925L9.07078 15.2948C9.24104 15.4911 9.43188 15.6689 9.64016 15.8252C11.2587 17.039 13.5548 16.711 14.7687 15.0925L14.6054 14.8901C14.4352 14.6938 14.2443 14.516 14.036 14.3598C12.4175 13.1459 10.1214 13.4739 8.90748 15.0925ZM11.8381 12.1618L12.0404 11.9985C12.2367 11.8283 12.4145 11.6375 12.5707 11.4292C13.7847 9.81064 13.4566 7.51447 11.8381 6.30055L11.6358 6.46384C11.4395 6.6341 11.2617 6.82492 11.1055 7.03319C9.89154 8.65174 10.2195 10.9479 11.8381 12.1618ZM11.8381 12.1618L12.0014 12.3642C12.1717 12.5605 12.3625 12.7383 12.5708 12.8945C14.1893 14.1084 16.4854 13.7804 17.6993 12.1618L17.536 11.9595C17.3658 11.7632 17.1749 11.5854 16.9667 11.4292C15.3481 10.2153 13.052 10.5433 11.8381 12.1618ZM14.7687 9.23119L14.9711 9.0679C15.1673 8.89764 15.3452 8.70682 15.5014 8.49855C16.7153 6.88 16.3873 4.58383 14.7687 3.36991L14.5664 3.5332C14.3701 3.70346 14.1923 3.89428 14.0361 4.10255C12.8222 5.7211 13.1502 8.01727 14.7687 9.23119ZM14.7687 9.23119L14.932 9.43354C15.1023 9.62984 15.2931 9.80766 15.5014 9.96387C17.1199 11.1778 19.4161 10.8497 20.6299 9.23119L20.4667 9.02885C20.2964 8.83254 20.1056 8.65473 19.8973 8.49852C18.2787 7.28463 15.9826 7.61266 14.7687 9.23119ZM5.90748 18.0925L6.10982 17.9292C6.30611 17.7589 6.48392 17.5681 6.64012 17.3598C7.85405 15.7413 7.52603 13.4451 5.90748 12.2312L5.70514 12.3945C5.50885 12.5647 5.33104 12.7556 5.17484 12.9638C3.96092 14.5824 4.28893 16.8786 5.90748 18.0925ZM5.90748 18.0925L6.07078 18.2948C6.24104 18.4911 6.43188 18.6689 6.64016 18.8252C8.25869 20.039 10.5548 19.711 11.7687 18.0925L11.6054 17.8901C11.4352 17.6938 11.2443 17.516 11.036 17.3598C9.41751 16.1459 7.12137 16.4739 5.90748 18.0925ZM17.6292 7.40757C17.3714 7.44439 17.1108 7.45359 16.8516 7.43518L16.593 7.40753C16.3069 5.40469 17.6986 3.54913 19.7014 3.26301C20.045 3.21392 20.3939 3.21392 20.7375 3.26301C21.0237 5.26589 19.632 7.12145 17.6292 7.40757Z",
  ],
};

/** Low shrub with berries. Scrub and heath. */
export const BUSH_ICON: TextureIcon = {
  size: 461.436,
  paint: "fill",
  scale: 1.1,
  paths: [
    "M460.403,307.005c-3.187-11.001-13.36-19.001-29.068-23.086c14.28-34.816,13.186-63.461-3.423-74.489 c-3.456-2.295-8.516-4.418-15.419-4.448c7.685-27.252,4.443-48.199-9.367-57.368c-10.055-6.675-23.911-5.722-39.428,2.353 c2.033-24.381-4.198-41.98-17.781-48.564c-13.305-6.45-30.675-0.724-48.265,15.349c-3.839-19.897-12.831-32.72-25.766-36.066 c-13.198-3.417-27.831,3.982-41.168,20.472c-13.334-16.489-27.965-23.888-41.168-20.472c-12.936,3.347-21.928,16.169-25.766,36.066 c-17.59-16.072-34.959-21.797-48.265-15.348c-13.583,6.583-19.815,24.182-17.782,48.563c-15.517-8.076-29.373-9.03-39.426-2.353 c-13.812,9.169-17.052,30.119-9.368,57.368c-6.902,0.03-11.963,2.153-15.418,4.448c-16.61,11.028-17.705,39.673-3.424,74.49 c-15.708,4.085-25.881,12.084-29.069,23.085c-4.84,16.704,7.477,35.787,33.792,52.357c23.07,14.527,50.197,22.206,78.448,22.206 h234.89c28.252,0,55.379-7.679,78.449-22.206C452.927,342.791,465.243,323.708,460.403,307.005z M417.554,344.976 c-20.354,12.817-44.349,19.591-69.391,19.591h-234.89c-25.041,0-49.036-6.774-69.39-19.591 c-18.288-11.516-28.946-24.874-26.522-33.24c1.828-6.308,11.528-11.19,25.948-13.059c2.703-0.351,5.075-1.977,6.376-4.372 c1.302-2.396,1.375-5.27,0.198-7.729c-15.953-33.317-15.49-57.317-6.954-62.984c1.767-1.173,3.912-1.621,6.158-1.621 c3.268,0,6.748,0.948,9.585,1.99c3.135,1.149,6.654,0.36,8.995-2.023s3.068-5.916,1.86-9.03 c-11.091-28.595-8.715-46.55-1.813-51.132c6.702-4.453,20.889,0.444,36.135,12.48c2.826,2.231,6.751,2.44,9.8,0.519 c3.047-1.921,4.552-5.553,3.757-9.066c-5.561-24.583-3.287-44.736,5.527-49.008c8.551-4.142,25.319,6.017,40.795,24.694 c2.256,2.722,5.961,3.76,9.299,2.618c3.343-1.145,5.629-4.239,5.742-7.77c0.678-21.235,6.722-36.948,15.037-39.1 c7.707-1.99,19.389,7.093,29.774,23.146c1.566,2.421,4.253,3.883,7.137,3.883s5.57-1.462,7.137-3.883 c10.385-16.052,22.069-25.139,29.773-23.146c8.315,2.151,14.359,17.864,15.038,39.1c0.113,3.531,2.399,6.625,5.742,7.77 c3.341,1.143,7.045,0.103,9.299-2.619c15.478-18.679,32.258-28.835,40.794-24.693c8.815,4.272,11.088,24.426,5.526,49.008 c-0.794,3.513,0.711,7.145,3.758,9.066c3.047,1.92,6.974,1.713,9.8-0.519c15.245-12.035,29.429-16.934,36.137-12.479 c6.9,4.582,9.277,22.537-1.813,51.132c-1.208,3.114-0.479,6.647,1.86,9.03c2.34,2.383,5.858,3.173,8.995,2.023 c4.787-1.758,11.406-3.25,15.743-0.369c8.535,5.667,8.998,29.667-6.954,62.985c-1.177,2.458-1.104,5.333,0.198,7.728 c1.302,2.396,3.673,4.021,6.376,4.372c14.42,1.869,24.119,6.751,25.947,13.059C446.499,320.102,435.841,333.46,417.554,344.976z",
    "M149.419,284.856c-14.611,0-26.499,11.887-26.499,26.499s11.888,26.499,26.499,26.499s26.499-11.887,26.499-26.499 S164.03,284.856,149.419,284.856z M149.419,320.854c-5.237,0-9.499-4.261-9.499-9.499s4.262-9.499,9.499-9.499 s9.499,4.261,9.499,9.499S154.656,320.854,149.419,320.854z",
    "M305.414,284.856c-14.611,0-26.499,11.887-26.499,26.499s11.888,26.499,26.499,26.499c14.612,0,26.5-11.887,26.5-26.499 S320.026,284.856,305.414,284.856z M305.414,320.854c-5.237,0-9.499-4.261-9.499-9.499s4.262-9.499,9.499-9.499 c5.238,0,9.5,4.261,9.5,9.499S310.652,320.854,305.414,320.854z",
    "M230.719,154.787c-14.611,0-26.499,11.887-26.499,26.499s11.888,26.499,26.499,26.499s26.499-11.887,26.499-26.499 S245.33,154.787,230.719,154.787z M230.719,190.785c-5.237,0-9.499-4.261-9.499-9.499s4.262-9.499,9.499-9.499 s9.499,4.261,9.499,9.499S235.956,190.785,230.719,190.785z",
    "M227.417,250.26c-14.611,0-26.499,11.887-26.499,26.499s11.888,26.499,26.499,26.499s26.499-11.887,26.499-26.499 S242.028,250.26,227.417,250.26z M227.417,286.258c-5.237,0-9.499-4.261-9.499-9.499s4.262-9.499,9.499-9.499 s9.499,4.261,9.499,9.499S232.654,286.258,227.417,286.258z",
    "M157.504,231.7c0-14.612-11.888-26.499-26.499-26.499s-26.499,11.887-26.499,26.499s11.888,26.5,26.499,26.5 S157.504,246.311,157.504,231.7z M121.506,231.7c0-5.238,4.262-9.499,9.499-9.499c5.237,0,9.499,4.261,9.499,9.499 c0,5.238-4.262,9.5-9.499,9.5C125.767,241.199,121.506,236.938,121.506,231.7z",
    "M330.432,205.201c-14.612,0-26.5,11.887-26.5,26.499s11.888,26.5,26.5,26.5c14.611,0,26.499-11.888,26.499-26.5 S345.044,205.201,330.432,205.201z M330.432,241.199c-5.238,0-9.5-4.261-9.5-9.5c0-5.238,4.262-9.499,9.5-9.499 c5.237,0,9.499,4.261,9.499,9.499C339.931,236.938,335.67,241.199,330.432,241.199z",
  ],
};

/** Reeds. Wetland, marsh and swamp. */
export const REED_ICON: TextureIcon = {
  size: 512.002,
  paint: "fill",
  scale: 1.15,
  paths: [
    "M333.4,196.418c1.928,0.475,3.877,0.708,5.814,0.708c4.367,0,8.664-1.191,12.494-3.512 c5.529-3.349,9.422-8.651,10.963-14.928L387.236,78.62c1.543-6.277,0.546-12.779-2.803-18.307 c-3.349-5.529-8.651-9.422-14.928-10.963l-12.354-3.033c7.583-22.962,12.563-35.7,12.618-35.84 c1.548-3.943-0.395-8.396-4.337-9.945c-3.944-1.549-8.396,0.394-9.945,4.335c-0.233,0.593-5.364,13.709-13.283,37.779 l-18.844-4.626c-12.959-3.175-26.09,4.775-29.27,17.732l-24.565,100.067c-1.542,6.277-0.546,12.779,2.803,18.307 s8.651,9.421,14.928,10.962v0.001l14.834,3.641c-18.39,80.84-31.222,162.404-38.312,243.404 c-11.931-73.533-29.028-147.177-51.036-219.827l12.163-3.916c12.701-4.09,19.708-17.75,15.619-30.45l-28.909-89.79 c-4.09-12.701-17.75-19.71-30.45-15.617l-15.85,5.103c-8.893-21.697-14.486-33.463-14.741-33.998 c-1.825-3.825-6.4-5.443-10.226-3.622c-3.825,1.824-5.446,6.402-3.623,10.226c0.06,0.126,5.464,11.503,13.94,32.112l-9.823,3.163 c-12.7,4.09-19.707,17.75-15.617,30.45l28.909,89.79c3.299,10.245,12.825,16.784,23.051,16.784c2.451,0,4.944-0.375,7.399-1.167 l13.55-4.363c19.784,65.341,35.565,131.488,47.139,197.62c-14.488-40.997-39.086-97.22-78.182-150.933 c-2.164-2.975-6.136-3.993-9.465-2.428c-3.33,1.564-5.08,5.272-4.172,8.837c0.313,1.231,31.625,124.311,57.254,235.91 c0.8,3.484,3.901,5.954,7.477,5.954h43.341c0.788,0,1.56-0.128,2.296-0.359c0.715,0.226,1.47,0.353,2.249,0.358 c0.077,0.006,0.151,0.018,0.229,0.021c0.119,0.005,0.237,0.008,0.356,0.008c0.199,0,0.396-0.014,0.591-0.029h42.742 c3.575,0,6.676-2.469,7.477-5.954c25.632-111.599,56.942-234.68,57.255-235.91c0.908-3.564-0.842-7.272-4.171-8.837 c-3.33-1.563-7.299-0.544-9.465,2.428c-41.829,57.466-67.062,117.805-81.072,159.297c7.19-76.773,19.569-154.013,36.981-230.605 L333.4,196.418z M179.881,206.77c-4.648,1.499-9.647-1.067-11.143-5.715l-28.908-89.79c-1.496-4.647,1.067-9.646,5.715-11.143 l40.32-12.98c0.899-0.289,1.811-0.428,2.708-0.428c3.743,0,7.229,2.394,8.436,6.142l28.909,89.79 c1.497,4.647-1.068,9.646-5.716,11.143L179.881,206.77z M224.291,496.629c-15.983-69.303-33.883-142.073-45.042-186.828 c48.855,81.03,67.822,160.78,73.058,186.828H224.291z M348.928,309.788c-11.158,44.754-29.061,117.531-45.045,186.841h-28.021 C281.082,470.595,300.012,390.887,348.928,309.788z M312.984,175.608c-0.001,0-0.001,0-0.001,0l-22.07-5.417 c-2.297-0.565-4.238-1.99-5.463-4.013c-1.224-2.023-1.59-4.401-1.025-6.699l24.566-100.067c1.163-4.742,5.962-7.66,10.711-6.488 l46.145,11.328c2.297,0.564,4.238,1.987,5.463,4.011c1.224,2.023,1.59,4.402,1.025,6.7l-24.566,100.066 c-0.564,2.297-1.987,4.238-4.011,5.463c-2.023,1.225-4.404,1.591-6.7,1.025l-24.07-5.908 C312.987,175.609,312.986,175.609,312.984,175.608z",
    "M181.271,164.586l-14.795-45.409c-1.312-4.028-5.643-6.234-9.67-4.918c-4.028,1.312-6.23,5.642-4.918,9.67l14.795,45.409 c1.056,3.24,4.061,5.298,7.292,5.298c0.788,0,1.589-0.122,2.378-0.379C180.381,172.944,182.583,168.614,181.271,164.586z",
    "M328.432,63.388c-4.094-1.092-8.297,1.344-9.387,5.439l-12.291,46.149c-1.09,4.094,1.344,8.297,5.439,9.387 c0.662,0.177,1.326,0.261,1.979,0.261c3.391,0,6.494-2.267,7.408-5.7l12.291-46.149C334.961,68.682,332.527,64.479,328.432,63.388 z",
  ],
};

/** Fruit tree. Orchard and vineyard. */
export const FRUIT_TREE_ICON: TextureIcon = {
  size: 512,
  paint: "fill",
  scale: 1.1,
  paths: [
    "M427.016,174.971c1.507-5.016,2.283-10.25,2.283-15.524c0-29.45-23.709-53.466-53.041-53.967 C368.491,46.045,317.522,0,256.001,0c-40.085,0-77.559,19.988-100.052,52.771c-3.494-0.425-7.008-0.638-10.518-0.638 c-48.158,0-87.338,39.179-87.338,87.338c0,17.2,5.044,33.854,14.392,48.029c-18.982,21.954-29.302,49.573-29.302,79.02 c0,66.876,54.407,121.284,121.282,121.284c18.129,0,35.553-3.943,51.306-11.273v121.437c0,7.751,6.283,14.034,14.034,14.034 h52.392c7.751,0,14.034-6.283,14.034-14.034V376.53c15.753,7.328,33.177,11.273,51.306,11.273 c66.875,0,121.282-54.407,121.282-121.284C468.82,231.336,453.377,197.883,427.016,174.971z M268.165,483.933h-0.001h-24.325 V358.315c4.308-3.744,8.378-7.806,12.163-12.18c3.785,4.374,7.853,8.436,12.163,12.18V483.933z M347.537,359.735 c-20.616,0-40.047-6.631-55.884-18.526c-0.291-0.267-0.581-0.533-0.895-0.776c-7.873-6.06-14.647-13.234-20.203-21.361 c-0.154-0.226-0.31-0.453-0.463-0.681c-0.282-0.421-0.549-0.856-0.825-1.283v-52.688c0-7.751-6.283-14.034-14.034-14.034 c-7.751,0-14.034,6.283-14.034,14.034v55.005c-5.51,7.98-12.195,15.037-19.953,21.009c-0.316,0.243-0.605,0.509-0.895,0.776 c-15.837,11.895-35.27,18.526-55.884,18.526c-51.399,0-93.215-41.816-93.215-93.216c0-25.917,10.412-49.998,29.316-67.807 c5.553-5.23,5.911-13.938,0.807-19.607c-9.81-10.896-15.213-24.972-15.213-39.637c0-32.682,26.588-59.27,59.27-59.27 c4.707,0,9.435,0.568,14.049,1.691c6.084,1.476,12.406-1.249,15.506-6.686c16.575-29.075,47.619-47.138,81.013-47.138 c51.355,0,93.145,41.741,93.216,93.08c-0.001,0.077-0.001,0.153-0.001,0.222c0,4.474,2.133,8.681,5.744,11.324 c3.611,2.643,8.264,3.405,12.529,2.055c2.529-0.801,5.164-1.207,7.836-1.207c14.285,0,25.908,11.623,25.908,25.908 c0,4.526-1.191,8.986-3.445,12.897c-3.6,6.249-1.876,14.211,3.984,18.412c24.409,17.493,38.98,45.816,38.98,75.763 C440.752,317.919,398.937,359.735,347.537,359.735z",
    "M161.975,109.699c-21.667,0-39.294,17.628-39.294,39.294c0,21.667,17.628,39.294,39.294,39.294 c21.667,0,39.294-17.628,39.294-39.294C201.269,127.327,183.643,109.699,161.975,109.699z M161.975,160.22 c-6.19,0-11.227-5.037-11.227-11.227c0-6.19,5.037-11.227,11.227-11.227c6.19,0,11.227,5.037,11.227,11.227 C173.202,155.184,168.166,160.22,161.975,160.22z",
    "M282.198,75.716c-22.607,0-41,18.393-41,41s18.393,41,41,41s41-18.393,41-41S304.804,75.716,282.198,75.716z M282.198,129.648c-7.131,0-12.932-5.802-12.932-12.932s5.802-12.932,12.932-12.932c7.132,0,12.932,5.802,12.932,12.932 C295.13,123.848,289.329,129.648,282.198,129.648z",
    "M361.254,233.799c-24.43,0-44.305,19.875-44.305,44.305c0,24.43,19.875,44.305,44.305,44.305s44.305-19.876,44.305-44.305 C405.558,253.675,385.684,233.799,361.254,233.799z M361.254,294.341c-8.952,0-16.237-7.284-16.237-16.237 c0-8.952,7.284-16.237,16.237-16.237c8.953,0,16.237,7.284,16.237,16.237C377.491,287.057,370.207,294.341,361.254,294.341z",
    "M143.731,233.799c-24.43,0-44.304,19.875-44.304,44.305c0,24.43,19.875,44.305,44.304,44.305s44.305-19.876,44.305-44.305 C188.035,253.675,168.161,233.799,143.731,233.799z M143.731,294.341c-8.952,0-16.237-7.284-16.237-16.237 c0-8.952,7.284-16.237,16.237-16.237c8.954,0,16.237,7.284,16.237,16.237C159.968,287.057,152.684,294.341,143.731,294.341z",
    "M268.996,219.582c-0.182-0.898-0.449-1.782-0.8-2.624c-0.351-0.856-0.786-1.67-1.291-2.428 c-0.519-0.772-1.109-1.488-1.754-2.133s-1.361-1.235-2.133-1.74c-0.758-0.505-1.572-0.94-2.414-1.291 c-0.856-0.351-1.74-0.632-2.624-0.8c-1.81-0.365-3.677-0.365-5.487,0c-0.898,0.168-1.782,0.449-2.624,0.8 c-0.856,0.351-1.67,0.786-2.428,1.291c-0.772,0.505-1.488,1.095-2.133,1.74s-1.235,1.361-1.74,2.133 c-0.505,0.758-0.94,1.572-1.291,2.428c-0.351,0.842-0.617,1.726-0.8,2.624c-0.182,0.898-0.281,1.824-0.281,2.737 c0,0.912,0.098,1.838,0.281,2.737c0.182,0.898,0.449,1.782,0.8,2.624c0.351,0.856,0.786,1.67,1.291,2.428 c0.505,0.772,1.095,1.488,1.74,2.133s1.361,1.235,2.133,1.74c0.758,0.505,1.572,0.94,2.428,1.291 c0.842,0.351,1.726,0.631,2.624,0.8c0.898,0.182,1.824,0.281,2.737,0.281c0.912,0,1.838-0.098,2.751-0.281 c0.884-0.168,1.768-0.449,2.624-0.8c0.842-0.351,1.656-0.786,2.414-1.291c0.772-0.505,1.488-1.095,2.133-1.74 s1.235-1.361,1.754-2.133c0.505-0.758,0.94-1.572,1.291-2.428c0.351-0.842,0.617-1.726,0.8-2.624 c0.182-0.898,0.267-1.824,0.267-2.737C269.263,221.406,269.178,220.48,268.996,219.582z",
  ],
};

/** Pitched-roof house. Residential. */
export const HOUSE_ICON: TextureIcon = {
  size: 24,
  paint: "stroke",
  strokeWidth: 1.44,
  paths: [
    "M5 9.77746V16.2C5 17.8802 5 18.7203 5.32698 19.362C5.6146 19.9265 6.07354 20.3854 6.63803 20.673C7.27976 21 8.11984 21 9.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7203 19 17.8802 19 16.2V5.00002M21 12L15.5668 5.96399C14.3311 4.59122 13.7133 3.90484 12.9856 3.65144C12.3466 3.42888 11.651 3.42893 11.0119 3.65159C10.2843 3.90509 9.66661 4.59157 8.43114 5.96452L3 12M14 21V15H10V21",
  ],
};

/**
 * Saw-tooth roof and a chimney. Industrial and commercial.
 *
 * Authored here, not supplied. Deliberately plain: at pattern scale the roof
 * profile is the whole signal, and anything finer than this is a smudge.
 */
export const FACTORY_ICON: TextureIcon = {
  size: 24,
  paint: "stroke",
  strokeWidth: 1.5,
  paths: ["M2.5 20.5H21.5", "M3.5 20.5V11L9 14.5V11L14.5 14.5V20.5", "M17.5 20.5V5H20.5V20.5"],
};

/**
 * Crossed sabres. Military land.
 *
 * Authored here, not supplied — and chosen because it is the mark a map
 * reader already associates with a military site, rather than the hatching a
 * paper map would use, which a repeating icon cannot express.
 */
export const SABRES_ICON: TextureIcon = {
  size: 24,
  paint: "stroke",
  strokeWidth: 1.5,
  paths: ["M5.5 20.5L18 5.5", "M18.5 20.5L6 5.5", "M3.5 9H8.5", "M15.5 9H20.5"],
};

/** The textures this package knows how to draw. */
export type LandTexture =
  | "woodland"
  | "scrub"
  | "farmland"
  | "orchard"
  | "wetland"
  | "residential"
  | "industry"
  | "military";

export const TEXTURE_ICONS: Record<LandTexture, TextureIcon> = {
  woodland: TREE_ICON,
  scrub: BUSH_ICON,
  farmland: WHEAT_ICON,
  orchard: FRUIT_TREE_ICON,
  wetland: REED_ICON,
  residential: HOUSE_ICON,
  industry: FACTORY_ICON,
  military: SABRES_ICON,
};

/**
 * Ink colours, one per texture.
 *
 * Desaturated on purpose, and darker than the plate they sit on: this is
 * background a plan is drawn over, not the subject. Same argument as
 * GOING_COLOURS, which these are meant to sit alongside rather than fight.
 */
export const TEXTURE_COLOURS: Record<LandTexture, string> = {
  woodland: "#3f6b46",
  scrub: "#5c7444",
  farmland: "#9a7b39",
  orchard: "#4e6b3c",
  wetland: "#3d7f76",
  residential: "#8a8180",
  industry: "#77706c",
  military: "#8a5a4a",
};

/**
 * THE GROUND COLOUR of each textured kind.
 *
 * These are not a tint over the flavor's own colour, they are the colour,
 * because for most of these kinds the flavor has none. Protomaps' `landuse`
 * layers cover park, urban_green, hospital, industrial, school, beach, zoo,
 * aerodrome, runway, pedestrian and pier — that is the whole list. `farmland`,
 * `orchard`, `farmyard`, `wetland`, `heath`, `scrub` and `residential` are all
 * left as the `earth` fill, which is `#e2dfda`: one grey for a wheat field, a
 * marsh and a housing estate alike.
 *
 * So: farmland is yellow, woodland is a darker green than the ground, marsh
 * goes blue-green, and the built-up kinds go warm grey. Muted, because a plan
 * is drawn over this, but not washed out — a wash of a colour nothing is under
 * is just a paler grey.
 */
export const TEXTURE_PLATE_COLOURS: Record<LandTexture, string> = {
  woodland: "#c5d9ae",
  scrub: "#d3ddb3",
  farmland: "#d6e398",
  orchard: "#cfdda6",
  wetland: "#c4d9d2",
  residential: "#e4e0dc",
  industry: "#dcd8d4",
  military: "#ded2c8",
};

/**
 * The base ground: what shows where there is no landuse polygon at all.
 *
 * The flavor's `earth` is a grey (`#e2dfda` in "light"), which is defensible on
 * a plate where nothing else is coloured and reads as pavement once the fields
 * and woods around it are not. This is the light grass green that replaces it,
 * chosen to sit UNDER the woodland plate so a wood still reads as darker than
 * the country around it.
 *
 * Applied only when landusePatterns is passed `ground` — see there for why an
 * extension does not repaint a layer it does not own by default.
 */
export const NATURAL_GROUND = "#e2ecd5";

/**
 * Which `landuse.kind` values get which texture.
 *
 * Only kinds whose NAME states the ground cover are here. `nature_reserve`,
 * `park` and `grass` are deliberately absent: a nature reserve is as often
 * moorland as woodland, and drawing trees on it would be the map asserting
 * something the tiles never said.
 *
 * Kinds an archive does not carry cost nothing — the filter simply never
 * matches — so the synonyms are worth having.
 */
export const TEXTURE_KINDS: Record<string, LandTexture> = {
  forest: "woodland",
  wood: "woodland",
  scrub: "scrub",
  heath: "scrub",
  farmland: "farmland",
  allotments: "farmland",
  farmyard: "farmland",
  orchard: "orchard",
  vineyard: "orchard",
  wetland: "wetland",
  marsh: "wetland",
  swamp: "wetland",
  bog: "wetland",
  residential: "residential",
  neighbourhood: "residential",
  industrial: "industry",
  commercial: "industry",
  retail: "industry",
  military: "military",
};

// ── Tile layout ─────────────────────────────────────────────────────────────

/** Where one icon sits in the pattern tile. */
export interface TexturePlacement {
  /** Centre, as a fraction of the tile. */
  readonly x: number;
  readonly y: number;
  /** Rotation in degrees. */
  readonly rotate: number;
  /** Size multiplier. */
  readonly scale: number;
}

/**
 * THE SLOT LATTICE — why every texture gets different offsets.
 *
 * Each texture is its own pattern image, and MapLibre tiles them all on the
 * same screen-space lattice. So two textures that place an icon at the same
 * fraction of the tile put those icons at the SAME PIXEL wherever their
 * polygons meet or overlap — a wood inside a military area, a residential
 * block over farmland — and the two glyphs print on top of each other. It is
 * not a rare case: overlapping landuse is normal in OSM-derived data.
 *
 * The fix is to treat the tile as a shared seating plan. Sixteen slots on a
 * staggered 4x4 lattice, dealt out two per texture, so no two textures can
 * ever claim the same one:
 *
 *   - the lattice guarantees a MINIMUM SEPARATION of a quarter tile between
 *     any two icons of any two textures — 16px at the default 64px tile, which
 *     leaves 5px clear around an 11px icon in the worst case;
 *   - the seats are dealt in steps of 7 (coprime with 16, so it visits all of
 *     them) rather than in order, which puts each texture's own two icons 18
 *     to 36px apart. Consecutive seats would pair them up and the pattern
 *     would read as dominoes;
 *   - the odd rows are staggered half a cell, so several textures on screen at
 *     once look scattered rather than like graph paper.
 *
 * Fixed rather than jittered, because the CI code scan blocks `Math.random()`
 * outright — and fixed is the better answer anyway: a pattern has to tile
 * seamlessly, and a random offset would have to be seeded and wrapped by hand
 * to manage it. This gets a provable separation instead of a hoped-for one.
 */
const LATTICE = 4;
const SLOT_STRIDE = 7;

/** Slots in the tile. More textures than `TEXTURE_SLOT_COUNT / 2` start to share. */
export const TEXTURE_SLOT_COUNT = LATTICE * LATTICE;

/** Icons each texture draws per tile. */
export const SLOTS_PER_TEXTURE = 2;

/** One seat on the lattice, by draw order rather than by position. */
export function slotPlacement(slot: number): TexturePlacement {
  const cell = (slot * SLOT_STRIDE) % TEXTURE_SLOT_COUNT;
  const column = cell % LATTICE;
  const row = Math.floor(cell / LATTICE);
  // Odd rows sit half a cell over. Same minimum separation, less grid.
  const x = (column + 0.5 + (row % 2) * 0.5) / LATTICE;

  return {
    x: x - Math.floor(x),
    y: (row + 0.5) / LATTICE,
    // Deterministic tilt and size variation, so a wood does not look stamped.
    rotate: ((slot * 5) % 7) * 4 - 12,
    scale: slot % 2 === 0 ? 1 : 0.92,
  };
}

/** The seats dealt to the texture at `index` in the extension's texture order. */
export function placementsForTexture(
  index: number,
  perTexture: number = SLOTS_PER_TEXTURE,
): TexturePlacement[] {
  return Array.from({ length: perTexture }, (_, k) => slotPlacement(index * perTexture + k));
}

export interface AbsolutePlacement extends TexturePlacement {
  /** Centre in tile pixels. May be negative, or past the tile edge. */
  readonly x: number;
  readonly y: number;
}

/**
 * Every placement, plus the eight wrapped copies of it.
 *
 * A pattern tile is drawn edge to edge, so an icon whose centre is near an
 * edge must also be drawn one tile over — otherwise it is sliced off and the
 * seam is visible as a grid across the whole polygon. Drawing the 3x3
 * neighbourhood and letting the canvas clip is the cheap, obviously-correct
 * way to do it: nine draws of a 20px glyph, once, at attach.
 */
export function wrappedPlacements(
  placements: readonly TexturePlacement[],
  tileSize: number,
): AbsolutePlacement[] {
  const out: AbsolutePlacement[] = [];
  for (const placement of placements) {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        out.push({
          ...placement,
          x: (placement.x + dx) * tileSize,
          y: (placement.y + dy) * tileSize,
        });
      }
    }
  }
  return out;
}

// ── Rasterisation ───────────────────────────────────────────────────────────

export interface RenderTextureOptions {
  icon: TextureIcon;
  colour: string;
  /** Tile side in CSS pixels. */
  tileSize: number;
  /** Icon side in CSS pixels, before the icon's own `scale`. */
  iconSize: number;
  /** Device pixel ratio. The image is rendered at this and declared with it. */
  pixelRatio: number;
  /** Where the icons sit. Defaults to the first texture's two slots. */
  placements?: readonly TexturePlacement[];
  /** Multiplier on every stroke width. */
  boldness?: number;
}

/**
 * Draw one pattern tile.
 *
 * Returns null rather than throwing where there is no DOM — a worker, a test,
 * an SSR pass — because the caller's response to "no canvas here" is to skip
 * the texture, not to fail the map.
 */
export function renderTexturePattern(options: RenderTextureOptions): ImageData | null {
  if (typeof document === "undefined" || typeof Path2D === "undefined") {
    return null;
  }

  const { icon, tileSize, iconSize, pixelRatio } = options;
  const side = Math.max(1, Math.round(tileSize * pixelRatio));

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = options.colour;
  ctx.strokeStyle = options.colour;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const placements = options.placements ?? placementsForTexture(0);
  const boldness = options.boldness ?? 1;

  for (const placement of wrappedPlacements(placements, tileSize)) {
    // The icon is authored with its origin at the top-left of its viewBox, and
    // placed by its CENTRE — so scale first, then step back half a box.
    const scale = (iconSize * (icon.scale ?? 1) * placement.scale) / icon.size;

    ctx.save();
    ctx.translate(placement.x, placement.y);
    ctx.rotate((placement.rotate * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-icon.size / 2, -icon.size / 2);

    if (icon.paint === "stroke") {
      // Set INSIDE the scaled transform, so the number means viewBox units —
      // which is how it was authored. Outside it, a 24-unit icon and a
      // 512-unit icon would need wildly different widths to draw one line.
      ctx.lineWidth = (icon.strokeWidth ?? 1.4) * boldness;
    }

    for (const d of icon.paths) {
      const path = new Path2D(d);
      if (icon.paint === "fill") {
        ctx.fill(path);
      } else {
        ctx.stroke(path);
      }
    }

    ctx.restore();
  }

  return ctx.getImageData(0, 0, side, side);
}
