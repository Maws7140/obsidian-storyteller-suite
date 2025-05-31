/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ItemView, WorkspaceLeaf, Setting, Notice, App, ButtonComponent, TFile, normalizePath } from 'obsidian'; // Added normalizePath
import StorytellerSuitePlugin from '../main';
// Import necessary modals for button actions (Edit/Create/Detail)
import { CharacterModal } from '../modals/CharacterModal';
import { LocationModal } from '../modals/LocationModal';
import { EventModal } from '../modals/EventModal';
// Remove GalleryModal import if no longer needed directly
// import { GalleryModal } from '../modals/GalleryModal';
import { ImageDetailModal } from '../modals/ImageDetailModal';
// Remove ImageSuggestModal import as we replace its usage
// import { ImageSuggestModal } from '../modals/GalleryModal';
import { Character, Location, Event } from '../types'; // Import types

export const VIEW_TYPE_DASHBOARD = "storyteller-dashboard-view";

export class DashboardView extends ItemView {
    plugin: StorytellerSuitePlugin;
    tabContentContainer: HTMLElement;
    tabHeaderContainer: HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    currentFilter: string = ''; // Store filter state
    fileInput: HTMLInputElement | null = null; // Store file input reference

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_DASHBOARD;
    }

    getDisplayText() {
        return "Storyteller Dashboard";
    }

    getIcon() {
        return "book-open"; // Icon for the view tab
    }

    async onOpen() {
        const container = this.containerEl.children[1]; // View content container
        container.empty();
        container.addClass('storyteller-dashboard-view-container'); // Add a class for styling

        // --- Create a Header Container ---
        const headerContainer = container.createDiv('storyteller-dashboard-header');

        // --- Title (inside the header container) ---
        headerContainer.createEl("h2", {
             text: "Storyteller Suite",
             cls: 'storyteller-dashboard-title' // Add class for potential styling
        });

        // --- Ko-fi Link (inside the header container) ---
        const kofiLink = headerContainer.createEl('a');
        kofiLink.href = 'https://ko-fi.com/kingmaws'; // <<< --- REPLACE WITH YOUR ACTUAL KO-FI URL
        kofiLink.target = '_blank'; // Open in new tab
        kofiLink.rel = 'noopener noreferrer'; // Security best practice
        kofiLink.addClass('storyteller-kofi-link'); // Add class for styling

        // Option 1: Use an icon (requires Obsidian icon font or custom CSS)
        // import { setIcon } from 'obsidian'; // Make sure setIcon is imported at the top
        // setIcon(kofiLink, 'coffee'); // Use 'coffee' or another relevant icon
        // kofiLink.ariaLabel = "Support on Ko-fi"; // Accessibility

        // Option 2: Use text
        kofiLink.setText('Support on Ko-fi'); // Or shorter text like "Donate"

        // --- Tab Headers (Now added AFTER the header container) ---
        this.tabHeaderContainer = container.createDiv('storyteller-dashboard-tabs');

        // --- Tab Content ---
        this.tabContentContainer = container.createDiv('storyteller-dashboard-content');

        // --- Define Tabs ---
        const tabs = [
            { id: 'characters', label: 'Characters', renderFn: this.renderCharactersContent.bind(this) },
            { id: 'locations', label: 'Locations', renderFn: this.renderLocationsContent.bind(this) },
            { id: 'events', label: 'Timeline', renderFn: this.renderEventsContent.bind(this) },
            { id: 'gallery', label: 'Gallery', renderFn: this.renderGalleryContent.bind(this) },
        ];

        // --- Create Tab Headers ---
        tabs.forEach((tab, index) => {
             const header = this.tabHeaderContainer.createEl('div', {
                 text: tab.label,
                 cls: 'storyteller-tab-header' + (index === 0 ? ' active' : '') // Activate first tab
             });
             header.dataset.tabId = tab.id; // Store tab id

             header.addEventListener('click', async () => {
                 // Deactivate others
                 this.tabHeaderContainer.querySelectorAll('.storyteller-tab-header').forEach(h => h.removeClass('active'));
                 // Activate clicked
                 header.addClass('active');
                 // Render content
                 this.currentFilter = ''; // Reset filter on tab switch
                 await tab.renderFn(this.tabContentContainer);
             });
        });

        // --- Initial Content Render ---
        await this.renderCharactersContent(this.tabContentContainer); // Render the first tab initially
    }

    // --- Render Functions for Tab Content ---

    async renderCharactersContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Characters', this.renderCharactersContent.bind(this), () => {
            new CharacterModal(this.app, this.plugin, null, async (char: Character) => {
                await this.plugin.saveCharacter(char);
                new Notice(`Character "${char.name}" created.`);
                await this.renderCharactersContent(container); // Refresh list
            }).open();
        });

        const characters = (await this.plugin.listCharacters()).filter(char =>
            char.name.toLowerCase().includes(this.currentFilter) ||
            (char.description || '').toLowerCase().includes(this.currentFilter) ||
            (char.traits || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (characters.length === 0) {
            listContainer.createEl('p', { text: 'No characters found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        this.renderCharacterList(characters, listContainer, container);
    }

    async renderLocationsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Locations', this.renderLocationsContent.bind(this), () => {
            new LocationModal(this.app, this.plugin, null, async (loc: Location) => {
                await this.plugin.saveLocation(loc);
                new Notice(`Location "${loc.name}" created.`);
                await this.renderLocationsContent(container); // Refresh list
            }).open();
        });

        const locations = (await this.plugin.listLocations()).filter(loc =>
            loc.name.toLowerCase().includes(this.currentFilter) ||
            (loc.description || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container');
        if (locations.length === 0) {
            listContainer.createEl('p', { text: 'No locations found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        this.renderLocationList(locations, listContainer, container);
    }

    async renderEventsContent(container: HTMLElement) {
        container.empty();
        this.renderHeaderControls(container, 'Events / Timeline', this.renderEventsContent.bind(this), () => {
            new EventModal(this.app, this.plugin, null, async (evt: Event) => {
                await this.plugin.saveEvent(evt);
                new Notice(`Event "${evt.name}" created.`);
                await this.renderEventsContent(container); // Refresh list
            }).open();
        });

        const events = (await this.plugin.listEvents()).filter(evt =>
            evt.name.toLowerCase().includes(this.currentFilter) ||
            (evt.description || '').toLowerCase().includes(this.currentFilter) ||
            (evt.dateTime || '').toLowerCase().includes(this.currentFilter) ||
            (evt.location || '').toLowerCase().includes(this.currentFilter)
        );

        const listContainer = container.createDiv('storyteller-list-container storyteller-timeline-container'); // Add timeline class if needed
        if (events.length === 0) {
            listContainer.createEl('p', { text: 'No events found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        this.renderEventList(events, listContainer, container);
    }

    async renderGalleryContent(container: HTMLElement) {
        container.empty();
        const refreshCallback = this.renderGalleryContent.bind(this, container); // Define callback

        this.renderHeaderControls(container, 'Gallery', refreshCallback, () => {
            // --- Upload Image Logic ---
            if (!this.fileInput) {
                // Create file input element if it doesn't exist
                this.fileInput = container.createEl('input', { type: 'file', cls: 'storyteller-hidden' });
                this.fileInput.accept = 'image/*'; // Accept only image files

                this.fileInput.onchange = async (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (!files || files.length === 0) {
                        return; // No file selected
                    }
                    const file = files[0];
                    const uploadFolderPath = this.plugin.settings.galleryUploadFolder;

                    try {
                        // 1. Ensure upload folder exists
                        await this.plugin.ensureFolder(uploadFolderPath);

                        // 2. Determine unique file path
                        let fileName = file.name;
                        let filePath = normalizePath(`${uploadFolderPath}/${fileName}`);
                        let counter = 0;
                        // Check for existing file and add counter if needed
                        while (this.app.vault.getAbstractFileByPath(filePath)) {
                            counter++;
                            const nameParts = file.name.split('.');
                            const extension = nameParts.pop();
                            fileName = `${nameParts.join('.')}_${counter}.${extension}`;
                            filePath = normalizePath(`${uploadFolderPath}/${fileName}`);
                        }

                        // 3. Read file content
                        const arrayBuffer = await file.arrayBuffer();

                        // 4. Create file in vault
                        const createdFile = await this.app.vault.createBinary(filePath, arrayBuffer);
                        new Notice(`Uploaded "${fileName}" to vault.`);

                        // 5. Add to gallery data and open detail modal
                        const newImageData = await this.plugin.addGalleryImage({ filePath: createdFile.path, title: createdFile.basename });
                        new ImageDetailModal(this.app, this.plugin, newImageData, true, refreshCallback).open();

                    } catch (error) {
                        console.error("Error uploading file:", error);
                        new Notice("Error uploading file. Check console for details.");
                    } finally {
                        // Reset file input value to allow uploading the same file again
                        if (this.fileInput) {
                            this.fileInput.value = '';
                        }
                    }
                };
            }
            // Trigger click on the hidden file input
            this.fileInput.click();
        }, "Upload Image"); // Change button text

        const images = this.plugin.getGalleryImages().filter(img =>
            img.filePath.toLowerCase().includes(this.currentFilter) ||
            (img.title || '').toLowerCase().includes(this.currentFilter) ||
            (img.caption || '').toLowerCase().includes(this.currentFilter) ||
            (img.description || '').toLowerCase().includes(this.currentFilter) ||
            (img.tags || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedCharacters || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedLocations || []).join(' ').toLowerCase().includes(this.currentFilter) ||
            (img.linkedEvents || []).join(' ').toLowerCase().includes(this.currentFilter)
        );

        const gridContainer = container.createDiv('storyteller-gallery-grid');
        if (images.length === 0) {
            gridContainer.createEl('p', { text: 'No images found.' + (this.currentFilter ? ' Matching filter.' : '') });
            return;
        }
        // Pass refreshCallback to renderGalleryGrid
        this.renderGalleryGrid(images, gridContainer, refreshCallback);
    }

    // --- Header Controls (Filter + Add Button) ---
    private renderHeaderControls(container: HTMLElement, title: string, filterFn: (filter: string) => Promise<void>, addFn: () => void, addButtonText: string = 'Create new') {
        // --- Header Controls (Filter + Add Button) ---
        new Setting(container)
            .setName(`Filter ${title}`)
            .setDesc('') // Keep desc empty or remove if not needed
            .addText(text => text
                .setPlaceholder(`Search ${title.toLowerCase()}...`)
                .onChange(async (value) => {
                    await filterFn(value.toLowerCase());
                }))
            .addButton(button => button
                .setButtonText(addButtonText)
                .setCta()
                .onClick(addFn));
    }

    // --- List/Grid Rendering Helpers (Adapted from Modals) ---

    renderCharacterList(characters: Character[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        characters.forEach(character => {
            const itemEl = listContainer.createDiv('storyteller-list-item storyteller-character-item'); // Add specific class

            // --- Profile Picture ---
            const imgContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (character.profileImagePath) {
                const imgEl = imgContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(character.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = character.name;
                } catch (e) {
                    console.error(`Error loading profile image for ${character.name}: ${character.profileImagePath}`, e);
                    imgContainer.createSpan({ text: '?', title: 'Error loading image' }); // Placeholder on error
                }
            } else {
                // Optional: Placeholder icon/initials if no image
                imgContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: character.name.substring(0, 1) });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: character.name });
            if (character.description) {
                infoEl.createEl('p', { text: character.description.substring(0, 80) + (character.description.length > 80 ? '...' : '') });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (character.status) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: character.status });
            }
            if (character.affiliation) {
                if (character.status) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-affiliation', text: character.affiliation });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new CharacterModal(this.app, this.plugin, character, async (updatedData: Character) => {
                    await this.plugin.saveCharacter(updatedData);
                    new Notice(`Character "${updatedData.name}" updated.`);
                    await this.renderCharactersContent(viewContainer); // Refresh list
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${character.name}"? This will move the file to system trash.`)) {
                    if (character.filePath) {
                        await this.plugin.deleteCharacter(character.filePath);
                        await this.renderCharactersContent(viewContainer); // Refresh list
                    } else {
                        new Notice('Error: Cannot delete character without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, character.filePath);
        });
    }

    renderLocationList(locations: Location[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        locations.forEach(location => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            // --- Image --- Use pfp class and logic
            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (location.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(location.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = location.name;
                } catch (e) {
                    console.error(`Error loading image for ${location.name}: ${location.profileImagePath}`, e);
                    pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
                }
            } else {
                // Placeholder: First letter of name
                const initials = location.name.substring(0, 1).toUpperCase();
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: initials });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: location.name });
            if (location.description) {
                infoEl.createEl('p', { text: location.description.substring(0, 100) + (location.description.length > 100 ? '...' : '') });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (location.locationType) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-type', text: location.locationType });
            }
            if (location.region) {
                if (location.locationType) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-region', text: `(${location.region})` });
            }
            if (location.status) {
                if (location.locationType || location.region) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: `[${location.status}]` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new LocationModal(this.app, this.plugin, location, async (updatedData) => {
                    await this.plugin.saveLocation(updatedData);
                    new Notice(`Location "${updatedData.name}" updated.`);
                    await this.renderLocationsContent(viewContainer); // Refresh list
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${location.name}"?`)) {
                    if (location.filePath) {
                        await this.plugin.deleteLocation(location.filePath);
                        await this.renderLocationsContent(viewContainer); // Refresh list
                    } else {
                        new Notice('Error: Cannot delete location without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, location.filePath);
        });
    }

    renderEventList(events: Event[], listContainer: HTMLElement, viewContainer: HTMLElement) {
        events.forEach(event => {
            const itemEl = listContainer.createDiv('storyteller-list-item');

            // --- Image --- Use pfp class and logic
            const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
            if (event.profileImagePath) {
                const imgEl = pfpContainer.createEl('img');
                try {
                    const resourcePath = this.app.vault.adapter.getResourcePath(event.profileImagePath);
                    imgEl.src = resourcePath;
                    imgEl.alt = event.name;
                } catch (e) {
                    console.error(`Error loading image for ${event.name}: ${event.profileImagePath}`, e);
                    pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
                }
            } else {
                // Placeholder: First letter of name
                const initials = event.name.substring(0, 1).toUpperCase();
                pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: initials });
            }

            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: event.name });
            if (event.dateTime) {
                infoEl.createEl('span', { text: ` (${event.dateTime})`, cls: 'storyteller-timeline-date' });
            }
            if (event.description) {
                infoEl.createEl('p', { text: event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '') });
            }

            // --- Add Extra Info ---
            const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
            if (event.status) {
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-status', text: `[${event.status}]` });
            }
            if (event.location) {
                if (event.status) extraInfoEl.appendText(' • '); // Separator
                extraInfoEl.createSpan({ cls: 'storyteller-list-item-location', text: `@ ${event.location}` });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            this.addEditButton(actionsEl, () => {
                new EventModal(this.app, this.plugin, event, async (updatedData) => {
                    await this.plugin.saveEvent(updatedData);
                    new Notice(`Event "${updatedData.name}" updated.`);
                    await this.renderEventsContent(viewContainer); // Refresh list
                }).open();
            });
            this.addDeleteButton(actionsEl, async () => {
                if (confirm(`Are you sure you want to delete "${event.name}"?`)) {
                    if (event.filePath) {
                        await this.plugin.deleteEvent(event.filePath);
                        await this.renderEventsContent(viewContainer); // Refresh list
                    } else {
                        new Notice('Error: Cannot delete event without file path.');
                    }
                }
            });
            this.addOpenFileButton(actionsEl, event.filePath);
        });
    }

    renderGalleryGrid(images: any[], gridContainer: HTMLElement, refreshCallback: () => Promise<void>) {
        // Apply grid styling class to the container (ensure CSS exists for this class)
        gridContainer.addClass('storyteller-gallery-grid'); // Added this line

        images.forEach(image => {
            // --- Item Wrapper ---
            const imgWrapper = gridContainer.createDiv('storyteller-gallery-item');
            imgWrapper.setAttribute('role', 'button'); // Make it behave like a button for accessibility
            imgWrapper.setAttribute('tabindex', '0'); // Make it focusable

            // --- Image Element ---
            const imgEl = imgWrapper.createEl('img', { cls: 'storyteller-gallery-item-image' }); // Add class for styling
            const resourcePath = this.app.vault.adapter.getResourcePath(image.filePath);
            imgEl.src = resourcePath;
            imgEl.alt = image.title || image.filePath.split('/').pop() || 'Gallery image'; // Provide alt text
            imgEl.loading = 'lazy'; // Improve performance for many images

            // --- Title Element ---
            const titleEl = imgWrapper.createDiv('storyteller-gallery-item-title'); // Create div for title
            // Use title if available, otherwise fallback to filename
            const titleText = image.title || image.filePath.split('/').pop() || '';
            titleEl.setText(titleText);
            titleEl.setAttribute('title', titleText); // Add full text as tooltip

            // --- Click Handler ---
            // Use keydown for accessibility as well
            const openDetailModal = () => {
                new ImageDetailModal(this.app, this.plugin, image, false, refreshCallback).open();
            };
            imgWrapper.addEventListener('click', openDetailModal);
            imgWrapper.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault(); // Prevent default spacebar scroll
                    openDetailModal();
                }
            });
        });
    }

    // --- Action Button Helpers ---
    addEditButton(container: HTMLElement, onClick: () => void) {
        new ButtonComponent(container)
            .setIcon('pencil')
            .setTooltip('Edit')
            .onClick(onClick);
    }

    addDeleteButton(container: HTMLElement, onClick: () => Promise<void>) {
        new ButtonComponent(container)
            .setIcon('trash')
            .setTooltip('Delete')
            .setClass('mod-warning')
            .onClick(onClick);
    }

    addOpenFileButton(container: HTMLElement, filePath: string | undefined) {
        if (!filePath) return;
        new ButtonComponent(container)
           .setIcon('go-to-file')
           .setTooltip('Open note')
           .onClick(() => {
               const file = this.app.vault.getAbstractFileByPath(filePath);
               if (file instanceof TFile) {
                   this.app.workspace.getLeaf(false).openFile(file);
               } else {
                   new Notice('Could not find the note file.');
               }
           });
    }

    async onClose() {
        // Clean up file input if it exists
        this.fileInput?.remove();
        this.fileInput = null;
    }
}
