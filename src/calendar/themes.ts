/**
 * Bundled timeline themes. These are ordinary {@link TimelineTheme} values,
 * exactly what a user would author in the theme editor and share as a
 * `.storytl.json`, provided so the theme picker has real choices on day one
 * and every field has a working example to copy from.
 *
 * - {@link OBSIDIAN_NATIVE_THEME}: sets no colours, so it follows the active
 *   Obsidian theme and any `--sts-timeline-*` CSS snippet.
 * - {@link HIGH_CONTRAST_THEME}: black canvas, white text, saturated lanes.
 * - {@link PARCHMENT_THEME}: warm paper, ink text, serif labels.
 * - {@link QUIET_THEME}: Obsidian's own colours with a quiet palette, flatter
 *   chips and thinner lines.
 */
import { OBSIDIAN_NATIVE_THEME, type TimelineTheme } from './TimelineDocuments';

export const HIGH_CONTRAST_THEME: TimelineTheme = {
  id: 'builtin:high-contrast',
  name: 'High contrast',
  description: 'Black canvas, white text and saturated lane colours for readability and projection.',
  colors: {
    background: '#000000',
    surface: '#111111',
    sidebar: '#0a0a0a',
    grid: '#5c5c5c',
    gridStrong: '#8a8a8a',
    text: '#ffffff',
    mutedText: '#d0d0d0',
    accentText: '#ffd400',
    onAccent: '#000000',
    accent: '#ffd400',
    now: '#ff3b30',
    conflictError: '#ff3b30',
    conflictWarning: '#ffd400',
    connector: '#00e5ff',
    flashback: '#c77dff',
    flashforward: '#ff9f1c',
    era: '#00e5ff',
    holiday: '#ff9f1c',
    milestone: '#ffd400',
    milestoneEdge: '#ffffff',
    slot: '#bdbdbd',
  },
  palette: ['#ffd400', '#00e5ff', '#ff4fd8', '#5cff5c', '#ff9f1c', '#8ab4ff', '#ff6b6b', '#c77dff', '#ffffff', '#3dffc5'],
  event: { radius: 2, height: 26, opacity: 1 },
  lane: { height: 40, gap: 10, labelWidth: 180 },
  axis: { density: 40, showCycles: true, showHolidays: true },
  connectors: { width: 2.5 },
};

export const PARCHMENT_THEME: TimelineTheme = {
  id: 'builtin:parchment',
  name: 'Parchment',
  description: 'Warm paper, ink text and serif labels, for chronicles and histories.',
  font: 'Georgia, "Times New Roman", serif',
  colors: {
    background: '#f3ead6',
    surface: '#fbf6ea',
    sidebar: '#e9dcc0',
    grid: '#cdb991',
    gridStrong: '#a8916a',
    text: '#3a2c1a',
    mutedText: '#6e5a3e',
    accentText: '#8a3b12',
    onAccent: '#fbf6ea',
    accent: '#8a3b12',
    now: '#a1241b',
    conflictError: '#a1241b',
    conflictWarning: '#b7791f',
    connector: '#6b4a2b',
    flashback: '#6c4f8a',
    flashforward: '#b45f1d',
    era: '#7a5c2e',
    holiday: '#b7791f',
    milestone: '#b8860b',
    milestoneEdge: '#5c4306',
    slot: '#8b7650',
  },
  palette: ['#8a3b12', '#2f5d50', '#6c4f8a', '#9a6b16', '#3f5f8a', '#7a2e3a', '#4d6b2c', '#a3542b', '#5a4a3a', '#2d6e7e'],
  event: { radius: 2, height: 24, opacity: 1 },
  lane: { height: 36, gap: 8, labelWidth: 174 },
  axis: { density: 50, showCycles: true, showHolidays: true },
  connectors: { width: 1.5, dependencyStyle: 'dashed' },
};

export const QUIET_THEME: TimelineTheme = {
  id: 'builtin:quiet',
  name: 'Quiet',
  description: 'Obsidian’s own colours with a quiet palette, flat chips and thin lines.',
  palette: ['#6b7280', '#7c8aa5', '#8a9a8a', '#a08f7a', '#8f7fa3', '#7a9aa0', '#a3858f', '#909090', '#7d8f6e', '#9a8a6a'],
  event: { radius: 1, height: 22, opacity: 0.92 },
  lane: { height: 32, gap: 6, labelWidth: 160 },
  axis: { density: 65, showCycles: false, showHolidays: true },
  connectors: { width: 1.25 },
};

export const BUILTIN_TIMELINE_THEMES: TimelineTheme[] = [
  OBSIDIAN_NATIVE_THEME,
  HIGH_CONTRAST_THEME,
  PARCHMENT_THEME,
  QUIET_THEME,
];
