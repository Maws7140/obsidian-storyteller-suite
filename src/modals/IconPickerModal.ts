/**
 * Icon picker for timeline entities (events and scenes).
 *
 * Four tabs: Icons (Lucide, Map Ink symbols and installed icon packs, with a colour
 * row), Emoji, Image (vault, upload or web link) and Recent. The modal reports the
 * chosen value and colour through onChoose; it never writes the note itself.
 */

import { App, Modal, Notice, Setting, getIconIds, requestUrl, setIcon } from 'obsidian';
import type { RequestUrlResponse } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { SYMBOLS } from '../leaflet/ink/symbols';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { isValidIconColor, parseIconValue } from '../utils/EntityIcon';
import {
    clearIconPackCache,
    drawPackGlyph,
    loadIconPacks,
    packResourcePath,
    renderIconPreview,
} from '../utils/IconPreview';
import { planPackIcons } from '../utils/IconPackNames';
import type { PackListing } from '../utils/IconPackNames';
import { EMOJI_GROUPS } from '../utils/IconEmojiCatalogue';
import {
    MAX_ICON_DOWNLOAD_BYTES,
    colourInputValue,
    isTintableIconKind,
    normaliseRecentIcons,
    parseColourInput,
    rememberRecentIcon,
    uploadFileName,
    validateWebImageUrl,
    webImageFileName,
} from '../utils/IconPickerLogic';

export interface IconPickerOptions {
    /** Current value, if the entity already has one. */
    current?: string;
    /** Current colour, if any. */
    currentColor?: string;
    /** Called once when the user chooses a value. `null` clears the icon. */
    onChoose: (value: string | null, color: string | null) => void;
}

type TabId = 'icons' | 'emoji' | 'image' | 'recent';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
    { id: 'icons', label: 'Icons' },
    { id: 'emoji', label: 'Emoji' },
    { id: 'image', label: 'Image' },
    { id: 'recent', label: 'Recent' },
];

/** Quick colour swatches, the same palette as the Map Ink toolbar. */
const COLOUR_SWATCHES = ['#2b2118', '#8b5a2b', '#3b6fa8', '#3f7d3a', '#b03a2e', '#c9a227', '#7b4fa0', '#6b6258'];

/** Icons drawn per page of the Icons grid. */
const PAGE_SIZE = 300;

const DEFAULT_UPLOAD_FOLDER = 'StorytellerSuite/GalleryUploads';
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const UNSUPPORTED_IMAGE = 'That file cannot be used as an icon. Use a PNG, JPEG, GIF, WebP, SVG, AVIF or BMP image.';

interface CatalogueEntry {
    value: string;
    label: string;
    /** Lower-case text the search matches against. */
    search: string;
    kind: 'lucide' | 'ink' | 'pack';
    pack?: PackListing;
    file?: string;
}

let instanceCounter = 0;

export class IconPickerModal extends Modal {
    private readonly plugin: StorytellerSuitePlugin;
    private readonly options: IconPickerOptions;
    private readonly uid = ++instanceCounter;

    private value: string | null;
    private colour: string | null;
    private tab: TabId;

    private catalogue: CatalogueEntry[] | null = null;
    private catalogueLoad: Promise<void> | null = null;
    private query = '';
    private limit = PAGE_SIZE;
    private renderQueued = false;

    private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
    private readonly panels = new Map<TabId, HTMLElement>();
    private swatchButtons: HTMLButtonElement[] = [];

    private searchInput!: HTMLInputElement;
    private hexInput!: HTMLInputElement;
    private colourInput!: HTMLInputElement;
    private iconGrid!: HTMLElement;
    private iconCount!: HTMLElement;
    private iconMore!: HTMLButtonElement;
    private recentGrid!: HTMLElement;
    private recentEmpty!: HTMLElement;
    private emojiInput!: HTMLInputElement;
    private emojiHint!: HTMLElement;
    private imageCurrent!: HTMLElement;
    private imageStatus!: HTMLElement;
    private uploadInput!: HTMLInputElement;
    private webToggle!: HTMLButtonElement;
    private webForm!: HTMLElement;
    private urlInput!: HTMLInputElement;
    private urlHint!: HTMLElement;
    private urlPreview!: HTMLElement;
    private saveCopy!: HTMLInputElement;
    private useLinkButton!: HTMLButtonElement;
    private footerPreview!: HTMLElement;
    private footerLabel!: HTMLElement;
    private chooseButton!: HTMLButtonElement;
    private busy = false;

