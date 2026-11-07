/** A screenshot shown under a guide section. Loaded from the web, so it is skipped quietly offline. */
export interface StorytellerGuideImage {
    src: string;
    alt: string;
    caption?: string;
}

export interface StorytellerGuideSection {
    title: string;
    bodyHtml: string;
    images?: StorytellerGuideImage[];
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
            <p><strong>Storyteller Suite ${version}</strong> is the biggest update yet. The timeline is rebuilt from the ground up, you can design your own calendars, maps get a drawing layer, campaigns run from your story's map, and every entity modal can be shaped around the fields you actually use.</p>
            <p>Your notes are not rewritten when you update.</p>
        `,
        sections: [
            {
                title: 'Coming from 1.8',
                bodyHtml: `
                    <ul>
                        <li><strong>Timeline data moves into notes.</strong> The first time you open the timeline, a dialog offers to move your eras, tracks and branches out of the plugin settings and into your story folders. <code>Storyteller: Undo timeline notes migration</code> puts them back.</li>
                        <li><strong>Scrolling and zooming.</strong> The mouse wheel now scrolls the timeline and Shift + wheel zooms. Trackpad pinch zooms too.</li>
                        <li><strong>Map markers.</strong> Entity markers on maps are now Map Ink tokens, in the same places as before.</li>
                        <li><strong>Settings on phones and tablets.</strong> Storyteller's settings open again on Android and iPad, as a list of sections you tap into.</li>
                    </ul>
                `
            },
            {
                title: 'Timeline',
                bodyHtml: `
                    <ul>
                        <li><strong>A new timeline engine.</strong> Chronology (horizontal or vertical), Gantt and a full-page Calendar view, with drag-to-edit and image export of the whole timeline.</li>
                        <li><strong>Your own calendars.</strong> Settings → Storyteller Suite → Timeline → <em>Manage calendars</em> lets you design a calendar with its own months, leap years, epochs and holidays.</li>
                        <li><strong>Themes.</strong> Pick a theme from the toolbar, or <em>Edit theme…</em> to change colours, fonts, sizes, connectors and a background image with a live preview. Share themes as files and bring them in with <em>Import from file…</em>.</li>
                        <li><strong>Icons.</strong> Give events and scenes an icon, show cover images, or switch on <em>Minimal</em> to draw events as icon nodes.</li>
                        <li><strong>Today per story.</strong> Each story can have its own "today": <em>Set today for this story…</em> in the zoom menu.</li>
                        <li><strong>Timelines in your notes.</strong> <code>Storyteller: Insert timeline block</code> embeds a live timeline in any note.</li>
                        <li><strong>Eras, tracks and branches</strong> belong to their story, branches carry the history they split from, and <em>Detect from event gaps</em> suggests eras for you.</li>
                    </ul>
                `
            },
            {
                title: 'Writing',
                bodyHtml: `
                    <ul>
                        <li><strong>Scene synopses.</strong> The Writing list shows each scene's synopsis instead of its first line, Board cards show it too, and the search looks inside it.</li>
                        <li>Scenes that are not in a chapter yet now show up in the list under <em>Unassigned scenes</em>.</li>
                    </ul>
                `,
                images: [
                    { src: 'https://i.ibb.co/CK23v8B4/851fd3ed9ec5.png', alt: 'Story board writing view', caption: 'Organise scenes on the story board while the Writing dashboard stays in sync.' },
                ]
            },
            {
                title: 'Campaign play',
                bodyHtml: `
                    <ul>
                        <li><strong>Run sessions from your map.</strong> <code>Storyteller: Open campaign view</code> opens on your story's map, with the party, current scene, combat and session log close at hand.</li>
                        <li><strong>Player screen.</strong> <code>Storyteller: Open player screen</code> shows your players the map, the party and votes, and hides the places they have not found yet.</li>
                        <li><strong>Session logs in Partylog.</strong> A quick entry line writes the log for you, with session header, end-of-session and interlude dialogs, and import and export.</li>
                        <li><strong>Campaign state.</strong> Clocks, threads, party resources, loot, factions and advancement are tracked as you play, and encounters can carry choices and flags.</li>
                        <li><strong>Campaigns on the timeline.</strong> A campaign can record onto its own track of the timeline, in in-world time.</li>
                        <li><strong>World Log.</strong> <code>Storyteller: New world log</code> keeps worldbuilding decisions, open questions and tensions in one place.</li>
                    </ul>
                `,
                images: [
                    { src: 'https://i.ibb.co/Fb3QVNgd/a086488103f6.png', alt: 'Campaign session view', caption: 'Run scenes, track the party, share inventory and keep a live session log in one place.' },
                    { src: 'https://i.ibb.co/cSB4h426/9a6e271d6622.png', alt: 'Scene graph and campaign tools', caption: 'Move through branching scenes on the scene graph and jump straight into play.' },
                ]
            },
            {
                title: 'Maps',
                bodyHtml: `
                    <ul>
                        <li><strong>Map Ink.</strong> <em>Draw on map</em> adds stamps, lines, areas, shapes, text and hand-inked brushes, in layers with a legend.</li>
                        <li><strong>Overlays and export.</strong> GeoJSON and GPX overlays, and PNG export of image maps.</li>
                        <li><strong>Child maps.</strong> Location markers offer <em>Create child location</em> and <em>Zoom to child map</em>.</li>
                    </ul>
                `,
                images: [
                    { src: 'https://i.ibb.co/5hcxV2rv/04c0d160200a.png', alt: 'Fantasy world map with entity markers', caption: 'Place characters, locations, events and items straight onto your maps.' },
                    { src: 'https://i.ibb.co/0yz8jPQ0/2b8aae06203f.png', alt: 'Map hierarchy from world to room', caption: 'Build a map hierarchy from world to city to room, with breadcrumbs to find your way back.' },
                ]
            },
            {
                title: 'Characters, places and your own fields',
                bodyHtml: `
                    <ul>
                        <li><strong>Your own fields.</strong> Settings → Storyteller Suite → Modals: add typed fields per entity type, and switch off any field or section you do not use.</li>
                        <li><strong>Tidier modals.</strong> Every entity modal is laid out in collapsible sections.</li>
                        <li><strong>Bring in notes you already have.</strong> <code>Storyteller: Import existing notes as entities</code> turns them into characters, locations, events and more, without deleting anything.</li>
                        <li><strong>Templates</strong> can be edited, imported from files, and adjusted before you apply them.</li>
                        <li><strong>Network graph.</strong> It follows the story's theme, colours by type, group, location or culture, has a legend that matches the screen, and zooms out to fit any layout.</li>
                    </ul>
                `,
                images: [
                    { src: 'https://i.ibb.co/qFCQwY2h/073c396b6682.png', alt: 'Groups and the network graph', caption: 'Groups are notes of their own and connect into the network graph with the rest of your story.' },
                ]
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
            renderGuideImages(bodyEl, section.images);
            return;
        }

        const sectionEl = sectionsEl.createDiv('storyteller-guide-section storyteller-guide-section--static');
        sectionEl.createEl('h3', {
            text: section.title,
            cls: 'storyteller-guide-section-heading'
        });
        const bodyEl = sectionEl.createDiv('storyteller-guide-section-body');
        renderGuideHtml(bodyEl, section.bodyHtml);
        renderGuideImages(bodyEl, section.images);
    });
}

function renderGuideImages(containerEl: HTMLElement, images: StorytellerGuideImage[] | undefined): void {
    for (const image of images ?? []) {
        if (!/^https:\/\//.test(image.src)) continue;
        const figure = containerEl.createEl('figure', { cls: 'storyteller-guide-figure' });
        const img = figure.createEl('img', { attr: { src: image.src, alt: image.alt, loading: 'lazy' } });
        // Offline, or the host is down: drop the figure rather than show a broken image.
        img.addEventListener('error', () => figure.remove());
        if (image.caption) figure.createEl('figcaption', { text: image.caption });
    }
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
    const allowedTags = new Set(['p', 'strong', 'em', 'code', 'ol', 'ul', 'li']);
    if (!allowedTags.has(tagName)) {
        Array.from(node.childNodes).forEach((child) => appendGuideNode(parentEl, child));
        return;
    }

    const el = parentEl.createEl(tagName as keyof HTMLElementTagNameMap);
    Array.from(node.childNodes).forEach((child) => appendGuideNode(el, child));
}
