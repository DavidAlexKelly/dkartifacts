// adapter/types.ts — the interface any rendering backend (MapLibre,
// Leaflet, Mapbox GL, a plain <canvas>, …) must implement to host
// TacticOverlay / OrderHandleController. WorldCoord's meaning is entirely
// up to the adapter — for map libraries it's typically [lng, lat]; for a
// non-geographic canvas it could just be raw [x, y] in some fixed unit.
export type WorldCoord = [number, number];

export interface ScreenPt {
  x: number;
  y: number;
}

export interface MarkerHandle {
  setPosition(world: WorldCoord): void;
  getPosition(): WorldCoord;
  getElement(): HTMLElement;
  remove(): void;
}

export interface MapAdapter {
  /** world coordinate -> screen pixels, relative to getContainer() */
  project(world: WorldCoord): ScreenPt;
  /** screen pixels -> world coordinate */
  unproject(px: ScreenPt): WorldCoord;
  /** DOM element pointer/mouse events should be measured relative to */
  getContainer(): HTMLElement;
  /** current zoom level, used to scale symbols consistently across zoom.
   * Return a constant (e.g. 0) if your backend has no zoom concept. */
  getZoom(): number;
  /** subscribe to any camera change (pan/zoom/rotate/resize/…); returns an unsubscribe fn */
  onCameraChange(cb: () => void): () => void;
  /** create a positionable marker at `world`, backed by `el` */
  createMarker(el: HTMLElement, world: WorldCoord): MarkerHandle;
}