    constructor(app: App, plugin: StorytellerSuitePlugin, options: IconPickerOptions) {
        super(app);
        this.plugin = plugin;
        this.options = options;
        const current = typeof options.current === 'string' ? options.current.trim() : '';
        this.value = current && parseIconValue(current) ? current : null;
        this.colour = isValidIconColor(options.currentColor) ? options.currentColor.trim() : null;
        const kind = this.value ? parseIconValue(this.value)?.kind : undefined;
        if (kind === 'emoji') this.tab = 'emoji';
        else if (kind === 'vault' || kind === 'url' || kind === 'data') this.tab = 'image';
        else this.tab = 'icons';
    }

    onOpen(): void {
        this.setTitle('Choose an icon');
        this.modalEl.addClass('storyteller-icon-picker-modal');
        const root = this.contentEl.createDiv({ cls: 'storyteller-icon-picker' });
        this.buildTabs(root);
        const body = root.createDiv({ cls: 'storyteller-icon-picker-body' });
        this.buildIconsPanel(body);
        this.buildEmojiPanel(body);
        this.buildImagePanel(body);
        this.buildRecentPanel(body);
        this.buildFooter(root);

        clearIconPackCache();
        this.catalogue = null;
        this.catalogueLoad = null;
        this.showTab(this.tab, false);
        this.renderRecent();
        this.refreshFooter();
        void this.loadCatalogue().then(() => this.renderIconGrid());
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // ----- Layout -----

    private tabDomId(id: TabId): string {
        return `storyteller-icon-picker-${this.uid}-tab-${id}`;
    }

    private panelDomId(id: TabId): string {
        return `storyteller-icon-picker-${this.uid}-panel-${id}`;
    }

    private buildTabs(root: HTMLElement): void {
        const bar = root.createDiv({
            cls: 'storyteller-icon-picker-tabs',
            attr: { role: 'tablist', 'aria-label': 'Icon sources' },
        });
        TABS.forEach((tab, index) => {
            const button = bar.createEl('button', {
                cls: 'storyteller-icon-picker-tab',
                text: tab.label,
                attr: {
                    type: 'button',
                    role: 'tab',
                    id: this.tabDomId(tab.id),
                    'aria-controls': this.panelDomId(tab.id),
                    'aria-selected': 'false',
                    tabindex: '-1',
                },
            });
            button.addEventListener('click', () => this.showTab(tab.id, false));
            button.addEventListener('keydown', evt => this.onTabKey(evt, index));
            this.tabButtons.set(tab.id, button);
        });
    }

    private makePanel(body: HTMLElement, id: TabId): HTMLElement {
        const panel = body.createDiv({
            cls: 'storyteller-icon-picker-panel',
            attr: {
                role: 'tabpanel',
                id: this.panelDomId(id),
                'aria-labelledby': this.tabDomId(id),
                tabindex: '0',
            },
        });
        this.panels.set(id, panel);
        return panel;
    }

    private showTab(id: TabId, focus: boolean): void {
        this.tab = id;
        for (const [tabId, button] of this.tabButtons) {
            const active = tabId === id;
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
            button.classList.toggle('is-active', active);
        }
        for (const [panelId, panel] of this.panels) {
            panel.hidden = panelId !== id;
        }
        if (focus) this.tabButtons.get(id)?.focus();
    }

    private onTabKey(evt: KeyboardEvent, index: number): void {
        let next = -1;
        switch (evt.key) {
            case 'ArrowRight': next = (index + 1) % TABS.length; break;
            case 'ArrowLeft': next = (index - 1 + TABS.length) % TABS.length; break;
            case 'Home': next = 0; break;
            case 'End': next = TABS.length - 1; break;
            default: return;
        }
        evt.preventDefault();
        this.showTab(TABS[next].id, true);
    }

    private buildFooter(root: HTMLElement): void {
        const footer = root.createDiv({ cls: 'storyteller-icon-picker-footer' });
        const current = footer.createDiv({ cls: 'storyteller-icon-picker-current' });
        this.footerPreview = current.createDiv({ cls: 'storyteller-icon-picker-footer-chip' });
        this.footerLabel = current.createDiv({ cls: 'storyteller-icon-picker-footer-label', attr: { 'aria-live': 'polite' } });

        const buttons = footer.createDiv({ cls: 'storyteller-icon-picker-footer-buttons' });
        const clear = buttons.createEl('button', { text: 'Clear', attr: { type: 'button' } });
        clear.addEventListener('click', () => this.finish(null, null));
        const cancel = buttons.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
        cancel.addEventListener('click', () => this.close());
        this.chooseButton = buttons.createEl('button', { cls: 'mod-cta', text: 'Choose', attr: { type: 'button' } });
        this.chooseButton.addEventListener('click', () => this.choose());
    }

    // ----- Icons tab -----

    private buildIconsPanel(body: HTMLElement): void {
        const panel = this.makePanel(body, 'icons');
        const header = panel.createDiv({ cls: 'storyteller-icon-picker-sticky' });

        this.searchInput = header.createEl('input', {
            cls: 'storyteller-icon-picker-search',
            attr: {
                type: 'search',
                placeholder: 'Search icons, symbols and packs',
                'aria-label': 'Search icons',
                autocomplete: 'off',
                spellcheck: 'false',
            },
        });
        this.searchInput.addEventListener('input', () => {
            this.query = this.searchInput.value.trim().toLowerCase();
            this.limit = PAGE_SIZE;
            this.renderIconGrid();
        });

        this.buildColourRow(header);

        this.iconCount = panel.createDiv({
            cls: 'storyteller-icon-picker-count',
            attr: { 'aria-live': 'polite' },
        });
        this.iconGrid = panel.createDiv({
            cls: 'storyteller-icon-picker-grid',
            attr: { role: 'group', 'aria-label': 'Icons' },
        });
        this.iconMore = panel.createEl('button', {
            cls: 'storyteller-icon-picker-more',
            text: 'Show more',
            attr: { type: 'button' },
        });
        this.iconMore.addEventListener('click', () => {
            this.limit += PAGE_SIZE;
            this.renderIconGrid();
        });
    }

    private buildColourRow(parent: HTMLElement): void {
        const row = parent.createDiv({
            cls: 'storyteller-icon-picker-colour',
            attr: { role: 'group', 'aria-label': 'Icon colour' },
        });
        row.createSpan({ cls: 'storyteller-icon-picker-colour-label', text: 'Colour' });

        const swatches = row.createDiv({ cls: 'storyteller-icon-picker-swatches' });
        for (const hex of COLOUR_SWATCHES) {
            const button = swatches.createEl('button', {
                cls: 'storyteller-icon-picker-swatch',
                attr: { type: 'button', 'aria-label': `Colour ${hex}`, title: hex, 'aria-pressed': 'false' },
            });
            button.style.setProperty('--storyteller-icon-picker-swatch', hex);
            button.addEventListener('click', () => this.setColour(hex));
            this.swatchButtons.push(button);
        }

        this.hexInput = row.createEl('input', {
            cls: 'storyteller-icon-picker-hex',
            attr: { type: 'text', placeholder: 'Hex code', 'aria-label': 'Colour as hex', spellcheck: 'false' },
        });
        this.hexInput.addEventListener('change', () => {
            const typed = this.hexInput.value.trim();
            if (!typed) {
                this.setColour(null);
                return;
            }
            const parsed = parseColourInput(typed);
            if (parsed) {
                this.setColour(parsed);
            } else {
                new Notice('That is not a colour. Use a hex code such as #b03a2e.');
                this.hexInput.value = this.colour ?? '';
            }
        });

        this.colourInput = row.createEl('input', {
            cls: 'storyteller-icon-picker-colour-input',
            attr: { type: 'color', 'aria-label': 'Pick a colour' },
        });
        this.colourInput.addEventListener('input', () => this.setColour(this.colourInput.value));

        const none = row.createEl('button', {
            cls: 'storyteller-icon-picker-none',
            text: 'No colour',
            attr: { type: 'button' },
        });
        none.addEventListener('click', () => this.setColour(null));
    }

    private async loadCatalogue(): Promise<void> {
        if (this.catalogue) return;
        if (!this.catalogueLoad) {
            this.catalogueLoad = (async () => {
                const entries: CatalogueEntry[] = [];

                for (const symbol of SYMBOLS) {
                    entries.push({
                        value: `ink:${symbol.id}`,
                        label: symbol.name,
                        search: `${symbol.name} ${symbol.id} ${symbol.category} ${symbol.keywords.join(' ')}`.toLowerCase(),
                        kind: 'ink',
                    });
                }

                const lucideIds = getIconIds()
                    .filter(id => id.startsWith('lucide-'))
                    .map(id => id.slice('lucide-'.length))
                    .sort();
                for (const id of lucideIds) {
                    entries.push({ value: id, label: id, search: id.toLowerCase(), kind: 'lucide' });
                }

                const packs = await loadIconPacks(this.app);
                const byFolder = new Map(packs.map(pack => [pack.folder, pack]));
                for (const planned of planPackIcons(packs)) {
                    entries.push({
                        value: planned.value,
                        label: planned.label,
                        search: `${planned.label} ${planned.folder} ${planned.value}`.toLowerCase(),
                        kind: 'pack',
                        pack: byFolder.get(planned.folder),
                        file: planned.file,
                    });
                }

                this.catalogue = entries;
            })();
        }
        await this.catalogueLoad;
    }

    private renderIconGrid(): void {
        if (!this.iconGrid) return;
        if (!this.catalogue) {
            this.iconGrid.replaceChildren();
            this.iconCount.setText('Loading icons...');
            this.iconMore.hidden = true;
            return;
        }
        const tokens = this.query.split(/\s+/).filter(Boolean);
        const matches = tokens.length === 0
            ? this.catalogue
            : this.catalogue.filter(entry => tokens.every(token => entry.search.includes(token)));
        const shown = matches.slice(0, this.limit);

        this.iconGrid.replaceChildren(...shown.map(entry => this.iconCell(entry)));
        if (matches.length === 0) {
            this.iconCount.setText('No icons match that search.');
        } else if (matches.length > shown.length) {
            this.iconCount.setText(`Showing ${shown.length} of ${matches.length}. Search to narrow the list.`);
        } else {
            this.iconCount.setText(`${matches.length} ${matches.length === 1 ? 'icon' : 'icons'}`);
        }
        this.iconMore.hidden = matches.length <= shown.length;
    }

    private iconCell(entry: CatalogueEntry): HTMLButtonElement {
        return this.cell(entry.label, entry.value, glyph => {
            if (entry.kind === 'pack' && entry.pack && entry.file) {
                drawPackGlyph(glyph, packResourcePath(this.app, entry.pack, entry.file), this.colour ?? undefined);
            } else {
                renderIconPreview(glyph, entry.value, this.colour, this.app);
            }
        });
    }

    // ----- Emoji tab -----

    private buildEmojiPanel(body: HTMLElement): void {
        const panel = this.makePanel(body, 'emoji');
        this.emojiInput = panel.createEl('input', {
            cls: 'storyteller-icon-picker-emoji-input',
            attr: {
                type: 'text',
                placeholder: 'Type or paste any emoji',
                'aria-label': 'Type or paste any emoji',
                autocomplete: 'off',
                spellcheck: 'false',
            },
        });
        this.emojiInput.addEventListener('input', () => this.onEmojiInput());
        this.emojiHint = panel.createDiv({ cls: 'storyteller-icon-picker-hint', attr: { 'aria-live': 'polite' } });

        for (const group of EMOJI_GROUPS) {
            const headingId = `storyteller-icon-picker-${this.uid}-emoji-${group.id}`;
            panel.createEl('h3', {
                cls: 'storyteller-icon-picker-group-title',
                text: group.name,
                attr: { id: headingId },
            });
            const grid = panel.createDiv({
                cls: 'storyteller-icon-picker-grid storyteller-icon-picker-grid-emoji',
                attr: { role: 'group', 'aria-labelledby': headingId },
            });
            for (const emoji of group.emoji) {
                grid.appendChild(this.cell(emoji, emoji, glyph => renderIconPreview(glyph, emoji, null, this.app)));
            }
        }
    }

    private onEmojiInput(): void {
        const typed = this.emojiInput.value.trim();
        if (!typed) {
            this.emojiHint.setText('');
            return;
        }
        if (parseIconValue(typed)?.kind === 'emoji') {
            this.emojiHint.setText('');
            this.setValue(typed);
        } else {
            this.emojiHint.setText('That is not an emoji. Paste an emoji or pick one below.');
        }
    }

    // ----- Image tab -----

    private buildImagePanel(body: HTMLElement): void {
        const panel = this.makePanel(body, 'image');

        const actions = panel.createDiv({
            cls: 'storyteller-icon-picker-actions',
            attr: { role: 'group', 'aria-label': 'Image source' },
        });
        this.actionButton(actions, 'folder-open', 'From vault', () => this.pickFromVault());
        this.actionButton(actions, 'upload', 'Upload from this device', () => this.uploadInput.click());
        this.webToggle = this.actionButton(actions, 'globe', 'From the web', () => this.toggleWebForm());
        this.webToggle.setAttribute('aria-expanded', 'false');
        this.webToggle.setAttribute('aria-controls', `storyteller-icon-picker-${this.uid}-web`);

        this.uploadInput = panel.createEl('input', { attr: { type: 'file', accept: 'image/*', 'aria-label': 'Upload an image' } });
        this.uploadInput.hidden = true;
        this.uploadInput.addEventListener('change', () => {
            const file = this.uploadInput.files?.[0];
            this.uploadInput.value = '';
            if (file) void this.uploadLocalFile(file);
        });

        this.imageCurrent = panel.createDiv({ cls: 'storyteller-icon-picker-image-current' });
        this.imageStatus = panel.createDiv({ cls: 'storyteller-icon-picker-status', attr: { 'aria-live': 'polite' } });

        this.webForm = panel.createDiv({
            cls: 'storyteller-icon-picker-web',
            attr: { id: `storyteller-icon-picker-${this.uid}-web` },
        });
        this.webForm.hidden = true;
        this.urlInput = this.webForm.createEl('input', {
            cls: 'storyteller-icon-picker-url',
            attr: {
                type: 'url',
                placeholder: 'https://example.com/dragon.png',
                'aria-label': 'Image link',
                inputmode: 'url',
                autocomplete: 'off',
                spellcheck: 'false',
            },
        });
        this.urlInput.addEventListener('input', () => this.onUrlInput());
        this.urlHint = this.webForm.createDiv({ cls: 'storyteller-icon-picker-hint', attr: { 'aria-live': 'polite' } });
        this.urlPreview = this.webForm.createDiv({ cls: 'storyteller-icon-picker-url-preview' });

        const toggle = this.webForm.createEl('label', { cls: 'storyteller-icon-picker-toggle' });
        this.saveCopy = toggle.createEl('input', { attr: { type: 'checkbox' } });
        this.saveCopy.checked = true;
        toggle.createSpan({ text: 'Save a copy in my vault' });
        this.webForm.createDiv({
            cls: 'storyteller-icon-picker-help',
            text: `Copies are saved in ${this.uploadFolder()}, so they keep loading and export cleanly. Without a copy, the timeline loads the image from the site.`,
        });

        this.useLinkButton = this.webForm.createEl('button', {
            cls: 'mod-cta',
            text: 'Use this image',
            attr: { type: 'button' },
        });
        this.useLinkButton.disabled = true;
        this.useLinkButton.addEventListener('click', () => void this.useWebImage());
    }

    private actionButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const button = parent.createEl('button', { cls: 'storyteller-icon-picker-action', attr: { type: 'button' } });
        const glyph = button.createSpan({ cls: 'storyteller-icon-picker-action-icon' });
        setIcon(glyph, icon);
        button.createSpan({ text: label });
        button.addEventListener('click', onClick);
        return button;
    }

