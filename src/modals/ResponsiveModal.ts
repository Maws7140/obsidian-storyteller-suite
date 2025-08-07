import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { PlatformUtils } from '../utils/PlatformUtils';

/**
 * Base class for mobile-responsive modals
 * Provides common mobile adaptations and responsive behavior
 */
export abstract class ResponsiveModal extends Modal {
    protected isFullScreen = false;

    constructor(app: App) {
        super(app);
        this.setupMobileAdaptations();
    }

    /**
     * Sets up mobile-specific adaptations for the modal
     */
    private setupMobileAdaptations(): void {
        // Apply mobile CSS classes
        const mobileClasses = PlatformUtils.getMobileCssClasses();
        mobileClasses.forEach(className => {
            this.modalEl.addClass(className);
        });

        // Add responsive modal class
        this.modalEl.addClass('storyteller-responsive-modal');

        // Set up full-screen modal for mobile
        if (PlatformUtils.shouldUseFullScreenModals()) {
            this.isFullScreen = true;
            this.modalEl.addClass('mobile-fullscreen');
        }

        // Add platform-specific classes
        if (PlatformUtils.isMobile()) {
            this.modalEl.addClass('mobile-optimized');
        }

        if (PlatformUtils.isTablet()) {
            this.modalEl.addClass('tablet-optimized');
        }
    }

    /**
     * Enhanced onOpen method with mobile optimizations
     */
    onOpen(): void {
        this.setupMobileLayout();
        super.onOpen();
    }

    /**
     * Sets up mobile-specific layout optimizations
     */
    private setupMobileLayout(): void {
        const { contentEl } = this;
        
        // Apply mobile padding
        if (PlatformUtils.isMobile()) {
            contentEl.style.padding = PlatformUtils.getModalPadding();
        }

        // Add touch-friendly scrolling
        if (PlatformUtils.isMobile()) {
            // Use CSS property for WebKit touch scrolling
            contentEl.style.setProperty('-webkit-overflow-scrolling', 'touch');
            contentEl.style.overflowY = 'auto';
        }

        // Handle safe areas on iOS
        if (PlatformUtils.isIOS()) {
            contentEl.style.paddingTop = 'env(safe-area-inset-top, 0)';
            contentEl.style.paddingBottom = 'env(safe-area-inset-bottom, 0)';
        }
    }

    /**
     * Creates a mobile-optimized setting with proper touch targets
     * @param container Container element
     * @param name Setting name
     * @param desc Setting description
     * @returns Setting instance
     */
    protected createMobileSetting(container: HTMLElement, name: string, desc: string): Setting {
        const setting = new Setting(container)
            .setName(name)
            .setDesc(desc);

        // Add mobile-friendly styling
        if (PlatformUtils.isMobile()) {
            setting.settingEl.addClass('mobile-setting');
            
            // Ensure minimum touch target size
            const touchTargetSize = PlatformUtils.getTouchTargetSize();
            setting.settingEl.style.minHeight = `${touchTargetSize}px`;
        }

        return setting;
    }

    /**
     * Creates a mobile-optimized button with proper sizing
     * @param text Button text
     * @param callback Click callback
     * @param isPrimary Whether this is a primary action button
     * @returns ButtonComponent
     */
    protected createMobileButton(text: string, callback: () => void, isPrimary = false): ButtonComponent {
        const button = new ButtonComponent(document.createElement('button'))
            .setButtonText(text)
            .onClick(callback);

        // Mobile-specific styling
        if (PlatformUtils.isMobile()) {
            const touchTargetSize = PlatformUtils.getTouchTargetSize();
            button.buttonEl.style.minHeight = `${touchTargetSize}px`;
            button.buttonEl.style.minWidth = `${touchTargetSize}px`;
            button.buttonEl.style.fontSize = `${1.1 * PlatformUtils.getFontScaling()}rem`;
            button.buttonEl.addClass('mobile-button');
            
            if (isPrimary) {
                button.buttonEl.addClass('mobile-button-primary');
            }
        }

        return button;
    }

