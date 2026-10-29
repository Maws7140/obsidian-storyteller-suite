import { App, Modal, Notice, Setting } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import {
    OBSIDIAN_NATIVE_THEME,
    encodeShareCode,
    makeThemeDocument,
    sanitizeTheme,
    type TimelineBackgroundFit,
    type TimelineBackgroundPosition,
    type TimelineTheme,
    type TimelineThemeColors,
} from '../calendar/TimelineDocuments';
import { TimelineRenderer, forgetTimelineImage } from '../utils/NativeTimelineRenderer';
import {
    DEFAULT_TIMELINE_METRICS,
    DEFAULT_TIMELINE_PALETTE,
    MAX_TIMELINE_PALETTE,
    TIMELINE_COLOR_ROLES,
    TIMELINE_LANE_COUNT_VARIABLE,
    joinColorAlpha,
    laneVariable,
    splitColorAlpha,
    type ColorWithAlpha,
    type TimelineColorRole,
} from '../utils/TimelineStyle';
import { ImageSuggestModal } from './GalleryModal';

type Done = () => void;

/** Colour roles in the groups the editor shows them in. */
const COLOR_GROUPS: Array<{ title: string; roles: TimelineColorRole[] }> = [
    { title: 'Canvas', roles: ['background', 'surface', 'sidebar', 'grid', 'gridStrong'] },
    { title: 'Text', roles: ['text', 'mutedText', 'accentText', 'onAccent'] },
    { title: 'Accents', roles: ['accent', 'connector', 'now', 'era', 'holiday', 'milestone', 'milestoneEdge', 'slot'] },
    { title: 'Signals', roles: ['conflictError', 'conflictWarning', 'flashback', 'flashforward'] },
];

/**
 * Open the editor on the theme the active story uses.
 *
 * A built-in theme cannot be changed in place, so editing one starts from a
 * copy that becomes the story's theme when saved. That keeps "Edit theme" a
 * single step from the timeline toolbar instead of a duplicate-then-find-it
 * detour through the manager.
 */
export function openActiveTimelineThemeEditor(app: App, plugin: StorytellerSuitePlugin, onSave?: Done): void {
    const registry = new CalendarRegistry(plugin);
    const active = registry.getActiveTheme();
    if (registry.isBuiltInTheme(active.id)) {
        new TimelineThemeEditorModal(app, plugin, duplicateTheme(active, registry.listThemes()), { activateOnSave: true, onSave }).open();
    } else {
        new TimelineThemeEditorModal(app, plugin, clone(active), { onSave }).open();
    }
}

/** The list of themes, mirroring the dating-system manager beside it in settings. */
export class TimelineThemeManagerModal extends Modal {
    private readonly registry: CalendarRegistry;

    constructor(app: App, private readonly plugin: StorytellerSuitePlugin, private readonly onChange?: Done) {
        super(app);
        this.registry = new CalendarRegistry(plugin);
    }

