import { App, Modal, Setting } from 'obsidian';
import { t } from '../../i18n/strings';

export class ConfirmModal extends Modal {
  private titleText: string;
  private bodyText: string;
  private confirmText: string;
  private onConfirm: () => void;

  constructor(app: App, options: { title: string; body: string; confirmText?: string; onConfirm: () => void; }) {
    super(app);
    this.titleText = options.title;
    this.bodyText = options.body;
    this.confirmText = options.confirmText ?? t('confirm');
    this.onConfirm = options.onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: this.titleText });
    contentEl.createEl('p', { text: this.bodyText });

    const buttons = new Setting(contentEl);
    buttons.addButton(b => b.setButtonText(this.confirmText).setCta().onClick(() => { this.onConfirm(); this.close(); }));
    buttons.addButton(b => b.setButtonText(t('cancel')).onClick(() => this.close()));
  }
}
