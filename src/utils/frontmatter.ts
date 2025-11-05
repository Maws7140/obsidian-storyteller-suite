// Frontmatter parsing utilities (Javalent-inspired)
// Parses location, mapmarker, mapmarkers, and mapoverlay from a note's frontmatter

import type { App, TFile } from 'obsidian';
import type { MapMarker } from '../types';

export interface MarkerDefinition {
  loc: [number, number];
  label?: string;
  link?: string; // wikilink or path
  description?: string;
  minZoom?: number;
  maxZoom?: number;
  color?: string;
  icon?: string;
}

export interface OverlayDefinition {
  color?: string;
  loc: [number, number];
  radius: string; // e.g. "100 m", "25 mi"
  description?: string;
}

export interface FrontmatterMapData {
  location?: [number, number] | string; // coordinates or wikilink
  mapmarker?: string | { icon?: string; color?: string; layer?: string };
  mapmarkers?: MarkerDefinition[];
  mapoverlay?: OverlayDefinition[];
}

export function readFrontmatter(app: App, file: TFile): FrontmatterMapData | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.frontmatter) return null;
  const fm = cache.frontmatter as any;
  const result: FrontmatterMapData = {};

  if (fm.location) result.location = fm.location;
  if (fm.mapmarker) result.mapmarker = fm.mapmarker;
  if (Array.isArray(fm.mapmarkers)) result.mapmarkers = fm.mapmarkers as MarkerDefinition[];
  if (Array.isArray(fm.mapoverlay)) result.mapoverlay = fm.mapoverlay as OverlayDefinition[];

  return result;
}

export function resolveWikilink(app: App, link: string, sourcePath: string): TFile | null {
  return app.metadataCache.getFirstLinkpathDest(link, sourcePath);
}

export function toMapMarker(def: MarkerDefinition): MapMarker {
  return {
    id: '', // caller should fill
    lat: def.loc[0],
    lng: def.loc[1],
    label: def.label,
    description: def.description,
    color: def.color,
    icon: def.icon,
    minZoom: def.minZoom,
    maxZoom: def.maxZoom
  };
}
