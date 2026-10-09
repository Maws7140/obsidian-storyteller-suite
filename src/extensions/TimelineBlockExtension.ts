// A live timeline inside an ordinary note, from a ```timeline fenced block.
//
// This is what sharing a timeline looks like without a sharing backend: the
// block renders wherever markdown renders, which includes Obsidian Publish and
// anyone who opens the vault. It is deliberately read only, since a note
// embedding somebody's story should not be able to reschedule it.

import { MarkdownRenderChild } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { TimelineRenderer } from '../utils/NativeTimelineRenderer';
import { parseTimelineBlock } from '../utils/TimelineBlockConfig';
import type { TimelineBlockConfig } from '../utils/TimelineBlockConfig';
import { parseEventDate, toMillis } from '../utils/DateParsing';

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
        const renderer = new TimelineRenderer(this.containerEl, this.plugin, {
            groupMode: this.config.groupMode,
            ganttMode: this.config.ganttMode,
            timelineLayout: this.config.orientation === 'vertical' ? 'timeline' : 'chronology',
            timelineOrientation: this.config.orientation,
            showEras: this.config.showEras,
            showPresence: this.config.showPresence,
            narrativeOrder: this.config.narrativeOrder,
            stackEnabled: this.config.stackEnabled,
            // An embedded timeline is a picture of a story, not a place to edit
            // one. Dragging an event here would rewrite a note the reader may
            // not even know they have open.
            editMode: false,
            getReferenceDate: () => this.plugin.getReferenceTodayDate()
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

    /** Called by the plugin when timeline data or the story's today has moved. */
    refreshTimeline(): void {
        if (!this.renderer) return;
        if (!this.ready) { this.stale = true; return; }
        void this.renderer.refresh();
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
        const host = el.createDiv('sts-timeline-block');
        host.setCssStyles({ height: `${config.height}px`, position: 'relative' });
        ctx.addChild(new TimelineBlockChild(host, plugin, config));
    });
}
