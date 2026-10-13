import { App, Modal, Setting } from 'obsidian';
import type { TimelineExportView } from '../utils/NativeTimelineRenderer';

export interface TimelineImageExportChoice {
    view: TimelineExportView;
    scope: 'view' | 'full';
    format: 'png' | 'jpg';
}

const VIEW_LABELS: ReadonlyArray<{ view: TimelineExportView; label: string }> = [
    { view: 'chronology', label: 'Chronology' },
    { view: 'timeline', label: 'Timeline' },
    { view: 'gantt', label: 'Gantt' },
    { view: 'calendar', label: 'Calendar' },
];

/** Pick which timeline view to save as an image, how much of it, and the file type. */
export class TimelineImageExportModal extends Modal {
    private choice: TimelineImageExportChoice;

    constructor(app: App, currentView: TimelineExportView, private readonly onExport: (choice: TimelineImageExportChoice) => void) {
        super(app);
        this.choice = { view: currentView, scope: 'view', format: 'png' };
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.setTitle('Export timeline image');

        new Setting(contentEl)
            .setName('View')
            .setDesc('Any view can be exported, not only the one on screen.')
            .addDropdown(dropdown => {
                for (const { view, label } of VIEW_LABELS) dropdown.addOption(view, label);
                dropdown.setValue(this.choice.view);
                dropdown.onChange(value => { this.choice.view = value as TimelineExportView; });
            });

        new Setting(contentEl)
            .setName('Range')
            .setDesc('Calendar exports the month on screen, or every month with events.')
            .addDropdown(dropdown => {
                dropdown.addOption('view', 'What is in view now');
                dropdown.addOption('full', 'Every event');
                dropdown.setValue(this.choice.scope);
                dropdown.onChange(value => { this.choice.scope = value === 'full' ? 'full' : 'view'; });
            });

        new Setting(contentEl)
            .setName('Format')
            .addDropdown(dropdown => {
                dropdown.addOption('png', 'PNG');
                dropdown.addOption('jpg', 'JPG');
                dropdown.setValue(this.choice.format);
                dropdown.onChange(value => { this.choice.format = value === 'jpg' ? 'jpg' : 'png'; });
            });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
            .addButton(button => button.setButtonText('Export').setCta().onClick(() => {
                this.close();
                this.onExport({ ...this.choice });
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
