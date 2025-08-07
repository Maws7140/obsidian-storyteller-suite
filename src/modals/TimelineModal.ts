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
    legendEl?: HTMLElement;
    detailsEl?: HTMLElement;

    // UI state
    private groupMode: 'none' | 'location' | 'group' = 'none';
    private stackEnabled = true;
    private density = 50; // 0-100 influences item margin

    private palette = [
        '#7C3AED', '#2563EB', '#059669', '#CA8A04', '#DC2626', '#EA580C', '#0EA5E9', '#22C55E', '#D946EF', '#F59E0B'
    ];

    constructor(app: App, plugin: StorytellerSuitePlugin, events: Event[]) {
        super(app);
        this.plugin = plugin;
        // Ensure events are sorted (main.ts listEvents should handle this)
        this.events = events;
        this.modalEl.addClass('storyteller-list-modal');
        this.modalEl.addClass('storyteller-timeline-modal');
        // Initialize from defaults
        this.groupMode = (plugin.settings.defaultTimelineGroupMode || 'none') as any;
        this.stackEnabled = plugin.settings.defaultTimelineStack ?? true;
        this.density = plugin.settings.defaultTimelineDensity ?? 50;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Timeline' });

        // Controls toolbar (grouping, presets, density)
        const controls = new Setting(contentEl)
            .setName('')
            .setClass('storyteller-timeline-toolbar')
            .addDropdown(dd => {
                dd.addOption('none', 'No grouping');
                dd.addOption('location', 'By location');
                dd.addOption('group', 'By group');
                dd.setValue(this.groupMode);
                dd.onChange(value => {
                    this.groupMode = (value as any);
                    this.renderTimeline();
                });
                return dd;
            })
            .addButton(b => b.setButtonText('Fit').onClick(() => { if (this.timeline) this.timeline.fit(); }))
            .addButton(b => b.setButtonText('Decade').onClick(() => this.zoomPresetYears(10)))
            .addButton(b => b.setButtonText('Century').onClick(() => this.zoomPresetYears(100)))
            .addButton(b => b.setButtonText('Today').onClick(() => {
                if (this.timeline) {
                    const ref = this.plugin.getReferenceTodayDate();
                    this.timeline.moveTo(ref);
                }
            }))
            .addToggle(t => t.setTooltip('Stack items').setValue(this.stackEnabled).onChange(v => { this.stackEnabled = v; this.renderTimeline(); }))
          //  .addSlider(sl => sl
          //      .setLimits(0, 100, 5)
          //      .setValue(this.density)
          //      .setDynamicTooltip()
          //      .onChange(v => { this.density = v; this.renderTimeline(); }))
            .addButton(b => b.setButtonText('Copy range').onClick(() => this.copyVisibleRange()));

        // (Search/filter removed per request)

        // Timeline container
        this.timelineContainer = contentEl.createDiv();
        this.timelineContainer.style.height = '380px';
        this.timelineContainer.style.marginBottom = '0.75rem';

        // Legend container
        this.legendEl = contentEl.createDiv('storyteller-timeline-legend');
        // Selection details container
        this.detailsEl = contentEl.createDiv('storyteller-timeline-details');

        // Build timeline now
        this.renderTimeline();
        // Apply default zoom preset
        const preset = this.plugin.settings.defaultTimelineZoomPreset || 'none';
        if (preset === 'fit' && this.timeline) this.timeline.fit();
        else if (preset === 'decade') this.zoomPresetYears(10);
        else if (preset === 'century') this.zoomPresetYears(100);
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
        // Clear existing timeline if present
        if (this.timeline) {
            try { this.timeline.destroy(); } catch {}
            this.timeline = null;
        }

        const referenceDate = this.plugin.getReferenceTodayDate();
        const build = this.buildDatasets(referenceDate);
        const items = build.items;
        const groups = build.groups;

        // Update legend
        if (this.legendEl) {
            this.legendEl.empty();
            const showLegend = this.plugin.settings.showTimelineLegend ?? true;
            if (showLegend && build.legend && build.legend.length > 0) {
                build.legend.forEach(entry => {
                    const chip = this.legendEl!.createDiv('storyteller-legend-chip');
                    const swatch = chip.createSpan('storyteller-legend-swatch');
                    swatch.setAttr('style', `background:${entry.color};border-color:${entry.color}`);
                    chip.createSpan({ text: entry.label });
                });
            }
        }

        // Options
        const itemMargin = 4 + Math.round(this.density / 6); // 4..20 approx
        const dayMs = 24 * 60 * 60 * 1000;
        const yearMs = 365.25 * dayMs;
        const options = {
            stack: this.stackEnabled,
            stackSubgroups: true,
            margin: { item: itemMargin, axis: 20 },
            // Enable natural wheel zoom without modifier key and bound the range sensibly
            zoomable: true,
            zoomMin: dayMs,              // do not zoom in past ~1 day
            zoomMax: 1000 * yearMs,      // up to ~1000 years
            multiselect: true,
            orientation: 'bottom' as const,
        };

        this.timeline = groups ? new Timeline(this.timelineContainer, items, groups, options)
                               : new Timeline(this.timelineContainer, items, options);
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

        // Selection details panel
        this.timeline.on('select', (props: any) => {
            if (!this.detailsEl) return;
            this.detailsEl.empty();
            const id = (props.items && props.items[0]) as number | undefined;
            if (id == null) return;
            const evt = this.events[id];
            const row = this.detailsEl.createDiv('storyteller-timeline-detail-row');
            const left = row.createDiv('storyteller-timeline-detail-info');
            left.createEl('strong', { text: evt.name });
            if (evt.location) left.createSpan({ text: `  @ ${evt.location}` });
            if (evt.dateTime) left.createSpan({ text: `  • ${evt.dateTime}` });
            const right = row.createDiv('storyteller-timeline-detail-actions');
            new ButtonComponent(right).setButtonText('Edit').onClick(() => {
                this.close();
                new EventModal(this.app, this.plugin, evt, async (updated: Event) => {
                    await this.plugin.saveEvent(updated);
                    new Notice(`Event "${updated.name}" updated.`);
                }).open();
            });
            new ButtonComponent(right).setButtonText('Open note').onClick(() => {
                if (!evt.filePath) return;
                const file = this.app.vault.getAbstractFileByPath(evt.filePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(false).openFile(file);
                    this.close();
                }
            });
        });
    }

    private buildDatasets(referenceDate: Date): { items: any; groups?: any; legend: Array<{ key: string; label: string; color: string }>; } {
        const items = new DataSet();
        const legend: Array<{ key: string; label: string; color: string }> = [];
        let groupsDS: any | undefined;

        // Build grouping map and colors if grouping
        let keyToColor = new Map<string, string>();
        let keyToLabel = new Map<string, string>();

        if (this.groupMode !== 'none') {
            groupsDS = new DataSet();
            if (this.groupMode === 'group') {
                const groups = this.plugin.getGroups();
                groups.forEach((g, i) => {
                    const color = g.color || this.palette[i % this.palette.length];
                    keyToColor.set(g.id, color);
                    keyToLabel.set(g.id, g.name);
                    groupsDS.add({ id: g.id, content: g.name });
                    legend.push({ key: g.id, label: g.name, color });
                });
                // Fallback group for items without any group
                const noneColor = '#64748B';
                keyToColor.set('__ungrouped__', noneColor);
                keyToLabel.set('__ungrouped__', 'Ungrouped');
                groupsDS.add({ id: '__ungrouped__', content: 'Ungrouped' });
                legend.push({ key: '__ungrouped__', label: 'Ungrouped', color: noneColor });
            } else if (this.groupMode === 'location') {
                // Collect unique locations from events
                const uniqueLocations = Array.from(new Set(this.events.map(e => e.location || 'Unspecified')));
                uniqueLocations.forEach((loc, i) => {
                    const id = loc || 'Unspecified';
                    const color = this.palette[i % this.palette.length];
                    keyToColor.set(id, color);
                    keyToLabel.set(id, loc || 'Unspecified');
                    groupsDS.add({ id, content: loc || 'Unspecified' });
                    legend.push({ key: id, label: loc || 'Unspecified', color });
                });
            }
        }

        this.events.forEach((evt, idx) => {
            const parsed = evt.dateTime ? parseEventDate(evt.dateTime, { referenceDate }) : { error: 'empty' } as any;
            const startMs = toMillis(parsed.start);
            const endMs = toMillis(parsed.end);
            if (startMs == null) return;

            // Determine grouping key and color
            let groupId: string | undefined;
            let color: string | undefined;
            if (this.groupMode === 'group') {
                groupId = (evt.groups && evt.groups.length > 0) ? evt.groups[0] : '__ungrouped__';
                color = keyToColor.get(groupId!);
            } else if (this.groupMode === 'location') {
                groupId = evt.location || 'Unspecified';
                color = keyToColor.get(groupId);
            }

            const approx = !!parsed.approximate;
            const style = color ? `background-color:${this.hexWithAlpha(color, 0.18)};border-color:${color};` : '';

            items.add({
                id: idx,
                content: evt.name,
                start: new Date(startMs),
                end: endMs != null ? new Date(endMs) : undefined,
                title: this.makeTooltip(evt, parsed),
                type: endMs != null ? 'range' : 'box',
                className: approx ? 'is-approx' : undefined,
                group: groupId,
                style,
            });
        });

        return { items, groups: groupsDS, legend };
    }

    private makeTooltip(evt: Event, parsed: any): string {
        const parts: string[] = [evt.name];
        const dt = parsed?.start ? toDisplay(parsed.start) : (evt.dateTime || '');
        if (dt) parts.push(dt);
        if (evt.location) parts.push(`@ ${evt.location}`);
        if (evt.description) parts.push(evt.description.length > 120 ? evt.description.slice(0, 120) + '…' : evt.description);
        return parts.filter(Boolean).join(' \n');
    }

    private zoomPresetYears(years: number) {
        if (!this.timeline) return;
        const center = this.plugin.getReferenceTodayDate().getTime();
        const half = (years * 365.25 * 24 * 60 * 60 * 1000) / 2;
        this.timeline.setWindow(new Date(center - half), new Date(center + half));
    }

    private copyVisibleRange() {
        if (!this.timeline) return;
        try {
            const range = this.timeline.getWindow();
            const text = `Timeline range: ${new Date(range.start).toISOString()} — ${new Date(range.end).toISOString()}`;
            navigator.clipboard?.writeText(text);
            new Notice('Timeline range copied');
        } catch (e) {
            // Fallback
            new Notice('Could not copy timeline range');
        }
    }

    private hexWithAlpha(hex: string, alpha: number): string {
        // Accept #RRGGBB
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return hex;
        const r = parseInt(m[1], 16);
        const g = parseInt(m[2], 16);
        const b = parseInt(m[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    onClose() {
        this.contentEl.empty();
    }
}
