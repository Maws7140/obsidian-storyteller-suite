import { CharacterModal } from '../../../modals/CharacterModal';
import { t } from '../../../i18n/strings';
import type { Character } from '../../../types';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const charactersController: DashboardTabController = {
    id: 'characters',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('characters'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderCharactersList(container, context);
        }, () => {
            new CharacterModal(context.app, context.plugin, null, async (char: Character) => {
                await context.mutationRunner.runCreate({
                    action: async () => {
                        await context.plugin.saveCharacter(char);
                    },
                    successNotice: `Character "${char.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'character-created',
                });
            }).open();
        });

        await renderCharactersList(container, context);
    },
};

async function renderCharactersList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const characters = (await context.plugin.listCharacters()).filter(char =>
        char.name.toLowerCase().includes(filter) ||
        (char.description || '').toLowerCase().includes(filter) ||
        (char.traits || []).join(' ').toLowerCase().includes(filter)
    );

    const listContainer = container.createDiv('storyteller-list-container');
    if (characters.length === 0) {
        const emptyMsg = listContainer.createEl('p', { text: t('noCharactersFound'), cls: 'storyteller-empty-state' });
        emptyMsg.style.color = 'var(--text-muted)';
        emptyMsg.style.fontStyle = 'italic';
        return;
    }

    characters.forEach(character => {
        const itemEl = listContainer.createDiv('storyteller-list-item storyteller-character-item');
        const imgContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (character.profileImagePath) {
            const imgEl = imgContainer.createEl('img');
            try {
                imgEl.src = context.getImageSrc(character.profileImagePath);
                imgEl.alt = character.name;
            } catch {
                imgContainer.createSpan({ text: '?', title: 'Error loading image' });
            }
        } else {
            imgContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: character.name.substring(0, 1) });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: character.name });
        if (character.description) {
            infoEl.createEl('p', { text: character.description.substring(0, 80) + (character.description.length > 80 ? '...' : '') });
        }

        const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
        if (character.race) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-char-race-badge', text: character.race });
        if (character.age) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-char-age-badge', text: character.age });
        if (character.status) {
            const statusSlug = character.status.toLowerCase().replace(/\s+/g, '-');
            extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-char-status-badge storyteller-char-status-${statusSlug}`, text: character.status });
        }
        if (character.affiliation) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-affiliation-badge', text: character.affiliation });
        if (character.balance) extraInfoEl.createSpan({ cls: 'storyteller-balance-chip', text: `⚖ ${character.balance}` });

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            new CharacterModal(context.app, context.plugin, character, async (updatedData: Character) => {
                await context.mutationRunner.runUpdate({
                    action: async () => {
                        await context.plugin.saveCharacter(updatedData);
                    },
                    successNotice: `Character "${updatedData.name}" updated.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'character-updated',
                });
            }).open();
        });
        context.addDeleteButton(actionsEl, async () => {
            if (character.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Are you sure you want to delete "${character.name}"? This will move the file to system trash.`,
                    action: async () => {
                        await context.plugin.deleteCharacter(character.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'character-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, character.filePath);
    });
}
