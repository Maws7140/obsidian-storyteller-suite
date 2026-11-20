// A live timeline inside an ordinary note, from a ```timeline fenced block.
//
// This is what sharing a timeline looks like without a sharing backend: the
// block renders wherever markdown renders, which includes Obsidian Publish and
// anyone who opens the vault. Existing events are deliberately read only, since
// a note embedding somebody's story should not be able to reschedule it. Adding
// a new event goes through the ordinary event form, so that much is offered.

import { MarkdownRenderChild, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { TimelineRenderer } from '../utils/NativeTimelineRenderer';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import { parseTimelineBlock } from '../utils/TimelineBlockConfig';
import type { TimelineBlockConfig } from '../utils/TimelineBlockConfig';
import { parseEventDate, toMillis } from '../utils/DateParsing';
import { openNewEventModal } from '../utils/OpenNewEventModal';
import { todayTextProblem } from '../calendar/ReferenceToday';

/**
 * Owns one block's renderer for as long as the note is on screen.
 *
 * The renderer holds a resize observer and an animation frame, so it has to be
 * torn down when the note closes. Obsidian only tells us that through the
 * render child, which is why this exists at all.
 */
class TimelineBlockChild extends MarkdownRenderChild {
    private renderer: TimelineRenderer | null = null;
    private unregisterLive: (() => void) | null = null;
    /** True once the first load has finished, so a refresh cannot race the initial build. */
    private ready = false;
    /** A refresh arrived before the first load finished; run it once the load is done. */
    private stale = false;

    constructor(
        containerEl: HTMLElement,
        private readonly plugin: StorytellerSuitePlugin,
        private readonly config: TimelineBlockConfig
    ) {
        super(containerEl);
    }

    onload(): void {
        const registry = new CalendarRegistry(this.plugin);
        const wanted = this.config.theme?.toLowerCase();
        const theme = wanted
            ? registry.listThemes().find(candidate => candidate.id.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted)
            : undefined;
        // Same rule as unknown settings: say so rather than quietly drawing the
        // story's theme or today and letting the writer think theirs applied.
        if (wanted && !theme) this.showProblem(`Unknown timeline theme "${this.config.theme}". Using the story's theme.`);
        const todayProblem = this.config.today ? todayTextProblem(this.config.today, registry.getActiveCalendar()) : null;
        if (todayProblem) this.showProblem(`${todayProblem} Using the story's today.`);
        const renderer = new TimelineRenderer(this.containerEl, this.plugin, {
            themeId: theme?.id,
            groupMode: this.config.groupMode,
            ganttMode: this.config.ganttMode,
            timelineLayout: this.config.orientation === 'vertical' ? 'timeline' : 'chronology',
            timelineOrientation: this.config.orientation,
            showEras: this.config.showEras,
            showPresence: this.config.showPresence,
            narrativeOrder: this.config.narrativeOrder,
            iconMode: this.config.iconMode,
            stackEnabled: this.config.stackEnabled,
            // An embedded timeline is a picture of a story, not a place to edit
            // one. Dragging an event here would rewrite a note the reader may
            // not even know they have open.
            editMode: false,
            getReferenceDate: () => this.plugin.getReferenceTodayDate(this.config.today)
        });
        this.renderer = renderer;
        this.unregisterLive = this.plugin.registerLiveTimeline(this);
        void (async () => {
            await renderer.initialize();
            if (this.renderer !== renderer) return;
            this.ready = true;
            if (this.stale) { this.stale = false; void renderer.refresh(); }
            renderer.applyFilters(this.config.filters);
            const start = this.config.from ? toMillis(parseEventDate(this.config.from).start) : null;
            const end = this.config.to ? toMillis(parseEventDate(this.config.to).start) : null;
            // Both ends or neither. Half a range would silently pin one edge to
            // whatever the fit happened to choose for the other.
            if (start != null && end != null) renderer.setVisibleRange(new Date(start), new Date(end));
        })();
    }

    /** A line above the block naming a setting it could not use. */
    private showProblem(text: string): void {
        const parent = this.containerEl.parentElement;
        if (!parent) return;
        const problem = parent.createDiv({ cls: 'sts-timeline-block-errors', text });
        parent.insertBefore(problem, this.containerEl);
    }

    /** Called by the plugin when timeline data or the story's today has moved. */
    refreshTimeline(): void {
        if (!this.renderer) return;
        if (!this.ready) { this.stale = true; return; }
        void this.renderer.refresh();
    }

    /** Open the event form dated to the middle of this block's view, then redraw the block. */
    openNewEvent(): void {
        const date = this.ready ? this.renderer?.getCenterDateText() : undefined;
        void openNewEventModal(this.plugin, {
            seed: date ? { dateTime: date } : undefined,
            onCreated: () => this.refreshTimeline()
        });
    }

    onunload(): void {
        this.unregisterLive?.();
        this.unregisterLive = null;
        this.ready = false;
        this.renderer?.destroy();
        this.renderer = null;
    }
}

export function registerTimelineBlockProcessor(plugin: StorytellerSuitePlugin): void {
    plugin.registerMarkdownCodeBlockProcessor('timeline', (source, el, ctx) => {
        const config = parseTimelineBlock(source);
        if (config.errors.length) {
            const problems = el.createDiv('sts-timeline-block-errors');
            config.errors.forEach(message => problems.createDiv({ text: message }));
        }
        const controls = el.createDiv('sts-timeline-block-controls');
        const host = el.createDiv('sts-timeline-block');
        host.setCssStyles({ height: `${config.height}px`, position: 'relative' });
        const child = new TimelineBlockChild(host, plugin, config);
        ctx.addChild(child);
        const newEvent = controls.createEl('button', {
            cls: 'storyteller-toolbar-btn-labelled',
            attr: { 'aria-label': 'Create a new event', 'title': 'Create a new event' }
        });
        setIcon(newEvent.createSpan('storyteller-toolbar-btn-icon'), 'calendar-plus');
        newEvent.createSpan({ cls: 'storyteller-toolbar-btn-text', text: 'New event' });
        newEvent.addEventListener('click', () => child.openNewEvent());
    });
}
