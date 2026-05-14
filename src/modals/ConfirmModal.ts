import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
    private message: string;
    private onResolve: (value: boolean) => void;

    constructor(app: App, message: string, onResolve: (value: boolean) => void) {
        super(app);
        this.message = message;
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Confirm action' });
        contentEl.createEl('p', { text: this.message });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Confirm')
                    .setCta()
                    .onClick(() => {
                        this.onResolve(true);
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.onResolve(false);
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    static prompt(app: App, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            let resolved = false;
            const modal = new ConfirmModal(app, message, (result) => {
                resolved = true;
                resolve(result);
            });
            
            const originalOnClose = modal.onClose.bind(modal);
            modal.onClose = () => {
                if (!resolved) {
                    resolve(false);
                }
                originalOnClose();
            };
            
            modal.open();
        });
    }
}
