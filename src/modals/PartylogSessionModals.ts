/*
 * Modals for the Partylog session header, the end of a session and interludes. Each modal
 * keeps its own form state and hands the view parsed values; the view writes the session and
 * the log block.
 */
import { App, Modal, Notice, Setting } from 'obsidian';

export interface SessionHeaderValues {
    number?: number;
    date: string;
    duration: string;
    players: string[];
    scribe: string;
    absent: string[];
    mood: string;
    recap: string;
    goals: string;
}

export interface AdvancementInput {
    character: string;
    detail: string;
    gains: string[];
}

export interface SessionEndValues {
    advancements: AdvancementInput[];
    /** Tag lines for party, character and resource changes, one per line. */
    changeLines: string[];
    hook: string;
    notes: string;
    endSession: boolean;
}

export interface InterludeValues {
    title: string;
    summary: string;
    changeLines: string[];
}

function splitList(value: string): string[] {
    return value.split(',').map(part => part.trim()).filter(part => part.length > 0);
}

function splitLines(value: string): string[] {
    return value.split('\n').map(part => part.trim()).filter(part => part.length > 0);
}

function parseNumber(value: string): number | undefined {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** Session header: number, date, duration, players, scribe, absences, mood, recap and goals. */
export class SessionHeaderModal extends Modal {
    private readonly initial: SessionHeaderValues;
    private readonly onSubmitValues: (values: SessionHeaderValues) => void;

    constructor(app: App, options: { initial: SessionHeaderValues; onSubmit: (values: SessionHeaderValues) => void }) {
        super(app);
        this.initial = options.initial;
        this.onSubmitValues = options.onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Session header' });

        const draft = {
            number: this.initial.number !== undefined ? String(this.initial.number) : '',
            date: this.initial.date,
            duration: this.initial.duration,
            players: this.initial.players.join('\n'),
            scribe: this.initial.scribe,
            absent: this.initial.absent.join(', '),
            mood: this.initial.mood,
            recap: this.initial.recap,
            goals: this.initial.goals,
        };

        new Setting(contentEl).setName('Session number').addText(text => {
            text.setValue(draft.number).setPlaceholder('7').onChange(value => { draft.number = value; });
        });
        new Setting(contentEl).setName('Date').addText(text => {
            text.setValue(draft.date).setPlaceholder('2026-01-31').onChange(value => { draft.date = value; });
        });
        new Setting(contentEl).setName('Duration').addText(text => {
            text.setValue(draft.duration).onChange(value => { draft.duration = value; });
        });
        new Setting(contentEl).setName('Players').setDesc('One per line, as player (character).').addTextArea(text => {
            text.setValue(draft.players).onChange(value => { draft.players = value; });
            text.inputEl.rows = 3;
        });
        new Setting(contentEl).setName('Scribe').addText(text => {
            text.setValue(draft.scribe).onChange(value => { draft.scribe = value; });
        });
        new Setting(contentEl).setName('Absent').setDesc('Comma separated.').addText(text => {
            text.setValue(draft.absent).onChange(value => { draft.absent = value; });
        });
        new Setting(contentEl).setName('Mood').addText(text => {
            text.setValue(draft.mood).onChange(value => { draft.mood = value; });
        });
        new Setting(contentEl).setName('Recap').addTextArea(text => {
            text.setValue(draft.recap).onChange(value => { draft.recap = value; });
            text.inputEl.rows = 3;
        });
        new Setting(contentEl).setName('Goals').addTextArea(text => {
            text.setValue(draft.goals).onChange(value => { draft.goals = value; });
            text.inputEl.rows = 2;
        });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Save header').setCta().onClick(() => {
                this.onSubmitValues({
                    number: parseNumber(draft.number),
                    date: draft.date.trim(),
                    duration: draft.duration.trim(),
                    players: splitLines(draft.players),
                    scribe: draft.scribe.trim(),
                    absent: splitList(draft.absent),
                    mood: draft.mood.trim(),
                    recap: draft.recap.trim(),
                    goals: draft.goals.trim(),
                });
                this.close();
            }))
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }
}

/** End of session: advancements, party changes as tags, hook, notes and whether to mark it completed. */
export class SessionEndModal extends Modal {
    private readonly partyNames: string[];
    private readonly onSubmitValues: (values: SessionEndValues) => void;

