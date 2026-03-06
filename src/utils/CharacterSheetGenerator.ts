import { App, normalizePath, TFile } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { BUILT_IN_SHEET_TEMPLATES, CustomSheetTemplate } from './CharacterSheetTemplates';

export interface SheetData {
    character: Character;
    events: { dateTime?: string; name: string; status?: string }[];
    locations: { name: string; description?: string }[];
    items: { name: string; currentOwner?: string; pastOwners?: string[]; isPlotCritical?: boolean }[];
    groups: { name: string; description?: string }[];
    portraitDataUrl?: string;
}

export class CharacterSheetGenerator {
    constructor(private app: App, private plugin: StorytellerSuitePlugin) {}

    private esc(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async collectData(character: Character): Promise<SheetData> {
        const allEvents    = await this.plugin.listEvents();
        const allLocations = await this.plugin.listLocations();
        const allItems     = await this.plugin.listPlotItems();
        const allGroups    = this.plugin.getGroups();

        const events = allEvents.filter(e =>
            e.characters?.some(c => c.toLowerCase() === character.name.toLowerCase())
        );
        const locations = allLocations.filter(l =>
            (character.locations || []).some(loc => loc.toLowerCase() === l.name.toLowerCase())
        );
        const items = allItems.filter(i =>
            i.currentOwner?.toLowerCase() === character.name.toLowerCase() ||
            i.pastOwners?.some(o => o.toLowerCase() === character.name.toLowerCase())
        );
        const groups = allGroups.filter(g =>
            (character.groups || []).includes(g.id)
        );

        let portraitDataUrl: string | undefined;
        if (character.profileImagePath) {
            const imgFile = this.app.vault.getAbstractFileByPath(normalizePath(character.profileImagePath));
            if (imgFile instanceof TFile) {
                try {
                    const buf = await this.app.vault.readBinary(imgFile);
                    const arr = new Uint8Array(buf);
                    let binary = '';
                    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
                    const b64  = btoa(binary);
                    const ext  = imgFile.extension.toLowerCase();
                    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                               : ext === 'png'  ? 'image/png'
                               : ext === 'webp' ? 'image/webp'
                               : 'image/png';
                    portraitDataUrl = `data:${mime};base64,${b64}`;
                } catch { /* unreadable image */ }
            }
        }

        return { character, events, locations, items, groups, portraitDataUrl };
    }

    // ── Template dispatch ─────────────────────────────────────────────────────

    buildInnerHTML(data: SheetData, templateId = 'classic'): string {
        const esc = (s: string) => this.esc(s);
        const nl  = (s: string) => esc(s).replace(/\n/g, '<br>');

        const builtIn = BUILT_IN_SHEET_TEMPLATES.find(t => t.id === templateId);
        if (builtIn) return builtIn.buildInnerHTML(data, esc, nl);

        const custom = (this.plugin.settings.characterSheetTemplates ?? []).find(t => t.id === templateId);
        if (custom) return this.applyCustomTemplate(custom, data);

        // Fallback to classic
        return BUILT_IN_SHEET_TEMPLATES[0].buildInnerHTML(data, esc, nl);
    }

    /** Returns the scoped CSS to inject inline for note/preview (empty for 'classic'). */
    getTemplateScopedCSS(templateId = 'classic'): string {
        const builtIn = BUILT_IN_SHEET_TEMPLATES.find(t => t.id === templateId);
        if (builtIn) return builtIn.getScopedCSS();
        // Custom templates embed their own styles; no separate scoped CSS needed.
        return '';
    }

    generateExportHTML(data: SheetData, templateId = 'classic'): string {
        const builtIn = BUILT_IN_SHEET_TEMPLATES.find(t => t.id === templateId);

        if (builtIn) {
            const inner = builtIn.buildInnerHTML(data, s => this.esc(s), s => this.esc(s).replace(/\n/g, '<br>'));
            return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this.esc(data.character.name)} — Character Sheet</title>
<style>${builtIn.getExportCSS()}</style>
</head>
<body>
${inner}
</body>
</html>`;
        }

        const custom = (this.plugin.settings.characterSheetTemplates ?? []).find(t => t.id === templateId);
        if (custom) {
            const html = this.applyCustomTemplate(custom, data);
            const trimmed = html.trimStart();
            if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return html;
            return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>${this.esc(data.character.name)} — Character Sheet</title></head>\n<body>\n${html}\n</body>\n</html>`;
        }

        // Fallback to classic
        return this.generateExportHTML(data, 'classic');
    }