    onOpen(): void {
        this.modalEl.addClass('storyteller-modal-scroll');
        this.modalEl.setCssStyles({ width: 'min(760px, 92vw)' });
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Timeline themes' });
        contentEl.createEl('p', {
            text: 'Colours, lane palette, font, shapes and a background image for the timeline. Each story uses one theme.',
        });

        new Setting(contentEl)
            .setName('New theme')
            .setDesc('Start from the Obsidian native theme, which follows your Obsidian colours.')
            .addButton(button => button.setButtonText('Create').setCta().onClick(() => {
                const theme = duplicateTheme(OBSIDIAN_NATIVE_THEME, this.registry.listThemes());
                theme.name = 'New theme';
                this.openEditor(theme, true);
            }));

        const activeId = this.registry.getActiveTheme().id;
        for (const theme of this.registry.listThemes()) {
            const builtIn = this.registry.isBuiltInTheme(theme.id);
            const detail = [
                builtIn ? 'Built in' : 'Custom',
                theme.description || '',
                theme.id === activeId ? 'Active' : '',
            ].filter(Boolean).join(' · ');
            const row = new Setting(contentEl).setName(theme.name).setDesc(detail);
            if (theme.id !== activeId) {
                row.addButton(button => button.setButtonText('Use').onClick(() => { void (async () => {
                    await this.registry.setActiveTheme(theme.id);
                    this.onChange?.();
                    this.render();
                })(); }));
            }
            row.addExtraButton(button => button.setIcon('share-2').setTooltip('Copy share code').onClick(() => { void (async () => {
                await navigator.clipboard.writeText(encodeShareCode(makeThemeDocument(theme)));
                new Notice(`Share code for ${theme.name} copied`);
            })(); }));
            row.addExtraButton(button => button.setIcon('copy').setTooltip('Duplicate').onClick(() => {
                this.openEditor(duplicateTheme(theme, this.registry.listThemes()), false);
            }));
            if (!builtIn) {
                row.addExtraButton(button => button.setIcon('pencil').setTooltip('Edit').onClick(() => {
                    this.openEditor(clone(theme), false);
                }));
                row.addExtraButton(button => button.setIcon('trash-2').setTooltip('Delete').onClick(() => { void (async () => {
                    await this.registry.deleteTheme(theme.id);
                    this.onChange?.();
                    this.render();
                })(); }));
            }
        }
    }

    private openEditor(theme: TimelineTheme, activateOnSave: boolean): void {
        new TimelineThemeEditorModal(this.app, this.plugin, theme, {
            activateOnSave,
            onSave: () => {
                this.onChange?.();
                this.render();
            },
        }).open();
    }
}

/**
 * The theme designer.
 *
 * A live preview of the active story's timeline sits above the form and is
 * redrawn with the unsaved draft on every change, so a colour can be judged
 * where it will actually be used. Nothing touches open timelines until Save.
 */
export class TimelineThemeEditorModal extends Modal {
    private readonly registry: CalendarRegistry;
    private draft: TimelineTheme;
    private formEl!: HTMLElement;
    private preview: TimelineRenderer | null = null;
    private previewTimer: number | null = null;
    /** Reads the stylesheet defaults, so an inherited colour shows its real value. */
    private probeEl: HTMLElement | null = null;

    constructor(
        app: App,
        private readonly plugin: StorytellerSuitePlugin,
        theme: TimelineTheme,
        private readonly options: { activateOnSave?: boolean; onSave?: Done } = {},
    ) {
        super(app);
        this.registry = new CalendarRegistry(plugin);
        this.draft = clone(theme);
    }

    onOpen(): void {
        this.modalEl.addClass('storyteller-modal-scroll', 'storyteller-theme-editor-modal');
        this.modalEl.setCssStyles({ width: 'min(920px, 94vw)' });
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Timeline theme editor' });

        const previewEl = contentEl.createDiv('storyteller-theme-preview');
        previewEl.createDiv({ cls: 'storyteller-theme-preview-label', text: 'Preview of the active story' });
        const host = previewEl.createDiv('storyteller-theme-preview-canvas');
        this.probeEl = contentEl.createDiv('sts-native-timeline storyteller-theme-probe');
        this.preview = new TimelineRenderer(host, this.plugin, {
            theme: clone(this.draft),
            groupMode: this.plugin.settings.defaultTimelineGroupMode ?? 'location',
            showEras: true,
            editMode: false,
            dependencyArrowStyle: this.plugin.settings.ganttArrowStyle ?? 'solid',
        });
        void this.preview.initialize();

        this.formEl = contentEl.createDiv('storyteller-theme-form');
        this.render();
    }

    onClose(): void {
        if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
        this.preview?.destroy();
        this.preview = null;
        this.contentEl.empty();
    }

    /** Redraw the preview with the draft, at most every few frames while a picker is being dragged. */
    private changed(): void {
        if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
        this.previewTimer = window.setTimeout(() => {
            this.previewTimer = null;
            this.preview?.setTheme(sanitizeTheme(clone(this.draft)));
        }, 60);
    }