    private toggleWebForm(): void {
        this.webForm.hidden = !this.webForm.hidden;
        this.webToggle.setAttribute('aria-expanded', String(!this.webForm.hidden));
        if (!this.webForm.hidden) this.urlInput.focus();
    }

    private uploadFolder(): string {
        return (this.plugin.settings.galleryUploadFolder || DEFAULT_UPLOAD_FOLDER).replace(/\/+$/, '');
    }

    private pickFromVault(): void {
        new GalleryImageSuggestModal(this.app, this.plugin, image => {
            if (!image) return;
            const path = image.filePath;
            if (parseIconValue(path)?.kind !== 'vault' || !this.app.vault.getAbstractFileByPath(path)) {
                new Notice(UNSUPPORTED_IMAGE);
                return;
            }
            this.setValue(path);
            this.setStatus('Image selected from your vault.');
        }).open();
    }

    private async uploadLocalFile(file: File): Promise<void> {
        if (this.busy) return;
        if (!file.type.startsWith('image/') && !IMAGE_NAME.test(file.name)) {
            new Notice(UNSUPPORTED_IMAGE);
            return;
        }
        if (file.size > MAX_ICON_DOWNLOAD_BYTES) {
            new Notice('That image is too large. Choose one that is under 20 megabytes.');
            return;
        }
        const name = uploadFileName(file.name, Date.now());
        const path = `${this.uploadFolder()}/${name}`;
        if (parseIconValue(path)?.kind !== 'vault') {
            new Notice(UNSUPPORTED_IMAGE);
            return;
        }
        this.setBusy(true, 'Saving image...');
        try {
            await this.saveToUploads(path, await file.arrayBuffer(), titleFromName(name));
            this.setValue(path);
            this.setStatus(`Image uploaded: ${name}`);
        } catch {
            this.setStatus('');
            new Notice('Could not save that image in your vault. Try again.');
        } finally {
            this.setBusy(false);
        }
    }

