/**
 * IconRasterHost backed by Obsidian: Lucide via getIcon, Map Ink symbols, icon packs under
 * `<configDir>/icons/<folder>/`, vault files via the metadata cache and resource paths.
 */
import { getIcon, normalizePath, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { getSymbol } from '../leaflet/ink/symbols';
import type { IconRasterHost } from './IconRasterCache';

const PACK_INDEX_TTL_MS = 30000;
const PACK_MAX_DEPTH = 3;

/**
 * Iconize prefix for a pack folder: first letter of each word for a multi-word name
 * ('font-awesome-solid' gives 'Fas'), the first two letters for a single word ('game' gives 'Ga').
 */
export function iconPackPrefix(folderName: string): string {
    const words = folderName.split(/[-_\s]+/).filter(word => word.length > 0);
    if (words.length === 0) return '';
    if (words.length > 1) return words.map(word => word.charAt(0).toUpperCase()).join('');
    const word = words[0];
    return word.charAt(0).toUpperCase() + word.charAt(1).toLowerCase();
}

/** Comparison key for icon names: lower case, without '-' and '_'. */
export function normaliseIconName(name: string): string {
    return name.toLowerCase().replace(/[-_]/g, '');
}

interface PackIndex {
    at: number;
    files: Map<string, string>;
}

export class ObsidianIconRasterHost implements IconRasterHost {
    private readonly packIndexes = new Map<string, PackIndex>();

    constructor(private readonly app: App, private readonly onRedraw: () => void) {}

    lucideSvg(id: string): string | null {
        try {
            const el = getIcon(id);
            return el ? el.outerHTML : null;
        } catch {
            return null;
        }
    }

    inkSymbolBody(id: string): string | null {
        return getSymbol(id)?.body ?? null;
    }

    async packSvgPath(pack: string, ref: string): Promise<string | null> {
        const folder = await this.findPackFolder(pack);
        if (!folder) return null;
        const files = await this.indexPack(folder);
        return files.get(normaliseIconName(ref)) ?? null;
    }

    readText(path: string): Promise<string> {
        return this.app.vault.adapter.read(path);
    }

    resourceUrl(pathOrLink: string): string | null {
        const target = pathOrLink.trim().replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
        if (!target) return null;
        let file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(target, '');
        if (!file) {
            const byPath = this.app.vault.getAbstractFileByPath(normalizePath(target));
            if (byPath instanceof TFile) file = byPath;
        }
        if (!file) return null;
        return this.app.vault.getResourcePath(file);
    }

    createImage(): HTMLImageElement {
        return new Image();
    }

    createCanvas(w: number, h: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }

    onLoaded(): void {
        this.onRedraw();
    }

    private async packFolders(): Promise<{ name: string; path: string }[]> {
        try {
            const listed = await this.app.vault.adapter.list(`${this.app.vault.configDir}/icons`);
            return listed.folders.map(path => ({ name: path.split('/').pop() ?? path, path }));
        } catch {
            return [];
        }
    }

    /** Exact folder name first (explicit `pack:` form), then the Iconize prefix. */
    private async findPackFolder(pack: string): Promise<string | null> {
        const wanted = pack.trim().toLowerCase();
        if (!wanted) return null;
        const folders = await this.packFolders();
        const exact = folders.find(folder => folder.name.toLowerCase() === wanted);
        if (exact) return exact.path;
        const byPrefix = folders.find(folder => iconPackPrefix(folder.name).toLowerCase() === wanted);
        return byPrefix ? byPrefix.path : null;
    }

    private async indexPack(folderPath: string): Promise<Map<string, string>> {
        const cached = this.packIndexes.get(folderPath);
        if (cached && Date.now() - cached.at < PACK_INDEX_TTL_MS) return cached.files;
        const files = new Map<string, string>();
        const walk = async (dir: string, depth: number): Promise<void> => {
            const listed = await this.app.vault.adapter.list(dir);
            for (const file of listed.files) {
                if (!/\.svg$/i.test(file)) continue;
                const base = (file.split('/').pop() ?? file).replace(/\.svg$/i, '');
                const key = normaliseIconName(base);
                if (!files.has(key)) files.set(key, file);
            }
            if (depth > 0) {
                for (const sub of listed.folders) await walk(sub, depth - 1);
            }
        };
        try {
            await walk(folderPath, PACK_MAX_DEPTH);
        } catch {
            // Unreadable pack folder: treat as empty.
        }
        this.packIndexes.set(folderPath, { at: Date.now(), files });
        return files;
    }
}
