/**
 * The glass in front of the CRT theme: scanlines, a vignette, and a slow roll
 * of brighter band down the screen. Also MapLibre's own controls, which are
 * white buttons in a stylesheet of MapLibre's and would be the only thing on
 * the screen not lit green.
 *
 * One element over everything with `pointer-events: none`, so the map and the
 * panels under it work exactly as before. Pure CSS — gradients and one
 * animation — so it costs nothing per frame of the map. The roll stops for
 * anyone whose system asks for reduced motion.
 */

import React from "react";

const SCREEN_CSS = `
.events-crt-screen {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.22) 3px
    ),
    radial-gradient(
      ellipse at center,
      rgba(0, 0, 0, 0) 60%,
      rgba(0, 0, 0, 0.55) 100%
    );
}
.events-crt-screen::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -20%;
  height: 20%;
  background: linear-gradient(
    to bottom,
    rgba(51, 255, 102, 0) 0%,
    rgba(51, 255, 102, 0.035) 50%,
    rgba(51, 255, 102, 0) 100%
  );
  animation: events-crt-roll 9s linear infinite;
}
@keyframes events-crt-roll {
  from { transform: translateY(0); }
  to { transform: translateY(600%); }
}
[data-theme="crt"] .maplibregl-ctrl-group {
  background: #03110a;
  border-radius: 1px;
  box-shadow: 0 0 0 1px rgba(51, 255, 102, 0.35), 0 0 10px rgba(51, 255, 102, 0.12);
}
[data-theme="crt"] .maplibregl-ctrl-group button + button {
  border-top-color: rgba(51, 255, 102, 0.25);
}
[data-theme="crt"] .maplibregl-ctrl-group button:not(:disabled):hover {
  background-color: rgba(51, 255, 102, 0.14);
}
/* The icons are dark SVGs: invert to light, then tint to the phosphor. */
[data-theme="crt"] .maplibregl-ctrl-icon {
  filter: invert(1) sepia(1) saturate(5) hue-rotate(75deg) brightness(0.95);
}
[data-theme="crt"] .maplibregl-ctrl-attrib,
[data-theme="crt"] .maplibregl-ctrl-attrib.maplibregl-compact {
  background: rgba(2, 12, 6, 0.86);
  color: #2fbf5a;
}
[data-theme="crt"] .maplibregl-ctrl-attrib a { color: #5cff8a; }
[data-theme="crt"] .maplibregl-ctrl-attrib-button {
  filter: invert(1) sepia(1) saturate(5) hue-rotate(75deg);
}
@media (prefers-reduced-motion: reduce) {
  .events-crt-screen::after { animation: none; display: none; }
}
`;

export function CrtScreen(): React.ReactElement {
  return (
    <>
      <style>{SCREEN_CSS}</style>
      <div className="events-crt-screen" aria-hidden="true" data-testid="crt-screen" />
    </>
  );
}