    constructor(app: App, options: { partyNames: string[]; onSubmit: (values: SessionEndValues) => void }) {
        super(app);
        this.partyNames = options.partyNames;
        this.onSubmitValues = options.onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'End session' });

        const advancements: AdvancementInput[] = [];
        const draft = { character: this.partyNames[0] ?? '', detail: '', gains: '', changes: '', hook: '', notes: '', endSession: true };

        contentEl.createEl('h4', { text: 'Advancements' });
        const advancementList = contentEl.createDiv('storyteller-campaign-end-advancements');
        const renderAdvancements = () => {
            advancementList.empty();
            if (advancements.length === 0) {
                advancementList.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No advancements yet.' });
            }
            advancements.forEach((entry, index) => {
                const row = advancementList.createDiv('storyteller-campaign-end-advancement');
                const gains = entry.gains.length ? `, ${entry.gains.join(', ')}` : '';
                row.createSpan({ text: `${entry.character}: ${entry.detail || 'advanced'}${gains}` });
                const remove = row.createEl('button', { cls: 'storyteller-campaign-progress-remove', attr: { 'aria-label': 'Remove advancement' } });
                remove.setText('Remove');
                remove.addEventListener('click', () => {
                    advancements.splice(index, 1);
                    renderAdvancements();
                });
            });
        };
        renderAdvancements();

        const addRow = new Setting(contentEl).setName('Add advancement');
        if (this.partyNames.length > 0) {
            addRow.addDropdown(dropdown => {
                for (const name of this.partyNames) dropdown.addOption(name, name);
                dropdown.setValue(draft.character).onChange(value => { draft.character = value; });
            });
        } else {
            addRow.setDesc('Add party members to the session first.');
        }
        addRow.addText(text => text.setPlaceholder('Rogue 6').onChange(value => { draft.detail = value; }));
        addRow.addText(text => text.setPlaceholder('Expertise, extra attack').onChange(value => { draft.gains = value; }));
        addRow.addButton(button => button.setButtonText('Add').onClick(() => {
            if (!draft.character.trim()) {
                new Notice('Choose the character who advanced.');
                return;
            }
            advancements.push({ character: draft.character.trim(), detail: draft.detail.trim(), gains: splitList(draft.gains) });
            renderAdvancements();
        }));

        new Setting(contentEl).setName('Changes as tag lines').setDesc('One per line, as tags. Use a tag for each change to the party.').addTextArea(text => {
            text.setPlaceholder('One tag per line').onChange(value => { draft.changes = value; });
            text.inputEl.rows = 3;
        });
        new Setting(contentEl).setName('Hook for the next session').addText(text => {
            text.setPlaceholder('The shipment arrives in three days.').onChange(value => { draft.hook = value; });
        });
        new Setting(contentEl).setName('Debrief notes').addTextArea(text => {
            text.onChange(value => { draft.notes = value; });
            text.inputEl.rows = 2;
        });
        new Setting(contentEl).setName('Mark session completed').addToggle(toggle => {
            toggle.setValue(draft.endSession).onChange(value => { draft.endSession = value; });
        });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Save end of session').setCta().onClick(() => {
                this.onSubmitValues({
                    advancements: advancements.map(entry => ({ ...entry, gains: [...entry.gains] })),
                    changeLines: splitLines(draft.changes),
                    hook: draft.hook.trim(),
                    notes: draft.notes.trim(),
                    endSession: draft.endSession,
                });
                this.close();
            }))
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }
}

/** Interlude between sessions: title, summary and tag lines for the changes it made. */
export class InterludeModal extends Modal {
    private readonly onSubmitValues: (values: InterludeValues) => void;

    constructor(app: App, options: { onSubmit: (values: InterludeValues) => void }) {
        super(app);
        this.onSubmitValues = options.onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Interlude' });

        const draft = { title: '', summary: '', changes: '' };
        new Setting(contentEl).setName('Title').addText(text => {
            text.setPlaceholder('One week, coast road').onChange(value => { draft.title = value; });
        });
        new Setting(contentEl).setName('Summary').addTextArea(text => {
            text.onChange(value => { draft.summary = value; });
            text.inputEl.rows = 3;
        });
        new Setting(contentEl).setName('Changes as tag lines').setDesc('One per line, as tags. Use a tag for each change the interlude made.').addTextArea(text => {
            text.onChange(value => { draft.changes = value; });
            text.inputEl.rows = 3;
        });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Add interlude').setCta().onClick(() => {
                const title = draft.title.trim();
                if (!title) {
                    new Notice('Enter a title for the interlude.');
                    return;
                }
                this.onSubmitValues({
                    title,
                    summary: draft.summary.trim(),
                    changeLines: splitLines(draft.changes),
                });
                this.close();
            }))
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }
}

export type ProgressAddKind = 'clock' | 'track' | 'timer' | 'thread' | 'goal' | 'quest';

export interface ProgressAddValues {
    name: string;
    kind: ProgressAddKind;
    /** Segments for clocks and tracks, starting count for timers. Ignored for threads, goals and quests. */
    size: number;
}

const PROGRESS_KIND_OPTIONS: ReadonlyArray<{ value: ProgressAddKind; label: string }> = [
    { value: 'clock', label: 'Clock' },
    { value: 'track', label: 'Track' },
    { value: 'timer', label: 'Timer' },
    { value: 'thread', label: 'Thread' },
    { value: 'goal', label: 'Goal' },
    { value: 'quest', label: 'Quest' },
];

/** Adds a clock, track, timer, thread, goal or quest to the live session. */
export class AddProgressModal extends Modal {
    private readonly initialKind: ProgressAddKind;
    private readonly onSubmitValues: (values: ProgressAddValues) => void;

    constructor(app: App, options: { initialKind: ProgressAddKind; onSubmit: (values: ProgressAddValues) => void }) {
        super(app);
        this.initialKind = options.initialKind;
        this.onSubmitValues = options.onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Add progress' });

        const draft: { name: string; kind: ProgressAddKind; size: number } = { name: '', kind: this.initialKind, size: 4 };
        new Setting(contentEl).setName('Name').addText(text => {
            text.setPlaceholder('Ritual').onChange(value => { draft.name = value; });
        });
        new Setting(contentEl).setName('Type').addDropdown(dropdown => {
            for (const option of PROGRESS_KIND_OPTIONS) dropdown.addOption(option.value, option.label);
            dropdown.setValue(draft.kind).onChange(value => { draft.kind = value as ProgressAddKind; });
        });
        new Setting(contentEl).setName('Size').setDesc('Segments for clocks and tracks, starting count for timers.').addDropdown(dropdown => {
            for (let size = 2; size <= 24; size += 1) dropdown.addOption(String(size), String(size));
            dropdown.setValue(String(draft.size)).onChange(value => { draft.size = Number.parseInt(value, 10); });
        });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Add').setCta().onClick(() => {
                const name = draft.name.trim();
                if (!name) {
                    new Notice('Enter a name.');
                    return;
                }
                this.onSubmitValues({ name, kind: draft.kind, size: draft.size });
                this.close();
            }))
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    }
}
