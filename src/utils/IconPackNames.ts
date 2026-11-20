/**
 * Icon pack naming, pure and with no Obsidian imports.
 *
 * A pack is a folder of SVG files at `<configDir>/icons/<folder>/<file>.svg` (the
 * folder Iconize uses). A pack icon is stored as an Iconize-style prefix plus the
 * PascalCase file name, for example `GiDragonHead` for `game-icons/dragon-head.svg`.
 * When two packs would share a prefix, the later one is stored in the explicit form
 * `pack:<folder>/<file>` instead.
 */

import type { ParsedIcon } from './EntityIcon';

export interface PackListing {
    /** Folder name inside `<configDir>/icons`, for example `game-icons`. */
    folder: string;
    /** Vault path of the folder, for example `.obsidian/icons/game-icons`. */
    path: string;
    /** SVG file names inside the folder, with extension, for example `dragon-head.svg`. */
    files: string[];
}

export interface PackIconEntry {
    folder: string;
    file: string;
    /** The frontmatter value that selects this icon. */
    value: string;
    /** Human label, the file name without extension. */
    label: string;
}

interface PackPlanEntry {
    pack: PackListing;
    /** Prefix this pack owns, or null when its icons use the explicit form. */
    prefix: string | null;
}

const MIN_PREFIX = 2;
const MAX_PREFIX = 4;
const EXPLICIT_PART = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Lower-case slug of a folder or file name, using only a-z, 0-9 and hyphens.
 * Strips a trailing `.svg`. Returns '' when nothing usable is left.
 */
export function slugName(name: string): string {
    return name
        .replace(/\.svg$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Iconize-style prefix for a pack folder: the first letter of each word, or the first
 * two letters when the name is one word. The result is capitalised, so `lucide-icons`
 * gives `Li`, `game-icons` gives `Gi` and `font-awesome-solid` gives `Fas`.
 * Returns null when the derived prefix is not 2 to 4 letters long.
 */
export function packPrefix(folder: string): string | null {
    const words = folder.split(/[^A-Za-z]+/).filter(Boolean);
    if (words.length === 0) return null;
    const raw = words.length === 1 ? words[0].slice(0, 2) : words.map(word => word.charAt(0)).join('');
    const prefix = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return prefix.length >= MIN_PREFIX && prefix.length <= MAX_PREFIX ? prefix : null;
}

/**
 * PascalCase name for a pack file: `dragon-head.svg` gives `DragonHead`.
 * Returns null when the result cannot be written in the prefixed form safely:
 * it must start with a letter, and the next two characters must not be capitals,
 * because the value parser would otherwise split the prefix in the wrong place
 * (for example `GiUIIcon`). Those icons use the explicit form instead.
 */
export function pascalName(file: string): string | null {
    const base = file.replace(/\.svg$/i, '');
    const pascal = base
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    if (!/^[A-Z]/.test(pascal)) return null;
    if (/[A-Z]/.test(pascal.slice(1, 3))) return null;
    return pascal;
}

/** Value for a pack file using its prefix, or null when the name cannot use the prefix form. */
export function prefixedPackValue(prefix: string, file: string): string | null {
    const name = pascalName(file);
    return name ? `${prefix}${name}` : null;
}

/** Explicit `pack:<folder>/<file>` value, or null when either part has no usable slug. */
export function explicitPackValue(folder: string, file: string): string | null {
    const folderSlug = slugName(folder);
    const fileSlug = slugName(file);
    if (!EXPLICIT_PART.test(folderSlug) || !EXPLICIT_PART.test(fileSlug)) return null;
    return `pack:${folderSlug}/${fileSlug}`;
}

/**
 * Decide, once for a set of packs, which pack owns each prefix. Packs are taken in
 * folder-name order so the result is stable. A later pack whose prefix is already
 * owned, or whose prefix is not derivable, gets prefix null.
 */
function packPrefixPlan(packs: readonly PackListing[]): PackPlanEntry[] {
    const owned = new Set<string>();
    return [...packs]
        .sort((a, b) => a.folder.localeCompare(b.folder))
        .map(pack => {
            const prefix = packPrefix(pack.folder);
            if (prefix === null || owned.has(prefix)) return { pack, prefix: null };
            owned.add(prefix);
            return { pack, prefix };
        });
}

/**
 * Every pack icon with the frontmatter value that selects it. Files that are not SVG
 * are skipped, and so are files with no usable name in either form.
 */
export function planPackIcons(packs: readonly PackListing[]): PackIconEntry[] {
    const entries: PackIconEntry[] = [];
    for (const { pack, prefix } of packPrefixPlan(packs)) {
        for (const file of [...pack.files].sort()) {
            if (!/\.svg$/i.test(file)) continue;
            const value = (prefix ? prefixedPackValue(prefix, file) : null) ?? explicitPackValue(pack.folder, file);
            if (!value) continue;
            entries.push({ folder: pack.folder, file, value, label: file.replace(/\.svg$/i, '') });
        }
    }
    return entries;
}

/**
 * Find the pack file a parsed `pack` icon refers to. Explicit values match on slugs,
 * prefixed values match on the PascalCase name within the pack that owns the prefix.
 */
export function resolvePackFile(
    packs: readonly PackListing[],
    parsed: ParsedIcon
): { pack: PackListing; file: string } | null {
    if (parsed.kind !== 'pack' || !parsed.pack) return null;
    const explicit = parsed.raw.startsWith('pack:');
    for (const { pack, prefix } of packPrefixPlan(packs)) {
        if (explicit) {
            if (slugName(pack.folder) !== parsed.pack) continue;
            const file = pack.files.find(name => /\.svg$/i.test(name) && slugName(name) === parsed.ref);
            if (file) return { pack, file };
        } else {
            if (prefix !== parsed.pack) continue;
            const file = pack.files.find(name => /\.svg$/i.test(name) && pascalName(name) === parsed.ref);
            if (file) return { pack, file };
        }
    }
    return null;
}
