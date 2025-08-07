import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { EventModal } from './EventModal';
import { parseEventDate, toMillis, toDisplay } from '../utils/DateParsing';
// @ts-ignore: vis-timeline is bundled dependency
// Use any typing to avoid complex vis types clashing with TS config
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VisStandalone = require('vis-timeline/standalone');
const Timeline: any = VisStandalone.Timeline;
const DataSet: any = VisStandalone.DataSet;

export class TimelineModal extends Modal {
    plugin: StorytellerSuitePlugin;
    events: Event[];
    // Removed fallback list to keep timeline-only UI
    timelineContainer: HTMLElement;
    timeline: any;

    constructor(app: App, plugin: StorytellerSuitePlugin, events: Event[]) {
        super(app);
        this.plugin = plugin;
        // Ensure events are sorted (main.ts listEvents should handle this)
        this.events = events;
        this.modalEl.addClass('storyteller-list-modal');
        this.modalEl.addClass('storyteller-timeline-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Timeline' });

        // Controls
        const controls = new Setting(contentEl)
            .setName('Controls')
            .addButton(b => b.setButtonText('Fit').onClick(() => { if (this.timeline) this.timeline.fit(); }))
            .addButton(b => b.setButtonText('Today').onClick(() => {
                if (this.timeline) {
                    const ref = this.plugin.getReferenceTodayDate();
                    this.timeline.moveTo(ref);
                }
            }));

        // (Search/filter removed per request)

        // Timeline container
        this.timelineContainer = contentEl.createDiv();
        this.timelineContainer.style.height = '380px';
        this.timelineContainer.style.marginBottom = '0.75rem';

        // No secondary list below the timeline

        // Build timeline now
        this.renderTimeline();
        // No secondary list render

        // Add New button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create new event')
                .setCta()
                .onClick(() => {
                    this.close(); // Close list modal
                    new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                        await this.plugin.saveEvent(eventData);
                        new Notice(`Event "${eventData.name}" created.`);
                        // Optionally reopen list modal or dashboard
                    }).open();
                }));
    }

    // List UI removed

    private renderTimeline() {
        const items = new DataSet();
        const referenceDate = this.plugin.getReferenceTodayDate();
        this.events.forEach((evt, idx) => {
            const parsed = evt.dateTime ? parseEventDate(evt.dateTime, { referenceDate }) : { error: 'empty' };
            const startMs = toMillis((parsed as any).start);
            const endMs = toMillis((parsed as any).end);
            if (startMs != null) {
                items.add({
                    id: idx,
                    content: evt.name,
                    start: new Date(startMs),
                    end: endMs != null ? new Date(endMs) : undefined,
                    title: evt.dateTime ? toDisplay((parsed as any).start) : '',
                    type: endMs != null ? 'range' : 'box'
                });
            }
        });

        // Minimal options
        const options = {
            stack: true,
            zoomKey: 'ctrlKey',
            multiselect: true,
            orientation: 'bottom' as const,
        };

        this.timeline = new Timeline(this.timelineContainer, items, options);
        // Place a custom current time bar based on reference date
        if (this.timeline && referenceDate) {
            try {
                // vis timeline API: setCurrentTime
                if (typeof this.timeline.setCurrentTime === 'function') {
                    this.timeline.setCurrentTime(referenceDate);
                }
            } catch {}
        }

        this.timeline.on('doubleClick', (props: any) => {
            if (props.item != null) {
                const idx = props.item as number;
                const event = this.events[idx];
                this.close();
                new EventModal(this.app, this.plugin, event, async (updatedData: Event) => {
                    await this.plugin.saveEvent(updatedData);
                    new Notice(`Event "${updatedData.name}" updated.`);
                }).open();
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