    private onUrlInput(): void {
        const typed = this.urlInput.value.trim();
        const url = validateWebImageUrl(typed);
        this.useLinkButton.disabled = !url || this.busy;
        this.urlPreview.replaceChildren();
        if (!typed) {
            this.urlHint.setText('');
            return;
        }
        if (!url) {
            this.urlHint.setText('Enter a full web link to the image.');
            return;
        }
        this.urlHint.setText('');
        const img = activeDocument.createElement('img');
        img.className = 'storyteller-icon-picker-url-img';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
            this.urlPreview.replaceChildren();
            this.urlHint.setText('No preview for that link. You can still use it if it is a direct image link.');
        };
        img.src = url;
        this.urlPreview.appendChild(img);
    }

    private async useWebImage(): Promise<void> {
        if (this.busy) return;
        const url = validateWebImageUrl(this.urlInput.value);
        if (!url) {
            new Notice('Enter a full web link to the image.');
            return;
        }
        if (!this.saveCopy.checked) {
            this.setValue(url);
            this.setStatus('Linked. The timeline loads this image from the site, and PNG export may not include it.');
            return;
        }
        this.setBusy(true, 'Downloading image...');
        try {
            const path = await this.downloadWebImage(url);
            if (path) {
                this.setValue(path);
                this.setStatus(`Saved a copy in your vault: ${path}`);
            } else {
                this.setStatus('');
            }
        } finally {
            this.setBusy(false);
        }
    }

    /** Download a link into the uploads folder. Returns the vault path, or null after showing a notice. */
    private async downloadWebImage(url: string): Promise<string | null> {
        let response: RequestUrlResponse;
        try {
            response = await requestUrl({ url, method: 'GET', throw: false });
        } catch {
            new Notice('Could not reach that link. Check the address and your connection.');
            return null;
        }
        if (response.status >= 400) {
            new Notice(`That site answered with an error (${response.status}). Check the link.`);
            return null;
        }
        const size = response.arrayBuffer.byteLength;
        if (size === 0) {
            new Notice('That link returned an empty file.');
            return null;
        }
        if (size > MAX_ICON_DOWNLOAD_BYTES) {
            new Notice('That image is too large to save. The limit is 20 megabytes.');
            return null;
        }
        const contentType = headerValue(response.headers, 'content-type');
        const name = webImageFileName(url, contentType, Date.now());
        if (!name) {
            new Notice('That link does not point to a picture. Try a direct link to an image file.');
            return null;
        }
        const path = `${this.uploadFolder()}/${name}`;
        try {
            await this.saveToUploads(path, response.arrayBuffer, titleFromName(name));
            return path;
        } catch {
            new Notice('Could not save that image in your vault. Try again.');
            return null;
        }
    }

    /** Write a binary into the uploads folder and register it in the gallery, as the cover image upload does. */
    private async saveToUploads(path: string, data: ArrayBuffer, title: string): Promise<void> {
        const folder = path.slice(0, path.lastIndexOf('/'));
        await this.plugin.ensureFolder(folder);
        await this.app.vault.createBinary(path, data);
        await this.plugin.addGalleryImage({ filePath: path, title });
    }

    private setBusy(busy: boolean, message?: string): void {
        this.busy = busy;
        const typed = validateWebImageUrl(this.urlInput.value);
        this.useLinkButton.disabled = busy || !typed;
        if (message) this.setStatus(message);
    }

    private setStatus(text: string): void {
        this.imageStatus.setText(text);
    }

    // ----- Recent tab -----

    private buildRecentPanel(body: HTMLElement): void {
        const panel = this.makePanel(body, 'recent');
        this.recentEmpty = panel.createDiv({
            cls: 'storyteller-icon-picker-empty',
            text: 'No recent picks yet. Choose an icon and it will appear here.',
        });
        this.recentGrid = panel.createDiv({
            cls: 'storyteller-icon-picker-grid',
            attr: { role: 'group', 'aria-label': 'Recent icons' },
        });
    }

    private renderRecent(): void {
        if (!this.recentGrid) return;
        const recent = normaliseRecentIcons(this.plugin.settings.iconPickerRecent);
        this.recentGrid.replaceChildren(...recent.map(value =>
            this.cell(value, value, glyph => renderIconPreview(glyph, value, this.colour, this.app))
        ));
        this.recentEmpty.hidden = recent.length > 0;
    }

    // ----- Shared cell, selection and footer -----

    private cell(label: string, value: string, draw: (glyph: HTMLElement) => void): HTMLButtonElement {
        const cell = activeDocument.createElement('button');
        cell.type = 'button';
        cell.className = 'storyteller-icon-picker-cell';
        cell.dataset.value = value;
        cell.setAttribute('aria-label', label);
        cell.title = label;
        const glyph = activeDocument.createElement('span');
        glyph.className = 'storyteller-icon-picker-glyph';
        cell.appendChild(glyph);
        draw(glyph);
        this.markCell(cell, value === this.value);
        cell.addEventListener('click', () => this.setValue(value));
        cell.addEventListener('dblclick', () => {
            this.setValue(value);
            this.choose();
        });
        cell.addEventListener('keydown', evt => this.onGridKey(evt));
        return cell;
    }

    private markCell(cell: HTMLElement, selected: boolean): void {
        cell.classList.toggle('is-selected', selected);
        cell.setAttribute('aria-pressed', String(selected));
    }

    private onGridKey(evt: KeyboardEvent): void {
        const cell = evt.currentTarget as HTMLButtonElement;
        const grid = cell.parentElement;
        if (!grid) return;
        const cells = Array.from(grid.querySelectorAll<HTMLButtonElement>(':scope > .storyteller-icon-picker-cell'));
        const index = cells.indexOf(cell);
        const columns = columnCount(cells);
        let next: number;
        switch (evt.key) {
            case 'ArrowRight': next = index + 1; break;
            case 'ArrowLeft': next = index - 1; break;
            case 'ArrowDown': next = index + columns; break;
            case 'ArrowUp': next = index - columns; break;
            case 'Home': next = 0; break;
            case 'End': next = cells.length - 1; break;
            default: return;
        }
        if (next < 0 || next >= cells.length) return;
        evt.preventDefault();
        cells[next].focus();
    }

    private setValue(value: string | null): void {
        this.value = value;
        this.refreshFooter();
    }

    private setColour(colour: string | null): void {
        this.colour = colour;
        this.syncColourControls();
        this.scheduleGridRender();
        this.refreshFooter();
    }

    /** Repaint the grids after a colour change. Coalesced into one frame. */
    private scheduleGridRender(): void {
        if (this.renderQueued) return;
        this.renderQueued = true;
        window.requestAnimationFrame(() => {
            this.renderQueued = false;
            this.renderIconGrid();
            this.renderRecent();
        });
    }

    private syncColourControls(): void {
        const selected = this.colour?.toLowerCase();
        this.swatchButtons.forEach((button, index) => {
            const active = selected === COLOUR_SWATCHES[index];
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', String(active));
        });
        if (this.hexInput && activeDocument.activeElement !== this.hexInput) {
            this.hexInput.value = this.colour ?? '';
        }
        if (this.colourInput) this.colourInput.value = colourInputValue(this.colour);
    }

    private refreshFooter(): void {
        if (!this.footerPreview) return;
        renderIconPreview(this.footerPreview, this.value, this.colour, this.app);
        this.footerLabel.setText(this.value ? describeValue(this.value) : 'No icon chosen');
        this.chooseButton.disabled = !this.value;
        this.contentEl.querySelectorAll<HTMLElement>('.storyteller-icon-picker-cell').forEach(cell => {
            this.markCell(cell, cell.dataset.value === this.value);
        });
        this.refreshImageCurrent();
    }

    private refreshImageCurrent(): void {
        if (!this.imageCurrent) return;
        const kind = this.value ? parseIconValue(this.value)?.kind : undefined;
        const isImage = kind === 'vault' || kind === 'url' || kind === 'data';
        this.imageCurrent.replaceChildren();
        const chip = this.imageCurrent.createDiv({ cls: 'storyteller-icon-picker-image-chip' });
        renderIconPreview(chip, isImage ? this.value : null, null, this.app);
        this.imageCurrent.createSpan({
            text: isImage && this.value
                ? `Selected image: ${shortenValue(this.value, 80)}`
                : 'No image selected yet. Choose one below.',
        });
    }

    private choose(): void {
        if (!this.value) return;
        const colour = isTintableIconKind(parseIconValue(this.value)?.kind) ? this.colour : null;
        void this.rememberRecent(this.value);
        this.finish(this.value, colour);
    }

    private finish(value: string | null, colour: string | null): void {
        this.options.onChoose(value, colour);
        this.close();
    }

    /**
     * Add a pick to the front of the recent list. The stored array is changed in place,
     * so no other part of the settings is replaced.
     */
    private async rememberRecent(value: string): Promise<void> {
        const settings = this.plugin.settings;
        if (!Array.isArray(settings.iconPickerRecent)) settings.iconPickerRecent = [];
        const list = settings.iconPickerRecent;
        const next = rememberRecentIcon(list, value);
        list.splice(0, list.length, ...next);
        await this.plugin.saveSettings();
    }
}

