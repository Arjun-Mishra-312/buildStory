/**
 * Literal brand colors for satori-rendered cards. Satori has no CSS custom
 * property support (its styles are inline JS objects, not parsed CSS), so
 * these mirror app/globals.css's :root tokens as plain hex strings rather
 * than reading them at render time. Cards always render in the dark/panel
 * look regardless of the viewer's site theme - there is no theme context on
 * a shared image.
 */
export const SHARE_CARD_PALETTE = {
  surface: "#191a17",
  ink: "#faf7ef",
  muted: "#a9a79c",
  faint: "#726f63",
  coral: "#f36f56",
  cobalt: "#6f86e8",
  line: "#38372f",
} as const;
