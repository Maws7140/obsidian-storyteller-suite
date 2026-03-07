import { App, Notice, Setting } from 'obsidian';
import { t } from '../../i18n/strings';
import { EntityType, getWhitelistKeys } from '../../yaml/EntitySections';

type CustomFieldDraft = {
    id: string;
    key: string;
    value: string;
};

export class EntityCustomFieldsEditor {
    private rows: CustomFieldDraft[] = [];
    private rowCounter = 0;
    private containerEl: HTMLElement | null = null;

    constructor(
        private readonly app: App,
        private readonly entityType: EntityType,
        initialFields?: Record<string, string>
    ) {
        this.setFields(initialFields);
    }

    setFields(fields?: Record<string, string>): void {
        this.rowCounter = 0;
        this.rows = Object.entries(fields || {}).map(([key, value]) => ({
            id: this.nextRowId(),
            key,
            value: value?.toString() || ''
        }));
    }

    renderSection(parent: HTMLElement): void {
        parent.createEl('h3', { text: t('customFields') });
        this.containerEl = parent.createDiv('storyteller-custom-fields-container');
        this.renderRows();

        new Setting(parent)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    const rowId = this.addField();
                    this.focusField(rowId);
                }));
    }

    addField(): string {
        const rowId = this.nextRowId();
        this.rows.push({ id: rowId, key: '', value: '' });
        this.renderRows();
        return rowId;
    }

    getFields(): Record<string, string> | null {
        const normalizedFields: Record<string, string> = {};
        const reserved = this.getReservedKeys();
        const seen = new Set<string>();

        for (const row of this.rows) {
            const trimmedKey = row.key.trim();
            const value = row.value ?? '';

            if (!trimmedKey) {
                if (!value.trim()) {
                    continue;
                }
                new Notice(t('fieldNameCannotBeEmpty'));
                return null;
            }

            if (reserved.has(trimmedKey)) {
                new Notice(t('thatNameIsReserved'));
                return null;
            }

            const normalizedKey = trimmedKey.toLowerCase();
            if (seen.has(normalizedKey)) {
                new Notice(t('fieldAlreadyExists'));
                return null;
            }

            seen.add(normalizedKey);
            normalizedFields[trimmedKey] = value;
        }

        return normalizedFields;
    }

    private renderRows(): void {
        if (!this.containerEl) {
            return;
        }

        this.containerEl.empty();
        if (this.rows.length === 0) {
            this.containerEl.createEl('p', {
                text: t('noCustomFields'),
                cls: 'storyteller-modal-list-empty'
            });
            return;
        }

        this.rows.forEach(row => {
            const fieldSetting = new Setting(this.containerEl!)
                .addText(text => text
                    .setValue(row.key)
                    .setPlaceholder(t('fieldName'))
                    .onChange(value => {
                        row.key = value;
                    }))
                .addText(text => text
                    .setValue(row.value)
                    .setPlaceholder(t('fieldValue'))
                    .onChange(value => {
                        row.value = value;
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip(t('removeFieldX', row.key || t('fieldName')))
                    .setClass('mod-warning')
                    .onClick(() => {
                        this.rows = this.rows.filter(existing => existing.id !== row.id);
                        this.renderRows();
                    }));

            fieldSetting.controlEl.addClass('storyteller-custom-field-row');

            const inputs = fieldSetting.controlEl.querySelectorAll('input');
            const nameInput = inputs.item(0);
            const valueInput = inputs.item(1);
            if (nameInput instanceof HTMLInputElement) {
                nameInput.dataset.customFieldRowId = row.id;
                nameInput.dataset.customFieldRole = 'name';
            }
            if (valueInput instanceof HTMLInputElement) {
                valueInput.dataset.customFieldRowId = row.id;
                valueInput.dataset.customFieldRole = 'value';
            }
        });
    }

    private focusField(rowId: string): void {
        window.setTimeout(() => {
            const nameInput = this.containerEl?.querySelector(
                `input[data-custom-field-row-id="${rowId}"][data-custom-field-role="name"]`
            );
            if (nameInput instanceof HTMLInputElement) {
                nameInput.focus();
            }
        }, 0);
    }

    private getReservedKeys(): Set<string> {
        return new Set([
            ...getWhitelistKeys(this.entityType),
            'customFields',
            'filePath',
            'id',
            'sections'
        ]);
    }

    private nextRowId(): string {
        this.rowCounter += 1;
        return `${this.entityType}-custom-field-${this.rowCounter}`;
    }
}
