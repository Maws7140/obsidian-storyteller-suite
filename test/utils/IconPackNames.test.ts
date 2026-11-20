import { describe, it, expect } from 'vitest';
import { parseIconValue } from '../../src/utils/EntityIcon';
import {
    packPrefix,
    pascalName,
    prefixedPackValue,
    explicitPackValue,
    planPackIcons,
    resolvePackFile,
    slugName,
    type PackListing,
} from '../../src/utils/IconPackNames';

describe('packPrefix', () => {
    it('takes the first letter of each word for multi-word folders', () => {
        expect(packPrefix('lucide-icons')).toBe('Li');
        expect(packPrefix('game-icons')).toBe('Gi');
        expect(packPrefix('font-awesome-solid')).toBe('Fas');
        expect(packPrefix('game_icons')).toBe('Gi');
    });

    it('takes the first two letters of a single-word folder', () => {
        expect(packPrefix('lucide')).toBe('Lu');
        expect(packPrefix('Fontawesome')).toBe('Fo');
    });

    it('returns null when no 2 to 4 letter prefix can be made', () => {
        expect(packPrefix('x')).toBeNull();
        expect(packPrefix('123')).toBeNull();
        expect(packPrefix('one-two-three-four-five')).toBeNull();
    });
});

describe('pascalName', () => {
    it('turns a kebab file name into PascalCase without the extension', () => {
        expect(pascalName('dragon-head.svg')).toBe('DragonHead');
        expect(pascalName('sword.SVG')).toBe('Sword');
        expect(pascalName('dragon_head.svg')).toBe('DragonHead');
    });

    it('refuses names that cannot start a prefixed value safely', () => {
        expect(pascalName('3d-glasses.svg')).toBeNull();
        expect(pascalName('ab-cd.svg')).toBeNull();
        expect(pascalName('abc-icon.svg')).toBe('AbcIcon');
    });
});

describe('value building', () => {
    it('builds prefixed values that the parser reads back as pack icons', () => {
        const value = prefixedPackValue('Gi', 'dragon-head.svg');
        expect(value).toBe('GiDragonHead');
        expect(parseIconValue(value)).toMatchObject({ kind: 'pack', pack: 'Gi', ref: 'DragonHead' });
        expect(parseIconValue(prefixedPackValue('Fas', 'dragon.svg'))).toMatchObject({ kind: 'pack', pack: 'Fas', ref: 'Dragon' });
    });

    it('builds explicit values from slugs and rejects unusable parts', () => {
        expect(explicitPackValue('Game Icons', 'Dragon_Head.svg')).toBe('pack:game-icons/dragon-head');
        expect(parseIconValue(explicitPackValue('game-icons', 'dragon-head.svg'))).toMatchObject({
            kind: 'pack',
            pack: 'game-icons',
            ref: 'dragon-head',
        });
        expect(explicitPackValue('!!!', 'x.svg')).toBeNull();
    });

    it('slugs names for folders and files', () => {
        expect(slugName('Dragon Head!.svg')).toBe('dragon-head');
        expect(slugName('--a--')).toBe('a');
    });
});

describe('planPackIcons', () => {
    const packs: PackListing[] = [
        { folder: 'game-icons', path: '.obsidian/icons/game-icons', files: ['dragon-head.svg', 'sword.svg', 'readme.txt', '3d-glasses.svg'] },
        { folder: 'gentle-icons', path: '.obsidian/icons/gentle-icons', files: ['scroll.svg'] },
        { folder: 'lucide-icons', path: '.obsidian/icons/lucide-icons', files: ['castle.svg'] },
    ];

    it('gives prefixed values, with explicit values where the name or prefix cannot be used', () => {
        const plan = planPackIcons(packs);
        const byFile = new Map(plan.map(entry => [`${entry.folder}/${entry.file}`, entry.value]));
        expect(byFile.get('game-icons/dragon-head.svg')).toBe('GiDragonHead');
        expect(byFile.get('game-icons/sword.svg')).toBe('GiSword');
        expect(byFile.get('game-icons/3d-glasses.svg')).toBe('pack:game-icons/3d-glasses');
        expect(byFile.has('game-icons/readme.txt')).toBe(false);
    });

    it('gives the later pack the explicit form when its prefix is already taken', () => {
        const plan = planPackIcons(packs);
        const byFile = new Map(plan.map(entry => [`${entry.folder}/${entry.file}`, entry.value]));
        // gentle-icons derives Gi too, and game-icons sorts first, so it owns Gi.
        expect(byFile.get('gentle-icons/scroll.svg')).toBe('pack:gentle-icons/scroll');
        expect(byFile.get('lucide-icons/castle.svg')).toBe('LiCastle');
    });

    it('labels entries with the file name without extension', () => {
        const entry = planPackIcons(packs).find(item => item.file === 'dragon-head.svg');
        expect(entry?.label).toBe('dragon-head');
    });
});

describe('resolvePackFile', () => {
    const packs: PackListing[] = [
        { folder: 'game-icons', path: '.obsidian/icons/game-icons', files: ['dragon-head.svg', '3d-glasses.svg'] },
        { folder: 'gentle-icons', path: '.obsidian/icons/gentle-icons', files: ['scroll.svg'] },
    ];

    it('resolves prefixed values to the owning pack', () => {
        const parsed = parseIconValue('GiDragonHead');
        expect(parsed).not.toBeNull();
        expect(resolvePackFile(packs, parsed!)).toEqual({ pack: packs[0], file: 'dragon-head.svg' });
    });

    it('resolves explicit values by folder and file slug', () => {
        const parsed = parseIconValue('pack:gentle-icons/scroll');
        expect(resolvePackFile(packs, parsed!)).toEqual({ pack: packs[1], file: 'scroll.svg' });
        const glasses = parseIconValue('pack:game-icons/3d-glasses');
        expect(resolvePackFile(packs, glasses!)?.file).toBe('3d-glasses.svg');
    });

    it('returns null for unknown names and non-pack kinds', () => {
        expect(resolvePackFile(packs, parseIconValue('GiNothingHere')!)).toBeNull();
        expect(resolvePackFile(packs, parseIconValue('sword')!)).toBeNull();
    });

    it('round trips every planned value through the parser', () => {
        for (const entry of planPackIcons(packs)) {
            const parsed = parseIconValue(entry.value);
            expect(parsed, entry.value).not.toBeNull();
            expect(resolvePackFile(packs, parsed!)?.file, entry.value).toBe(entry.file);
        }
    });
});
