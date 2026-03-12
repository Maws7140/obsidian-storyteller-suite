import { SheetData } from './CharacterSheetGenerator';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BuiltInSheetTemplate {
    id: string;
    name: string;
    description: string;
    /** Full self-contained CSS for standalone HTML export (includes body/reset). */
    getExportCSS(): string;
    /**
     * CSS scoped to this template's root class, injected inline for note/preview.
     * Return an empty string for 'classic' — styles.css already handles it.
     */
    getScopedCSS(): string;
    /** Inner HTML <div> only, no <style> tag. */
    buildInnerHTML(data: SheetData, esc: (s: string) => string, nl: (s: string) => string): string;
    /** Optional note-native content for markdown/callout presets. */
    buildNoteContent?(data: SheetData, portraitPath?: string): string;
}

export interface CustomSheetTemplate {
    id: string;
    name: string;
    description: string;
    /** Full HTML with {{token}} placeholders. May be a fragment or full document. */
    html: string;
}

/** All available token names for custom templates. */
export const CUSTOM_TEMPLATE_TOKENS: readonly string[] = [
    '{{name}}', '{{portrait_img}}',
    '{{status}}', '{{affiliation}}', '{{age}}', '{{occupation}}', '{{born}}',
    '{{traits}}',
    '{{description}}', '{{backstory}}',
    '{{relationships_html}}', '{{groups_html}}', '{{locations_html}}',
    '{{items_html}}', '{{events_html}}', '{{custom_fields_html}}',
    '{{date_generated}}',
];

const ABILITY_SCORE_LABELS: Array<[string, keyof SheetData['character']]> = [
    ['STR', 'dndStr'],
    ['DEX', 'dndDex'],
    ['CON', 'dndCon'],
    ['INT', 'dndInt'],
    ['WIS', 'dndWis'],
    ['CHA', 'dndCha'],
];

function mdEscape(value: string): string {
    return value
        .replace(/\|/g, '\\|')
        .replace(/\n/g, '<br>');
}

function noteLink(name: string): string {
    return `[[${name}]]`;
}

function buildMarkdownTable(rows: Array<[string, string]>, headers: [string, string] = ['Field', 'Value']): string[] {
    if (rows.length === 0) return [];
    return [
        `| ${headers[0]} | ${headers[1]} |`,
        `| ${'-'.repeat(headers[0].length)} | ${'-'.repeat(headers[1].length)} |`,
        ...rows.map(([label, value]) => `| ${mdEscape(label)} | ${mdEscape(value)} |`),
    ];
}

function buildCalloutMarkdown(type: string, title: string, lines: string[]): string {
    if (lines.length === 0) return '';
    return [`> [!${type}] ${title}`, ...lines.map(line => line ? `> ${line}` : '>')].join('\n');
}

function getIdentityRows(data: SheetData): Array<[string, string]> {
    const { character } = data;
    const c = character as any;
    const rows: Array<[string, string]> = [];
    if (character.status) rows.push(['Status', character.status]);
    if (character.affiliation) rows.push(['Affiliation', character.affiliation]);
    if (c.age) rows.push(['Age', String(c.age)]);
    if (c.occupation) rows.push(['Occupation', String(c.occupation)]);
    const born = c.birthDate || c.birthday;
    if (born) rows.push(['Born', String(born)]);
    if (c.race || c.dndRace) rows.push(['Race', String(c.dndRace || c.race)]);
    return rows;
}

function getDndDetailRows(data: SheetData): Array<[string, string]> {
    const c = data.character as any;
    const rows: Array<[string, string]> = [];
    if (c.dndLevel != null) rows.push(['Level', String(c.dndLevel)]);
    if (c.dndClass) rows.push(['Class', String(c.dndClass)]);
    if (c.dndSubclass) rows.push(['Subclass', String(c.dndSubclass)]);
    if (c.dndRace) rows.push(['Ancestry', String(c.dndRace)]);
    if (c.dndCurrentHp != null || c.dndMaxHp != null) {
        const hp = `${c.dndCurrentHp ?? c.dndMaxHp ?? 0}/${c.dndMaxHp ?? c.dndCurrentHp ?? 0}`;
        rows.push(['HP', hp]);
    }
    if (c.dndTempHp != null) rows.push(['Temp HP', String(c.dndTempHp)]);
    if (c.dndAc != null) rows.push(['Armor Class', String(c.dndAc)]);
    if (c.dndSpeed != null) rows.push(['Speed', `${c.dndSpeed} ft`]);
    if (c.dndProficiencyBonus != null) rows.push(['Proficiency', `${c.dndProficiencyBonus >= 0 ? '+' : ''}${c.dndProficiencyBonus}`]);
    if (c.dndHitDice) rows.push(['Hit Dice', String(c.dndHitDice)]);
    if (Array.isArray(c.dndConditions) && c.dndConditions.length > 0) rows.push(['Conditions', c.dndConditions.join(', ')]);
    return rows;
}

function getAbilityRows(data: SheetData): Array<[string, string]> {
    const c = data.character as any;
    return ABILITY_SCORE_LABELS
        .map(([label, key]) => [label, c[key] != null ? String(c[key]) : '—'] as [string, string]);
}

function buildBulletLines(items: string[]): string[] {
    return items.length > 0 ? items.map(item => `- ${item}`) : ['- None'];
}

function buildRelationshipLines(data: SheetData): string[] {
    const { character } = data;
    const relationships = character.relationships || [];
    const connections = character.connections || [];
    const lines: string[] = [];
    relationships.forEach(rel => {
        if (typeof rel === 'string') {
            lines.push(noteLink(rel));
            return;
        }
        const entry = rel as any;
        const target = entry.target || entry.name || String(rel);
        lines.push(`**${entry.type || 'Related'}**: ${noteLink(target)}${entry.label ? ` — ${entry.label}` : ''}`);
    });
    connections.forEach(conn => {
        lines.push(`**${conn.type}**: ${noteLink(conn.target)}${conn.label ? ` — ${conn.label}` : ''}`);
    });
    return lines.length > 0 ? lines.map(line => `- ${line}`) : ['- None recorded'];
}

function buildItemLines(data: SheetData): string[] {
    const { character, items } = data;
    const lines = items.map(item => {
        const ownership = item.currentOwner?.toLowerCase() === character.name.toLowerCase() ? 'current' : 'former';
        return `${noteLink(item.name)} (${ownership})${item.isPlotCritical ? ' — Plot Critical' : ''}`;
    });
    return buildBulletLines(lines);
}

function buildEventLines(data: SheetData): string[] {
    const dated = data.events.filter(ev => ev.dateTime).sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
    const undated = data.events.filter(ev => !ev.dateTime);
    const lines = [...dated, ...undated].map(ev => {
        const prefix = ev.dateTime ? `**${ev.dateTime}** — ` : '';
        const suffix = ev.status ? ` (${ev.status})` : '';
        return `${prefix}${noteLink(ev.name)}${suffix}`;
    });
    return buildBulletLines(lines);
}

function buildLocationLines(data: SheetData): string[] {
    const lines = data.locations.map(location => {
        const snippet = location.description ? ` — ${location.description.slice(0, 80)}${location.description.length > 80 ? '…' : ''}` : '';
        return `${noteLink(location.name)}${snippet}`;
    });
    return buildBulletLines(lines);
}

function buildGroupLines(data: SheetData): string[] {
    const lines = data.groups.map(group => `${noteLink(group.name)}${group.description ? ` — ${group.description}` : ''}`);
    return buildBulletLines(lines);
}

function buildTraitLines(data: SheetData): string[] {
    return buildBulletLines((data.character.traits || []).slice());
}

function buildCustomFieldLines(data: SheetData): string[] {
    const fields = data.character.customFields || {};
    const rows = Object.entries(fields).map(([key, value]) => `- **${key}**: ${value}`);
    return rows.length > 0 ? rows : ['- None'];
}

function buildObsidianCalloutPreview(title: string, type: string, bodyHtml: string): string {
    return `<div class="callout" data-callout="${type}"><div class="callout-title"><div class="callout-title-inner">${title}</div></div><div class="callout-content">${bodyHtml}</div></div>`;
}

function buildCalloutSheetMarkdown(data: SheetData, portraitPath?: string): string {
    const { character } = data;
    const lines: string[] = [];
    lines.push(`# ${character.name}`);
    if (portraitPath) lines.push(`![[${portraitPath}|260]]`);
    lines.push('');

    const identity = buildMarkdownTable([
        ...getIdentityRows(data),
        ...getDndDetailRows(data),
    ]);
    if (identity.length > 0) {
        lines.push(buildCalloutMarkdown('summary', 'Snapshot', identity));
        lines.push('');
    }

    const abilities = buildMarkdownTable(getAbilityRows(data), ['Ability', 'Score']);
    if (abilities.length > 0) {
        lines.push(buildCalloutMarkdown('tip', 'Ability Scores', abilities));
        lines.push('');
    }

    if (character.description || character.backstory) {
        const backgroundLines: string[] = [];
        if (character.description) {
            backgroundLines.push('**Description**');
            backgroundLines.push(...character.description.split('\n'));
        }
        if (character.backstory) {
            if (backgroundLines.length > 0) backgroundLines.push('');
            backgroundLines.push('**Backstory**');
            backgroundLines.push(...character.backstory.split('\n'));
        }
        lines.push(buildCalloutMarkdown('abstract', 'Background', backgroundLines));
        lines.push('');
    }

    lines.push(buildCalloutMarkdown('info', 'Traits & Factions', [
        '**Traits**',
        ...buildTraitLines(data),
        '',
        '**Groups**',
        ...buildGroupLines(data),
    ]));
    lines.push('');

    lines.push(buildCalloutMarkdown('example', 'Relations & Places', [
        '**Relationships**',
        ...buildRelationshipLines(data),
        '',
        '**Locations**',
        ...buildLocationLines(data),
    ]));
    lines.push('');

    lines.push(buildCalloutMarkdown('note', 'Inventory & Timeline', [
        '**Items**',
        ...buildItemLines(data),
        '',
        '**Timeline**',
        ...buildEventLines(data),
    ]));
    lines.push('');

    if (data.character.customFields && Object.keys(data.character.customFields).length > 0) {
        lines.push(buildCalloutMarkdown('quote', 'Additional Details', buildCustomFieldLines(data)));
        lines.push('');
    }

    lines.push(`*Generated by Storyteller Suite - ${new Date().toLocaleDateString()}*`);
    return lines.join('\n');
}