    private render(): void {
        const el = this.formEl;
        el.empty();

        this.section('Identity');
        new Setting(el).setName('Name').addText(text => text.setValue(this.draft.name).onChange(value => {
            this.draft.name = value;
        }));
        new Setting(el).setName('Description').addTextArea(text => {
            text.setValue(this.draft.description || '').onChange(value => { this.draft.description = value || undefined; });
            text.inputEl.rows = 2;
        });

        for (const group of COLOR_GROUPS) {
            this.section(`${group.title} colours`);
            group.roles.forEach(role => this.renderColor(role));
        }

        this.renderPalette();
        this.renderBackground();

        this.section('Typography');
        new Setting(el)
            .setName('Label font')
            .setDesc('A CSS font family for every label on the timeline. Leave blank to use the Obsidian interface font.')
            .addText(text => text
                .setPlaceholder('Georgia, serif')
                .setValue(this.draft.font || '')
                .onChange(value => { this.draft.font = value.trim() || undefined; this.changed(); }));

        this.section('Events');
        this.slider('Corner radius', 'Rounding of event chips and cards, in pixels.', 0, 16, 1,
            this.draft.event?.radius ?? DEFAULT_TIMELINE_METRICS.eventRadius,
            value => { (this.draft.event ||= {}).radius = value; });
        this.slider('Chip height', 'Height of an event chip at the default row density, in pixels.', 16, 48, 1,
            this.draft.event?.height ?? DEFAULT_TIMELINE_METRICS.eventHeight,
            value => { (this.draft.event ||= {}).height = value; });
        this.slider('Opacity', 'How solid events draw, in percent. Rumours and inherited events fade further from here.', 20, 100, 5,
            Math.round((this.draft.event?.opacity ?? DEFAULT_TIMELINE_METRICS.eventOpacity) * 100),
            value => { (this.draft.event ||= {}).opacity = value / 100; });

        this.section('Lanes');
        this.slider('Label width', 'Width of the lane name sidebar, in pixels.', 80, 400, 2,
            this.draft.lane?.labelWidth ?? DEFAULT_TIMELINE_METRICS.laneLabelWidth,
            value => { (this.draft.lane ||= {}).labelWidth = value; });
        this.slider('Minimum height', 'Smallest a lane may be, in pixels, even with a single row of events.', 20, 200, 2,
            this.draft.lane?.height ?? DEFAULT_TIMELINE_METRICS.laneMinHeight,
            value => { (this.draft.lane ||= {}).height = value; });
        this.slider('Gap', 'Space below the last row of events in a lane, in pixels.', 0, 40, 1,
            this.draft.lane?.gap ?? DEFAULT_TIMELINE_METRICS.laneGap,
            value => { (this.draft.lane ||= {}).gap = value; });

        this.section('Axis');
        this.slider('Label density', 'How tightly date labels pack along the axis. Higher fits more labels.', 0, 100, 5,
            this.draft.axis?.density ?? DEFAULT_TIMELINE_METRICS.axisDensity,
            value => { (this.draft.axis ||= {}).density = value; });
        new Setting(el).setName('Show calendar cycles').setDesc('Seasonal and named cycles from the dating system, as bands under the axis.')
            .addToggle(toggle => toggle.setValue(this.draft.axis?.showCycles !== false).onChange(value => {
                (this.draft.axis ||= {}).showCycles = value;
                this.changed();
            }));
        new Setting(el).setName('Show holidays').setDesc('Holidays from the dating system, as a band under the axis.')
            .addToggle(toggle => toggle.setValue(this.draft.axis?.showHolidays !== false).onChange(value => {
                (this.draft.axis ||= {}).showHolidays = value;
                this.changed();
            }));

        this.section('Connectors');
        this.slider('Line width', 'Thickness of dependency arrows and narrative links, in pixels.', 0.5, 6, 0.25,
            this.draft.connectors?.width ?? DEFAULT_TIMELINE_METRICS.connectorWidth,
            value => { (this.draft.connectors ||= {}).width = value; });
        new Setting(el).setName('Arrow style').setDesc('Use the setting follows the dependency arrow style chosen in timeline settings.')
            .addDropdown(dropdown => dropdown
                .addOption('', 'Use the setting')
                .addOption('solid', 'Solid')
                .addOption('dashed', 'Dashed')
                .addOption('dotted', 'Dotted')
                .setValue(this.draft.connectors?.dependencyStyle || '')
                .onChange(value => {
                    (this.draft.connectors ||= {}).dependencyStyle = (value || undefined) as 'solid' | 'dashed' | 'dotted' | undefined;
                    this.changed();
                }));

        this.section('Share');
        new Setting(el)
            .setName('Share code')
            .setDesc('Copy this theme as a code anyone can paste into the timeline import box in settings. A vault background image does not travel with it; an HTTPS image link does.')
            .addButton(button => button.setButtonText('Copy share code').onClick(() => { void (async () => {
                await navigator.clipboard.writeText(encodeShareCode(makeThemeDocument(sanitizeTheme(clone(this.draft)))));
                new Notice('Theme share code copied');
            })(); }))
            .addButton(button => button.setButtonText('Copy as JSON').onClick(() => { void (async () => {
                await navigator.clipboard.writeText(JSON.stringify(makeThemeDocument(sanitizeTheme(clone(this.draft))), null, 2));
                new Notice('Theme JSON copied. Save it as a .storytl.json file to share it.');
            })(); }));

        const actions = new Setting(el);
        actions.addButton(button => button.setButtonText('Save theme').setCta().onClick(() => { void this.save(); }));
        actions.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }

