import { App, Notice, Setting, TextAreaComponent, ButtonComponent, DropdownComponent } from 'obsidian';
import type { Book, Chapter } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';

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
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'book', this.book.customFields);
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-book-modal');
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'New Book' : `Edit: ${this.book.name}` });

        // Name
        new Setting(contentEl)
            .setName('Title')
            .addText(t => t
                .setPlaceholder('Book title')
                .setValue(this.book.name || '')
                .onChange(v => { this.book.name = v; })
            );

        // Series
        new Setting(contentEl)
            .setName('Series')
            .setDesc('Series or saga this book belongs to')
            .addText(t => t
                .setPlaceholder('e.g. The Ironveil Chronicles')
                .setValue(this.book.series || '')
                .onChange(v => { this.book.series = v || undefined; })
            );

        // Book number
        new Setting(contentEl)
            .setName('Book Number')
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

        // Genre
        new Setting(contentEl)
            .setName('Genre')
            .addText(t => t
                .setPlaceholder('e.g. Dark Fantasy')
                .setValue(this.book.genre || '')
                .onChange(v => { this.book.genre = v || undefined; })
            );

        // Status
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

        // Cover image
        let imageDescEl: HTMLElement | null = null;
        const coverSetting = new Setting(contentEl)
            .setName('Cover Image')
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

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder('Overview of the book…')
                  .setValue(this.book.description || '')
                  .onChange(v => { this.book.description = v || undefined; });
                ta.inputEl.rows = 4;
            });

        // Synopsis
        new Setting(contentEl)
            .setName('Synopsis')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder('Short back-cover synopsis…')
                  .setValue(this.book.synopsis || '')
                  .onChange(v => { this.book.synopsis = v || undefined; });
                ta.inputEl.rows = 3;
            });

        // Chapters section
        contentEl.createEl('h3', { text: 'Chapters' });
        const allChapters = await this.plugin.listChapters();
        // Only show chapters unassigned or already in this book
        const availableChapters = allChapters.filter(
            c => !c.bookId || c.bookId === this.book.id
        );

        const chaptersListEl = contentEl.createDiv('storyteller-modal-linked-entities');
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

        new Setting(contentEl)
            .setName('Add Chapter')
            .addDropdown((dd: DropdownComponent) => {
                dd.addOption('', '— Select chapter —');
                for (const ch of availableChapters) {
                    const alreadyLinked = (this.book.linkedChapters ?? []).includes(ch.name);
                    if (!alreadyLinked) dd.addOption(ch.name, ch.number ? `Ch.${ch.number} — ${ch.name}` : ch.name);
                }
                dd.onChange(v => {
                    if (!v) return;
                    if (!Array.isArray(this.book.linkedChapters)) this.book.linkedChapters = [];
                    if (!this.book.linkedChapters.includes(v)) {
                        this.book.linkedChapters.push(v);
                        // Update chapter's bookId/bookName
                        const ch = allChapters.find(c => c.name === v);
                        if (ch) {
                            ch.bookId = this.book.id;
                            ch.bookName = this.book.name;
                        }
                    }
                    renderChapterChips();
                    dd.setValue('');
                });
            });

        this.customFieldsEditor.setFields(this.book.customFields);
        this.customFieldsEditor.renderSection(contentEl);

        // Buttons
        const buttons = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttons.addButton(btn => btn
                .setButtonText('Delete')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Delete book "${this.book.name}"? This will unlink all its chapters.`)) {
                        await this.onDelete!(this.book);
                        this.close();
                    }
                })
            );
        }
        buttons.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        buttons.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
        buttons.addButton(btn => btn
            .setButtonText(this.isNew ? 'Create Book' : 'Save Changes')
            .setCta()
            .onClick(async () => {
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
            })
        );
    }

    onClose(): void { this.contentEl.empty(); }
}