/** Setting row for an entity's icon, used in the Media section of the event and scene modals. */
export function addIconSetting(
    parent: HTMLElement,
    app: App,
    plugin: StorytellerSuitePlugin,
    target: { icon?: string; iconColor?: string }
): Setting {
    let clearButton: { setDisabled(disabled: boolean): unknown } | null = null;
    const setting = new Setting(parent).setName('Icon or image');
    const chip = setting.controlEl.createDiv({ cls: 'storyteller-icon-picker-chip' });

    const refresh = (): void => {
        renderIconPreview(chip, target.icon, target.iconColor, app);
        setting.setDesc(describeSelection(target.icon, target.iconColor));
        clearButton?.setDisabled(!target.icon);
    };

    setting.addButton(button => button
        .setButtonText('Choose')
        .setTooltip('Choose an icon, emoji or image')
        .onClick(() => {
            new IconPickerModal(app, plugin, {
                current: target.icon,
                currentColor: target.iconColor,
                onChoose: (value, colour) => {
                    target.icon = value ?? undefined;
                    target.iconColor = colour ?? undefined;
                    refresh();
                },
            }).open();
        }));
    setting.addButton(button => {
        clearButton = button;
        button
            .setButtonText('Clear')
            .setTooltip('Remove the icon')
            .onClick(() => {
                target.icon = undefined;
                target.iconColor = undefined;
                refresh();
            });
    });
    refresh();
    return setting;
}