    // ── Custom template token replacement ─────────────────────────────────────

    private applyCustomTemplate(tpl: CustomSheetTemplate, data: SheetData): string {
        const { character, events, locations, items, groups, portraitDataUrl } = data;
        const c   = character as any;
        const esc = (s: string) => this.esc(s);
        const nl  = (s: string) => esc(s).replace(/\n/g, '<br>');

        const portraitImg = portraitDataUrl
            ? `<img src="${portraitDataUrl}" alt="${esc(character.name)}" style="max-width:200px;border-radius:4px;">`
            : '';

        const traitsStr = (character.traits || []).map(t => esc(t)).join(', ');

        // Relationships HTML
        const rels = character.relationships || [];
        const conns = character.connections   || [];
        let relsHtml = '';
        if (rels.length > 0 || conns.length > 0) {
            const li: string[] = [];
            rels.forEach(rel => {
                if (typeof rel === 'string') {
                    li.push(`<li>${esc(rel)}</li>`);
                } else {
                    const r = rel as any;
                    const target = r.target || r.name || '';
                    li.push(`<li><strong>${esc(r.type || 'Related')}</strong>: ${esc(target)}${r.label ? ` — ${esc(r.label)}` : ''}</li>`);
                }
            });
            conns.forEach(conn => {
                li.push(`<li><strong>${esc(conn.type)}</strong>: ${esc(conn.target)}${conn.label ? ` — ${esc(conn.label)}` : ''}</li>`);
            });
            relsHtml = `<ul>${li.join('')}</ul>`;
        }

        const groupsHtml = groups.length > 0
            ? `<ul>${groups.map(g => `<li><strong>${esc(g.name)}</strong>${g.description ? `: ${esc(g.description)}` : ''}</li>`).join('')}</ul>`
            : '';

        const locsHtml = locations.length > 0
            ? `<ul>${locations.map(l => {
                const snip = l.description ? ` — ${l.description.slice(0, 80)}` : '';
                return `<li><strong>${esc(l.name)}</strong>${esc(snip)}</li>`;
              }).join('')}</ul>`
            : '';

        const itemsHtml = items.length > 0
            ? `<ul>${items.map(item => {
                const own  = item.currentOwner?.toLowerCase() === character.name.toLowerCase() ? '(current)' : '(former)';
                const crit = item.isPlotCritical ? ' — <em>Plot Critical</em>' : '';
                return `<li><strong>${esc(item.name)}</strong> ${own}${crit}</li>`;
              }).join('')}</ul>`
            : '';

        let eventsHtml = '';
        if (events.length > 0) {
            const dated   = events.filter(ev => ev.dateTime).sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
            const undated = events.filter(ev => !ev.dateTime);
            eventsHtml = `<ul>${[...dated, ...undated].map(ev =>
                `<li>${ev.dateTime ? `<strong>${esc(ev.dateTime)}</strong> — ` : ''}${esc(ev.name)}${ev.status ? ` (${esc(ev.status)})` : ''}</li>`
            ).join('')}</ul>`;
        }

        let customFieldsHtml = '';
        if (character.customFields && Object.keys(character.customFields).length > 0) {
            customFieldsHtml = `<table><tbody>${
                Object.entries(character.customFields).map(([k, v]) =>
                    `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`
                ).join('')
            }</tbody></table>`;
        }

        const tokens: Record<string, string> = {
            '{{name}}':              esc(character.name),
            '{{portrait_img}}':      portraitImg,
            '{{status}}':            esc(character.status || ''),
            '{{affiliation}}':       esc(character.affiliation || ''),
            '{{age}}':               esc(c.age ? String(c.age) : ''),
            '{{occupation}}':        esc(c.occupation || ''),
            '{{born}}':              esc(String(c.birthDate || c.birthday || '')),
            '{{traits}}':            traitsStr,
            '{{description}}':       character.description ? nl(character.description) : '',
            '{{backstory}}':         character.backstory   ? nl(character.backstory)   : '',
            '{{relationships_html}}': relsHtml,
            '{{groups_html}}':       groupsHtml,
            '{{locations_html}}':    locsHtml,
            '{{items_html}}':        itemsHtml,
            '{{events_html}}':       eventsHtml,
            '{{custom_fields_html}}': customFieldsHtml,
            '{{date_generated}}':    new Date().toLocaleDateString(),
        };

        let result = tpl.html;
        for (const [token, value] of Object.entries(tokens)) {
            result = result.split(token).join(value);
        }
        return result;
    }

