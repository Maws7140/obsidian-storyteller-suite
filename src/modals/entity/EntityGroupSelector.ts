import { EventRef, Notice, Setting } from 'obsidian';
import StorytellerSuitePlugin from '../../main';
import { t } from '../../i18n/strings';

export type GroupableEntityType = 'character' | 'event' | 'location' | 'item' | 'compendiumEntry';

type GroupSelectorOptions = {
    plugin: StorytellerSuitePlugin;
    description: string;
    getSelectedGroupIds: () => string[] | undefined;
    setSelectedGroupIds: (groupIds: string[]) => void;
    loadSelectedGroupIds?: () => Promise<string[]>;
    persistAdd?: (groupId: string) => Promise<void>;
    persistRemove?: (groupId: string) => Promise<void>;
};

export class EntityGroupSelector {
    private readonly plugin: StorytellerSuitePlugin;
    private readonly description: string;
    private readonly getSelectedGroupIds: () => string[] | undefined;
    private readonly setSelectedGroupIds: (groupIds: string[]) => void;
    private readonly loadSelectedGroupIds?: () => Promise<string[]>;
    private readonly persistAdd?: (groupId: string) => Promise<void>;
    private readonly persistRemove?: (groupId: string) => Promise<void>;

    private containerEl: HTMLElement | null = null;
    private selectedGroupIds = new Set<string>();
    private refreshToken = 0;
    private groupChangedRef: EventRef | null = null;

    constructor(options: GroupSelectorOptions) {
        this.plugin = options.plugin;
        this.description = options.description;
        this.getSelectedGroupIds = options.getSelectedGroupIds;
        this.setSelectedGroupIds = options.setSelectedGroupIds;
        this.loadSelectedGroupIds = options.loadSelectedGroupIds;
        this.persistAdd = options.persistAdd;
        this.persistRemove = options.persistRemove;
    }

    attach(container: HTMLElement): void {
        this.containerEl = container;
        if (!this.groupChangedRef) {
            this.groupChangedRef = (this.plugin.app.workspace as any).on('storyteller:groups-changed', () => {
                void this.refresh();
            });
        }
        void this.refresh();
    }

    dispose(): void {
        if (this.groupChangedRef) {
            this.plugin.app.workspace.offref(this.groupChangedRef);
            this.groupChangedRef = null;
        }
    }

    async refresh(): Promise<void> {
        const currentToken = ++this.refreshToken;
        const selectedIds = await this.readSelectedGroupIds();
        if (currentToken !== this.refreshToken) {
            return;
        }

        this.selectedGroupIds = new Set(selectedIds);
        this.setSelectedGroupIds(Array.from(this.selectedGroupIds));
        this.render();
    }

    private render(): void {
        if (!this.containerEl) {
            return;
        }

        this.containerEl.empty();
        const allGroups = this.plugin.getGroups();
        if (allGroups.length === 0) {
            this.containerEl.createEl('p', {
                text: 'No groups available. Create groups in the Groups section.'
            });
            return;
        }

        new Setting(this.containerEl)
            .setName(t('groups'))
            .setDesc(this.description)
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectGroupPlaceholder'));
                allGroups.forEach(group => {
                    dropdown.addOption(group.id, group.name);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (!value || this.selectedGroupIds.has(value)) {
                        return;
                    }
                    void this.addGroup(value);
                });
            });

        if (this.selectedGroupIds.size === 0) {
            return;
        }

        const selectedDiv = this.containerEl.createDiv('selected-groups');
        allGroups
            .filter(group => this.selectedGroupIds.has(group.id))
            .forEach(group => {
                const tag = selectedDiv.createSpan({ text: group.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' x', cls: 'remove-group-btn' });
                removeBtn.onclick = () => {
                    void this.removeGroup(group.id);
                };
            });
    }

    private async addGroup(groupId: string): Promise<void> {
        if (this.selectedGroupIds.has(groupId)) {
            return;
        }

        this.selectedGroupIds.add(groupId);
        this.setSelectedGroupIds(Array.from(this.selectedGroupIds));

        try {
            if (this.persistAdd) {
                await this.persistAdd(groupId);
            }
        } catch (error) {
            this.selectedGroupIds.delete(groupId);
            this.setSelectedGroupIds(Array.from(this.selectedGroupIds));
            const message = error instanceof Error ? error.message : 'Failed to add group';
            new Notice(message);
        }

        this.render();
    }

    private async removeGroup(groupId: string): Promise<void> {
        if (!this.selectedGroupIds.has(groupId)) {
            return;
        }

        this.selectedGroupIds.delete(groupId);
        this.setSelectedGroupIds(Array.from(this.selectedGroupIds));

        try {
            if (this.persistRemove) {
                await this.persistRemove(groupId);
            }
        } catch (error) {
            this.selectedGroupIds.add(groupId);
            this.setSelectedGroupIds(Array.from(this.selectedGroupIds));
            const message = error instanceof Error ? error.message : 'Failed to remove group';
            new Notice(message);
        }

        this.render();
    }

    private async readSelectedGroupIds(): Promise<string[]> {
        if (this.loadSelectedGroupIds) {
            const loaded = await this.loadSelectedGroupIds();
            return Array.from(new Set(loaded.filter(Boolean)));
        }

        return Array.from(new Set((this.getSelectedGroupIds() || []).filter(Boolean)));
    }
}
