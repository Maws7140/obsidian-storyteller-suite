export interface StorytellerGuideSection {
    title: string;
    bodyHtml: string;
}

export interface StorytellerGuideDocument {
    title: string;
    introHtml: string;
    sections: StorytellerGuideSection[];
}

type RenderGuideOptions = {
    collapsible?: boolean;
    openFirstCount?: number;
    hideTitle?: boolean;
};

export function getGettingStartedGuide(version: string): StorytellerGuideDocument {
    return {
        title: 'Getting started',
        introHtml: `
            <p><strong>Storyteller Suite ${version}</strong> keeps your story data in markdown notes while giving you a full writing, timeline, map, worldbuilding, and campaign workflow inside Obsidian.</p>
            <p>Use this guide to set up your vault cleanly and understand where the big systems fit together.</p>
        `,
        sections: [
            {
                title: 'Quick start checklist',
                bodyHtml: `
                    <ol>
                        <li>Open the dashboard from the ribbon or with <code>Storyteller: Open dashboard</code>.</li>
                        <li>Create a story, or enable custom folders first if you already have a manual structure.</li>
                        <li>Create a few core entities: characters, locations, events, scenes, and at least one map.</li>
                        <li>Open Writing to manage chapters, scenes, drafts, and compile workflows.</li>
                        <li>Open Timeline to plan events in Timeline or Gantt mode.</li>
                        <li>Open Campaign view if you want session play, inventory, map boards, and branch-driven DnD style flow.</li>
                    </ol>
                `
            },
            {
                title: 'Stories, books, and folders',
                bodyHtml: `
                    <ul>
                        <li><strong>Story</strong> is the top-level project the plugin switches between.</li>
                        <li><strong>Book</strong> is an internal subdivision inside a story.</li>
                        <li>Chapters belong to books directly.</li>
                        <li>Scenes inherit book placement from their parent chapter.</li>
                        <li>If you use <code>{bookName}</code> in chapter or scene folder paths, files are split by book. If you do not, books still exist logically but files stay flat inside the story.</li>
                        <li>Custom folders are an advanced manual setup. The plugin reads the custom paths you configure. It does not merge old default paths into them.</li>
                    </ul>
                `
            },
            {
                title: 'Writing, drafts, and compile',
                bodyHtml: `
                    <ul>
                        <li>Use the Writing view to manage books, chapters, scenes, and draft order.</li>
                        <li>Drafts control scene order and compile inclusion.</li>
                        <li>Compile workflows can use configurable built-in steps for cleanup, formatting, and export.</li>
                        <li>Books are for structure. Drafts are for output.</li>
                    </ul>
                `
            },
            {
                title: 'Timeline and Gantt',
                bodyHtml: `
                    <ul>
                        <li>Events support milestones, progress, dependencies, flashbacks, and flashforwards.</li>
                        <li>Timeline mode is best for chronology and forked planning.</li>
                        <li>Gantt mode is best for duration, overlap, dependency arrows, and grouped planning lanes.</li>
                        <li>You can group by character, location, or group to understand who is where and when.</li>
                    </ul>
                `
            },
            {
                title: 'Maps and campaign boards',
                bodyHtml: `
                    <ul>
                        <li>Maps can be real-world maps or image-based boards.</li>
                        <li>Location pins, entity markers, and parent-child map navigation all work from the same map system.</li>
                        <li>Campaign boards reuse image maps for DnD-style play, location inspection, item pickup, and scene travel.</li>
                        <li>SVG boards are supported in two modes: direct overlay for lighter files and rasterized tiling for larger files.</li>
                    </ul>
                `
            },
            {
                title: 'Campaign play and DnD features',
                bodyHtml: `
                    <ul>
                        <li>Campaign sessions track party members, inventory, conditions, HP, flags, revealed lore, and faction standing.</li>
                        <li>Scenes can contain branches and encounter blocks with item, flag, lore, and faction requirements.</li>
                        <li>Plot items can trigger advanced effects like HP changes, condition changes, scene travel, lore reveals, and group standing changes.</li>
                        <li>Compendium entries work as the knowledge layer. Groups work as the faction-pressure layer.</li>
                    </ul>
                `
            },
            {
                title: 'Gallery, references, and character sheets',
                bodyHtml: `
                    <ul>
                        <li>The gallery supports single and multi-image import and live folder sync from the managed upload folder.</li>
                        <li>References, locations, characters, and other entities can link to gallery assets.</li>
                        <li>Character sheets now include both styled presets and markdown or callout-based presets for note-native output.</li>
                    </ul>
                `
            },
            {
                title: 'Templates and worldbuilding',
                bodyHtml: `
                    <ul>
                        <li>Templates can be built-in, note-based, or custom.</li>
                        <li>Groups, cultures, economies, magic systems, references, and compendium entries are all note-backed entities.</li>
                        <li>Group notes sync into plugin state, so manual note editing does not make those entities disappear from the UI.</li>
                    </ul>
                `
            },
            {
                title: 'Useful commands',
                bodyHtml: `
                    <ul>
                        <li><code>Storyteller: Open dashboard</code></li>
                        <li><code>Storyteller: Open campaign view</code></li>
                        <li><code>Storyteller: Open timeline panel</code></li>
                        <li><code>Storyteller: Create new story</code></li>
                        <li><code>Storyteller: Compile manuscript</code></li>
                        <li><code>Storyteller: Generate character sheet</code></li>
                    </ul>
                `
            }
        ]
    };
}

