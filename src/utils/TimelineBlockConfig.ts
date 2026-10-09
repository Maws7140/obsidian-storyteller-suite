// Settings for a ```timeline fenced block.
//
// Kept apart from the block's Obsidian plumbing so the parsing can be read, and
// tested, without a renderer or a workspace in the way.

import type { TimelineFilters } from './NativeTimelineRenderer';
import type { TimelineGroupMode } from '../types';

/** Every knob a fenced timeline block can turn. */
export interface TimelineBlockConfig {
    groupMode: TimelineGroupMode;
    ganttMode: boolean;
    orientation: 'horizontal' | 'vertical';
    height: number;
    showEras: boolean;
    showPresence: boolean;
    narrativeOrder: boolean;
    stackEnabled: boolean;
    filters: TimelineFilters;
    /** Initial visible window, when the block asked for one. */
    from?: string;
    to?: string;
    /** Rendered in place of the timeline when the block is unreadable. */
    errors: string[];
}

const GROUP_MODES: TimelineGroupMode[] = ['none', 'location', 'group', 'character', 'track', 'item', 'culture', 'magicSystem'];

/** Aliases so the block reads like prose rather than like the type union. */
const GROUP_ALIASES: Record<string, TimelineGroupMode> = {
    character: 'character', characters: 'character',
    location: 'location', locations: 'location',
    group: 'group', groups: 'group',
    track: 'track', tracks: 'track',
    item: 'item', items: 'item',
    culture: 'culture', cultures: 'culture',
    magic: 'magicSystem', magicsystem: 'magicSystem', 'magic-system': 'magicSystem',
    none: 'none'
};

const DEFAULT_HEIGHT = 380;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 2000;

function asBoolean(value: string): boolean {
    return /^(true|yes|on|1)$/i.test(value.trim());
}

function asList(value: string): Set<string> | undefined {
    const parts = value.split(',').map(part => part.trim()).filter(Boolean);
    return parts.length ? new Set(parts) : undefined;
}

/**
 * Read a block's settings.
 *
 * Unknown keys are collected rather than ignored. A typo in a fenced block is
 * invisible otherwise: the timeline renders, looks nearly right, and quietly
 * leaves out the filter somebody thought they had applied.
 */
export function parseTimelineBlock(source: string): TimelineBlockConfig {
    const config: TimelineBlockConfig = {
        groupMode: 'none',
        ganttMode: false,
        orientation: 'horizontal',
        height: DEFAULT_HEIGHT,
        showEras: false,
        showPresence: false,
        narrativeOrder: false,
        stackEnabled: true,
        filters: {},
        errors: []
    };

    source.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const separator = trimmed.indexOf(':');
        if (separator < 0) {
            config.errors.push(`Not a setting: "${trimmed}"`);
            return;
        }
        const key = trimmed.slice(0, separator).trim().toLowerCase();
        const value = trimmed.slice(separator + 1).trim();
        switch (key) {
            case 'group':
            case 'group-by':
                if (GROUP_ALIASES[value.toLowerCase()]) config.groupMode = GROUP_ALIASES[value.toLowerCase()];
                else config.errors.push(`Unknown grouping "${value}". Try one of: ${GROUP_MODES.join(', ')}`);
                break;
            case 'gantt': config.ganttMode = asBoolean(value); break;
            case 'orientation': config.orientation = value.toLowerCase() === 'vertical' ? 'vertical' : 'horizontal'; break;
            case 'height': {
                const parsed = Number.parseInt(value, 10);
                if (Number.isFinite(parsed)) config.height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed));
                else config.errors.push(`Height "${value}" is not a number`);
                break;
            }
            case 'eras': config.showEras = asBoolean(value); break;
            case 'presence': config.showPresence = asBoolean(value); break;
            case 'narrative': config.narrativeOrder = asBoolean(value); break;
            case 'stack': config.stackEnabled = asBoolean(value); break;
            case 'milestones': config.filters.milestonesOnly = asBoolean(value); break;
            case 'characters': config.filters.characters = asList(value); break;
            case 'locations': config.filters.locations = asList(value); break;
            case 'groups': config.filters.groups = asList(value); break;
            case 'tags': config.filters.tags = asList(value); break;
            case 'era': config.filters.eras = asList(value); break;
            case 'branch': config.filters.forkId = value || undefined; break;
            case 'from': config.from = value; break;
            case 'to': config.to = value; break;
            default: config.errors.push(`Unknown setting "${key}"`);
        }
    });

    return config;
}

