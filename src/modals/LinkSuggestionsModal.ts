// Review list for implied-link suggestions opened from the network graph.
// Accept writes a real relationship to the source character's note.
// Dismiss remembers the suggestion key in plugin settings so it does not come back.

import { App, Modal, Notice, Setting } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { LinkSuggestion, connectionForSuggestion, suggestImpliedLinks } from '../utils/RelationshipSuggestions';

export class LinkSuggestionsModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private onChange: () => void;
    private suggestions: LinkSuggestion[] = [];
    private listEl: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, onChange: () => void) {
        super(app);
        this.plugin = plugin;
        this.onChange = onChange;
        this.modalEl.addClass('storyteller-link-suggestions-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('suggestLinksTitle') });
        this.listEl = contentEl.createDiv('storyteller-link-suggestions-list');
        void this.load();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async load(): Promise<void> {
        if (!this.listEl) return;
        this.listEl.empty();
        this.listEl.createEl('p', { text: '…', cls: 'storyteller-modal-list-empty' });
        try {
            const [characters, events, scenes] = await Promise.all([
                this.plugin.listCharacters(),
                this.plugin.listEvents(),
                this.plugin.listScenes()
            ]);
            this.suggestions = suggestImpliedLinks({
                characters,
                groups: this.plugin.getGroups(),
                occasions: [
                    ...events.map(e => ({ id: `event:${e.id || e.name}`, participants: e.characters ?? [] })),
                    ...scenes.map(s => ({ id: `scene:${s.id || s.name}`, participants: s.linkedCharacters ?? [] }))
                ],
                dismissed: this.plugin.settings.dismissedLinkSuggestions ?? []
            });
        } catch (err) {
            console.error('[Storyteller] Could not compute link suggestions:', err);
            this.suggestions = [];
        }
        this.render();
    }

    private render(): void {
        if (!this.listEl) return;
        this.listEl.empty();
        if (this.suggestions.length === 0) {
            this.listEl.createEl('p', { text: t('noLinkSuggestions'), cls: 'storyteller-modal-list-empty' });
            return;
        }

        for (const suggestion of this.suggestions) {
            const arrow = suggestion.direction === 'mutual' ? '↔' : '→';
            const kindLabel = t(suggestion.kind);
            const description = suggestion.label
                ? `${kindLabel} · ${suggestion.label} — ${suggestion.detail}`
                : `${kindLabel} — ${suggestion.detail}`;
            new Setting(this.listEl)
                .setName(`${suggestion.source} ${arrow} ${suggestion.target}`)
                .setDesc(description)
                .addButton(button => button
                    .setButtonText(t('acceptSuggestion'))
                    .setCta()
                    .onClick(() => { void this.accept(suggestion); }))
                .addButton(button => button
                    .setButtonText(t('dismissSuggestion'))
                    .onClick(() => { void this.dismiss(suggestion); }));
        }
    }

    private async accept(suggestion: LinkSuggestion): Promise<void> {
        try {
            const characters = await this.plugin.listCharacters();
            const source = characters.find(c => c.name === suggestion.source);
            if (!source) throw new Error(`Source character not found: ${suggestion.source}`);
            source.connections = [...(source.connections ?? []), connectionForSuggestion(suggestion)];
            await this.plugin.saveCharacter(source);
            new Notice(t('suggestionAccepted'));
            this.suggestions = this.suggestions.filter(s => s.key !== suggestion.key);
            this.render();
            this.onChange();
        } catch (err) {
            console.error('[Storyteller] Could not accept link suggestion:', err);
            new Notice(t('suggestionAcceptFailed'));
        }
    }

    private async dismiss(suggestion: LinkSuggestion): Promise<void> {
        const dismissed = this.plugin.settings.dismissedLinkSuggestions ?? [];
        if (!dismissed.includes(suggestion.key)) {
            this.plugin.settings.dismissedLinkSuggestions = [...dismissed, suggestion.key];
            await this.plugin.saveSettings();
        }
        this.suggestions = this.suggestions.filter(s => s.key !== suggestion.key);
        this.render();
    }
}
