/**
 * CampaignSessionModal — create or resume a campaign session.
 * Shows existing sessions as "Resume" cards and provides a form to start a new one.
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import { CampaignSession } from '../types';
import StorytellerSuitePlugin from '../main';

export class CampaignSessionModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private onSessionSelected: (session: CampaignSession) => void;
    private preferredStartingScene?: import('../types').Scene;

    private sessions: CampaignSession[] = [];
    private scenes: import('../types').Scene[] = [];
    private characters: import('../types').Character[] = [];

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        onSessionSelected: (session: CampaignSession) => void,
        preferredStartingScene?: import('../types').Scene
    ) {
        super(app);
        this.plugin = plugin;
        this.onSessionSelected = onSessionSelected;
        this.preferredStartingScene = preferredStartingScene;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        this.modalEl.addClass('storyteller-campaign-session-modal');
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Campaign Sessions' });

        // Load data
        const [sessions, scenes, characters] = await Promise.all([
            this.plugin.listSessions().catch(() => [] as CampaignSession[]),
            this.plugin.listScenes().catch(() => [] as import('../types').Scene[]),
            this.plugin.listCharacters().catch(() => [] as import('../types').Character[])
        ]);
        this.sessions = sessions;
        this.scenes = scenes;
        this.characters = characters;

        // Existing sessions
        if (sessions.length > 0) {
            contentEl.createEl('h3', { text: 'Resume a Session' });
            const sessionList = contentEl.createDiv('storyteller-campaign-session-list');
            for (const sess of sessions) {
                const card = sessionList.createDiv('storyteller-campaign-session-card');
                const info = card.createDiv('storyteller-campaign-session-info');
                info.createEl('strong', { text: sess.name });
                if (sess.currentSceneName) info.createEl('p', { text: `Scene: ${sess.currentSceneName}`, cls: 'storyteller-campaign-session-detail' });
                if (sess.partyCharacterNames?.length) info.createEl('p', { text: `Party: ${sess.partyCharacterNames.join(', ')}`, cls: 'storyteller-campaign-session-detail' });
                const statusBadge = info.createSpan({ cls: `storyteller-campaign-status-badge is-${sess.status ?? 'active'}`, text: sess.status ?? 'active' });

                const actions = card.createDiv('storyteller-campaign-session-actions');
                const resumeBtn = actions.createEl('button', { cls: 'storyteller-modal-btn mod-cta', text: 'Resume' });
                resumeBtn.addEventListener('click', () => {
                    this.close();
                    this.onSessionSelected(sess);
                });

                const deleteBtn = actions.createEl('button', { cls: 'storyteller-modal-btn mod-warning', text: 'Delete' });
                deleteBtn.addEventListener('click', async () => {
                    if (sess.filePath && confirm(`Delete session "${sess.name}"?`)) {
                        await this.plugin.deleteSession(sess.filePath);
                        await this.onOpen();
                    }
                });
            }
        }

        // New session form
        contentEl.createEl('h3', { text: 'Start a New Session' });
        const form = contentEl.createDiv('storyteller-campaign-new-session-form');

        let sessionName = '';
        let startingSceneId: string | undefined = this.preferredStartingScene?.id;
        let startingSceneName: string | undefined = this.preferredStartingScene?.name;
        const partyCharacterIds: string[] = [];
        const partyCharacterNames: string[] = [];

        new Setting(form)
            .setName('Session name')
            .addText(t => t.setPlaceholder('e.g. Session 1 — The Dark Tavern').onChange(v => { sessionName = v; }));

        new Setting(form)
            .setName('Starting scene')
            .addDropdown(dd => {
                dd.addOption('', '— Select scene —');
                for (const sc of this.scenes) dd.addOption(sc.id ?? sc.name, sc.name);
                if (this.preferredStartingScene) {
                    dd.setValue(this.preferredStartingScene.id ?? this.preferredStartingScene.name);
                }
                dd.onChange(v => {
                    const sc = this.scenes.find(s => (s.id ?? s.name) === v);
                    startingSceneId = sc?.id;
                    startingSceneName = sc?.name;
                });
            });

        new Setting(form)
            .setName('Party members')
            .setDesc('Select characters to include in this session');

        const partyEl = form.createDiv('storyteller-campaign-party-selector');
        const renderParty = () => {
            partyEl.empty();
            // Chip list of selected characters
            for (const name of partyCharacterNames) {
                const chip = partyEl.createSpan({ cls: 'storyteller-campaign-party-chip', text: name });
                chip.style.cursor = 'pointer';
                chip.title = 'Click to remove';
                chip.addEventListener('click', () => {
                    const idx = partyCharacterNames.indexOf(name);
                    if (idx >= 0) { partyCharacterNames.splice(idx, 1); partyCharacterIds.splice(idx, 1); }
                    renderParty();
                });
            }
            // Add dropdown
            const addSel = partyEl.createEl('select', { cls: 'storyteller-campaign-party-add' }) as HTMLSelectElement;
            addSel.createEl('option', { value: '', text: '+ Add character…' });
            for (const ch of this.characters) {
                if (!partyCharacterIds.includes(ch.id ?? ch.name)) {
                    addSel.createEl('option', { value: ch.id ?? ch.name, text: ch.name });
                }
            }
            addSel.addEventListener('change', () => {
                const ch = this.characters.find(c => (c.id ?? c.name) === addSel.value);
                if (ch) {
                    partyCharacterIds.push(ch.id ?? ch.name);
                    partyCharacterNames.push(ch.name);
                    renderParty();
                }
            });
        };
        renderParty();

        // Footer buttons
        const footer = form.createDiv('storyteller-modal-footer');
        const cancelBtn = footer.createEl('button', { cls: 'storyteller-modal-btn', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const startBtn = footer.createEl('button', { cls: 'storyteller-modal-btn mod-cta', text: 'Start Session' });
        startBtn.addEventListener('click', async () => {
            if (!sessionName.trim()) {
                new Notice('Please enter a session name.');
                return;
            }
            const activeStory = this.plugin.getActiveStory();
            if (!activeStory) {
                new Notice('No active story. Please select a story first.');
                return;
            }

            const partyItems: string[] = [];
            for (const character of this.characters) {
                const charId = character.id ?? character.name;
                if (!partyCharacterIds.includes(charId)) continue;
                for (const ownedItem of character.ownedItems ?? []) {
                    const exists = partyItems.some(item => item.trim().toLowerCase() === ownedItem.trim().toLowerCase());
                    if (!exists) partyItems.push(ownedItem);
                }
            }

            const session: CampaignSession = {
                name: sessionName.trim(),
                storyId: activeStory.id,
                currentSceneId: startingSceneId,
                currentSceneName: startingSceneName,
                partyCharacterIds,
                partyCharacterNames,
                partyItems,
                partyState: partyCharacterIds.map((id, i) => ({
                    characterId: id,
                    characterName: partyCharacterNames[i],
                    currentHp: 0,
                    maxHp: 0,
                })),
                status: 'active',
            };

            await this.plugin.saveSession(session);
            new Notice(`Session "${session.name}" created.`);
            this.close();
            this.onSessionSelected(session);
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