    private async save(): Promise<void> {
        if (!this.draft.name.trim()) {
            new Notice('Give the theme a name.');
            return;
        }
        try {
            const saved = await this.registry.saveTheme(this.draft);
            if (this.options.activateOnSave && this.plugin.getActiveStory()) await this.registry.setActiveTheme(saved.id);
            this.options.onSave?.();
            this.close();
            new Notice(`${saved.name} saved`);
        } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
        }
    }

    private section(title: string): void {
        new Setting(this.formEl).setName(title).setHeading();
    }

    private slider(name: string, desc: string, min: number, max: number, step: number, value: number, apply: (value: number) => void): void {
        new Setting(this.formEl).setName(name).setDesc(desc).addSlider(slider => slider
            .setLimits(min, max, step)
            .setValue(value)
            // Still needed: before Obsidian 1.13 a slider shows no value without it.
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            .setDynamicTooltip()
            .onChange(next => { apply(next); this.changed(); }));
    }

    /**
     * One colour role: picker, opacity, visibility and reset in a single row.
     *
     * The picker only speaks solid hex, so opacity rides alongside it and the
     * two are joined into `#rrggbbaa` on save. Hiding a colour sets its opacity
     * to zero and remembers the opacity it had, so turning it back on returns
     * to the same strength rather than to solid.
     */
    private renderColor(role: TimelineColorRole): void {
        const spec = TIMELINE_COLOR_ROLES[role];
        const current = toColorWithAlpha(this.draft.colors?.[role] || this.inherited(spec.variable, spec.fallback));
        let lastVisibleAlpha = current.alpha > 0 ? current.alpha : 1;
        let syncing = false;
        const setting = new Setting(this.formEl).setName(spec.label);
        const describe = () => {
            const own = this.draft.colors?.[role];
            const state = !own ? 'Inherited from Obsidian.'
                : current.alpha <= 0 ? 'Hidden.'
                : current.alpha < 1 ? `Set by this theme, ${Math.round(current.alpha * 100)}% opacity.`
                : 'Set by this theme.';
            setting.setDesc(`${spec.description} ${state}`);
        };
        const write = () => {
            (this.draft.colors ||= {} as TimelineThemeColors)[role] = joinColorAlpha(current.hex, current.alpha);
            describe();
            this.changed();
        };
        describe();
        setting.addColorPicker(picker => {
            picker.setValue(current.hex);
            picker.onChange(value => {
                current.hex = value;
                write();
            });
        });
        let slider: { setValue(value: number): unknown } | null = null;
        let toggle: { setValue(value: boolean): unknown } | null = null;
        setting.addSlider(component => {
            slider = component;
            component
                .setLimits(0, 100, 5)
                .setValue(Math.round(current.alpha * 100))
                // Still needed: before Obsidian 1.13 a slider shows no value without it.
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                .setDynamicTooltip()
                .onChange(value => {
                    if (syncing) return;
                    current.alpha = value / 100;
                    if (current.alpha > 0) lastVisibleAlpha = current.alpha;
                    syncing = true;
                    toggle?.setValue(current.alpha > 0);
                    syncing = false;
                    write();
                });
            component.sliderEl.setAttr('aria-label', `${spec.label} opacity`);
        });
        setting.addToggle(component => {
            toggle = component;
            component
                .setTooltip('Visible')
                .setValue(current.alpha > 0)
                .onChange(visible => {
                    if (syncing) return;
                    current.alpha = visible ? lastVisibleAlpha : 0;
                    syncing = true;
                    slider?.setValue(Math.round(current.alpha * 100));
                    syncing = false;
                    write();
                });
        });
        setting.addExtraButton(button => button.setIcon('rotate-ccw').setTooltip('Inherit from Obsidian').onClick(() => {
            if (this.draft.colors) delete this.draft.colors[role];
            this.changed();
            this.render();
        }));
    }

    private renderPalette(): void {
        this.section('Lane palette');
        const custom = !!this.draft.palette?.length;
        new Setting(this.formEl)
            .setName('Custom palette')
            .setDesc('Colours handed out to lanes, characters, locations and calendar cycles in turn. Off uses the default palette.')
            .addToggle(toggle => toggle.setValue(custom).onChange(value => {
                this.draft.palette = value ? this.inheritedPalette() : undefined;
                this.changed();
                this.render();
            }));
        if (!custom) return;
        const palette = this.draft.palette || [];
        palette.forEach((color, index) => {
            const current = toColorWithAlpha(color);
            const write = () => {
                palette[index] = joinColorAlpha(current.hex, current.alpha);
                this.changed();
            };
            new Setting(this.formEl)
                .setName(`Colour ${index + 1}`)
                .addColorPicker(picker => picker.setValue(current.hex).onChange(value => {
                    current.hex = value;
                    write();
                }))
                .addSlider(slider => {
                    slider
                        .setLimits(0, 100, 5)
                        .setValue(Math.round(current.alpha * 100))
                        // Still needed: before Obsidian 1.13 a slider shows no value without it.
                        // eslint-disable-next-line @typescript-eslint/no-deprecated
                        .setDynamicTooltip()
                        .onChange(value => {
                            current.alpha = value / 100;
                            write();
                        });
                    slider.sliderEl.setAttr('aria-label', `Colour ${index + 1} opacity`);
                })
                .addExtraButton(button => button.setIcon('trash-2').setTooltip('Remove').setDisabled(palette.length <= 1).onClick(() => {
                    palette.splice(index, 1);
                    this.changed();
                    this.render();
                }));
        });
        new Setting(this.formEl)
            .addButton(button => button.setButtonText('Add colour').setDisabled(palette.length >= MAX_TIMELINE_PALETTE).onClick(() => {
                palette.push(DEFAULT_TIMELINE_PALETTE[palette.length % DEFAULT_TIMELINE_PALETTE.length]);
                this.changed();
                this.render();
            }))
            .addButton(button => button.setButtonText('Reset to default').onClick(() => {
                this.draft.palette = [...DEFAULT_TIMELINE_PALETTE];
                this.changed();
                this.render();
            }));
    }

    private renderBackground(): void {
        this.section('Background image');
        const background = this.draft.background || {};
        const setBackground = (patch: Partial<NonNullable<TimelineTheme['background']>>) => {
            this.draft.background = { ...(this.draft.background || {}), ...patch };
            this.changed();
        };
        new Setting(this.formEl)
            .setName('Image')
            .setDesc('A vault image, or an HTTPS link. Drawn behind the timeline and included in image exports.')
            .addText(text => text
                .setPlaceholder('Attachments/map.png')
                .setValue(background.image || '')
                .onChange(value => {
                    const previous = this.draft.background?.image;
                    if (previous) forgetTimelineImage(previous);
                    setBackground({ image: value.trim() || undefined });
                }))
            .addButton(button => button.setButtonText('Choose').setTooltip('Pick an image from the vault').onClick(() => {
                new ImageSuggestModal(this.app, this.plugin, file => {
                    setBackground({ image: file.path, opacity: this.draft.background?.opacity ?? 0.35 });
                    this.render();
                }).open();
            }))
            .addExtraButton(button => button.setIcon('x').setTooltip('Remove image').onClick(() => {
                this.draft.background = undefined;
                this.changed();
                this.render();
            }));
        if (!background.image) return;
        new Setting(this.formEl).setName('Fit').setDesc('How the image fills the timeline.')
            .addDropdown(dropdown => dropdown
                .addOption('cover', 'Cover')
                .addOption('contain', 'Contain')
                .addOption('stretch', 'Stretch')
                .addOption('tile', 'Tile')
                .setValue(background.fit || 'cover')
                .onChange(value => setBackground({ fit: value as TimelineBackgroundFit })));
        new Setting(this.formEl).setName('Position').setDesc('Which edge the image is anchored to when it does not fit exactly.')
            .addDropdown(dropdown => dropdown
                .addOption('center', 'Center')
                .addOption('top', 'Top')
                .addOption('bottom', 'Bottom')
                .addOption('left', 'Left')
                .addOption('right', 'Right')
                .setValue(background.position || 'center')
                .onChange(value => setBackground({ position: value as TimelineBackgroundPosition })));
        this.slider('Image opacity', 'How strongly the image shows through the background colour, in percent.', 0, 100, 5,
            Math.round((background.opacity ?? 0.35) * 100),
            value => { this.draft.background = { ...(this.draft.background || {}), opacity: value / 100 }; });
        this.slider('Blur', 'Soften the image so labels stay readable over it, in pixels.', 0, 24, 1,
            background.blur ?? 0,
            value => { this.draft.background = { ...(this.draft.background || {}), blur: value }; });
    }

    /** The value a variable has before this theme sets it. */
    private inherited(variable: string, fallback: string): string {
        if (!this.probeEl) return fallback;
        return getComputedStyle(this.probeEl).getPropertyValue(variable).trim() || fallback;
    }

    private inheritedPalette(): string[] {
        const count = Number.parseInt(this.inherited(TIMELINE_LANE_COUNT_VARIABLE, String(DEFAULT_TIMELINE_PALETTE.length)), 10) || DEFAULT_TIMELINE_PALETTE.length;
        return Array.from({ length: Math.min(MAX_TIMELINE_PALETTE, count) }, (_, index) =>
            normalizeColor(this.inherited(laneVariable(index), DEFAULT_TIMELINE_PALETTE[index % DEFAULT_TIMELINE_PALETTE.length])));
    }
}

/**
 * Any CSS colour as hex and opacity, for a colour picker that only speaks
 * solid hex. The canvas does the parsing, so named colours, `transparent`,
 * rgb() and hsl() all work.
 */
function toColorWithAlpha(value: string): ColorWithAlpha {
    const ctx = activeDocument.createElement('canvas').getContext('2d');
    if (!ctx) return { hex: '#000000', alpha: 1 };
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    return splitColorAlpha(String(ctx.fillStyle)) || { hex: '#000000', alpha: 1 };
}

/** Any CSS colour as `#rrggbb`, or `#rrggbbaa` when it is see-through. */
function normalizeColor(value: string): string {
    const color = toColorWithAlpha(value);
    return joinColorAlpha(color.hex, color.alpha);
}

function duplicateTheme(theme: TimelineTheme, existing: TimelineTheme[]): TimelineTheme {
    const copy = clone(theme);
    const base = `theme-${slug(theme.name) || 'custom'}`;
    const used = new Set(existing.map(value => value.id));
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    copy.id = id;
    copy.name = `${theme.name} copy`;
    return copy;
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
