import { App, Notice, Setting, TextAreaComponent, ButtonComponent, DropdownComponent } from 'obsidian';
import type { Book } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { EntityCustomFieldsEditor, customFieldEditorOptions } from './entity/EntityCustomFieldsEditor';
import { confirmWithModal } from './ui/ConfirmModal';
import { isModalFieldVisible } from './entity/ModalFieldVisibility';
import { createCollapsibleModalSection } from './entity/CollapsibleModalSection';
import { sanitizeCustomFieldDefinitions } from './entity/CustomFieldDefinitions';

export type BookModalSubmitCallback = (book: Book) => Promise<void>;
export type BookModalDeleteCallback = (book: Book) => Promise<void>;

export class BookModal extends ResponsiveModal {
    book: Book;
    plugin: StorytellerSuitePlugin;
    onSubmit: BookModalSubmitCallback;
    onDelete?: BookModalDeleteCallback;
    isNew: boolean;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        book: Book | null,
        onSubmit: BookModalSubmitCallback,
        onDelete?: BookModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = book === null;
        this.book = book || {
            name: '',
            linkedChapters: [],
            groups: [],
            customFields: {},
        };
        if (!this.book.customFields) this.book.customFields = {};
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'book', this.book.customFields,
            customFieldEditorOptions(this.plugin, 'book', () => this.book));
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-book-modal');
    }

    /**
     * Whether a field is turned on for this vault. A hidden field is simply not
     * rendered; its stored value rides along untouched on the object that gets
     * submitted, so turning one off never discards data.
     */
    private shows(fieldKey: string): boolean {
        return isModalFieldVisible(this.plugin.settings.hiddenModalFields, 'book', fieldKey);
    }

    /** Whether the vault defines any typed fields for books. */
    private hasDefinedFields(): boolean {
        return sanitizeCustomFieldDefinitions('book', this.plugin.getCustomFieldDefinitions('book')).length > 0;
    }

    onOpen(): void { void (async () => {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? 'New Book' : `Edit: ${this.book.name}` });

        // --- Core fields: flat at the top, always shown unless hidden in settings ---
        // Name
        new Setting(contentEl)
            .setName('Title')
            .addText(t => t
                .setPlaceholder('Book title')
                .setValue(this.book.name || '')
                .onChange(v => { this.book.name = v; })
            );

        // Series
        if (this.shows('series')) {
            new Setting(contentEl)
                .setName('Series')
                .setDesc('Series or saga this book belongs to')
                .addText(t => t
                    .setPlaceholder('E.g. The ironveil chronicles')
                    .setValue(this.book.series || '')
                    .onChange(v => { this.book.series = v || undefined; })
                );
        }

        // Book number
        if (this.shows('bookNumber')) {
            new Setting(contentEl)
                .setName('Book number')
                .setDesc('Position in the series (1, 2, 3…)')
                .addText(t => {
                    t.setPlaceholder('1')
                     .setValue(this.book.bookNumber != null ? String(this.book.bookNumber) : '')
                     .onChange(v => {
                         const n = parseInt(v, 10);
                         this.book.bookNumber = Number.isFinite(n) ? n : undefined;
                     });
                    t.inputEl.type = 'number';
                });
        }

        // Status
        if (this.shows('status')) {
            new Setting(contentEl)
                .setName('Status')
                .addDropdown((dd: DropdownComponent) => {
                    dd.addOption('Planning', 'Planning');
                    dd.addOption('Writing', 'Writing');
                    dd.addOption('Revising', 'Revising');
                    dd.addOption('Complete', 'Complete');
                    dd.setValue(this.book.status ?? 'Planning');
                    dd.onChange(v => { this.book.status = v as Book['status']; });
                });
        }

        // Cover image
        if (this.shows('coverImagePath')) {
            let imageDescEl: HTMLElement | null = null;
            const coverSetting = new Setting(contentEl)
                .setName('Cover image')
                .then(s => {
                    imageDescEl = s.descEl.createEl('small', {
                        text: this.book.coverImagePath ? `Current: ${this.book.coverImagePath}` : 'None set'
                    });
                    s.descEl.addClass('storyteller-modal-setting-vertical');
                });
            addImageSelectionButtons(coverSetting, this.app, this.plugin, {
                currentPath: this.book.coverImagePath,
                onSelect: (path) => { this.book.coverImagePath = path; },
                descriptionEl: imageDescEl || undefined,
            });
        }

        // Description
        if (this.shows('description')) {
            new Setting(contentEl)
                .setName('Description')
                .setClass('storyteller-modal-setting-vertical')
                .addTextArea((ta: TextAreaComponent) => {
                    ta.setPlaceholder('Overview of the book…')
                      .setValue(this.book.description || '')
                      .onChange(v => { this.book.description = v || undefined; });
                    ta.inputEl.rows = 4;
                });
        }

        // --- Your fields: typed definitions, open whenever any exist ---
        this.customFieldsEditor.setFields(this.book.customFields);
        const definedSection = this.hasDefinedFields()
            ? createCollapsibleModalSection(contentEl, {
                title: 'Your fields',
                description: 'Typed fields defined for books in settings',
                icon: 'list-checks',
                open: true,
            })
            : null;
        if (definedSection) this.customFieldsEditor.renderDefinedFields(definedSection, { heading: false });

        // --- Genre and synopsis ---
        const storySection = this.shows('genre') || this.shows('synopsis')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Genre and synopsis',
                description: 'Category, and the back-cover synopsis',
                icon: 'book-open',
                open: Boolean(this.book.genre || this.book.synopsis),
            })
            : null;

        // Genre
        if (storySection && this.shows('genre')) {
            new Setting(storySection)
                .setName('Genre')
                .addText(t => t
                    .setPlaceholder('E.g. Dark fantasy')
                    .setValue(this.book.genre || '')
                    .onChange(v => { this.book.genre = v || undefined; })
                );
        }

        // Synopsis
        if (storySection && this.shows('synopsis')) {
            new Setting(storySection)
                .setName('Synopsis')
                .setClass('storyteller-modal-setting-vertical')
                .addTextArea((ta: TextAreaComponent) => {
                    ta.setPlaceholder('Short back-cover synopsis…')
                      .setValue(this.book.synopsis || '')
                      .onChange(v => { this.book.synopsis = v || undefined; });
                    ta.inputEl.rows = 3;
                });
        }

        // --- Chapters ---
        const chaptersSection = this.shows('linkedChapters')
            ? createCollapsibleModalSection(contentEl, {
                title: 'Chapters',
                description: 'Chapters that belong to this book',
                icon: 'list-ordered',
                open: Boolean(this.book.linkedChapters?.length),
            })
            : null;

        if (chaptersSection) {
            const allChapters = await this.plugin.listChapters();
            // Only show chapters unassigned or already in this book
            const availableChapters = allChapters.filter(
                c => !c.bookId || c.bookId === this.book.id
            );

            const chaptersListEl = chaptersSection.createDiv('storyteller-modal-linked-entities');
            const renderChapterChips = () => {
                chaptersListEl.empty();
                const linked = this.book.linkedChapters ?? [];
                if (linked.length === 0) {
                    chaptersListEl.createEl('span', { text: 'None', cls: 'storyteller-modal-list-empty' });
                    return;
                }
                linked.forEach((name, idx) => {
                    const chip = chaptersListEl.createDiv('storyteller-modal-list-item');
                    chip.createSpan({ text: name });
                    new ButtonComponent(chip)
                        .setClass('storyteller-modal-list-remove')
                        .setTooltip(`Remove ${name}`)
                        .setIcon('cross')
                        .onClick(() => {
                            (this.book.linkedChapters ?? []).splice(idx, 1);
                            renderChapterChips();
                        });
                });
            };
            renderChapterChips();

            new Setting(chaptersSection)
                .setName('Add chapter')
                .addDropdown((dd: DropdownComponent) => {
                    dd.addOption('', '— select chapter —');
                    for (const ch of availableChapters) {
                        const alreadyLinked = (this.book.linkedChapters ?? []).includes(ch.name);
                        if (!alreadyLinked) dd.addOption(ch.name, ch.number ? `Ch.${ch.number} — ${ch.name}` : ch.name);
                    }
                    dd.onChange(v => {
                        if (!v) return;
                        if (!Array.isArray(this.book.linkedChapters)) this.book.linkedChapters = [];
                        // The chapter's bookId is written when the book is saved (saveBook)
                        if (!this.book.linkedChapters.includes(v)) {
                            this.book.linkedChapters.push(v);
                        }
                        renderChapterChips();
                        dd.setValue('');
                    });
                });
        }

        // --- Free-form custom fields ---
        if (this.shows('customFields')) {
            const customFieldsSection = createCollapsibleModalSection(contentEl, {
                title: 'Custom fields',
                description: 'Additional properties specific to this project',
                icon: 'list-plus',
                open: Boolean(Object.keys(this.book.customFields || {}).length),
            });
            this.customFieldsEditor.renderFreeFormSection(customFieldsSection, { heading: false });
        }

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, 'Delete', async () => {
                if (await confirmWithModal(this.app, {
                    title: 'Confirm',
                    body: `Delete book "${this.book.name}"? This will unlink all its chapters.`,
                    confirmText: 'Delete',
                })) {
                    await this.onDelete!(this.book);
                    this.close();
                }
            }, { warning: true });
        }
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer', attr: { 'aria-hidden': 'true' } });
        this.createFooterButton(footerEl, 'Cancel', () => this.close());
        this.createFooterButton(footerEl, this.isNew ? 'Create Book' : 'Save Changes', async () => {
            if (!this.book.name?.trim()) {
                new Notice('Book title is required.');
                return;
            }
            this.book.description = this.book.description || '';
            this.book.synopsis = this.book.synopsis || '';
            const customFields = this.customFieldsEditor.getFields();
            if (!customFields) {
                return;
            }
            this.book.customFields = customFields;
            await this.onSubmit(this.book);
            this.close();
        }, { cta: true });
    })(); }

    onClose(): void { this.contentEl.empty(); }
}