    /**
     * Creates a mobile-optimized text area with proper sizing
     * @param container Container element
     * @param placeholder Placeholder text
     * @param value Initial value
     * @param onChange Change callback
     * @returns HTMLTextAreaElement
     */
    protected createMobileTextArea(
        container: HTMLElement, 
        placeholder: string, 
        value: string, 
        onChange: (value: string) => void
    ): HTMLTextAreaElement {
        const textarea = container.createEl('textarea', {
            attr: { placeholder },
            value
        });

        // Mobile optimizations
        if (PlatformUtils.isMobile()) {
            textarea.addClass('mobile-textarea');
            textarea.style.fontSize = `${1.1 * PlatformUtils.getFontScaling()}rem`;
            textarea.style.minHeight = '120px'; // Taller for mobile
            textarea.style.padding = '12px'; // Larger padding
            
            // Enable better mobile editing
            textarea.setAttribute('autocapitalize', 'sentences');
            textarea.setAttribute('spellcheck', 'true');
        }

        textarea.addEventListener('input', () => onChange(textarea.value));
        return textarea;
    }

    /**
     * Creates a mobile-optimized input field
     * @param container Container element
     * @param type Input type
     * @param placeholder Placeholder text
     * @param value Initial value
     * @param onChange Change callback
     * @returns HTMLInputElement
     */
    protected createMobileInput(
        container: HTMLElement,
        type: string,
        placeholder: string,
        value: string,
        onChange: (value: string) => void
    ): HTMLInputElement {
        const input = container.createEl('input', {
            type,
            attr: { placeholder },
            value
        });

        // Mobile optimizations
        if (PlatformUtils.isMobile()) {
            input.addClass('mobile-input');
            const touchTargetSize = PlatformUtils.getTouchTargetSize();
            input.style.minHeight = `${touchTargetSize}px`;
            input.style.fontSize = `${1.1 * PlatformUtils.getFontScaling()}rem`;
            input.style.padding = '12px';
        }

        input.addEventListener('input', () => onChange(input.value));
        return input;
    }

    /**
     * Creates a mobile-friendly button bar at the bottom of the modal
     * @param buttons Array of button configurations
     */
    protected createMobileButtonBar(buttons: Array<{
        text: string;
        callback: () => void;
        isPrimary?: boolean;
        isDestructive?: boolean;
    }>): HTMLElement {
        const buttonBar = this.contentEl.createEl('div', { cls: 'mobile-button-bar' });

        // On mobile, stack buttons vertically or use horizontal layout for tablets
        if (PlatformUtils.isMobile() && !PlatformUtils.isTablet()) {
            buttonBar.addClass('vertical-button-bar');
        } else {
            buttonBar.addClass('horizontal-button-bar');
        }

        buttons.forEach(buttonConfig => {
            const button = this.createMobileButton(
                buttonConfig.text, 
                buttonConfig.callback,
                buttonConfig.isPrimary
            );

            if (buttonConfig.isDestructive) {
                button.buttonEl.addClass('mod-warning');
            }

            buttonBar.appendChild(button.buttonEl);
        });

        return buttonBar;
    }

    /**
     * Triggers haptic feedback if available and appropriate
     * @param type Type of haptic feedback ('light', 'medium', 'heavy')
     */
    protected triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
        if (!PlatformUtils.shouldUseHapticFeedback()) return;

        // Use the navigator.vibrate API if available (Android)
        if ('vibrate' in navigator) {
            const duration = type === 'light' ? 10 : type === 'medium' ? 20 : 50;
            navigator.vibrate(duration);
        }
    }

    /**
     * Handles mobile-specific keyboard events
     * @param evt Keyboard event
     */
    protected handleMobileKeyboard(evt: KeyboardEvent): void {
        // On mobile, Enter key might behave differently
        if (PlatformUtils.isMobile() && evt.key === 'Enter') {
            // Prevent default behavior in some cases
            if (evt.target instanceof HTMLTextAreaElement) {
                // Allow normal behavior in text areas
                return;
            }
            
            // For other inputs, trigger haptic feedback
            this.triggerHapticFeedback('light');
        }
    }

    /**
     * Shows a mobile-friendly loading state
     * @param show Whether to show loading state
     */
    protected showMobileLoading(show: boolean): void {
        if (show) {
            this.contentEl.addClass('mobile-loading');
            // Could add a spinner or loading animation here
        } else {
            this.contentEl.removeClass('mobile-loading');
        }
    }
}
