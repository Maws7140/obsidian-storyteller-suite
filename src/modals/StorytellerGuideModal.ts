import { App, ButtonComponent, Modal } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import {
    getGettingStartedGuide,
    getWhatsNewGuide,
    renderGuideDocument,
} from '../tutorial/StorytellerGuideContent';

export type StorytellerGuideMode = 'getting-started' | 'whats-new';

export class StorytellerGuideModal extends Modal {
    constructor(
        app: App,
        private plugin: StorytellerSuitePlugin,
        private mode: StorytellerGuideMode
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('storyteller-guide-modal');

        const version = this.plugin.manifest.version;
        const guide = this.mode === 'whats-new'
            ? getWhatsNewGuide(version)
            : getGettingStartedGuide(version);

        this.titleEl.setText(guide.title);
        renderGuideDocument(contentEl, guide, {
            collapsible: true,
            openFirstCount: this.mode === 'whats-new' ? 2 : 1,
            hideTitle: true,
        });

        const footerEl = contentEl.createDiv('storyteller-guide-footer');

        new ButtonComponent(footerEl)
            .setIcon('layout-dashboard')
            .setButtonText('Open dashboard')
            .setCta()
            .onClick(() => {
                this.close();
                void this.plugin.activateView();
            });

        if (this.mode === 'whats-new') {
            new ButtonComponent(footerEl)
                .setIcon('book-open')
                .setButtonText('Open getting started guide')
                .onClick(() => {
                    this.close();
                    this.plugin.openGettingStartedGuide();
                });
        } else {
            new ButtonComponent(footerEl)
                .setIcon('sparkles')
                .setButtonText('Open update highlights')
                .onClick(() => {
                    this.close();
                    this.plugin.openWhatsNewGuide();
                });
        }

        new ButtonComponent(footerEl)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
