import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
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
// @ts-ignore: timeline-arrows bundled dependency
import Arrow from '../vendor/timeline-arrows.js';

export class TimelineModal extends Modal {
    plugin: StorytellerSuitePlugin;
    events: Event[];
    // Removed fallback list to keep timeline-only UI
    timelineContainer: HTMLElement;
    timeline: any;
    legendEl?: HTMLElement;
    detailsEl?: HTMLElement;

    // UI state
    private groupMode: 'none' | 'location' | 'group' | 'character' = 'none';
    private stackEnabled = true;
    private density = 50; // 0-100 influences item margin
    private editModeEnabled = false;
    private viewMode: 'timeline' | 'gantt' = 'timeline';
    private defaultGanttDuration = 1; // days - default duration for events without end date in Gantt view
    
    // Filter state
    private filters = {
        characters: new Set<string>(),
        locations: new Set<string>(),
        groups: new Set<string>(),
        milestonesOnly: false
    };
    private filterPanelVisible = false;
    
    // Dependency arrow rendering
    private dependencyArrows: any; // timeline-arrows instance

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
        this.defaultGanttDuration = plugin.settings.ganttDefaultDuration ?? 1;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('timeline') });

        // Controls toolbar (grouping, presets, density, edit mode, filters)
        const controls = new Setting(contentEl)
            .setName('')
            .setClass('storyteller-timeline-toolbar')
            .addDropdown(dd => {
                dd.addOption('none', 'No grouping');
                dd.addOption('location', 'By location');
                dd.addOption('group', 'By group');
                dd.addOption('character', 'By character');
                dd.setValue(this.groupMode);
                dd.onChange(value => {
                    this.groupMode = (value as any);
                    this.renderTimeline();
                });
                return dd;
            })
            .addButton(b => {
                b.setButtonText(this.viewMode === 'gantt' ? 'Gantt' : 'Timeline')
                    .setIcon(this.viewMode === 'gantt' ? 'bar-chart-2' : 'clock')
                    .setTooltip('Switch between Timeline and Gantt chart views')
                    .onClick(() => {
                        this.viewMode = this.viewMode === 'timeline' ? 'gantt' : 'timeline';
                        b.setButtonText(this.viewMode === 'gantt' ? 'Gantt' : 'Timeline');
                        b.setIcon(this.viewMode === 'gantt' ? 'bar-chart-2' : 'clock');
                        this.renderTimeline();
                        new Notice(`Switched to ${this.viewMode === 'gantt' ? 'Gantt' : 'Timeline'} view`);
                    });
                return b;
            })
            .addButton(b => b.setButtonText(t('fit') || 'Fit').onClick(() => { if (this.timeline) this.timeline.fit(); }))
            .addButton(b => b.setButtonText(t('decade') || 'Decade').onClick(() => this.zoomPresetYears(10)))
            .addButton(b => b.setButtonText(t('century') || 'Century').onClick(() => this.zoomPresetYears(100)))
            .addButton(b => b.setButtonText(t('today') || 'Today').onClick(() => {
                if (this.timeline) {
                    const ref = this.plugin.getReferenceTodayDate();
                    this.timeline.moveTo(ref);
                }
            }))
            .addToggle(t => t.setTooltip('Stack items').setValue(this.stackEnabled).onChange(v => { this.stackEnabled = v; this.renderTimeline(); }))
            .addButton(b => {
                b.setTooltip('Edit mode (drag to reschedule)')
                    .setIcon(this.editModeEnabled ? 'pencil' : 'lock')
                    .onClick(() => {
                        this.editModeEnabled = !this.editModeEnabled;
                        b.setIcon(this.editModeEnabled ? 'pencil' : 'lock');
                        this.renderTimeline();
                        if (this.editModeEnabled) {
                            this.timelineContainer.addClass('timeline-edit-mode');
                            new Notice('Edit mode enabled - drag events to reschedule');
                        } else {
                            this.timelineContainer.removeClass('timeline-edit-mode');
                            new Notice('Edit mode disabled');
                        }
                    });
                return b;
            })
            .addButton(b => b.setButtonText(t('copyRange') || 'Copy range').onClick(() => this.copyVisibleRange()));

        // Filter panel
        const filterPanelContainer = contentEl.createDiv('storyteller-filter-panel-container');
        const filterToggleBtn = new ButtonComponent(filterPanelContainer)
            .setButtonText('Filters')
            .setIcon('filter')
            .onClick(() => {
                this.filterPanelVisible = !this.filterPanelVisible;
                filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';
            });
        
        const filterPanel = filterPanelContainer.createDiv('storyteller-filter-panel');
        filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';
        
        // Milestones only toggle
        new Setting(filterPanel)
            .setName('Milestones Only')
            .setDesc('Show only milestone events')
            .addToggle(toggle => toggle
                .setValue(this.filters.milestonesOnly)
                .onChange(value => {
                    this.filters.milestonesOnly = value;
                    this.renderTimeline();
                }));
        
        // Character filter
        new Setting(filterPanel)
            .setName('Filter by Character')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select character...');
                const allCharacters = new Set<string>();
                this.events.forEach(e => {
                    if (e.characters) e.characters.forEach(c => allCharacters.add(c));
                });
                Array.from(allCharacters).sort().forEach(char => {
                    dropdown.addOption(char, char);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.characters.has(value)) {
                        this.filters.characters.add(value);
                        this.renderFilterChips(filterChips);
                        this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Location filter
        new Setting(filterPanel)
            .setName('Filter by Location')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select location...');
                const allLocations = new Set<string>();
                this.events.forEach(e => {
                    if (e.location) allLocations.add(e.location);
                });
                Array.from(allLocations).sort().forEach(loc => {
                    dropdown.addOption(loc, loc);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.locations.has(value)) {
                        this.filters.locations.add(value);
                        this.renderFilterChips(filterChips);
                        this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Group filter
        new Setting(filterPanel)
            .setName('Filter by Group')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select group...');
                const groups = this.plugin.getGroups();
                groups.forEach(g => {
                    dropdown.addOption(g.id, g.name);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.groups.has(value)) {
                        this.filters.groups.add(value);
                        this.renderFilterChips(filterChips);
                        this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Clear all filters button
        new Setting(filterPanel)
            .addButton(button => button
                .setButtonText('Clear All Filters')
                .onClick(() => {
                    this.filters.characters.clear();
                    this.filters.locations.clear();
                    this.filters.groups.clear();
                    this.filters.milestonesOnly = false;
                    this.renderFilterChips(filterChips);
                    this.renderTimeline();
                }));
        
        // Active filter chips
        const filterChips = contentEl.createDiv('storyteller-filter-chips');
        this.renderFilterChips(filterChips);

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
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createNewEvent'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                            await this.plugin.saveEvent(eventData);
                            new Notice(t('created', t('event'), eventData.name));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });
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
        // In Gantt mode, use larger margins for better bar visibility
        const baseMargin = this.viewMode === 'gantt' ? 15 : 4;
        const itemMargin = baseMargin + Math.round(this.density / 6);
        const dayMs = 24 * 60 * 60 * 1000;
        const yearMs = 365.25 * dayMs;
        const options: any = {
            stack: this.stackEnabled,
            stackSubgroups: true,
            margin: { item: itemMargin, axis: 20 },
            // Enable natural wheel zoom without modifier key and bound the range sensibly
            zoomable: true,
            zoomMin: dayMs,              // do not zoom in past ~1 day
            zoomMax: 1000 * yearMs,      // up to ~1000 years
            multiselect: true,
            orientation: 'bottom' as const,
            // Progress bar template - renders as overlay on timeline items
            visibleFrameTemplate: function(item: any) {
                if (!item.progress || item.progress === 0) return '';
                return `<div class="timeline-progress" style="width:${item.progress}%"></div>`;
            }
        };

        // Add explicit item height in Gantt mode for consistent bar sizing
        if (this.viewMode === 'gantt') {
            options.height = '40px';
        }
        
        // Enable drag-and-drop editing when in edit mode
        if (this.editModeEnabled) {
            options.editable = {
                updateTime: true,
                updateGroup: true,
                remove: false,
                add: false
            };
        }

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

        // Handle drag-and-drop changes when in edit mode
        this.timeline.on('changed', async (props: any) => {
            if (!this.editModeEnabled) return;
            if (!props || !props.items || props.items.length === 0) return;
            
            // Get the updated item from the timeline
            const updatedItemId = props.items[0];
            const updatedItem = items.get(updatedItemId);
            if (!updatedItem) return;
            
            // Get the corresponding event
            const event = this.events[updatedItemId];
            if (!event) return;
            
            // Update the event's dateTime based on the new start/end
            const startDate = new Date(updatedItem.start);
            const endDate = updatedItem.end ? new Date(updatedItem.end) : null;
            
            // Format as ISO string for consistency
            if (endDate) {
                event.dateTime = `${startDate.toISOString()} to ${endDate.toISOString()}`;
            } else {
                event.dateTime = startDate.toISOString();
            }
            
            // Save the updated event
            try {
                await this.plugin.saveEvent(event);
                new Notice(`Event "${event.name}" rescheduled`);
            } catch (error) {
                console.error('Error saving event after drag:', error);
                new Notice('Error saving event changes');
            }
        });

        this.timeline.on('doubleClick', (props: any) => {
            if (props.item != null) {
                const idx = props.item as number;
                const event = this.events[idx];
                this.close();
                new EventModal(this.app, this.plugin, event, async (updatedData: Event) => {
                    await this.plugin.saveEvent(updatedData);
                    new Notice(t('updated', t('event'), updatedData.name));
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
            if (evt.dateTime) {
                const parsed = parseEventDate(evt.dateTime);
                const displayDate = parsed.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : evt.dateTime;
                left.createSpan({ text: `  ΓÇó ${displayDate}` });
            }
            const right = row.createDiv('storyteller-timeline-detail-actions');
            new ButtonComponent(right).setButtonText(t('editBtn')).onClick(() => {
                this.close();
                new EventModal(this.app, this.plugin, evt, async (updated: Event) => {
                    await this.plugin.saveEvent(updated);
                    new Notice(t('updated', t('event'), updated.name));
                }).open();
            });
            new ButtonComponent(right).setButtonText(t('openNoteBtn')).onClick(() => {
                if (!evt.filePath) return;
                const file = this.app.vault.getAbstractFileByPath(evt.filePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(false).openFile(file);
                    this.close();
                }
            });
        });
        
        // Render dependency arrows if in Gantt mode using timeline-arrows library
        if (this.viewMode === 'gantt') {
            // Clear existing arrows
            if (this.dependencyArrows) {
                try {
                    this.dependencyArrows.removeArrows();
                } catch {}
            }
            
            // Build arrow specifications
            const arrowSpecs = this.buildDependencyArrows();
            
            // Create arrows with timeline-arrows library
            if (arrowSpecs.length > 0) {
                const arrowOptions = {
                    followRelationships: true,
                    color: '#666',
                    strokeWidth: 2,
                    hideWhenItemsNotVisible: true
                };
                this.dependencyArrows = new Arrow(this.timeline, arrowSpecs, arrowOptions);
            }
        }
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
            } else if (this.groupMode === 'character') {
                // Collect unique characters from events
                const uniqueCharacters = new Set<string>();
                this.events.forEach(e => {
                    if (e.characters && e.characters.length > 0) {
                        e.characters.forEach(c => uniqueCharacters.add(c));
                    }
                });
                Array.from(uniqueCharacters).forEach((char, i) => {
                    const color = this.palette[i % this.palette.length];
                    keyToColor.set(char, color);
                    keyToLabel.set(char, char);
                    groupsDS.add({ id: char, content: char });
                    legend.push({ key: char, label: char, color });
                });
                // Fallback for events without characters
                const noneColor = '#64748B';
                keyToColor.set('__unassigned__', noneColor);
                keyToLabel.set('__unassigned__', 'No character');
                groupsDS.add({ id: '__unassigned__', content: 'No character' });
                legend.push({ key: '__unassigned__', label: 'No character', color: noneColor });
            }
        }

        this.events.forEach((evt, idx) => {
            const parsed = evt.dateTime ? parseEventDate(evt.dateTime, { referenceDate }) : { error: 'empty' } as any;
            const startMs = toMillis(parsed.start);
            const endMs = toMillis(parsed.end);
            if (startMs == null) {
                // Log BCE parsing issues for debugging
                if (parsed.error === 'unparsed' && evt.dateTime && /\b\d+\s*(?:BC|bce|BCE|B\.C\.|b\.c\.|b\.c\.e\.)\b/i.test(evt.dateTime)) {
                    console.warn(`Failed to parse BCE date: ${evt.dateTime} for event: ${evt.name}`);
                }
                return;
            }

            // Apply filters
            if (this.filters.milestonesOnly && !evt.isMilestone) {
                return; // Skip non-milestones when filter is active
            }
            
            if (this.filters.characters.size > 0) {
                const hasMatchingChar = evt.characters?.some(c => this.filters.characters.has(c));
                if (!hasMatchingChar) return;
            }
            
            if (this.filters.locations.size > 0) {
                if (!evt.location || !this.filters.locations.has(evt.location)) return;
            }
            
            if (this.filters.groups.size > 0) {
                const hasMatchingGroup = evt.groups?.some(g => this.filters.groups.has(g));
                if (!hasMatchingGroup) return;
            }

            // Determine grouping key and color
            let groupId: string | undefined;
            let color: string | undefined;
            if (this.groupMode === 'group') {
                groupId = (evt.groups && evt.groups.length > 0) ? evt.groups[0] : '__ungrouped__';
                color = keyToColor.get(groupId!);
            } else if (this.groupMode === 'location') {
                groupId = evt.location || 'Unspecified';
                color = keyToColor.get(groupId);
            } else if (this.groupMode === 'character') {
                groupId = (evt.characters && evt.characters.length > 0) ? evt.characters[0] : '__unassigned__';
                color = keyToColor.get(groupId);
            }

            const approx = !!parsed.approximate;
            const isMilestone = !!evt.isMilestone;
            
            // Gantt mode: ensure all events have duration (but not milestones)
            let displayEndMs = endMs;
            if (this.viewMode === 'gantt' && displayEndMs == null && !isMilestone) {
                // Add default duration for events without end date
                const durationMs = this.defaultGanttDuration * 24 * 60 * 60 * 1000;
                displayEndMs = startMs + durationMs;
            }
            
            // Build CSS classes
            const classes: string[] = [];
            if (approx) classes.push('is-approx');
            if (isMilestone) classes.push('timeline-milestone');
            if (this.viewMode === 'gantt' && !isMilestone) classes.push('gantt-bar');
            
            // Build style with milestone overrides
            let style = color ? `background-color:${this.hexWithAlpha(color, 0.18)};border-color:${color};` : '';
            
            // Milestone icon prefix
            const content = isMilestone ? 'Γ¡É ' + evt.name : evt.name;

            // Determine item type based on view mode - milestones always use 'box' to avoid showing range bars
            let itemType: string;
            if (isMilestone) {
                itemType = 'box'; // Milestones always render as boxes to show content without range bars
            } else if (this.viewMode === 'gantt') {
                itemType = 'range'; // Non-milestone events use range bars in Gantt mode
            } else {
                itemType = displayEndMs != null ? 'range' : 'box'; // Timeline mode: use original logic
            }

            items.add({
                id: idx,
                content: content, // Clean text only - progress bar handled by visibleFrameTemplate
                start: new Date(startMs),
                end: displayEndMs != null ? new Date(displayEndMs) : undefined,
                title: this.makeTooltip(evt, parsed),
                type: itemType,
                className: classes.length > 0 ? classes.join(' ') : undefined,
                group: groupId,
                style,
                progress: evt.progress // Pass as data property for visibleFrameTemplate
            });
        });

        return { items, groups: groupsDS, legend };
    }

    private makeTooltip(evt: Event, parsed: any): string {
        const parts: string[] = [evt.name];
        const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
        if (dt) parts.push(dt);
        if (evt.location) parts.push(`@ ${evt.location}`);
        if (evt.description) parts.push(evt.description.length > 120 ? evt.description.slice(0, 120) + 'ΓÇª' : evt.description);
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
            const text = `Timeline range: ${new Date(range.start).toISOString()} ΓÇö ${new Date(range.end).toISOString()}`;
            navigator.clipboard?.writeText(text);
            new Notice(t('copyRange'));
        } catch (e) {
            // Fallback
            new Notice('Could not copy timeline range'); // Keep this as is - it's an error message
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

    private renderFilterChips(container: HTMLElement) {
        container.empty();
        const hasActiveFilters = this.filters.characters.size > 0 || 
                                 this.filters.locations.size > 0 || 
                                 this.filters.groups.size > 0 || 
                                 this.filters.milestonesOnly;
        
        if (!hasActiveFilters) return;
        
        // Character chips
        this.filters.characters.forEach(char => {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Character: ${char}` });
            const removeBtn = chip.createSpan({ text: '├ù', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.characters.delete(char);
                this.renderFilterChips(container);
                this.renderTimeline();
            };
        });
        
        // Location chips
        this.filters.locations.forEach(loc => {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Location: ${loc}` });
            const removeBtn = chip.createSpan({ text: '├ù', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.locations.delete(loc);
                this.renderFilterChips(container);
                this.renderTimeline();
            };
        });
        
        // Group chips
        this.filters.groups.forEach(groupId => {
            const group = this.plugin.getGroups().find(g => g.id === groupId);
            const groupName = group ? group.name : groupId;
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Group: ${groupName}` });
            const removeBtn = chip.createSpan({ text: '├ù', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.groups.delete(groupId);
                this.renderFilterChips(container);
                this.renderTimeline();
            };
        });
        
        // Milestones chip
        if (this.filters.milestonesOnly) {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: 'Milestones Only' });
            const removeBtn = chip.createSpan({ text: '├ù', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.milestonesOnly = false;
                this.renderFilterChips(container);
                this.renderTimeline();
            };
        }
    }

    private buildDependencyArrows(): Array<{id: string, id_item_1: number, id_item_2: number, title?: string}> {
        const arrows: Array<{id: string, id_item_1: number, id_item_2: number, title?: string}> = [];
        let arrowId = 0;
        
        this.events.forEach((evt, targetIdx) => {
            if (!evt.dependencies || evt.dependencies.length === 0) return;
            
            evt.dependencies.forEach(depName => {
                const sourceIdx = this.events.findIndex(e => e.name === depName);
                if (sourceIdx === -1) return;
                
                arrows.push({
                    id: `arrow_${arrowId++}`,
                    id_item_1: sourceIdx,
                    id_item_2: targetIdx,
                    title: `${depName} ΓåÆ ${evt.name}`
                });
            });
        });
        
        return arrows;
    }

    onClose() {
        this.contentEl.empty();
        if (this.dependencyArrows) {
            try {
                this.dependencyArrows.removeArrows();
            } catch {}
        }
    }
}
