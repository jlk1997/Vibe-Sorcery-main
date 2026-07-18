/** 24×24 viewBox, stroke icons — used to build SVG data URIs */
export const ICON_PATHS: Record<string, string> = {
  play: '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev:
    '<path d="M6 6v12"/><path d="M18 6L10 12l8 6V6z"/>',
  next:
    '<path d="M18 6v12"/><path d="M6 6l8 6-8 6V6z"/>',
  heart:
    '<path d="M12 20.5c-3.5-2.8-6-5.6-6-9a3.5 3.5 0 0 1 6-2 3.5 3.5 0 0 1 6 2c0 3.4-2.5 6.2-6 9z"/>',
  heartFilled:
    '<path d="M12 20.5c-3.5-2.8-6-5.6-6-9a3.5 3.5 0 0 1 6-2 3.5 3.5 0 0 1 6 2c0 3.4-2.5 6.2-6 9z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/>',
  bell:
    '<path d="M12 3a4 4 0 0 0-4 4v3.5L6 13h12l-2-2.5V7a4 4 0 0 0-4-4z"/><path d="M10 17a2 2 0 0 0 4 0"/>',
  music:
    '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  journey: '<path d="M4 18l6-8 5 4 5-10"/>',
  sigil: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M8 10h8M8 14h8"/>',
  flask: '<path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 17l-5-9V2"/><path d="M8 2h8"/>',
  grimoire: '<path d="M5 4h14v16H5z"/><path d="M9 4v16M5 8h4M5 12h4M5 16h4"/>',
  create: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  feed: '<path d="M12 3c-4.5 5-7 9-7 14a7 7 0 0 0 14 0c0-5-2.5-9-7-14z"/>',
  discover:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  share:
    '<path d="M16 8l-4-4-4 4"/><path d="M12 4v9"/><path d="M6 14v4h12v-4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  comment: '<path d="M6 18l-2 2V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8l-2 2z"/>',
  bookmark: '<path d="M6 4h12v16l-6-4-6 4V4z"/>',
  bookmarkFilled:
    '<path d="M6 4h12v16l-6-4-6 4V4z" fill="currentColor"/>',
  flag: '<path d="M5 3v18"/><path d="M5 4h11l-2 4 2 4H5"/>',
  remix:
    '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  grid:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  queue:
    '<path d="M4 6h16M4 12h16M4 18h10"/><path d="M18 16v6M15 19l3-3 3 3"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  lyrics: '<path d="M4 6h16M4 12h10M4 18h14"/>',
  sparkle:
    '<path d="M12 2l1.2 4.2L17 7l-3.8 1.8L12 13l-1.2-4.2L7 7l3.8-1.8L12 2z"/><path d="M19 14l.8 2.8L22 17l-2.2 1.2L19 21l-.8-2.8L16 17l2.2-1.2L19 14z"/><path d="M5 15l.6 2.1L8 17l-2.4 1.3L5 21l-.6-2.1L2 17l2.4-1.3L5 15z"/>',
};

const FILL_ICONS = new Set(["play", "pause", "heartFilled", "bookmarkFilled", "more", "list", "stop"]);

export function iconSvgDataUri(name: string, color: string): string {
  const inner = ICON_PATHS[name] || ICON_PATHS.info;
  const useFill = FILL_ICONS.has(name);
  const svg = useFill
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="none">${inner.replace(/currentColor/g, color)}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
