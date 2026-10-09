import { App, Notice, Setting } from 'obsidian';
import { t } from '../../i18n/strings';
import { EntityType, getWhitelistKeys } from '../../yaml/EntitySections';
import {
    CustomFieldDefinition,
    commitDefinedFieldValues,
    displayValueForDefinition,
    isLinkFieldType,
    sanitizeCustomFieldDefinitions,
} from './CustomFieldDefinitions';

type CustomFieldDraft = {
    id: string;
    key: string;
    value: string;
};

export interface CustomFieldEditorOptions {
    /** Typed fields for this entity type, rendered above the free-form rows. */
    definitions?: CustomFieldDefinition[];
    /**
     * The entity object the modal saves. Defined fields are read from it and
     * written back to it by getFields(), so every existing save path picks
     * them up unchanged.
     */
    getEntity?: () => object | undefined;
    /** Entity names offered by link and links pickers, for the active story. */
    listTargetNames?: (target: string) => Promise<string[]>;
}

/** The plugin members the editor needs. Structural, so tests can stub it. */
export interface CustomFieldPluginAccess {
    getCustomFieldDefinitions(entityType: EntityType): CustomFieldDefinition[];
    listCustomFieldTargetNames(target: string): Promise<string[]>;
}

/** Options for an entity modal, built from the plugin's settings and lists. */
export function customFieldEditorOptions(
    plugin: CustomFieldPluginAccess,
    entityType: EntityType,
    getEntity: () => object | undefined
): CustomFieldEditorOptions {
    return {
        definitions: plugin.getCustomFieldDefinitions(entityType),
        getEntity,
        listTargetNames: target => plugin.listCustomFieldTargetNames(target),
    };
}

export class EntityCustomFieldsEditor {
    private rows: CustomFieldDraft[] = [];
    private rowCounter = 0;
    private containerEl: HTMLElement | null = null;
    private readonly definitions: CustomFieldDefinition[];
    /** Raw input per defined key, in the shape its widget edits. */
    private definedDrafts: Record<string, unknown> = {};
    private readonly targetNames = new Map<string, string[]>();
    private readonly pendingTargets = new Set<string>();

    constructor(
        private readonly app: App,
        private readonly entityType: EntityType,
        initialFields?: Record<string, string>,
        private readonly options: CustomFieldEditorOptions = {}
    ) {
        this.definitions = sanitizeCustomFieldDefinitions(entityType, options.definitions);
        this.setFields(initialFields);
    }

    setFields(fields?: Record<string, string>): void {
        this.rowCounter = 0;
        const definedKeys = new Set(this.definitions.map(definition => definition.key));
        const entity = this.readEntity();

        // A defined key that was swept into customFields before its definition
        // existed still shows its value. The next save moves it to the top level.
        this.definedDrafts = {};
        for (const definition of this.definitions) {
            const stored = entity && entity[definition.key] !== undefined
                ? entity[definition.key]
                : fields?.[definition.key];
            this.definedDrafts[definition.key] = displayValueForDefinition(definition, stored);
        }

        this.rows = Object.entries(fields || {})
            .filter(([key]) => !definedKeys.has(key))
            .map(([key, value]) => ({
                id: this.nextRowId(),
                key,
                value: value?.toString() || ''
            }));
    }

