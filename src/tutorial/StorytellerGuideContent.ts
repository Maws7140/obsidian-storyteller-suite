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
            <p><strong>Storyteller Suite ${version}</strong> closes gaps and brings the timeline closer to my final vision.</p>
        `,
        sections: [
            {
                title: 'Native Timeline Engine & Custom Calendars',
                bodyHtml: `
                    <ul>
                        <li><strong>Native Canvas Engine.</strong> The timeline rendering engine has been rewritten onto a custom canvas renderer.</li>
                        <li><strong>Custom Dating Systems.</strong> Open Settings → Storyteller Suite → Timeline → <em>Manage calendars</em>, or run <code>Storyteller: Manage custom calendars</code>, to create calendars with user-defined month lengths, years, and epoch rules.</li>
                        <li><strong>Inline Note Embedding.</strong> Embed interactive timeline blocks inside any note using a fenced <code>timeline</code> code block.</li>
                        <li><strong>Trackpad Pinch Zoom & Canvas Export.</strong> Pinch to zoom on laptop trackpads and export the entire timeline canvas.</li>
                        <li><strong>Smart Gantt Bars.</strong> Short Gantt events automatically render as readable chips with shading for duration.</li>
                    </ul>
                `
            },
            {
                title: 'Eras & Alternate Timelines',
                bodyHtml: `
                    <ul>
                        <li><strong>Scoped Eras & Tracks.</strong> Eras and tracks are scoped to their parent story notes.</li>
                        <li><strong>Era suggestions.</strong> In <em>Manage timeline eras & periods</em>, choose <em>Detect from event gaps</em> to have Storyteller fill editable era ranges from unusually large gaps between dated events. Existing eras are never overwritten.</li>
                        <li><strong>Markdown frontmatter.</strong> Timeline notes accept <code>entityType: era</code>, <code>entityType: branch</code>, or <code>entityType: fork</code>. Era notes can include an optional <code>abbreviation</code>.</li>
                        <li><strong>Branch History Inheritance.</strong> Alternate timeline branches inherit historical events up to their divergence point.</li>
                    </ul>
                `
            },
            {
                title: 'Fixes & Stability',
                bodyHtml: `
                    <ul>
                        <li><strong>Story Switching.</strong> Changing active stories reloads open timeline views and resets tracks, branches, and filters.</li>
                        <li><strong>Scroll & Arrow Fixes.</strong> Dependency arrows stay anchored while scrolling, and event markers align to calendar days.</li>
                        <li><strong>Per-Project Custom Folders.</strong> Custom folder templates with <code>{storyName}</code>, <code>{storySlug}</code>, or <code>{storyId}</code> resolve per active story to prevent path collisions.</li>
                        <li><strong>Modal Customization.</strong> Modal fields can be toggled on or off per entity type in settings, with default custom frontmatter fields.</li>
                        <li><strong>Compile Step Scrolling.</strong> The compile tab layout scrolls to display all workflow steps.</li>
                        <li><strong>Item Owners and Quantities.</strong> Plot items support multiple current owners and quantity tracking.</li>
                        <li><strong>Template Variable Creation.</strong> Variable creation in templates is easier, with support for note-based templates and default template assignments.</li>
                    </ul>
                `
            },
            {
                title: 'Development Status & Next Steps',
                bodyHtml: `
                    <p>Apologies for the delay between updates due to recent life changes and work starting on a new plugin project.</p>
                    <p>The next release will likely be the final beta update. It will include full project exporting, allowing you to export your entire story and vault data beyond timeline images.</p>
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
