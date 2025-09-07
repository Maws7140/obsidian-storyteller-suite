import { App, Modal, Setting, TextComponent } from 'obsidian';
import { t } from '../../i18n/strings';

export class PromptModal extends Modal {
  private titleText: string;
  private labelText: string;
  private defaultValue: string;
  private validator?: (value: string) => string | null;
  private onSubmit: (value: string) => void;

  constructor(app: App, options: { title: string; label: string; defaultValue?: string; validator?: (v: string) => string | null; onSubmit: (v: string) => void; }) {
    super(app);
    this.titleText = options.title;
    this.labelText = options.label;
    this.defaultValue = options.defaultValue ?? '';
    this.validator = options.validator;
    this.onSubmit = options.onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: this.titleText });

    let input: TextComponent | null = null;
    let errorEl: HTMLElement | null = null;

    new Setting(contentEl)
      .setName(this.labelText)
      .addText(t => {
        input = t.setValue(this.defaultValue);
      });

    errorEl = contentEl.createDiv({ cls: 'mod-warning' });
    errorEl.style.display = 'none';

    const submit = () => {
      const value = (input?.getValue() ?? '').trim();
      if (this.validator) {
        const err = this.validator(value);
        if (err) {
          errorEl!.style.display = '';
          errorEl!.setText(err);
          return;
        }
      }
      this.onSubmit(value);
      this.close();
    };

    const buttons = new Setting(contentEl);
    buttons.addButton(b => b.setButtonText(t('ok')).setCta().onClick(submit));
    buttons.addButton(b => b.setButtonText(t('cancel')).onClick(() => this.close()));

    // Keyboard enter to submit
    this.contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }
}
