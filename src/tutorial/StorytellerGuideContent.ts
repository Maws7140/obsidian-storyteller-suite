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
            <p>The settings pane now renders correctly in Obsidian 1.13&rsquo;s separate Settings window. Plus: templates can link to entities you already have, and gallery uploads pick their folder from a dropdown.</p>
        `,
        sections: [
            {
                title: 'Fixed',
                bodyHtml: `
                    <ul>
                        <li>Settings no longer appear blank in Obsidian 1.13+, which opens Settings in its own window. The layout is now applied directly so it renders no matter which window hosts it.</li>
                    </ul>
                `
            },
            {
                title: 'New',
                bodyHtml: `
                    <ul>
                        <li>Templates can link the entities they create to <strong>existing</strong> vault entities &mdash; locations, magic systems, groups, cultures, and more &mdash; chosen when the template is applied. Define the links in the new <strong>Links</strong> tab of the template editor; the apply dialog then prompts for the existing entities to attach. No duplicate entities are created.</li>
                        <li>The gallery upload folder is now chosen from a dropdown of your vault folders instead of a free-text field.</li>
                    </ul>
                `
            },
            {
                title: 'Fixes',
                bodyHtml: `
                    <ul>
                        <li>Plugin settings no longer render blank under newer Obsidian settings windows: the layout uses a non-collapsing height, missing settings collections are guarded before rendering, and a failing section shows a message instead of blanking the whole pane.</li>
                    </ul>
                `
            },
            {
                title: 'Also included',
                bodyHtml: `
                    <ul>
                        <li>Ongoing template, timeline, and map editor improvements, plus the earlier UI-style isolation so Storyteller&rsquo;s styles stay scoped to its own views.</li>
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