export function getWhatsNewGuide(version: string): StorytellerGuideDocument {
    return {
        title: `What is new in ${version}`,
        introHtml: `
            <p><strong>Storyteller Suite ${version}</strong> rebuilds the timeline, turns campaign play into a virtual tabletop, adds a drawing layer to maps, and lets you shape every entity modal around your own fields.</p>
            <p>Your notes are not rewritten on upgrade. The full list of changes is in the changelog on GitHub.</p>
        `,
        sections: [
            {
                title: 'Coming from 1.8',
                bodyHtml: `
                    <ul>
                        <li><strong>Timeline data moves into notes.</strong> The first time you open the timeline, a dialog offers to move your eras, tracks and branches out of the plugin settings and into your story folders. <code>Storyteller: Undo timeline notes migration</code> reverses it.</li>
                        <li><strong>Wheel and zoom.</strong> The mouse wheel now scrolls the timeline and Shift + wheel zooms. Trackpad pinch also zooms.</li>
                        <li><strong>Map pins.</strong> Entity markers on maps are now Map Ink tokens. Existing markers stay where they were.</li>
                    </ul>
                `
            },
            {
                title: 'Timeline',
                bodyHtml: `
                    <ul>
                        <li><strong>New engine.</strong> Chronology (horizontal or vertical), Gantt and a full-pane Calendar view, drawn natively, with drag editing and image export of the whole canvas.</li>
                        <li><strong>Custom calendars.</strong> Open Settings → Storyteller Suite → Timeline → <em>Manage calendars</em>, or run <code>Storyteller: Manage custom calendars</code>, to design a calendar with its own months, leap rules, epochs and holidays.</li>
                        <li><strong>Themes.</strong> Pick a theme from the <em>Theme</em> field in the toolbar, or choose <em>Edit theme…</em> to change colours, the lane palette, font, sizes, connectors and a background image with a live preview. Every colour is also a <code>--sts-timeline-*</code> CSS variable.</li>
                        <li><strong>Icons and Minimal.</strong> Give events and scenes an icon, show cover images, and switch on <em>Minimal</em> to draw events as icon nodes.</li>
                        <li><strong>Today per story.</strong> Set a story's own "today" from the zoom menu with <em>Set today for this story…</em>.</li>
                        <li><strong>Timeline blocks.</strong> Run <code>Storyteller: Insert timeline block</code> to embed a live timeline in any note.</li>
                        <li><strong>Eras, tracks and branches.</strong> Scoped to their story. Branches inherit the history they forked from, and <em>Detect from event gaps</em> in <em>Manage timeline eras & periods</em> suggests eras for you.</li>
                    </ul>
                `
            },
            {
                title: 'Campaign play',
                bodyHtml: `
                    <ul>
                        <li><strong>The map is the board.</strong> <code>Storyteller: Open campaign view</code> puts the whole map on the stage, with the party, scene, combat and log in floating panels.</li>
                        <li><strong>Player screen.</strong> <code>Storyteller: Open player screen</code> shows your players the board, the party and votes, with fog of war over what they have not seen.</li>
                        <li><strong>Partylog.</strong> The quick entry bar writes your session log in Partylog notation, with session header, end-of-session and interlude dialogs, and import and export of sessions.</li>
                        <li><strong>Campaign state.</strong> Clocks, threads, party resources, loot, factions and advancement are tracked during play, and encounter rolls can carry choices and flags.</li>
                        <li><strong>Campaigns on the timeline.</strong> A campaign can record onto its own track or fork of the main timeline, in in-world time.</li>
                        <li><strong>World Log.</strong> <code>Storyteller: New world log</code> starts a Lorelog log for worldbuilding decisions, open questions and tensions.</li>
                    </ul>
                `
            },
            {
                title: 'Maps',
                bodyHtml: `
                    <ul>
                        <li><strong>Map Ink.</strong> Press <em>Draw on map</em> in the map toolbar to add stamps, lines, areas, shapes, text and hand-inked brushes, organised in layers with a legend.</li>
                        <li><strong>Overlays and export.</strong> Add GeoJSON or GPX overlays, and export image maps as PNG from the map menu.</li>
                        <li><strong>Child maps.</strong> Location markers offer <em>Create child location</em> and <em>Zoom to child map</em>.</li>
                    </ul>
                `
            },
            {
                title: 'Entities, templates and import',
                bodyHtml: `
                    <ul>
                        <li><strong>Sectioned modals.</strong> Every entity modal is laid out in collapsible sections.</li>
                        <li><strong>Defined fields.</strong> Settings → Storyteller Suite → Modals lets you add typed fields per entity type, and switch off any field or section you do not use.</li>
                        <li><strong>Import existing notes.</strong> <code>Storyteller: Import existing notes as entities</code> turns notes you already have into characters, locations, events and more.</li>
                        <li><strong>Templates.</strong> Edit templates, import them from <code>.json</code> files, and choose what to create before applying one.</li>
                        <li><strong>Network graph.</strong> The graph follows the story's timeline theme, can colour nodes by type, group, location or culture, and has a legend that follows what is on screen.</li>
                    </ul>
                `
            }
        ]
    };
}