function buildFieldJournalMarkdown(data: SheetData, portraitPath?: string): string {
    const { character } = data;
    const lines: string[] = [];
    lines.push(`# ${character.name}`);
    if (portraitPath) lines.push(`![[${portraitPath}|220]]`);
    lines.push('');

    const atAGlance = buildMarkdownTable([
        ...getIdentityRows(data),
        ...getDndDetailRows(data),
    ]);
    if (atAGlance.length > 0) {
        lines.push('## At a Glance');
        lines.push('');
        lines.push(...atAGlance);
        lines.push('');
    }

    const abilities = buildMarkdownTable(getAbilityRows(data), ['Ability', 'Score']);
    if (abilities.length > 0) {
        lines.push('## Ability Scores');
        lines.push('');
        lines.push(...abilities);
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

    const sections: Array<[string, string[]]> = [
        ['Traits', buildTraitLines(data)],
        ['Relationships', buildRelationshipLines(data)],
        ['Groups & Factions', buildGroupLines(data)],
        ['Known Locations', buildLocationLines(data)],
        ['Items', buildItemLines(data)],
        ['Timeline', buildEventLines(data)],
    ];
    sections.forEach(([title, entries]) => {
        lines.push(`## ${title}`);
        lines.push('');
        lines.push(...entries);
        lines.push('');
    });

    if (data.character.customFields && Object.keys(data.character.customFields).length > 0) {
        lines.push('## Additional Details');
        lines.push('');
        lines.push(...buildCustomFieldLines(data));
        lines.push('');
    }

    lines.push('---');
    lines.push(`*Generated by Storyteller Suite - ${new Date().toLocaleDateString()}*`);
    return lines.join('\n');
}

// ─── Shared inner HTML builder ────────────────────────────────────────────────

function sharedBuildHTML(
    data: SheetData,
    esc: (s: string) => string,
    nl:  (s: string) => string,
    rootCls: string
): string {
    const { character, events, locations, items, groups, portraitDataUrl } = data;
    const c = character as any;

    const statItems: string[] = [];
    if (character.status)      statItems.push(`<span class="cs-stat"><span class="cs-sl">Status</span><span class="cs-sv">${esc(character.status)}</span></span>`);
    if (character.affiliation) statItems.push(`<span class="cs-stat"><span class="cs-sl">Affiliation</span><span class="cs-sv">${esc(character.affiliation)}</span></span>`);
    if (c.age)                 statItems.push(`<span class="cs-stat"><span class="cs-sl">Age</span><span class="cs-sv">${esc(String(c.age))}</span></span>`);
    if (c.occupation)          statItems.push(`<span class="cs-stat"><span class="cs-sl">Occupation</span><span class="cs-sv">${esc(c.occupation)}</span></span>`);
    const born = c.birthDate || c.birthday;
    if (born)                  statItems.push(`<span class="cs-stat"><span class="cs-sl">Born</span><span class="cs-sv">${esc(String(born))}</span></span>`);

    const traitsHTML   = (character.traits || []).map(t => `<span class="cs-trait">${esc(t)}</span>`).join('');
    const portraitHTML = portraitDataUrl
        ? `<div class="cs-portrait"><img src="${portraitDataUrl}" alt="${esc(character.name)}"></div>`
        : '';

    // Relationships
    const relationships = character.relationships || [];
    const connections   = character.connections   || [];
    let relHTML = '';
    if (relationships.length > 0 || connections.length > 0) {
        const rels: string[] = [];
        relationships.forEach(rel => {
            if (typeof rel === 'string') {
                rels.push(`<div class="cs-rel-item"><span class="cs-rel-type">Related</span><span class="cs-rel-name">${esc(rel)}</span></div>`);
            } else {
                const r = rel as any;
                const target = r.target || r.name || String(rel);
                const label  = r.label ? ` — ${esc(r.label)}` : '';
                rels.push(`<div class="cs-rel-item"><span class="cs-rel-type">${esc(r.type || 'Related')}</span><span class="cs-rel-name">${esc(target)}${label}</span></div>`);
            }
        });
        connections.forEach(conn => {
            const label = conn.label ? ` — ${esc(conn.label)}` : '';
            rels.push(`<div class="cs-rel-item"><span class="cs-rel-type">${esc(conn.type)}</span><span class="cs-rel-name">${esc(conn.target)}${label}</span></div>`);
        });
        relHTML = `<div class="cs-section cs-full"><h2 class="cs-sh">Relationships</h2><div class="cs-rels">${rels.join('')}</div></div>`;
    }

    const descHTML      = character.description ? `<div class="cs-section"><h2 class="cs-sh">Description</h2><p class="cs-body-text">${nl(character.description)}</p></div>` : '';
    const backstoryHTML = character.backstory   ? `<div class="cs-section"><h2 class="cs-sh">Backstory</h2><p class="cs-body-text">${nl(character.backstory)}</p></div>`   : '';

    const groupsHTML = groups.length > 0
        ? `<div class="cs-section"><h2 class="cs-sh">Groups &amp; Factions</h2><div class="cs-list">${
            groups.map(g => `<div class="cs-list-item"><strong>${esc(g.name)}</strong>${g.description ? `<span class="cs-list-meta"> — ${esc(g.description)}</span>` : ''}</div>`).join('')
          }</div></div>` : '';

    const locsHTML = locations.length > 0
        ? `<div class="cs-section"><h2 class="cs-sh">Known Locations</h2><div class="cs-list">${
            locations.map(l => {
                const snip = l.description ? ` — ${l.description.slice(0, 80)}${l.description.length > 80 ? '…' : ''}` : '';
                return `<div class="cs-list-item"><strong>${esc(l.name)}</strong><span class="cs-list-meta">${esc(snip)}</span></div>`;
            }).join('')
          }</div></div>` : '';

    const itemsHTML = items.length > 0
        ? `<div class="cs-section"><h2 class="cs-sh">Items</h2><div class="cs-list">${
            items.map(item => {
                const own  = item.currentOwner?.toLowerCase() === character.name.toLowerCase() ? '(current)' : '(former)';
                const crit = item.isPlotCritical ? ' <span class="cs-badge-critical">Plot Critical</span>' : '';
                return `<div class="cs-list-item"><strong>${esc(item.name)}</strong> <span class="cs-list-meta">${own}</span>${crit}</div>`;
            }).join('')
          }</div></div>` : '';

    let timelineHTML = '';
    if (events.length > 0) {
        const dated   = events.filter(ev => ev.dateTime).sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
        const undated = events.filter(ev => !ev.dateTime);
        const evItems = [...dated, ...undated].map(ev => {
            const st   = ev.status ? `<span class="cs-ev-status">${esc(ev.status)}</span>` : '';
            const date = ev.dateTime ? `<span class="cs-ev-date">${esc(ev.dateTime)}</span>` : `<span class="cs-ev-date cs-ev-undated">undated</span>`;
            return `<div class="cs-timeline-item">${date}<span class="cs-ev-name">${esc(ev.name)}</span>${st}</div>`;
        }).join('');
        timelineHTML = `<div class="cs-section cs-full"><h2 class="cs-sh">Timeline</h2><div class="cs-timeline">${evItems}</div></div>`;
    }

    let customHTML = '';
    if (character.customFields && Object.keys(character.customFields).length > 0) {
        const rows = Object.entries(character.customFields).map(([k, v]) =>
            `<tr><td class="cs-td-key">${esc(k)}</td><td class="cs-td-val">${esc(v)}</td></tr>`
        ).join('');
        customHTML = `<div class="cs-section cs-full"><h2 class="cs-sh">Additional Details</h2><table class="cs-table"><tbody>${rows}</tbody></table></div>`;
    }

    return `<div class="${rootCls}">
  <div class="cs-header">
    ${portraitHTML}
    <div class="cs-hero">
      <h1 class="cs-name">${esc(character.name)}</h1>
      ${statItems.length > 0 ? `<div class="cs-stats">${statItems.join('')}</div>` : ''}
      ${traitsHTML ? `<div class="cs-traits">${traitsHTML}</div>` : ''}
    </div>
  </div>
  <div class="cs-grid">
    ${descHTML}${backstoryHTML}${relHTML}${groupsHTML}${locsHTML}${itemsHTML}${timelineHTML}${customHTML}
  </div>
  <div class="cs-footer">Generated by Storyteller Suite - ${new Date().toLocaleDateString()}</div>
</div>`;
}

// ─── Template 1: Classic ──────────────────────────────────────────────────────

const classicTemplate: BuiltInSheetTemplate = {
    id: 'classic',
    name: 'Classic',
    description: 'Dark atmospheric glass aesthetic with purple accents.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0f0;padding:32px 16px}
.sts-cs-root{max-width:860px;margin:0 auto;background:#141428;border-radius:16px;padding:36px;box-shadow:0 8px 48px rgba(0,0,0,.65)}
.cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:28px}
.cs-portrait{width:120px;height:150px;flex-shrink:0;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,.1)}.cs-portrait img{width:100%;height:100%;object-fit:cover}
.cs-hero{flex:1}.cs-name{font-size:2.1rem;font-weight:700;color:#fff;letter-spacing:-.02em;margin-bottom:14px;line-height:1.1}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.cs-stat{display:flex;flex-direction:column;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 12px;min-width:80px}
.cs-sl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#70708a;margin-bottom:2px}.cs-sv{font-size:13px;font-weight:600;color:#e0e0f0}
.cs-traits{display:flex;flex-wrap:wrap;gap:6px}.cs-trait{padding:3px 10px;background:rgba(110,70,190,.2);border:1px solid rgba(110,70,190,.35);border-radius:20px;font-size:11px;color:#b090f0}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cs-section{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:18px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#70708a;margin-bottom:12px;font-weight:600}.cs-body-text{font-size:13px;line-height:1.7;color:#b0b0c8}
.cs-rels{display:flex;flex-direction:column;gap:6px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(255,255,255,.03);border-radius:6px;border:1px solid rgba(255,255,255,.05)}
.cs-rel-type{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#70708a;min-width:72px;flex-shrink:0}.cs-rel-name{font-size:13px;color:#c0c0d8}
.cs-list{display:flex;flex-direction:column;gap:4px}.cs-list-item{font-size:13px;color:#b0b0c8;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#e0e0f0}.cs-list-meta{color:#70708a;font-size:12px}
.cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(233,69,96,.2);border:1px solid rgba(233,69,96,.4);border-radius:10px;font-size:10px;color:#e94560;margin-left:6px}
.cs-timeline{display:flex;flex-direction:column;gap:6px}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:6px;border-left:2px solid rgba(110,70,190,.5)}
.cs-ev-date{font-size:11px;color:#70708a;min-width:90px;font-family:monospace;flex-shrink:0}.cs-ev-undated{color:#404050}.cs-ev-name{flex:1;font-size:13px;color:#e0e0f0}.cs-ev-status{font-size:11px;color:#70708a;padding:2px 8px;background:rgba(255,255,255,.05);border-radius:10px}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px solid rgba(255,255,255,.05)}.cs-td-key{font-size:12px;color:#70708a;padding:7px 12px 7px 0;width:35%;vertical-align:top}.cs-td-val{font-size:13px;color:#b0b0c8;padding:7px 0}
.cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#404050;text-align:right}
@media print{body{background:#fff;color:#000}.sts-cs-root{box-shadow:none;background:#fff;border:1px solid #ddd;max-width:100%}}@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}.cs-portrait{width:90px;height:112px}}`;
    },

    // styles.css covers the preview/note version
    getScopedCSS() { return ''; },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root');
    },
};

// ─── Template 2: Manuscript ───────────────────────────────────────────────────

const manuscriptTemplate: BuiltInSheetTemplate = {
    id: 'manuscript',
    name: 'Manuscript',
    description: 'Warm parchment tones with serif type — ink on aged paper.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#e8dfc8;font-family:Georgia,'Times New Roman',serif;color:#2a1505;padding:32px 16px}
.sts-cs-ms{max-width:860px;margin:0 auto;background:#fdf8f0;border-radius:3px;padding:40px;box-shadow:0 2px 24px rgba(60,30,10,.22);border:1px solid #c8b490}
.cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #c8a870;margin-bottom:28px}
.cs-portrait{width:120px;height:150px;flex-shrink:0;border-radius:2px;overflow:hidden;border:3px solid #c8a870;box-shadow:2px 2px 8px rgba(60,30,10,.2)}.cs-portrait img{width:100%;height:100%;object-fit:cover}
.cs-hero{flex:1}.cs-name{font-size:2.3rem;font-weight:700;color:#2a1505;font-style:italic;margin-bottom:14px;line-height:1.1}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.cs-stat{display:flex;flex-direction:column;background:#f5ede0;border:1px solid #d4c0a0;border-radius:2px;padding:6px 12px;min-width:80px}
.cs-sl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8b6840;margin-bottom:2px;font-family:'Segoe UI',sans-serif}.cs-sv{font-size:13px;font-weight:600;color:#2a1505}
.cs-traits{display:flex;flex-wrap:wrap;gap:6px}.cs-trait{padding:3px 10px;background:rgba(139,68,19,.08);border:1px solid rgba(139,68,19,.3);border-radius:2px;font-size:11px;color:#7a3a10;font-style:italic}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.cs-section{background:#fdf8f0;border:1px solid #d4c0a0;border-radius:2px;padding:18px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#8b6840;margin-bottom:10px;font-weight:700;font-family:'Segoe UI',sans-serif;border-bottom:1px solid #e0d0b8;padding-bottom:6px}
.cs-body-text{font-size:14px;line-height:1.85;color:#3a2010}
.cs-rels{display:flex;flex-direction:column;gap:6px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:7px 12px;background:#f8f2e4;border-radius:2px;border-left:3px solid #c8a060}
.cs-rel-type{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8b6840;min-width:72px;flex-shrink:0;font-family:'Segoe UI',sans-serif}.cs-rel-name{font-size:13px;color:#2a1505;font-style:italic}
.cs-list{display:flex;flex-direction:column;gap:4px}.cs-list-item{font-size:13px;color:#3a2010;padding:5px 0;border-bottom:1px solid #e8dcc8}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#2a1505}.cs-list-meta{color:#8b6840;font-size:12px}
.cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(170,20,20,.1);border:1px solid rgba(170,20,20,.3);border-radius:2px;font-size:10px;color:#9b1010;margin-left:6px}
.cs-timeline{display:flex;flex-direction:column;gap:6px}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f8f2e4;border-radius:2px;border-left:3px solid #c8a060}
.cs-ev-date{font-size:11px;color:#8b6840;min-width:90px;font-family:'Courier New',monospace;flex-shrink:0}.cs-ev-undated{color:#c8b090}.cs-ev-name{flex:1;font-size:13px;color:#2a1505;font-style:italic}.cs-ev-status{font-size:11px;color:#8b6840;padding:2px 8px;background:#f0e8d8;border-radius:2px}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px solid #e8dcc8}.cs-td-key{font-size:12px;color:#8b6840;padding:7px 12px 7px 0;width:35%;vertical-align:top;font-family:'Segoe UI',sans-serif}.cs-td-val{font-size:13px;color:#3a2010;padding:7px 0;font-style:italic}
.cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid #d4c0a0;font-size:11px;color:#b09070;text-align:right;font-style:italic}
@media print{body{background:#fff}.sts-cs-ms{box-shadow:none;max-width:100%}}@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}}`;
    },

    getScopedCSS() {
        return `.sts-cs-ms{background:#fdf8f0;border-radius:3px;padding:40px;border:1px solid #c8b490;font-family:Georgia,'Times New Roman',serif;color:#2a1505}
.sts-cs-ms .cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #c8a870;margin-bottom:28px}
.sts-cs-ms .cs-portrait{width:120px;height:150px;flex-shrink:0;border-radius:2px;overflow:hidden;border:3px solid #c8a870}.sts-cs-ms .cs-portrait img{width:100%;height:100%;object-fit:cover}
.sts-cs-ms .cs-hero{flex:1}.sts-cs-ms .cs-name{font-size:2.3rem;font-weight:700;color:#2a1505;font-style:italic;margin-bottom:14px;line-height:1.1}
.sts-cs-ms .cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.sts-cs-ms .cs-stat{display:flex;flex-direction:column;background:#f5ede0;border:1px solid #d4c0a0;border-radius:2px;padding:6px 12px}
.sts-cs-ms .cs-sl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8b6840;margin-bottom:2px;font-family:'Segoe UI',sans-serif}.sts-cs-ms .cs-sv{font-size:13px;font-weight:600;color:#2a1505}
.sts-cs-ms .cs-traits{display:flex;flex-wrap:wrap;gap:6px}.sts-cs-ms .cs-trait{padding:3px 10px;background:rgba(139,68,19,.08);border:1px solid rgba(139,68,19,.3);border-radius:2px;font-size:11px;color:#7a3a10;font-style:italic}
.sts-cs-ms .cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.sts-cs-ms .cs-section{background:#fdf8f0;border:1px solid #d4c0a0;border-radius:2px;padding:18px}.sts-cs-ms .cs-section.cs-full{grid-column:1/-1}
.sts-cs-ms .cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#8b6840;margin-bottom:10px;font-weight:700;font-family:'Segoe UI',sans-serif;border-bottom:1px solid #e0d0b8;padding-bottom:6px}
.sts-cs-ms .cs-body-text{font-size:14px;line-height:1.85;color:#3a2010}
.sts-cs-ms .cs-rels{display:flex;flex-direction:column;gap:6px}.sts-cs-ms .cs-rel-item{display:flex;align-items:center;gap:10px;padding:7px 12px;background:#f8f2e4;border-radius:2px;border-left:3px solid #c8a060}
.sts-cs-ms .cs-rel-type{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8b6840;min-width:72px;flex-shrink:0;font-family:'Segoe UI',sans-serif}.sts-cs-ms .cs-rel-name{font-size:13px;color:#2a1505;font-style:italic}
.sts-cs-ms .cs-list{display:flex;flex-direction:column;gap:4px}.sts-cs-ms .cs-list-item{font-size:13px;color:#3a2010;padding:5px 0;border-bottom:1px solid #e8dcc8}.sts-cs-ms .cs-list-item:last-child{border-bottom:none}.sts-cs-ms .cs-list-item strong{color:#2a1505}.sts-cs-ms .cs-list-meta{color:#8b6840;font-size:12px}
.sts-cs-ms .cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(170,20,20,.1);border:1px solid rgba(170,20,20,.3);border-radius:2px;font-size:10px;color:#9b1010;margin-left:6px}
.sts-cs-ms .cs-timeline{display:flex;flex-direction:column;gap:6px}.sts-cs-ms .cs-timeline-item{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f8f2e4;border-radius:2px;border-left:3px solid #c8a060}
.sts-cs-ms .cs-ev-date{font-size:11px;color:#8b6840;min-width:90px;font-family:'Courier New',monospace;flex-shrink:0}.sts-cs-ms .cs-ev-undated{color:#c8b090}.sts-cs-ms .cs-ev-name{flex:1;font-size:13px;color:#2a1505;font-style:italic}.sts-cs-ms .cs-ev-status{font-size:11px;color:#8b6840;padding:2px 8px;background:#f0e8d8;border-radius:2px}
.sts-cs-ms .cs-table{width:100%;border-collapse:collapse}.sts-cs-ms .cs-table tr:not(:last-child) td{border-bottom:1px solid #e8dcc8}.sts-cs-ms .cs-td-key{font-size:12px;color:#8b6840;padding:7px 12px 7px 0;width:35%;vertical-align:top;font-family:'Segoe UI',sans-serif}.sts-cs-ms .cs-td-val{font-size:13px;color:#3a2010;padding:7px 0;font-style:italic}
.sts-cs-ms .cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid #d4c0a0;font-size:11px;color:#b09070;text-align:right;font-style:italic}`;
    },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root sts-cs-ms');
    },
};

// ─── Template 3: Minimal ──────────────────────────────────────────────────────

const minimalTemplate: BuiltInSheetTemplate = {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean white layout optimised for readability and printing.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#f4f4f4;font-family:-apple-system,'Segoe UI',sans-serif;color:#111;padding:32px 16px}
.sts-cs-min{max-width:860px;margin:0 auto;background:#fff;border-radius:6px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.1)}
.cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:28px}
.cs-portrait{width:110px;height:138px;flex-shrink:0;border-radius:4px;overflow:hidden;border:1px solid #ddd}.cs-portrait img{width:100%;height:100%;object-fit:cover}
.cs-hero{flex:1}.cs-name{font-size:2rem;font-weight:700;color:#111;letter-spacing:-.02em;margin-bottom:14px;line-height:1.1}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.cs-stat{display:flex;flex-direction:column;background:#f8f8f8;border:1px solid #e5e5e5;border-radius:4px;padding:6px 12px;min-width:80px}
.cs-sl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:2px}.cs-sv{font-size:13px;font-weight:600;color:#111}
.cs-traits{display:flex;flex-wrap:wrap;gap:6px}.cs-trait{padding:3px 10px;background:#f0f0f0;border:1px solid #ddd;border-radius:20px;font-size:11px;color:#555}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cs-section{background:#fafafa;border:1px solid #e8e8e8;border-radius:4px;padding:18px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#888;margin-bottom:12px;font-weight:700}
.cs-body-text{font-size:13px;line-height:1.75;color:#333}
.cs-rels{display:flex;flex-direction:column;gap:5px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:#fff;border-radius:3px;border:1px solid #e8e8e8}
.cs-rel-type{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;min-width:72px;flex-shrink:0}.cs-rel-name{font-size:13px;color:#333}
.cs-list{display:flex;flex-direction:column;gap:4px}.cs-list-item{font-size:13px;color:#444;padding:5px 0;border-bottom:1px solid #eee}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#111}.cs-list-meta{color:#999;font-size:12px}
.cs-badge-critical{display:inline-block;padding:1px 8px;background:#fff0f0;border:1px solid #ffb3b3;border-radius:10px;font-size:10px;color:#cc0000;margin-left:6px}
.cs-timeline{display:flex;flex-direction:column;gap:5px}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:#fff;border-radius:3px;border-left:3px solid #111;border:1px solid #e8e8e8;border-left:3px solid #333}
.cs-ev-date{font-size:11px;color:#999;min-width:90px;font-family:monospace;flex-shrink:0}.cs-ev-undated{color:#ccc}.cs-ev-name{flex:1;font-size:13px;color:#111}.cs-ev-status{font-size:11px;color:#888;padding:2px 8px;background:#f0f0f0;border-radius:10px}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px solid #eee}.cs-td-key{font-size:12px;color:#888;padding:7px 12px 7px 0;width:35%;vertical-align:top}.cs-td-val{font-size:13px;color:#333;padding:7px 0}
.cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:right}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff;padding:0}.sts-cs-min{box-shadow:none;max-width:100%;padding:20px}}@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}}`;
    },

    getScopedCSS() {
        return `.sts-cs-min{background:#fff;border-radius:6px;padding:40px;border:1px solid #e5e5e5;font-family:-apple-system,'Segoe UI',sans-serif;color:#111}
.sts-cs-min .cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:28px}
.sts-cs-min .cs-portrait{width:110px;height:138px;flex-shrink:0;border-radius:4px;overflow:hidden;border:1px solid #ddd}.sts-cs-min .cs-portrait img{width:100%;height:100%;object-fit:cover}
.sts-cs-min .cs-name{font-size:2rem;font-weight:700;color:#111;letter-spacing:-.02em;margin-bottom:14px;line-height:1.1}
.sts-cs-min .cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.sts-cs-min .cs-stat{display:flex;flex-direction:column;background:#f8f8f8;border:1px solid #e5e5e5;border-radius:4px;padding:6px 12px}
.sts-cs-min .cs-sl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:2px}.sts-cs-min .cs-sv{font-size:13px;font-weight:600;color:#111}
.sts-cs-min .cs-traits{display:flex;flex-wrap:wrap;gap:6px}.sts-cs-min .cs-trait{padding:3px 10px;background:#f0f0f0;border:1px solid #ddd;border-radius:20px;font-size:11px;color:#555}
.sts-cs-min .cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sts-cs-min .cs-section{background:#fafafa;border:1px solid #e8e8e8;border-radius:4px;padding:18px}.sts-cs-min .cs-section.cs-full{grid-column:1/-1}
.sts-cs-min .cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#888;margin-bottom:12px;font-weight:700}
.sts-cs-min .cs-body-text{font-size:13px;line-height:1.75;color:#333}
.sts-cs-min .cs-rels{display:flex;flex-direction:column;gap:5px}.sts-cs-min .cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:#fff;border-radius:3px;border:1px solid #e8e8e8}
.sts-cs-min .cs-rel-type{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;min-width:72px;flex-shrink:0}.sts-cs-min .cs-rel-name{font-size:13px;color:#333}
.sts-cs-min .cs-list{display:flex;flex-direction:column;gap:4px}.sts-cs-min .cs-list-item{font-size:13px;color:#444;padding:5px 0;border-bottom:1px solid #eee}.sts-cs-min .cs-list-item:last-child{border-bottom:none}.sts-cs-min .cs-list-item strong{color:#111}.sts-cs-min .cs-list-meta{color:#999;font-size:12px}
.sts-cs-min .cs-badge-critical{display:inline-block;padding:1px 8px;background:#fff0f0;border:1px solid #ffb3b3;border-radius:10px;font-size:10px;color:#cc0000;margin-left:6px}
.sts-cs-min .cs-timeline{display:flex;flex-direction:column;gap:5px}.sts-cs-min .cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:#fff;border-radius:3px;border:1px solid #e8e8e8;border-left:3px solid #333}
.sts-cs-min .cs-ev-date{font-size:11px;color:#999;min-width:90px;font-family:monospace;flex-shrink:0}.sts-cs-min .cs-ev-undated{color:#ccc}.sts-cs-min .cs-ev-name{flex:1;font-size:13px;color:#111}.sts-cs-min .cs-ev-status{font-size:11px;color:#888;padding:2px 8px;background:#f0f0f0;border-radius:10px}
.sts-cs-min .cs-table{width:100%;border-collapse:collapse}.sts-cs-min .cs-table tr:not(:last-child) td{border-bottom:1px solid #eee}.sts-cs-min .cs-td-key{font-size:12px;color:#888;padding:7px 12px 7px 0;width:35%;vertical-align:top}.sts-cs-min .cs-td-val{font-size:13px;color:#333;padding:7px 0}
.sts-cs-min .cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:right}`;
    },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root sts-cs-min');
    },
};

// ─── Template 4: Dossier ──────────────────────────────────────────────────────

const dossierTemplate: BuiltInSheetTemplate = {
    id: 'dossier',
    name: 'Dossier',
    description: 'Classified-document aesthetic — manila paper, typewriter font, red stamp accents.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#3a2e1e;font-family:'Courier New',Courier,monospace;color:#2a1a08;padding:32px 16px}
.sts-cs-dos{max-width:860px;margin:0 auto;background:#f2ead5;border-radius:2px;padding:40px 44px;box-shadow:0 4px 32px rgba(0,0,0,.5),inset 0 0 0 1px #c8b888;position:relative}
.sts-cs-dos::before{content:'CLASSIFIED';position:absolute;top:28px;right:36px;font-size:11px;font-weight:700;letter-spacing:.25em;color:rgba(180,20,20,.55);border:2px solid rgba(180,20,20,.5);padding:3px 10px;transform:rotate(3deg);pointer-events:none}
.cs-header{display:flex;gap:24px;align-items:flex-start;padding-bottom:20px;border-bottom:3px double #a08040;margin-bottom:24px}
.cs-portrait{width:100px;height:130px;flex-shrink:0;border-radius:0;overflow:hidden;border:2px solid #a08040;filter:grayscale(30%)}.cs-portrait img{width:100%;height:100%;object-fit:cover}
.cs-hero{flex:1}.cs-name{font-size:1.7rem;font-weight:700;color:#1a0a00;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px;line-height:1.15}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.cs-stat{display:flex;flex-direction:column;background:rgba(160,128,60,.1);border:1px solid #c8b070;border-radius:0;padding:5px 10px;min-width:80px}
.cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.15em;color:#7a5a20;margin-bottom:1px}.cs-sv{font-size:12px;font-weight:700;color:#1a0a00}
.cs-traits{display:flex;flex-wrap:wrap;gap:5px}.cs-trait{padding:2px 8px;background:transparent;border:1px solid #9b6020;border-radius:0;font-size:11px;color:#7a4010}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.cs-section{background:transparent;border:1px solid #c8b070;border-radius:0;padding:16px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:#9b6020;margin-bottom:10px;font-weight:700;border-bottom:1px solid #c8b070;padding-bottom:5px}
.cs-body-text{font-size:12px;line-height:1.7;color:#2a1a08}
.cs-rels{display:flex;flex-direction:column;gap:5px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(160,128,60,.06);border-bottom:1px dashed #c8b070}
.cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#9b6020;min-width:72px;flex-shrink:0}.cs-rel-name{font-size:12px;color:#1a0a00}
.cs-list{display:flex;flex-direction:column;gap:0}.cs-list-item{font-size:12px;color:#2a1a08;padding:5px 0;border-bottom:1px dashed #d8c898}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#1a0a00}.cs-list-meta{color:#9b6020;font-size:11px}
.cs-badge-critical{display:inline-block;padding:1px 6px;background:rgba(180,20,20,.12);border:1px solid rgba(180,20,20,.5);border-radius:0;font-size:9px;color:#a01010;margin-left:6px;text-transform:uppercase;letter-spacing:.08em}
.cs-timeline{display:flex;flex-direction:column;gap:0}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed #d8c898}
.cs-ev-date{font-size:10px;color:#9b6020;min-width:90px;flex-shrink:0}.cs-ev-undated{color:#c8a870;font-style:italic}.cs-ev-name{flex:1;font-size:12px;color:#1a0a00}.cs-ev-status{font-size:10px;color:#9b6020;padding:1px 6px;border:1px solid #c8b070}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px dashed #d8c898}.cs-td-key{font-size:11px;color:#9b6020;padding:6px 12px 6px 0;width:35%;vertical-align:top;text-transform:uppercase;letter-spacing:.06em}.cs-td-val{font-size:12px;color:#2a1a08;padding:6px 0}
.cs-footer{margin-top:20px;padding-top:12px;border-top:2px solid #a08040;font-size:10px;color:#9b7a40;text-align:right;text-transform:uppercase;letter-spacing:.1em}
@media print{body{background:#fff}.sts-cs-dos{box-shadow:none;max-width:100%}}@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}}`;
    },

    getScopedCSS() {
        return `.sts-cs-dos{background:#f2ead5;border-radius:2px;padding:40px 44px;border:1px solid #c8b888;position:relative;font-family:'Courier New',Courier,monospace;color:#2a1a08}
.sts-cs-dos::before{content:'CLASSIFIED';position:absolute;top:28px;right:36px;font-size:11px;font-weight:700;letter-spacing:.25em;color:rgba(180,20,20,.55);border:2px solid rgba(180,20,20,.5);padding:3px 10px;transform:rotate(3deg);pointer-events:none}
.sts-cs-dos .cs-header{display:flex;gap:24px;align-items:flex-start;padding-bottom:20px;border-bottom:3px double #a08040;margin-bottom:24px}
.sts-cs-dos .cs-portrait{width:100px;height:130px;flex-shrink:0;overflow:hidden;border:2px solid #a08040;filter:grayscale(30%)}.sts-cs-dos .cs-portrait img{width:100%;height:100%;object-fit:cover}
.sts-cs-dos .cs-name{font-size:1.7rem;font-weight:700;color:#1a0a00;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px;line-height:1.15}
.sts-cs-dos .cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.sts-cs-dos .cs-stat{display:flex;flex-direction:column;background:rgba(160,128,60,.1);border:1px solid #c8b070;padding:5px 10px}
.sts-cs-dos .cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.15em;color:#7a5a20;margin-bottom:1px}.sts-cs-dos .cs-sv{font-size:12px;font-weight:700;color:#1a0a00}
.sts-cs-dos .cs-traits{display:flex;flex-wrap:wrap;gap:5px}.sts-cs-dos .cs-trait{padding:2px 8px;background:transparent;border:1px solid #9b6020;font-size:11px;color:#7a4010}
.sts-cs-dos .cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sts-cs-dos .cs-section{background:transparent;border:1px solid #c8b070;padding:16px}.sts-cs-dos .cs-section.cs-full{grid-column:1/-1}
.sts-cs-dos .cs-sh{font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:#9b6020;margin-bottom:10px;font-weight:700;border-bottom:1px solid #c8b070;padding-bottom:5px}
.sts-cs-dos .cs-body-text{font-size:12px;line-height:1.7;color:#2a1a08}
.sts-cs-dos .cs-rels{display:flex;flex-direction:column;gap:5px}.sts-cs-dos .cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(160,128,60,.06);border-bottom:1px dashed #c8b070}
.sts-cs-dos .cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#9b6020;min-width:72px;flex-shrink:0}.sts-cs-dos .cs-rel-name{font-size:12px;color:#1a0a00}
.sts-cs-dos .cs-list{display:flex;flex-direction:column}.sts-cs-dos .cs-list-item{font-size:12px;color:#2a1a08;padding:5px 0;border-bottom:1px dashed #d8c898}.sts-cs-dos .cs-list-item:last-child{border-bottom:none}.sts-cs-dos .cs-list-item strong{color:#1a0a00}.sts-cs-dos .cs-list-meta{color:#9b6020;font-size:11px}
.sts-cs-dos .cs-badge-critical{display:inline-block;padding:1px 6px;background:rgba(180,20,20,.12);border:1px solid rgba(180,20,20,.5);font-size:9px;color:#a01010;margin-left:6px;text-transform:uppercase;letter-spacing:.08em}
.sts-cs-dos .cs-timeline{display:flex;flex-direction:column}.sts-cs-dos .cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed #d8c898}
.sts-cs-dos .cs-ev-date{font-size:10px;color:#9b6020;min-width:90px;flex-shrink:0}.sts-cs-dos .cs-ev-undated{color:#c8a870;font-style:italic}.sts-cs-dos .cs-ev-name{flex:1;font-size:12px;color:#1a0a00}.sts-cs-dos .cs-ev-status{font-size:10px;color:#9b6020;padding:1px 6px;border:1px solid #c8b070}
.sts-cs-dos .cs-table{width:100%;border-collapse:collapse}.sts-cs-dos .cs-table tr:not(:last-child) td{border-bottom:1px dashed #d8c898}.sts-cs-dos .cs-td-key{font-size:11px;color:#9b6020;padding:6px 12px 6px 0;width:35%;vertical-align:top;text-transform:uppercase;letter-spacing:.06em}.sts-cs-dos .cs-td-val{font-size:12px;color:#2a1a08;padding:6px 0}
.sts-cs-dos .cs-footer{margin-top:20px;padding-top:12px;border-top:2px solid #a08040;font-size:10px;color:#9b7a40;text-align:right;text-transform:uppercase;letter-spacing:.1em}`;
    },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root sts-cs-dos');
    },
};

// ─── Template 5: Neon ─────────────────────────────────────────────────────────

const neonTemplate: BuiltInSheetTemplate = {
    id: 'neon',
    name: 'Neon',
    description: 'Deep black with glowing cyan accents and a cyberpunk edge.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#020208;font-family:'Courier New',Courier,monospace;color:#c8f0f8;padding:32px 16px}
.sts-cs-neo{max-width:860px;margin:0 auto;background:#080814;border-radius:4px;padding:36px;border:1px solid rgba(0,229,255,.25);box-shadow:0 0 40px rgba(0,229,255,.08),inset 0 0 80px rgba(0,229,255,.02)}
.sts-cs-neo::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,229,255,.015) 2px,rgba(0,229,255,.015) 4px);pointer-events:none;border-radius:4px}
.cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:1px solid rgba(0,229,255,.2);margin-bottom:28px;position:relative}
.cs-portrait{width:120px;height:150px;flex-shrink:0;border-radius:2px;overflow:hidden;border:1px solid rgba(0,229,255,.4);box-shadow:0 0 12px rgba(0,229,255,.2)}.cs-portrait img{width:100%;height:100%;object-fit:cover;filter:saturate(0.8) contrast(1.1)}
.cs-hero{flex:1}.cs-name{font-size:2rem;font-weight:700;color:#00e5ff;text-shadow:0 0 16px rgba(0,229,255,.6);letter-spacing:.04em;margin-bottom:14px;line-height:1.1;text-transform:uppercase}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.cs-stat{display:flex;flex-direction:column;background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.2);border-radius:2px;padding:6px 12px;min-width:80px}
.cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.18em;color:rgba(0,229,255,.5);margin-bottom:2px}.cs-sv{font-size:12px;font-weight:700;color:#a0e8f8}
.cs-traits{display:flex;flex-wrap:wrap;gap:6px}.cs-trait{padding:2px 10px;background:rgba(0,229,255,.06);border:1px solid rgba(0,229,255,.3);border-radius:2px;font-size:11px;color:#00e5ff;text-shadow:0 0 6px rgba(0,229,255,.4)}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cs-section{background:rgba(0,229,255,.02);border:1px solid rgba(0,229,255,.15);border-radius:2px;padding:18px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:9px;text-transform:uppercase;letter-spacing:.2em;color:rgba(0,229,255,.6);margin-bottom:12px;font-weight:700;border-bottom:1px solid rgba(0,229,255,.12);padding-bottom:6px}
.cs-body-text{font-size:12px;line-height:1.75;color:#a8d8e8}
.cs-rels{display:flex;flex-direction:column;gap:5px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(0,229,255,.03);border-radius:2px;border:1px solid rgba(0,229,255,.1)}
.cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:rgba(0,229,255,.5);min-width:72px;flex-shrink:0}.cs-rel-name{font-size:12px;color:#c0e8f8}
.cs-list{display:flex;flex-direction:column;gap:3px}.cs-list-item{font-size:12px;color:#a8d8e8;padding:5px 0;border-bottom:1px solid rgba(0,229,255,.06)}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#c8f0ff}.cs-list-meta{color:rgba(0,229,255,.45);font-size:11px}
.cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(255,50,80,.12);border:1px solid rgba(255,50,80,.4);border-radius:2px;font-size:10px;color:#ff5060;margin-left:6px;text-shadow:0 0 6px rgba(255,50,80,.5)}
.cs-timeline{display:flex;flex-direction:column;gap:5px}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:rgba(0,229,255,.02);border-radius:2px;border:1px solid rgba(0,229,255,.1);border-left:2px solid rgba(0,229,255,.5)}
.cs-ev-date{font-size:10px;color:rgba(0,229,255,.55);min-width:90px;flex-shrink:0}.cs-ev-undated{color:rgba(0,229,255,.2)}.cs-ev-name{flex:1;font-size:12px;color:#c0e8f8}.cs-ev-status{font-size:10px;color:rgba(0,229,255,.5);padding:2px 6px;background:rgba(0,229,255,.05);border-radius:2px}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px solid rgba(0,229,255,.07)}.cs-td-key{font-size:11px;color:rgba(0,229,255,.5);padding:7px 12px 7px 0;width:35%;vertical-align:top;text-transform:uppercase;letter-spacing:.06em}.cs-td-val{font-size:12px;color:#a8d8e8;padding:7px 0}
.cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid rgba(0,229,255,.12);font-size:10px;color:rgba(0,229,255,.3);text-align:right;text-transform:uppercase;letter-spacing:.1em}
@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}}`;
    },

    getScopedCSS() {
        return `.sts-cs-neo{background:#080814;border-radius:4px;padding:36px;border:1px solid rgba(0,229,255,.25);font-family:'Courier New',Courier,monospace;color:#c8f0f8}
.sts-cs-neo .cs-header{display:flex;gap:28px;align-items:flex-start;padding-bottom:24px;border-bottom:1px solid rgba(0,229,255,.2);margin-bottom:28px}
.sts-cs-neo .cs-portrait{width:120px;height:150px;flex-shrink:0;border-radius:2px;overflow:hidden;border:1px solid rgba(0,229,255,.4);box-shadow:0 0 12px rgba(0,229,255,.2)}.sts-cs-neo .cs-portrait img{width:100%;height:100%;object-fit:cover;filter:saturate(0.8) contrast(1.1)}
.sts-cs-neo .cs-name{font-size:2rem;font-weight:700;color:#00e5ff;text-shadow:0 0 16px rgba(0,229,255,.6);letter-spacing:.04em;margin-bottom:14px;line-height:1.1;text-transform:uppercase}
.sts-cs-neo .cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.sts-cs-neo .cs-stat{display:flex;flex-direction:column;background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.2);padding:6px 12px}
.sts-cs-neo .cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.18em;color:rgba(0,229,255,.5);margin-bottom:2px}.sts-cs-neo .cs-sv{font-size:12px;font-weight:700;color:#a0e8f8}
.sts-cs-neo .cs-traits{display:flex;flex-wrap:wrap;gap:6px}.sts-cs-neo .cs-trait{padding:2px 10px;background:rgba(0,229,255,.06);border:1px solid rgba(0,229,255,.3);font-size:11px;color:#00e5ff}
.sts-cs-neo .cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sts-cs-neo .cs-section{background:rgba(0,229,255,.02);border:1px solid rgba(0,229,255,.15);padding:18px}.sts-cs-neo .cs-section.cs-full{grid-column:1/-1}
.sts-cs-neo .cs-sh{font-size:9px;text-transform:uppercase;letter-spacing:.2em;color:rgba(0,229,255,.6);margin-bottom:12px;font-weight:700;border-bottom:1px solid rgba(0,229,255,.12);padding-bottom:6px}
.sts-cs-neo .cs-body-text{font-size:12px;line-height:1.75;color:#a8d8e8}
.sts-cs-neo .cs-rels{display:flex;flex-direction:column;gap:5px}.sts-cs-neo .cs-rel-item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.1)}
.sts-cs-neo .cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:rgba(0,229,255,.5);min-width:72px;flex-shrink:0}.sts-cs-neo .cs-rel-name{font-size:12px;color:#c0e8f8}
.sts-cs-neo .cs-list{display:flex;flex-direction:column}.sts-cs-neo .cs-list-item{font-size:12px;color:#a8d8e8;padding:5px 0;border-bottom:1px solid rgba(0,229,255,.06)}.sts-cs-neo .cs-list-item:last-child{border-bottom:none}.sts-cs-neo .cs-list-item strong{color:#c8f0ff}.sts-cs-neo .cs-list-meta{color:rgba(0,229,255,.45);font-size:11px}
.sts-cs-neo .cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(255,50,80,.12);border:1px solid rgba(255,50,80,.4);font-size:10px;color:#ff5060;margin-left:6px}
.sts-cs-neo .cs-timeline{display:flex;flex-direction:column;gap:5px}.sts-cs-neo .cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:rgba(0,229,255,.02);border:1px solid rgba(0,229,255,.1);border-left:2px solid rgba(0,229,255,.5)}
.sts-cs-neo .cs-ev-date{font-size:10px;color:rgba(0,229,255,.55);min-width:90px;flex-shrink:0}.sts-cs-neo .cs-ev-undated{color:rgba(0,229,255,.2)}.sts-cs-neo .cs-ev-name{flex:1;font-size:12px;color:#c0e8f8}.sts-cs-neo .cs-ev-status{font-size:10px;color:rgba(0,229,255,.5);padding:2px 6px;background:rgba(0,229,255,.05)}
.sts-cs-neo .cs-table{width:100%;border-collapse:collapse}.sts-cs-neo .cs-table tr:not(:last-child) td{border-bottom:1px solid rgba(0,229,255,.07)}.sts-cs-neo .cs-td-key{font-size:11px;color:rgba(0,229,255,.5);padding:7px 12px 7px 0;width:35%;vertical-align:top;text-transform:uppercase;letter-spacing:.06em}.sts-cs-neo .cs-td-val{font-size:12px;color:#a8d8e8;padding:7px 0}
.sts-cs-neo .cs-footer{margin-top:24px;padding-top:14px;border-top:1px solid rgba(0,229,255,.12);font-size:10px;color:rgba(0,229,255,.3);text-align:right;text-transform:uppercase;letter-spacing:.1em}`;
    },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root sts-cs-neo');
    },
};

// ─── Template 6: D&D ──────────────────────────────────────────────────────────

const dndTemplate: BuiltInSheetTemplate = {
    id: 'dnd',
    name: 'D&D',
    description: 'Fantasy parchment with D&D-red headers and decorative double borders.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#1a1008;font-family:Georgia,'Times New Roman',serif;color:#2a1505;padding:32px 16px}
.sts-cs-dnd{max-width:860px;margin:0 auto;background:#f0e6c8;border-radius:2px;padding:36px 40px;box-shadow:0 4px 40px rgba(0,0,0,.6);border:6px double #9b1717;outline:2px solid #c8a040;outline-offset:-10px}
.cs-header{display:flex;gap:24px;align-items:flex-start;padding-bottom:20px;border-bottom:3px double #9b1717;margin-bottom:24px}
.cs-portrait{width:110px;height:138px;flex-shrink:0;border-radius:0;overflow:hidden;border:3px solid #9b1717;box-shadow:2px 2px 0 #6b0f0f}.cs-portrait img{width:100%;height:100%;object-fit:cover;filter:sepia(20%)}
.cs-hero{flex:1}.cs-name{font-size:2.2rem;font-weight:700;color:#9b1717;font-style:italic;margin-bottom:12px;line-height:1.1;text-shadow:1px 1px 0 rgba(155,23,23,.15)}
.cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.cs-stat{display:flex;flex-direction:column;background:rgba(155,23,23,.06);border:1px solid rgba(155,23,23,.3);border-radius:0;padding:6px 12px;min-width:80px}
.cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.14em;color:#9b1717;margin-bottom:2px}.cs-sv{font-size:13px;font-weight:700;color:#2a0808}
.cs-traits{display:flex;flex-wrap:wrap;gap:6px}.cs-trait{padding:3px 10px;background:rgba(155,23,23,.07);border:1px solid rgba(155,23,23,.4);border-radius:2px;font-size:11px;color:#7a0e0e;font-style:italic}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cs-section{background:rgba(255,255,255,.25);border:2px double #c8a040;border-radius:0;padding:16px}.cs-section.cs-full{grid-column:1/-1}
.cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#9b1717;margin-bottom:10px;font-weight:700;font-variant:small-caps;border-bottom:1px solid rgba(155,23,23,.25);padding-bottom:5px}
.cs-body-text{font-size:13px;line-height:1.8;color:#2a1505}
.cs-rels{display:flex;flex-direction:column;gap:6px}.cs-rel-item{display:flex;align-items:center;gap:10px;padding:7px 10px;background:rgba(155,23,23,.04);border-bottom:1px solid rgba(155,23,23,.15)}
.cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#9b1717;min-width:72px;flex-shrink:0}.cs-rel-name{font-size:13px;color:#2a1505;font-style:italic}
.cs-list{display:flex;flex-direction:column;gap:4px}.cs-list-item{font-size:13px;color:#2a1505;padding:5px 0;border-bottom:1px solid rgba(155,23,23,.12)}.cs-list-item:last-child{border-bottom:none}.cs-list-item strong{color:#1a0808}.cs-list-meta{color:#9b5020;font-size:12px;font-style:italic}
.cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(155,23,23,.12);border:1px solid rgba(155,23,23,.5);border-radius:0;font-size:10px;color:#9b1717;margin-left:6px;text-transform:uppercase;letter-spacing:.06em}
.cs-timeline{display:flex;flex-direction:column;gap:6px}.cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:rgba(255,255,255,.2);border-bottom:1px solid rgba(155,23,23,.12);border-left:3px solid #9b1717}
.cs-ev-date{font-size:11px;color:#9b5020;min-width:90px;flex-shrink:0;font-style:italic}.cs-ev-undated{color:#c8a880;font-style:italic}.cs-ev-name{flex:1;font-size:13px;color:#1a0808;font-style:italic}.cs-ev-status{font-size:11px;color:#9b1717;padding:2px 7px;border:1px solid rgba(155,23,23,.3)}
.cs-table{width:100%;border-collapse:collapse}.cs-table tr:not(:last-child) td{border-bottom:1px solid rgba(155,23,23,.12)}.cs-td-key{font-size:12px;color:#9b1717;padding:7px 12px 7px 0;width:35%;vertical-align:top;font-variant:small-caps;letter-spacing:.04em}.cs-td-val{font-size:13px;color:#2a1505;padding:7px 0;font-style:italic}
.cs-footer{margin-top:20px;padding-top:12px;border-top:3px double #9b1717;font-size:11px;color:#9b5020;text-align:center;font-style:italic}
@media print{body{background:#fff}.sts-cs-dnd{box-shadow:none;max-width:100%}}@media(max-width:600px){.cs-grid{grid-template-columns:1fr}.cs-header{flex-direction:column}}`;
    },

    getScopedCSS() {
        return `.sts-cs-dnd{background:#f0e6c8;border-radius:2px;padding:36px 40px;border:6px double #9b1717;outline:2px solid #c8a040;outline-offset:-10px;font-family:Georgia,'Times New Roman',serif;color:#2a1505}
.sts-cs-dnd .cs-header{display:flex;gap:24px;align-items:flex-start;padding-bottom:20px;border-bottom:3px double #9b1717;margin-bottom:24px}
.sts-cs-dnd .cs-portrait{width:110px;height:138px;flex-shrink:0;overflow:hidden;border:3px solid #9b1717;box-shadow:2px 2px 0 #6b0f0f}.sts-cs-dnd .cs-portrait img{width:100%;height:100%;object-fit:cover;filter:sepia(20%)}
.sts-cs-dnd .cs-name{font-size:2.2rem;font-weight:700;color:#9b1717;font-style:italic;margin-bottom:12px;line-height:1.1}
.sts-cs-dnd .cs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.sts-cs-dnd .cs-stat{display:flex;flex-direction:column;background:rgba(155,23,23,.06);border:1px solid rgba(155,23,23,.3);padding:6px 12px}
.sts-cs-dnd .cs-sl{font-size:8px;text-transform:uppercase;letter-spacing:.14em;color:#9b1717;margin-bottom:2px}.sts-cs-dnd .cs-sv{font-size:13px;font-weight:700;color:#2a0808}
.sts-cs-dnd .cs-traits{display:flex;flex-wrap:wrap;gap:6px}.sts-cs-dnd .cs-trait{padding:3px 10px;background:rgba(155,23,23,.07);border:1px solid rgba(155,23,23,.4);font-size:11px;color:#7a0e0e;font-style:italic}
.sts-cs-dnd .cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sts-cs-dnd .cs-section{background:rgba(255,255,255,.25);border:2px double #c8a040;padding:16px}.sts-cs-dnd .cs-section.cs-full{grid-column:1/-1}
.sts-cs-dnd .cs-sh{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#9b1717;margin-bottom:10px;font-weight:700;font-variant:small-caps;border-bottom:1px solid rgba(155,23,23,.25);padding-bottom:5px}
.sts-cs-dnd .cs-body-text{font-size:13px;line-height:1.8;color:#2a1505}
.sts-cs-dnd .cs-rels{display:flex;flex-direction:column;gap:6px}.sts-cs-dnd .cs-rel-item{display:flex;align-items:center;gap:10px;padding:7px 10px;background:rgba(155,23,23,.04);border-bottom:1px solid rgba(155,23,23,.15)}
.sts-cs-dnd .cs-rel-type{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#9b1717;min-width:72px;flex-shrink:0}.sts-cs-dnd .cs-rel-name{font-size:13px;color:#2a1505;font-style:italic}
.sts-cs-dnd .cs-list{display:flex;flex-direction:column}.sts-cs-dnd .cs-list-item{font-size:13px;color:#2a1505;padding:5px 0;border-bottom:1px solid rgba(155,23,23,.12)}.sts-cs-dnd .cs-list-item:last-child{border-bottom:none}.sts-cs-dnd .cs-list-item strong{color:#1a0808}.sts-cs-dnd .cs-list-meta{color:#9b5020;font-size:12px;font-style:italic}
.sts-cs-dnd .cs-badge-critical{display:inline-block;padding:1px 8px;background:rgba(155,23,23,.12);border:1px solid rgba(155,23,23,.5);font-size:10px;color:#9b1717;margin-left:6px;text-transform:uppercase;letter-spacing:.06em}
.sts-cs-dnd .cs-timeline{display:flex;flex-direction:column;gap:6px}.sts-cs-dnd .cs-timeline-item{display:flex;align-items:center;gap:12px;padding:7px 10px;background:rgba(255,255,255,.2);border-bottom:1px solid rgba(155,23,23,.12);border-left:3px solid #9b1717}
.sts-cs-dnd .cs-ev-date{font-size:11px;color:#9b5020;min-width:90px;flex-shrink:0;font-style:italic}.sts-cs-dnd .cs-ev-undated{color:#c8a880;font-style:italic}.sts-cs-dnd .cs-ev-name{flex:1;font-size:13px;color:#1a0808;font-style:italic}.sts-cs-dnd .cs-ev-status{font-size:11px;color:#9b1717;padding:2px 7px;border:1px solid rgba(155,23,23,.3)}
.sts-cs-dnd .cs-table{width:100%;border-collapse:collapse}.sts-cs-dnd .cs-table tr:not(:last-child) td{border-bottom:1px solid rgba(155,23,23,.12)}.sts-cs-dnd .cs-td-key{font-size:12px;color:#9b1717;padding:7px 12px 7px 0;width:35%;vertical-align:top;font-variant:small-caps;letter-spacing:.04em}.sts-cs-dnd .cs-td-val{font-size:13px;color:#2a1505;padding:7px 0;font-style:italic}
.sts-cs-dnd .cs-footer{margin-top:20px;padding-top:12px;border-top:3px double #9b1717;font-size:11px;color:#9b5020;text-align:center;font-style:italic}`;
    },

    buildInnerHTML(data, esc, nl) {
        return sharedBuildHTML(data, esc, nl, 'sts-cs-root sts-cs-dnd');
    },
};

// ─── Exports ──────────────────────────────────────────────────────────────────


const adventurerPanelTemplate: BuiltInSheetTemplate = {
    id: 'adventurer-panel',
    name: 'Adventurer Panel',
    description: 'Dark campaign dossier with portrait rail, metadata strip, and D&D stat ledger.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#070d1d;font-family:'Segoe UI',system-ui,sans-serif;color:#e7ebff;padding:32px 16px}.sts-cs-adv{max-width:1040px;margin:0 auto;background:linear-gradient(180deg,#0a1130 0%,#060c22 100%);border:1px solid rgba(95,126,255,.28);border-radius:18px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.45)}.sts-cs-adv .cs-panel-layout{display:grid;grid-template-columns:minmax(0,1.65fr) 280px;gap:20px;align-items:start}.sts-cs-adv .cs-panel-overline{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#c28ae8;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px}.sts-cs-adv .cs-panel-overline span{padding:4px 10px;border-radius:999px;border:1px solid rgba(194,138,232,.35);background:rgba(194,138,232,.08)}.sts-cs-adv .cs-name{font-size:3rem;line-height:1;font-weight:800;letter-spacing:-.04em;color:#f7f8ff;margin-bottom:14px}.sts-cs-adv .cs-panel-tagline{font-size:1rem;line-height:1.7;color:#d2d9ff;background:rgba(255,255,255,.03);border:1px solid rgba(95,126,255,.15);border-radius:14px;padding:16px 18px;margin-bottom:16px}.sts-cs-adv .cs-panel-badges{display:flex;flex-wrap:wrap;gap:8px}.sts-cs-adv .cs-trait{padding:5px 10px;border-radius:999px;background:rgba(95,126,255,.12);border:1px solid rgba(95,126,255,.28);font-size:12px;color:#b7c6ff}.sts-cs-adv .cs-panel-sections{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.sts-cs-adv .cs-panel-section,.sts-cs-adv .cs-panel-section-full{background:rgba(9,18,49,.9);border:1px solid rgba(95,126,255,.18);border-radius:14px;padding:16px}.sts-cs-adv .cs-panel-section-full{grid-column:1/-1}.sts-cs-adv .cs-panel-section h2,.sts-cs-adv .cs-panel-side-card h2{font-size:13px;font-weight:800;color:#b9c6ff;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}.sts-cs-adv .cs-panel-copy{font-size:14px;line-height:1.8;color:#d7ddff}.sts-cs-adv .cs-panel-list{display:flex;flex-direction:column;gap:8px}.sts-cs-adv .cs-panel-list-item{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);font-size:14px;color:#e7ebff}.sts-cs-adv .cs-panel-list-item span{display:block;color:#9faedc;font-size:12px;margin-top:4px}.sts-cs-adv .cs-panel-side{display:flex;flex-direction:column;gap:14px}.sts-cs-adv .cs-panel-portrait{border-radius:14px;overflow:hidden;border:1px solid rgba(95,126,255,.22);background:#0d1434}.sts-cs-adv .cs-panel-portrait img{display:block;width:100%;height:420px;object-fit:cover}.sts-cs-adv .cs-panel-side-card{background:rgba(9,18,49,.96);border:1px solid rgba(95,126,255,.18);border-radius:14px;padding:14px}.sts-cs-adv .cs-table{width:100%;border-collapse:collapse}.sts-cs-adv .cs-table td{padding:10px 8px;border-top:1px solid rgba(95,126,255,.16);font-size:14px}.sts-cs-adv .cs-table tr:first-child td{border-top:none}.sts-cs-adv .cs-td-key{color:#b07ac6;font-weight:700;width:44%}.sts-cs-adv .cs-td-val{color:#eff2ff}.sts-cs-adv .cs-ability-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.sts-cs-adv .cs-ability{padding:12px 10px;border-radius:12px;background:linear-gradient(180deg,rgba(91,120,255,.12),rgba(91,120,255,.03));border:1px solid rgba(91,120,255,.2);text-align:center}.sts-cs-adv .cs-ability-label{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9fb0f3;margin-bottom:6px}.sts-cs-adv .cs-ability-score{display:block;font-size:1.35rem;font-weight:800;color:#fff}.sts-cs-adv .cs-footer{margin-top:18px;padding-top:14px;border-top:1px solid rgba(95,126,255,.16);font-size:12px;color:#7f8ebf;text-align:right}@media(max-width:860px){.sts-cs-adv .cs-panel-layout{grid-template-columns:1fr}.sts-cs-adv .cs-panel-sections{grid-template-columns:1fr}.sts-cs-adv .cs-panel-portrait img{height:320px}}`;
    },

    getScopedCSS() {
        return `.sts-cs-adv{max-width:1040px;margin:0 auto;background:linear-gradient(180deg,#0a1130 0%,#060c22 100%);border:1px solid rgba(95,126,255,.28);border-radius:18px;padding:28px;color:#e7ebff}.sts-cs-adv .cs-panel-layout{display:grid;grid-template-columns:minmax(0,1.65fr) 280px;gap:20px;align-items:start}.sts-cs-adv .cs-panel-overline{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#c28ae8;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px}.sts-cs-adv .cs-panel-overline span{padding:4px 10px;border-radius:999px;border:1px solid rgba(194,138,232,.35);background:rgba(194,138,232,.08)}.sts-cs-adv .cs-name{font-size:3rem;line-height:1;font-weight:800;letter-spacing:-.04em;color:#f7f8ff;margin-bottom:14px}.sts-cs-adv .cs-panel-tagline{font-size:1rem;line-height:1.7;color:#d2d9ff;background:rgba(255,255,255,.03);border:1px solid rgba(95,126,255,.15);border-radius:14px;padding:16px 18px;margin-bottom:16px}.sts-cs-adv .cs-panel-badges{display:flex;flex-wrap:wrap;gap:8px}.sts-cs-adv .cs-trait{padding:5px 10px;border-radius:999px;background:rgba(95,126,255,.12);border:1px solid rgba(95,126,255,.28);font-size:12px;color:#b7c6ff}.sts-cs-adv .cs-panel-sections{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.sts-cs-adv .cs-panel-section,.sts-cs-adv .cs-panel-section-full{background:rgba(9,18,49,.9);border:1px solid rgba(95,126,255,.18);border-radius:14px;padding:16px}.sts-cs-adv .cs-panel-section-full{grid-column:1/-1}.sts-cs-adv .cs-panel-section h2,.sts-cs-adv .cs-panel-side-card h2{font-size:13px;font-weight:800;color:#b9c6ff;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}.sts-cs-adv .cs-panel-copy{font-size:14px;line-height:1.8;color:#d7ddff}.sts-cs-adv .cs-panel-list{display:flex;flex-direction:column;gap:8px}.sts-cs-adv .cs-panel-list-item{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);font-size:14px;color:#e7ebff}.sts-cs-adv .cs-panel-list-item span{display:block;color:#9faedc;font-size:12px;margin-top:4px}.sts-cs-adv .cs-panel-side{display:flex;flex-direction:column;gap:14px}.sts-cs-adv .cs-panel-portrait{border-radius:14px;overflow:hidden;border:1px solid rgba(95,126,255,.22);background:#0d1434}.sts-cs-adv .cs-panel-portrait img{display:block;width:100%;height:420px;object-fit:cover}.sts-cs-adv .cs-panel-side-card{background:rgba(9,18,49,.96);border:1px solid rgba(95,126,255,.18);border-radius:14px;padding:14px}.sts-cs-adv .cs-table{width:100%;border-collapse:collapse}.sts-cs-adv .cs-table td{padding:10px 8px;border-top:1px solid rgba(95,126,255,.16);font-size:14px}.sts-cs-adv .cs-table tr:first-child td{border-top:none}.sts-cs-adv .cs-td-key{color:#b07ac6;font-weight:700;width:44%}.sts-cs-adv .cs-td-val{color:#eff2ff}.sts-cs-adv .cs-ability-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.sts-cs-adv .cs-ability{padding:12px 10px;border-radius:12px;background:linear-gradient(180deg,rgba(91,120,255,.12),rgba(91,120,255,.03));border:1px solid rgba(91,120,255,.2);text-align:center}.sts-cs-adv .cs-ability-label{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9fb0f3;margin-bottom:6px}.sts-cs-adv .cs-ability-score{display:block;font-size:1.35rem;font-weight:800;color:#fff}.sts-cs-adv .cs-footer{margin-top:18px;padding-top:14px;border-top:1px solid rgba(95,126,255,.16);font-size:12px;color:#7f8ebf;text-align:right}@media(max-width:860px){.sts-cs-adv .cs-panel-layout{grid-template-columns:1fr}.sts-cs-adv .cs-panel-sections{grid-template-columns:1fr}.sts-cs-adv .cs-panel-portrait img{height:320px}}`;
    },

    buildInnerHTML(data, esc, nl) {
        const { character, portraitDataUrl } = data;
        const c = character as any;
        const metaBits = [
            c.dndLevel != null ? `Level ${esc(String(c.dndLevel))}` : 'Player Character',
            c.dndClass ? esc(String(c.dndClass)) : null,
            c.dndSubclass ? esc(String(c.dndSubclass)) : null,
            character.affiliation ? esc(character.affiliation) : null,
            character.status ? esc(character.status) : null,
        ].filter(Boolean) as string[];
        const traitBadges = (character.traits || []).slice(0, 6).map(trait => `<span class="cs-trait">${esc(trait)}</span>`).join('');
        const overviewRows = [...getDndDetailRows(data), ...getIdentityRows(data).filter(([label]) => label !== 'Race')].map(([label, value]) => `<tr><td class="cs-td-key">${esc(label)}</td><td class="cs-td-val">${esc(value)}</td></tr>`).join('');
        const abilityCards = getAbilityRows(data).map(([label, value]) => `<div class="cs-ability"><span class="cs-ability-label">${label}</span><span class="cs-ability-score">${esc(value)}</span></div>`).join('');
        const relationshipCards = buildRelationshipLines(data).slice(0, 6).map(line => `<div class="cs-panel-list-item">${esc(line.replace(/^- /, ''))}</div>`).join('');
        const groupCards = buildGroupLines(data).slice(0, 5).map(line => `<div class="cs-panel-list-item">${esc(line.replace(/^- /, ''))}</div>`).join('');
        const locationCards = buildLocationLines(data).slice(0, 4).map(line => `<div class="cs-panel-list-item">${esc(line.replace(/^- /, ''))}</div>`).join('');
        const itemCards = buildItemLines(data).slice(0, 5).map(line => `<div class="cs-panel-list-item">${esc(line.replace(/^- /, ''))}</div>`).join('');
        const eventCards = data.events.slice(0, 6).map(event => `<div class="cs-panel-list-item"><strong>${esc(event.name)}</strong>${event.dateTime ? `<span>${esc(event.dateTime)}</span>` : ''}</div>`).join('');
        const detailCards = Object.entries(character.customFields || {}).map(([key, value]) => `<div class="cs-panel-list-item"><strong>${esc(key)}</strong><span>${esc(value)}</span></div>`).join('');
        const portraitHTML = portraitDataUrl ? `<div class="cs-panel-portrait"><img src="${portraitDataUrl}" alt="${esc(character.name)}"></div>` : '';
        return `<div class="sts-cs-adv"><div class="cs-panel-layout"><div class="cs-panel-main"><div class="cs-panel-overline">${metaBits.map(bit => `<span>${bit}</span>`).join('')}</div><h1 class="cs-name">${esc(character.name)}</h1><div class="cs-panel-tagline">${character.description ? nl(character.description) : 'A campaign-facing sheet designed for quick reading, scene hooks, and tabletop context.'}</div>${traitBadges ? `<div class="cs-panel-badges">${traitBadges}</div>` : ''}<div class="cs-panel-sections">${character.backstory ? `<section class="cs-panel-section"><h2>History</h2><div class="cs-panel-copy">${nl(character.backstory)}</div></section>` : ''}<section class="cs-panel-section"><h2>Factions & Places</h2><div class="cs-panel-list">${groupCards || '<div class="cs-panel-list-item">No factions linked yet.</div>'}${locationCards || ''}</div></section><section class="cs-panel-section"><h2>Relations</h2><div class="cs-panel-list">${relationshipCards || '<div class="cs-panel-list-item">No relationships linked yet.</div>'}</div></section><section class="cs-panel-section"><h2>Inventory</h2><div class="cs-panel-list">${itemCards || '<div class="cs-panel-list-item">No items linked yet.</div>'}</div></section><section class="cs-panel-section-full"><h2>Campaign Timeline</h2><div class="cs-panel-list">${eventCards || '<div class="cs-panel-list-item">No events linked yet.</div>'}</div></section>${detailCards ? `<section class="cs-panel-section-full"><h2>Notes & Hooks</h2><div class="cs-panel-list">${detailCards}</div></section>` : ''}</div></div><aside class="cs-panel-side">${portraitHTML}<section class="cs-panel-side-card"><h2>Adventure Details</h2><table class="cs-table"><tbody>${overviewRows}</tbody></table></section><section class="cs-panel-side-card"><h2>Ability Scores</h2><div class="cs-ability-grid">${abilityCards}</div></section></aside></div><div class="cs-footer">Generated by Storyteller Suite - ${new Date().toLocaleDateString()}</div></div>`;
    },
};

const calloutSheetTemplate: BuiltInSheetTemplate = {
    id: 'callout-sheet',
    name: 'Callout Sheet',
    description: 'Obsidian-native callouts and tables with minimal custom styling.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#111827;font-family:'Segoe UI',system-ui,sans-serif;color:#e5e7eb;padding:32px 16px}.sts-cs-callout{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:16px}.sts-cs-callout h1{font-size:2.3rem;line-height:1.05;color:#f9fafb}.sts-cs-callout .cs-note-top{display:flex;gap:18px;align-items:flex-start}.sts-cs-callout .cs-note-main{flex:1}.sts-cs-callout .cs-note-portrait{width:220px;flex-shrink:0;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}.sts-cs-callout .cs-note-portrait img{display:block;width:100%;height:280px;object-fit:cover}.sts-cs-callout .callout{border-radius:14px;border:1px solid rgba(255,255,255,.1);overflow:hidden;background:rgba(255,255,255,.03)}.sts-cs-callout .callout-title{padding:12px 16px;font-weight:700;letter-spacing:.04em;background:rgba(255,255,255,.04)}.sts-cs-callout .callout-content{padding:16px}.sts-cs-callout .callout[data-callout='summary']{border-left:4px solid #8b5cf6}.sts-cs-callout .callout[data-callout='tip']{border-left:4px solid #22c55e}.sts-cs-callout .callout[data-callout='abstract']{border-left:4px solid #f59e0b}.sts-cs-callout .callout[data-callout='info']{border-left:4px solid #3b82f6}.sts-cs-callout .callout[data-callout='example']{border-left:4px solid #ec4899}.sts-cs-callout .callout[data-callout='note']{border-left:4px solid #94a3b8}.sts-cs-callout .callout[data-callout='quote']{border-left:4px solid #f97316}.sts-cs-callout table{width:100%;border-collapse:collapse}.sts-cs-callout td,.sts-cs-callout th{padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);text-align:left}.sts-cs-callout tr:first-child td,.sts-cs-callout tr:first-child th{border-top:none}.sts-cs-callout ul{padding-left:1.2rem;display:grid;gap:6px}.sts-cs-callout .cs-footer{font-size:12px;color:#9ca3af;text-align:right;padding-top:8px}@media(max-width:700px){.sts-cs-callout .cs-note-top{flex-direction:column}.sts-cs-callout .cs-note-portrait{width:100%}.sts-cs-callout .cs-note-portrait img{height:260px}}`;
    },

    getScopedCSS() {
        return `.sts-cs-callout{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:16px}.sts-cs-callout h1{font-size:2.3rem;line-height:1.05}.sts-cs-callout .cs-note-top{display:flex;gap:18px;align-items:flex-start}.sts-cs-callout .cs-note-main{flex:1}.sts-cs-callout .cs-note-portrait{width:220px;flex-shrink:0;border-radius:14px;overflow:hidden;border:1px solid var(--background-modifier-border)}.sts-cs-callout .cs-note-portrait img{display:block;width:100%;height:280px;object-fit:cover}.sts-cs-callout .callout{margin:0}.sts-cs-callout table{width:100%;border-collapse:collapse}.sts-cs-callout td,.sts-cs-callout th{padding:8px 10px;border-top:1px solid var(--background-modifier-border);text-align:left}.sts-cs-callout tr:first-child td,.sts-cs-callout tr:first-child th{border-top:none}.sts-cs-callout ul{padding-left:1.2rem;display:grid;gap:6px}.sts-cs-callout .cs-footer{font-size:12px;color:var(--text-muted);text-align:right;padding-top:8px}@media(max-width:700px){.sts-cs-callout .cs-note-top{flex-direction:column}.sts-cs-callout .cs-note-portrait{width:100%}.sts-cs-callout .cs-note-portrait img{height:260px}}`;
    },

    buildInnerHTML(data, esc, nl) {
        const { character, portraitDataUrl } = data;
        const portraitHTML = portraitDataUrl ? `<div class="cs-note-portrait"><img src="${portraitDataUrl}" alt="${esc(character.name)}"></div>` : '';
        const snapshotRows = [...getIdentityRows(data), ...getDndDetailRows(data)].map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');
        const abilityRows = getAbilityRows(data).map(([label, value]) => `<tr><th>${label}</th><td>${esc(value)}</td></tr>`).join('');
        const listToHtml = (items: string[]) => `<ul>${items.map(item => `<li>${esc(item.replace(/^- /, ''))}</li>`).join('')}</ul>`;
        return `<div class="sts-cs-callout"><div class="cs-note-top"><div class="cs-note-main"><h1>${esc(character.name)}</h1>${buildObsidianCalloutPreview('Snapshot', 'summary', `<table><tbody>${snapshotRows}</tbody></table>`)}</div>${portraitHTML}</div>${buildObsidianCalloutPreview('Ability Scores', 'tip', `<table><tbody>${abilityRows}</tbody></table>`)}${character.description || character.backstory ? buildObsidianCalloutPreview('Background', 'abstract', `${character.description ? `<p>${nl(character.description)}</p>` : ''}${character.backstory ? `<p>${nl(character.backstory)}</p>` : ''}`) : ''}${buildObsidianCalloutPreview('Traits & Factions', 'info', `${listToHtml(buildTraitLines(data))}${listToHtml(buildGroupLines(data))}`)}${buildObsidianCalloutPreview('Relations & Places', 'example', `${listToHtml(buildRelationshipLines(data))}${listToHtml(buildLocationLines(data))}`)}${buildObsidianCalloutPreview('Inventory & Timeline', 'note', `${listToHtml(buildItemLines(data))}${listToHtml(buildEventLines(data))}`)}${data.character.customFields && Object.keys(data.character.customFields).length > 0 ? buildObsidianCalloutPreview('Additional Details', 'quote', listToHtml(buildCustomFieldLines(data))) : ''}<div class="cs-footer">Generated by Storyteller Suite - ${new Date().toLocaleDateString()}</div></div>`;
    },

    buildNoteContent(data, portraitPath) {
        return buildCalloutSheetMarkdown(data, portraitPath);
    },
};

const fieldJournalTemplate: BuiltInSheetTemplate = {
    id: 'field-journal',
    name: 'Field Journal',
    description: 'Plain markdown headings, tables, and lists for maximum theme compatibility.',

    getExportCSS() {
        return `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#22170f;padding:32px 16px}.sts-cs-journal{max-width:820px;margin:0 auto;background:#fffdf7;border:1px solid #d9d1c4;border-radius:10px;padding:36px}.sts-cs-journal h1{font-size:2.4rem;line-height:1.05;margin-bottom:18px}.sts-cs-journal h2{font-size:1.15rem;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #ddd2c0}.sts-cs-journal p,.sts-cs-journal li,.sts-cs-journal td,.sts-cs-journal th{font-size:15px;line-height:1.75}.sts-cs-journal .cs-journal-portrait{margin-bottom:18px}.sts-cs-journal .cs-journal-portrait img{display:block;width:220px;max-width:100%;border-radius:8px;border:1px solid #d9d1c4}.sts-cs-journal table{width:100%;border-collapse:collapse;margin-bottom:8px}.sts-cs-journal td,.sts-cs-journal th{padding:8px 10px;border-top:1px solid #e7dfd3;text-align:left}.sts-cs-journal tr:first-child td,.sts-cs-journal tr:first-child th{border-top:none}.sts-cs-journal ul{padding-left:1.25rem;display:grid;gap:6px}.sts-cs-journal .cs-footer{margin-top:24px;padding-top:12px;border-top:1px solid #d9d1c4;color:#7c6d59;font-size:12px;text-align:right}`;
    },

    getScopedCSS() {
        return `.sts-cs-journal{max-width:820px;margin:0 auto}.sts-cs-journal h1{font-size:2.4rem;line-height:1.05;margin-bottom:18px}.sts-cs-journal h2{font-size:1.15rem;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--background-modifier-border)}.sts-cs-journal p,.sts-cs-journal li,.sts-cs-journal td,.sts-cs-journal th{line-height:1.75}.sts-cs-journal .cs-journal-portrait{margin-bottom:18px}.sts-cs-journal .cs-journal-portrait img{display:block;width:220px;max-width:100%;border-radius:8px;border:1px solid var(--background-modifier-border)}.sts-cs-journal table{width:100%;border-collapse:collapse;margin-bottom:8px}.sts-cs-journal td,.sts-cs-journal th{padding:8px 10px;border-top:1px solid var(--background-modifier-border);text-align:left}.sts-cs-journal tr:first-child td,.sts-cs-journal tr:first-child th{border-top:none}.sts-cs-journal ul{padding-left:1.25rem;display:grid;gap:6px}.sts-cs-journal .cs-footer{margin-top:24px;padding-top:12px;border-top:1px solid var(--background-modifier-border);color:var(--text-muted);font-size:12px;text-align:right}`;
    },

    buildInnerHTML(data, esc, nl) {
        const { character, portraitDataUrl } = data;
        const portraitHTML = portraitDataUrl ? `<div class="cs-journal-portrait"><img src="${portraitDataUrl}" alt="${esc(character.name)}"></div>` : '';
        const snapshotRows = [...getIdentityRows(data), ...getDndDetailRows(data)].map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');
        const abilities = getAbilityRows(data).map(([label, value]) => `<tr><th>${label}</th><td>${esc(value)}</td></tr>`).join('');
        const listToHtml = (items: string[]) => `<ul>${items.map(item => `<li>${esc(item.replace(/^- /, ''))}</li>`).join('')}</ul>`;
        return `<div class="sts-cs-journal"><h1>${esc(character.name)}</h1>${portraitHTML}${snapshotRows ? `<h2>At a Glance</h2><table><tbody>${snapshotRows}</tbody></table>` : ''}<h2>Ability Scores</h2><table><tbody>${abilities}</tbody></table>${character.description ? `<h2>Description</h2><p>${nl(character.description)}</p>` : ''}${character.backstory ? `<h2>Backstory</h2><p>${nl(character.backstory)}</p>` : ''}<h2>Traits</h2>${listToHtml(buildTraitLines(data))}<h2>Relationships</h2>${listToHtml(buildRelationshipLines(data))}<h2>Groups &amp; Factions</h2>${listToHtml(buildGroupLines(data))}<h2>Known Locations</h2>${listToHtml(buildLocationLines(data))}<h2>Items</h2>${listToHtml(buildItemLines(data))}<h2>Timeline</h2>${listToHtml(buildEventLines(data))}${data.character.customFields && Object.keys(data.character.customFields).length > 0 ? `<h2>Additional Details</h2>${listToHtml(buildCustomFieldLines(data))}` : ''}<div class="cs-footer">Generated by Storyteller Suite - ${new Date().toLocaleDateString()}</div></div>`;
    },

    buildNoteContent(data, portraitPath) {
        return buildFieldJournalMarkdown(data, portraitPath);
    },
};


export const BUILT_IN_SHEET_TEMPLATES: BuiltInSheetTemplate[] = [
    classicTemplate,
    manuscriptTemplate,
    minimalTemplate,
    dossierTemplate,
    neonTemplate,
    dndTemplate,
    adventurerPanelTemplate,
    calloutSheetTemplate,
    fieldJournalTemplate,
];
