// overlay/theme.ts — visual theming for edit handles, decoupled from
// hardcoded pixel values. Pass a partial theme to OrderHandleController;
// unspecified fields fall back to DEFAULT_HANDLE_THEME.
export interface HandleTheme {
  endpointHandleSize: number;
  positionHandleSize: number;
  sectionHandleSize: number;
  scaleHandleSize: number;
  handleBorderWidth: number;
  handleFillIdle: string;
  handleFillActive: string;
}

export const DEFAULT_HANDLE_THEME: HandleTheme = {
  endpointHandleSize: 24,
  positionHandleSize: 20,
  sectionHandleSize: 16,
  scaleHandleSize: 14,
  handleBorderWidth: 2.5,
  handleFillIdle: "rgba(255,255,255,0.85)",
  handleFillActive: "rgba(255,255,255,0.95)",
};

export function resolveTheme(theme?: Partial<HandleTheme>): HandleTheme {
  return { ...DEFAULT_HANDLE_THEME, ...theme };
}

let stylesInjected = false;
export function ensureHandleStyles(): void {
  if (stylesInjected) {return;}
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "__tg-handle-style";
  style.textContent = `
    .tg-handle { opacity: 0 !important; transition: opacity 0.12s; }
    .tg-handle:hover { opacity: 1 !important; }
    .tg-handle--dragging { opacity: 1 !important; }
    .tg-handle--group-hovered { opacity: 1 !important; }
  `;
  document.head.appendChild(style);
}