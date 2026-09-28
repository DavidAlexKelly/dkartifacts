/**
 * Menu colours.
 *
 * A separate module rather than a constant in menus.tsx: a file that exports
 * both components and an object breaks React Fast Refresh, and the lint rule
 * that catches it is right to. Hosts import DEFAULT_MENU_THEME, spread it, and
 * override the two or three colours their design system cares about.
 */

export interface MenuTheme {
  background: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export const DEFAULT_MENU_THEME: MenuTheme = {
  background: "#111318",
  border: "#374057",
  text: "#e8ecf4",
  muted: "#8b93a7",
  accent: "#4a7c59",
};