    renderSection(parent: HTMLElement): void {
        parent.createEl('h3', { text: t('customFields') });
        this.containerEl = parent.createDiv('storyteller-custom-fields-container');
        this.ensureTargetNames();
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

    /**
     * Free-form fields as a customFields map, or null when they are invalid.
     * Also commits the defined fields to the entity from getEntity, so a save
     * path that already calls this needs no other change.
     */
    getFields(): Record<string, string> | null {
        this.commitDefinedFields();

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

    private readEntity(): Record<string, unknown> | undefined {
        const entity = this.options.getEntity?.();
        return entity ? entity as Record<string, unknown> : undefined;
    }

    private commitDefinedFields(): void {
        const entity = this.readEntity();
        if (!entity || this.definitions.length === 0) return;
        commitDefinedFieldValues(entity, this.definitions, this.definedDrafts);
    }

    private ensureTargetNames(): void {
        const listTargetNames = this.options.listTargetNames;
        if (!listTargetNames) return;
        for (const definition of this.definitions) {
            const target = definition.target;
            if (!isLinkFieldType(definition.type) || !target) continue;
            if (this.targetNames.has(target) || this.pendingTargets.has(target)) continue;
            this.pendingTargets.add(target);
            void listTargetNames(target)
                .then(names => this.targetNames.set(target, names))
                .catch(() => this.targetNames.set(target, []))
                .finally(() => {
                    this.pendingTargets.delete(target);
                    this.renderRows();
                });
        }
    }

    private renderRows(): void {
        if (!this.containerEl) {
            return;
        }

        this.containerEl.empty();
        for (const definition of this.definitions) {
            this.renderDefinedField(this.containerEl, definition);
        }

        if (this.rows.length === 0) {
            if (this.definitions.length === 0) {
                this.containerEl.createEl('p', {
                    text: t('noCustomFields'),
                    cls: 'storyteller-modal-list-empty'
                });
            }
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
            if (nameInput.instanceOf(HTMLInputElement)) {
                nameInput.dataset.customFieldRowId = row.id;
                nameInput.dataset.customFieldRole = 'name';
            }
            if (valueInput.instanceOf(HTMLInputElement)) {
                valueInput.dataset.customFieldRowId = row.id;
                valueInput.dataset.customFieldRole = 'value';
            }
        });
    }

    /** One typed field: the input matches its type. */
    private renderDefinedField(parent: HTMLElement, definition: CustomFieldDefinition): void {
        const key = definition.key;
        const draft = this.definedDrafts[key];
        const setting = new Setting(parent).setName(definition.label || key);
        if (definition.label) setting.setDesc(key);
        setting.settingEl.addClass('storyteller-custom-field-defined');
        setting.settingEl.dataset.customFieldKey = key;

        switch (definition.type) {
            case 'text':
                setting.addText(text => text
                    .setValue(typeof draft === 'string' ? draft : '')
                    .onChange(value => { this.definedDrafts[key] = value; }));
                break;
            case 'textarea':
                setting.addTextArea(text => {
                    text.setValue(typeof draft === 'string' ? draft : '')
                        .onChange(value => { this.definedDrafts[key] = value; });
                    text.inputEl.rows = 2;
                });
                break;
            case 'number':
                setting.addText(text => {
                    text.setValue(typeof draft === 'string' ? draft : '')
                        .onChange(value => { this.definedDrafts[key] = value; });
                    text.inputEl.type = 'number';
                });
                break;
            case 'list':
                setting.addText(text => text
                    .setValue(typeof draft === 'string' ? draft : '')
                    .setPlaceholder('Comma separated')
                    .onChange(value => { this.definedDrafts[key] = value; }));
                break;
            case 'link':
                this.renderLinkPicker(setting, definition, typeof draft === 'string' ? draft : '');
                break;
            case 'links':
                this.renderLinksPicker(parent, setting, definition, Array.isArray(draft) ? draft as string[] : []);
                break;
        }
    }

    private renderLinkPicker(setting: Setting, definition: CustomFieldDefinition, current: string): void {
        const key = definition.key;
        const names = this.namesFor(definition);
        setting.addDropdown(dropdown => {
            dropdown.addOption('', 'None');
            for (const name of this.withCurrent(names, current ? [current] : [])) {
                dropdown.addOption(name, name);
            }
            dropdown.setValue(current).onChange(value => {
                this.definedDrafts[key] = value;
            });
        });
        this.noteIfNoTargets(setting, definition);
    }

    private renderLinksPicker(
        parent: HTMLElement,
        setting: Setting,
        definition: CustomFieldDefinition,
        selected: string[]
    ): void {
        const key = definition.key;
        const names = this.namesFor(definition);
        const available = names.filter(name => !selected.includes(name));
        setting.addDropdown(dropdown => {
            dropdown.addOption('', 'Add...');
            for (const name of available) {
                dropdown.addOption(name, name);
            }
            dropdown.setValue('').onChange(value => {
                if (!value) return;
                this.definedDrafts[key] = [...selected, value];
                this.renderRows();
            });
        });
        this.noteIfNoTargets(setting, definition);

        const chips = parent.createDiv('storyteller-custom-field-chips');
        for (const name of selected) {
            const chip = chips.createSpan({ cls: 'storyteller-custom-field-chip', text: name });
            const remove = chip.createEl('button', { text: '×', cls: 'storyteller-custom-field-chip-remove' });
            remove.setAttribute('aria-label', `Remove ${name}`);
            remove.addEventListener('click', () => {
                this.definedDrafts[key] = selected.filter(item => item !== name);
                this.renderRows();
            });
        }
    }

    private namesFor(definition: CustomFieldDefinition): string[] {
        return definition.target ? (this.targetNames.get(definition.target) ?? []) : [];
    }

    private withCurrent(names: string[], extra: string[]): string[] {
        const out = [...names];
        for (const value of extra) {
            if (value && !out.includes(value)) out.push(value);
        }
        return out;
    }

    private noteIfNoTargets(setting: Setting, definition: CustomFieldDefinition): void {
        const target = definition.target;
        if (target && this.targetNames.has(target) && this.namesFor(definition).length === 0) {
            setting.setDesc('No matching notes in the active story yet.');
        }
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
            ...this.definitions.map(definition => definition.key),
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