export function renderGuideDocument(
    containerEl: HTMLElement,
    guide: StorytellerGuideDocument,
    options: RenderGuideOptions = {}
): void {
    const {
        collapsible = true,
        openFirstCount = 1,
        hideTitle = false,
    } = options;

    if (!hideTitle) {
        containerEl.createEl('h2', { text: guide.title, cls: 'storyteller-guide-title' });
    }

    const introEl = containerEl.createDiv('storyteller-guide-intro');
    renderGuideHtml(introEl, guide.introHtml);

    const sectionsEl = containerEl.createDiv('storyteller-guide-sections');
    guide.sections.forEach((section, index) => {
        if (collapsible) {
            const detailsEl = sectionsEl.createEl('details', { cls: 'storyteller-guide-section' });
            if (index < openFirstCount) {
                detailsEl.setAttr('open', 'open');
            }

            detailsEl.createEl('summary', {
                text: section.title,
                cls: 'storyteller-guide-section-summary'
            });

            const bodyEl = detailsEl.createDiv('storyteller-guide-section-body');
            renderGuideHtml(bodyEl, section.bodyHtml);
            return;
        }

        const sectionEl = sectionsEl.createDiv('storyteller-guide-section storyteller-guide-section--static');
        sectionEl.createEl('h3', {
            text: section.title,
            cls: 'storyteller-guide-section-heading'
        });
        const bodyEl = sectionEl.createDiv('storyteller-guide-section-body');
        renderGuideHtml(bodyEl, section.bodyHtml);
    });
}

function renderGuideHtml(containerEl: HTMLElement, html: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<section>${html}</section>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return;

    Array.from(root.childNodes).forEach((node) => {
        appendGuideNode(containerEl, node);
    });
}

function appendGuideNode(parentEl: HTMLElement, node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text?.trim()) {
            parentEl.appendText(text);
        }
        return;
    }

    if (!(node.instanceOf(Element))) return;

    const tagName = node.tagName.toLowerCase();
    const allowedTags = new Set(['p', 'strong', 'code', 'ol', 'ul', 'li']);
    if (!allowedTags.has(tagName)) {
        Array.from(node.childNodes).forEach((child) => appendGuideNode(parentEl, child));
        return;
    }

    const el = parentEl.createEl(tagName as keyof HTMLElementTagNameMap);
    Array.from(node.childNodes).forEach((child) => appendGuideNode(el, child));
}