/** Short text for the settings row: the value and its colour, or None. */
export function describeSelection(icon: string | undefined, colour: string | undefined): string {
    if (!icon) return 'None';
    const text = shortenValue(icon, 60);
    return colour ? `${text}, colour ${colour}` : text;
}

function describeValue(value: string): string {
    const parsed = parseIconValue(value);
    switch (parsed?.kind) {
        case 'lucide': return `Icon: ${parsed.ref}`;
        case 'ink': return `Map symbol: ${parsed.ref}`;
        case 'pack': return `Icon pack: ${shortenValue(value, 60)}`;
        case 'emoji': return 'Emoji';
        case 'vault': return `Image: ${shortenValue(parsed.ref, 60)}`;
        case 'url': return `Web image: ${shortenValue(parsed.ref, 60)}`;
        case 'data': return 'Embedded image';
        default: return shortenValue(value, 60);
    }
}

function shortenValue(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function titleFromName(name: string): string {
    return name.replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
    if (!headers) return null;
    const key = Object.keys(headers).find(item => item.toLowerCase() === name);
    return key ? headers[key] : null;
}

/** Number of grid columns, read from the first row's offsets. */
function columnCount(cells: HTMLElement[]): number {
    if (cells.length === 0) return 1;
    const top = cells[0].offsetTop;
    let count = 0;
    for (const cell of cells) {
        if (cell.offsetTop !== top) break;
        count++;
    }
    return Math.max(1, count);
}