    // ── Save methods ──────────────────────────────────────────────────────────

    async saveSheetToNote(character: Character, templateId = 'classic'): Promise<string> {
        const data = await this.collectData(character);
        // Never embed base64 data URIs in .md files — large images produce megabytes of
        // inline text that causes Obsidian to crash. Use a wikilink for the portrait instead.
        const portraitPath = character.profileImagePath;
        data.portraitDataUrl = undefined;

        const inner = this.buildInnerHTML(data, templateId);

        const story      = this.plugin.getActiveStory();
        const baseFolder = story ? this.plugin.getEntityFolder('character') : 'StorytellerSuite/Characters';
        const folderPath = `${baseFolder}/Sheets`;

        try { await this.app.vault.createFolder(normalizePath(folderPath)); } catch { /* exists */ }

        const safeName = character.name.replace(/[:"*?<>|/\\]+/g, '');
        const filePath = normalizePath(`${folderPath}/${safeName} — Character Sheet.md`);

        const content = portraitPath ? `![[${portraitPath}|200]]\n\n${inner}` : inner;

        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
        return filePath;
    }

    async saveSheetHTML(character: Character, templateId = 'classic'): Promise<string> {
        const data = await this.collectData(character);
        const html = this.generateExportHTML(data, templateId);

        const story      = this.plugin.getActiveStory();
        const baseFolder = story ? this.plugin.getEntityFolder('character') : 'StorytellerSuite/Characters';
        const folderPath = `${baseFolder}/Sheets`;

        try { await this.app.vault.createFolder(normalizePath(folderPath)); } catch { /* exists */ }

        const safeName = character.name.replace(/[:"*?<>|/\\]+/g, '');
        const filePath = normalizePath(`${folderPath}/${safeName} — Character Sheet.html`);

        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, html);
        } else {
            await this.app.vault.create(filePath, html);
        }
        return filePath;
    }

    // ── Legacy markdown generation (kept for backward compat) ─────────────────

    async generate(character: Character): Promise<string> {
        const allEvents    = await this.plugin.listEvents();
        const allLocations = await this.plugin.listLocations();
        const allItems     = await this.plugin.listPlotItems();
        const allGroups    = this.plugin.getGroups();

        const charEvents    = allEvents.filter(e => e.characters?.some(c => c.toLowerCase() === character.name.toLowerCase()));
        const charLocations = allLocations.filter(l => (character.locations || []).some(loc => loc.toLowerCase() === l.name.toLowerCase()));
        const charItems     = allItems.filter(i => i.currentOwner?.toLowerCase() === character.name.toLowerCase() || i.pastOwners?.some(o => o.toLowerCase() === character.name.toLowerCase()));
        const charGroups    = allGroups.filter(g => (character.groups || []).includes(g.id));

        const lines: string[] = [];

        lines.push(`# ${character.name}`);
        if (character.profileImagePath) lines.push(`![[${character.profileImagePath}|200]]`);
        lines.push('');

        lines.push('## At a Glance');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|-------|-------|');
        const c = character as any;
        if (character.status)      lines.push(`| **Status** | ${character.status} |`);
        if (character.affiliation) lines.push(`| **Affiliation** | ${character.affiliation} |`);
        if (c.age)                 lines.push(`| **Age** | ${c.age} |`);
        if (c.occupation)          lines.push(`| **Occupation** | ${c.occupation} |`);
        const born = c.birthDate || c.birthday;
        if (born)                  lines.push(`| **Born** | ${born} |`);
        lines.push('');

        if (character.traits?.length) {
            lines.push('## Traits');
            lines.push('');
            character.traits.forEach(trait => lines.push(`- ${trait}`));
            lines.push('');
        }
        if (character.description) {
            lines.push('## Description');
            lines.push('');
            lines.push(character.description);
            lines.push('');
        }
        if (character.backstory) {
            lines.push('## Backstory');
            lines.push('');
            lines.push(character.backstory);
            lines.push('');
        }

        const relationships = character.relationships || [];
        const connections   = character.connections   || [];
        if (relationships.length > 0 || connections.length > 0) {
            lines.push('## Relationships');
            lines.push('');
            relationships.forEach(rel => {
                if (typeof rel === 'string') {
                    lines.push(`- [[${rel}]]`);
                } else {
                    const r = rel as any;
                    const target = r.target || r.name || String(rel);
                    lines.push(`- **${r.type || 'Related'}**: [[${target}]]${r.label ? ` — ${r.label}` : ''}`);
                }
            });
            connections.forEach(conn => {
                lines.push(`- **${conn.type}**: [[${conn.target}]]${conn.label ? ` — ${conn.label}` : ''}`);
            });
            lines.push('');
        }

        if (charGroups.length > 0) {
            lines.push('## Groups & Factions');
            lines.push('');
            charGroups.forEach(g => lines.push(`- **${g.name}**${g.description ? `: ${g.description}` : ''}`));
            lines.push('');
        }
        if (charLocations.length > 0) {
            lines.push('## Known Locations');
            lines.push('');
            charLocations.forEach(loc => {
                const snippet = loc.description ? ` — ${loc.description.slice(0, 80)}${loc.description.length > 80 ? '…' : ''}` : '';
                lines.push(`- [[${loc.name}]]${snippet}`);
            });
            lines.push('');
        }
        if (charItems.length > 0) {
            lines.push('## Items');
            lines.push('');
            charItems.forEach(item => {
                const ownership = item.currentOwner?.toLowerCase() === character.name.toLowerCase() ? '(current)' : '(former)';
                const critical  = item.isPlotCritical ? ' — *Plot Critical*' : '';
                lines.push(`- [[${item.name}]] ${ownership}${critical}`);
            });
            lines.push('');
        }
        if (charEvents.length > 0) {
            lines.push('## Timeline');
            lines.push('');
            const dated   = charEvents.filter(e => e.dateTime).sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
            const undated = charEvents.filter(e => !e.dateTime);
            dated.forEach(e => lines.push(`- **${e.dateTime}** — [[${e.name}]]${e.status ? ` *(${e.status})*` : ''}`));
            undated.forEach(e => lines.push(`- [[${e.name}]]${e.status ? ` *(${e.status})*` : ''}`));
            lines.push('');
        }
        if (character.customFields && Object.keys(character.customFields).length > 0) {
            lines.push('## Additional Details');
            lines.push('');
            lines.push('| Field | Value |');
            lines.push('|-------|-------|');
            for (const [key, value] of Object.entries(character.customFields)) {
                lines.push(`| ${key} | ${value} |`);
            }
            lines.push('');
        }

        lines.push('---');
        lines.push(`*Generated by Storyteller Suite — ${new Date().toLocaleDateString()}*`);
        return lines.join('\n');
    }

    async saveSheet(character: Character): Promise<string> {
        const content    = await this.generate(character);
        const story      = this.plugin.getActiveStory();
        const baseFolder = story ? this.plugin.getEntityFolder('character') : 'StorytellerSuite/Characters';
        const folderPath = `${baseFolder}/Sheets`;

        try { await this.app.vault.createFolder(normalizePath(folderPath)); } catch { /* exists */ }

        const safeName = character.name.replace(/[:"*?<>|/\\]+/g, '');
        const filePath = normalizePath(`${folderPath}/${safeName} — Character Sheet.md`);

        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
        return filePath;
    }
}
