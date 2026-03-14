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
                        <li>Compile workflows can use built-in steps or your own custom JavaScript steps.</li>
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
            <p>This release is a real feature update, not just a cleanup pass. The biggest changes are the new campaign and DnD workflow, new character sheet presets, the rebuilt timeline and Gantt experience, and a stronger map-board flow.</p>
        `,
        sections: [
            {
                title: 'Timeline and Gantt redesign',
                bodyHtml: `
                    <ul>
                        <li>Timeline and Gantt got a broad visual and interaction pass so they read better and behave better under heavier planning setups.</li>
                        <li>Dependency arrows, grouped lanes, progress bars, milestone filtering, and safer dependency tracking all landed in the redesign.</li>
                        <li>Scroll behavior, grouped rendering, and larger-event handling are much cleaner than before.</li>
                    </ul>
                `
            },
            {
                title: 'New campaign and DnD mode',
                bodyHtml: `
                    <ul>
                        <li>Campaign play is now a first-class feature area with sessions, party state, inventory, conditions, HP tracking, flags, revealed lore, and faction standing.</li>
                        <li>Scenes can drive tabletop-style play through branches, encounter blocks, item requirements, compendium reveals, and faction gates.</li>
                        <li>Items now support richer campaign effects like HP changes, conditions, lore reveals, scene travel, and faction-standing changes.</li>
                        <li>Campaign commands now cover opening sessions, resuming sessions, logging play, opening the active session note, and starting directly from the current scene.</li>
                    </ul>
                `
            },
            {
                title: 'Map boards and SVG support',
                bodyHtml: `
                    <ul>
                        <li>Image maps now pull more weight in live play through campaign boards, location inspection, item pickup, and scene travel.</li>
                        <li>Board pickups persist correctly across sessions, and dense marker interaction is more reliable than before.</li>
                        <li>SVG maps now support direct overlay mode for lighter files and rasterized tiled mode for larger boards.</li>
                    </ul>
                `
            },
            {
                title: 'Writing workflows',
                bodyHtml: `
                    <ul>
                        <li>Saved workflows, custom compile steps, and better draft workflow selection.</li>
                        <li>Writing and compile flows are more flexible for draft-based output and custom manuscript pipelines.</li>
                        <li>Books, chapters, scenes, and draft order all fit together more cleanly in the current writing flow.</li>
                    </ul>
                `
            },
            {
                title: 'Entity system cleanup',
                bodyHtml: `
                    <ul>
                        <li>Group notes, wiki-link friendly properties, and better sync between notes and plugin state.</li>
                        <li>Shared custom-field handling across entity modals.</li>
                        <li>Entity rename and cleanup behavior is more reliable across linked notes, maps, and reverse refs.</li>
                    </ul>
                `
            },
            {
                title: 'New character sheet presets',
                bodyHtml: `
                    <ul>
                        <li>Character sheets now have a stronger feature set with new DnD-themed presets and note-native markdown or callout layouts.</li>
                        <li>You can choose between styled showcase sheets and lighter presets that fit normal Obsidian notes better.</li>
                        <li>This includes a more tabletop-facing preset direction instead of only generic sheet output.</li>
                    </ul>
                `
            },
            {
                title: 'Gallery and onboarding',
                bodyHtml: `
                    <ul>
                        <li>Multi-image upload support in gallery flows.</li>
                        <li>Gallery folder sync is stricter about discovering managed images and nested managed folders.</li>
                        <li>The plugin now includes a proper first-run guide and an in-app update-highlights popup.</li>
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
    introEl.innerHTML = guide.introHtml;

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
            bodyEl.innerHTML = section.bodyHtml;
            return;
        }

        const sectionEl = sectionsEl.createDiv('storyteller-guide-section storyteller-guide-section--static');
        sectionEl.createEl('h3', {
            text: section.title,
            cls: 'storyteller-guide-section-heading'
        });
        const bodyEl = sectionEl.createDiv('storyteller-guide-section-body');
        bodyEl.innerHTML = section.bodyHtml;
    });
}
