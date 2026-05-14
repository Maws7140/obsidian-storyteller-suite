import { App, Setting, Notice } from 'obsidian';
import type {
    AmbientSound,
    ColorPalette,
    LocationSensoryProfile,
    SoundProfile,
    TimeVariation
} from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';

export type SensoryProfileModalSubmitCallback = (profile: LocationSensoryProfile) => Promise<void>;

type ColorTemperature = NonNullable<ColorPalette['temperature']>;
type SoundLevel = NonNullable<SoundProfile['soundLevel']>;
type AmbientVolume = NonNullable<AmbientSound['volume']>;
type AmbientFrequency = NonNullable<AmbientSound['frequency']>;
type TimeOfDay = TimeVariation['timeOfDay'];

/**
 * Modal for editing sensory profiles for locations
 * Provides rich sensory descriptions including sight, sound, smell, touch, taste
 * Also includes atmosphere, mood, colors, and time/seasonal variations
 */
export class SensoryProfileModal extends ResponsiveModal {
    profile: LocationSensoryProfile;
    plugin: StorytellerSuitePlugin;
    onSubmit: SensoryProfileModalSubmitCallback;
    locationId: string;
    locationName: string;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        locationId: string,
        locationName: string,
        profile: LocationSensoryProfile | null,
        onSubmit: SensoryProfileModalSubmitCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.locationId = locationId;
        this.locationName = locationName;
        this.onSubmit = onSubmit;

        this.profile = profile || {
            locationId,
            locationName,
            sensoryDetails: {},
            atmosphere: { mood: '', intensity: 5 },
            mood: { primary: '', intensity: 5 },
            colors: { dominant: [], accent: [], temperature: 'neutral' },
            sounds: { ambient: [], soundLevel: 'moderate' },
            timeVariations: [],
            seasonalVariations: [],
            notes: ''
        };

        this.modalEl.addClass('storyteller-sensory-modal');
    }

    onOpen(): void {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: `Sensory Profile: ${this.locationName}`
        });

        // Tabs for different sections
        const tabsContainer = contentEl.createDiv('storyteller-sensory-tabs');
        const tabContent = contentEl.createDiv('storyteller-sensory-tab-content');

        const tabs = [
            { id: 'senses', label: 'Five Senses', render: () => this.renderSensoryDetails(tabContent) },
            { id: 'atmosphere', label: 'Atmosphere & Mood', render: () => this.renderAtmosphere(tabContent) },
            { id: 'colors', label: 'Colors', render: () => this.renderColors(tabContent) },
            { id: 'sounds', label: 'Sounds', render: () => this.renderSounds(tabContent) },
            { id: 'time', label: 'Time Variations', render: () => this.renderTimeVariations(tabContent) },
            { id: 'seasonal', label: 'Seasonal', render: () => this.renderSeasonalVariations(tabContent) }
        ];

        // Create tab buttons
        tabs.forEach((tab, index) => {
            const button = tabsContainer.createEl('button', {
                text: tab.label,
                cls: index === 0 ? 'storyteller-tab-active' : ''
            });
            button.addEventListener('click', () => {
                tabsContainer.querySelectorAll('button').forEach(b => b.removeClass('storyteller-tab-active'));
                button.addClass('storyteller-tab-active');
                tab.render();
            });
        });

        // Render first tab
        tabs[0].render();

        // Save button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    await this.onSubmit(this.profile);
                    this.close();
                    new Notice('Sensory profile saved');
                }))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    renderSensoryDetails(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Five senses' });

        if (!this.profile.sensoryDetails) {
            this.profile.sensoryDetails = {};
        }

        // Sight
        new Setting(container)
            .setName('Sight')
            .setDesc('Visual details, colors, lighting, what can be seen')
            .addTextArea(text => {
                text.setValue(this.profile.sensoryDetails?.sight || '')
                    .onChange(value => {
                        if (!this.profile.sensoryDetails) this.profile.sensoryDetails = {};
                        this.profile.sensoryDetails.sight = value;
                    });
                text.inputEl.rows = 3;
            });

        // Sound
        new Setting(container)
            .setName('Sound')
            .setDesc('What can be heard - ambient noise, echoes, silence')
            .addTextArea(text => {
                text.setValue(this.profile.sensoryDetails?.sound || '')
                    .onChange(value => {
                        if (!this.profile.sensoryDetails) this.profile.sensoryDetails = {};
                        this.profile.sensoryDetails.sound = value;
                    });
                text.inputEl.rows = 3;
            });

        // Smell
        new Setting(container)
            .setName('Smell')
            .setDesc('Scents, odors, fragrances in the air')
            .addTextArea(text => {
                text.setValue(this.profile.sensoryDetails?.smell || '')
                    .onChange(value => {
                        if (!this.profile.sensoryDetails) this.profile.sensoryDetails = {};
                        this.profile.sensoryDetails.smell = value;
                    });
                text.inputEl.rows = 3;
            });

        // Touch
        new Setting(container)
            .setName('Touch')
            .setDesc('Textures, temperature, physical sensations')
            .addTextArea(text => {
                text.setValue(this.profile.sensoryDetails?.touch || '')
                    .onChange(value => {
                        if (!this.profile.sensoryDetails) this.profile.sensoryDetails = {};
                        this.profile.sensoryDetails.touch = value;
                    });
                text.inputEl.rows = 3;
            });

        // Taste
        new Setting(container)
            .setName('Taste')
            .setDesc('Flavors in the air, tastes (if applicable)')
            .addTextArea(text => {
                text.setValue(this.profile.sensoryDetails?.taste || '')
                    .onChange(value => {
                        if (!this.profile.sensoryDetails) this.profile.sensoryDetails = {};
                        this.profile.sensoryDetails.taste = value;
                    });
                text.inputEl.rows = 3;
            });
    }

    renderAtmosphere(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Atmosphere & mood' });

        if (!this.profile.atmosphere) {
            this.profile.atmosphere = { mood: '', intensity: 5 };
        }
        if (!this.profile.mood) {
            this.profile.mood = { primary: '', intensity: 5 };
        }

        // Atmosphere mood
        new Setting(container)
            .setName('Atmosphere mood')
            .setDesc('Overall feeling of the place')
            .addText(text => text
                .setValue(this.profile.atmosphere?.mood || '')
                .setPlaceholder('E.g., mysterious, peaceful, tense')
                .onChange(value => {
                    if (!this.profile.atmosphere) this.profile.atmosphere = { mood: '', intensity: 5 };
                    this.profile.atmosphere.mood = value;
                }));

        // Atmosphere emotion
        new Setting(container)
            .setName('Dominant emotion')
            .setDesc('Primary emotion evoked')
            .addText(text => text
                .setValue(this.profile.atmosphere?.emotion || '')
                .setPlaceholder('E.g., fear, wonder, nostalgia')
                .onChange(value => {
                    if (!this.profile.atmosphere) this.profile.atmosphere = { mood: '', intensity: 5 };
                    this.profile.atmosphere.emotion = value;
                }));

        // Atmosphere intensity
        new Setting(container)
            .setName('Atmosphere intensity')
            .setDesc('How strong is the atmosphere? (1-10)')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.profile.atmosphere?.intensity || 5)
                .setDynamicTooltip()
                .onChange(value => {
                    if (!this.profile.atmosphere) this.profile.atmosphere = { mood: '', intensity: 5 };
                    this.profile.atmosphere.intensity = value;
                }));

        // Mood primary
        new Setting(container)
            .setName('Primary mood')
            .setDesc('Main mood of the location')
            .addText(text => text
                .setValue(this.profile.mood?.primary || '')
                .setPlaceholder('E.g., somber, cheerful, oppressive')
                .onChange(value => {
                    if (!this.profile.mood) this.profile.mood = { primary: '', intensity: 5 };
                    this.profile.mood.primary = value;
                }));

        // Mood secondary
        new Setting(container)
            .setName('Secondary mood')
            .setDesc('Secondary mood (optional)')
            .addText(text => text
                .setValue(this.profile.mood?.secondary || '')
                .setPlaceholder('E.g., hopeful, melancholic')
                .onChange(value => {
                    if (!this.profile.mood) this.profile.mood = { primary: '', intensity: 5 };
                    this.profile.mood.secondary = value;
                }));

        // Mood intensity
        new Setting(container)
            .setName('Mood intensity')
            .setDesc('How strong is the mood? (1-10)')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.profile.mood?.intensity || 5)
                .setDynamicTooltip()
                .onChange(value => {
                    if (!this.profile.mood) this.profile.mood = { primary: '', intensity: 5 };
                    this.profile.mood.intensity = value;
                }));
    }

    renderColors(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Color palette' });

        if (!this.profile.colors) {
            this.profile.colors = { dominant: [], accent: [], temperature: 'neutral' };
        }

        // Dominant colors
        new Setting(container)
            .setName('Dominant colors')
            .setDesc('Main colors (comma-separated)')
            .addText(text => text
                .setValue(this.profile.colors?.dominant?.join(', ') || '')
                .setPlaceholder('E.g., deep blue, silver, black')
                .onChange(value => {
                    if (!this.profile.colors) this.profile.colors = { dominant: [], accent: [], temperature: 'neutral' };
                    this.profile.colors.dominant = value.split(',').map(c => c.trim()).filter(c => c);
                }));

        // Accent colors
        new Setting(container)
            .setName('Accent colors')
            .setDesc('Secondary/highlight colors (comma-separated)')
            .addText(text => text
                .setValue(this.profile.colors?.accent?.join(', ') || '')
                .setPlaceholder('E.g., gold, crimson')
                .onChange(value => {
                    if (!this.profile.colors) this.profile.colors = { dominant: [], accent: [], temperature: 'neutral' };
                    this.profile.colors.accent = value.split(',').map(c => c.trim()).filter(c => c);
                }));

        // Color temperature
        new Setting(container)
            .setName('Color temperature')
            .setDesc('Overall warmth or coolness')
            .addDropdown(dropdown => dropdown
                .addOption('warm', 'Warm (reds, oranges, yellows)')
                .addOption('cool', 'Cool (blues, greens, purples)')
                .addOption('neutral', 'Neutral (grays, browns)')
                .setValue(this.profile.colors?.temperature || 'neutral')
                .onChange(value => {
                    if (!this.profile.colors) this.profile.colors = { dominant: [], accent: [], temperature: 'neutral' };
                    this.profile.colors.temperature = value as ColorTemperature;
                }));
    }

    renderSounds(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Sound profile' });

        if (!this.profile.sounds) {
            this.profile.sounds = { ambient: [], soundLevel: 'moderate' };
        }

        // Sound level
        new Setting(container)
            .setName('Overall sound level')
            .setDesc('How loud is this place generally?')
            .addDropdown(dropdown => dropdown
                .addOption('silent', 'Silent')
                .addOption('quiet', 'Quiet')
                .addOption('moderate', 'Moderate')
                .addOption('noisy', 'Noisy')
                .addOption('deafening', 'Deafening')
                .setValue(this.profile.sounds?.soundLevel || 'moderate')
                .onChange(value => {
                    if (!this.profile.sounds) this.profile.sounds = { ambient: [], soundLevel: 'moderate' };
                    this.profile.sounds.soundLevel = value as SoundLevel;
                }));

        // Ambient sounds section
        container.createEl('h4', { text: 'Ambient sounds' });

        const soundsList = container.createDiv('storyteller-sounds-list');
        this.renderSoundsList(soundsList);

        // Add sound button
        new Setting(container)
            .addButton(button => button
                .setButtonText('+ add ambient sound')
                .setCta()
                .onClick(() => {
                    if (!this.profile.sounds) this.profile.sounds = { ambient: [], soundLevel: 'moderate' };
                    if (!this.profile.sounds.ambient) this.profile.sounds.ambient = [];
                    this.profile.sounds.ambient.push({ name: '', volume: 'moderate', frequency: 'constant' });
                    this.renderSoundsList(soundsList);
                }));
    }

    renderSoundsList(container: HTMLElement): void {
        container.empty();

        if (!this.profile.sounds?.ambient || this.profile.sounds.ambient.length === 0) {
            container.createEl('p', { text: 'No ambient sounds yet', cls: 'storyteller-empty-message' });
            return;
        }

        this.profile.sounds.ambient.forEach((sound, index) => {
            const soundItem = container.createDiv('storyteller-sound-item');

            new Setting(soundItem)
                .setName(`Sound ${index + 1}`)
                .addText(text => text
                    .setValue(sound.name)
                    .setPlaceholder('E.g., distant thunder, chirping birds')
                    .onChange(value => {
                        if (this.profile.sounds?.ambient) {
                            this.profile.sounds.ambient[index].name = value;
                        }
                    }));

            new Setting(soundItem)
                .setName('Volume')
                .addDropdown(dropdown => dropdown
                    .addOption('quiet', 'Quiet')
                    .addOption('moderate', 'Moderate')
                    .addOption('loud', 'Loud')
                    .setValue(sound.volume || 'moderate')
                    .onChange(value => {
                        if (this.profile.sounds?.ambient) {
                            this.profile.sounds.ambient[index].volume = value as AmbientVolume;
                        }
                    }))
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove')
                    .onClick(() => {
                        if (this.profile.sounds?.ambient) {
                            this.profile.sounds.ambient.splice(index, 1);
                            this.renderSoundsList(container);
                        }
                    }));

            new Setting(soundItem)
                .setName('Frequency')
                .addDropdown(dropdown => dropdown
                    .addOption('constant', 'Constant')
                    .addOption('intermittent', 'Intermittent')
                    .addOption('rare', 'Rare')
                    .setValue(sound.frequency || 'constant')
                    .onChange(value => {
                        if (this.profile.sounds?.ambient) {
                            this.profile.sounds.ambient[index].frequency = value as AmbientFrequency;
                        }
                    }));
        });
    }

    renderTimeVariations(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Time of day variations' });
        container.createEl('p', { text: 'How does this location change throughout the day?', cls: 'setting-item-description' });

        if (!this.profile.timeVariations) {
            this.profile.timeVariations = [];
        }

        const timeList = container.createDiv('storyteller-time-list');
        this.renderTimeList(timeList);

        // Add time variation button
        new Setting(container)
            .addButton(button => button
                .setButtonText('+ add time variation')
                .setCta()
                .onClick(() => {
                    if (!this.profile.timeVariations) this.profile.timeVariations = [];
                    this.profile.timeVariations.push({
                        timeOfDay: 'morning',
                        changes: {},
                        mood: ''
                    });
                    this.renderTimeList(timeList);
                }));
    }

    renderTimeList(container: HTMLElement): void {
        container.empty();

        if (!this.profile.timeVariations || this.profile.timeVariations.length === 0) {
            container.createEl('p', { text: 'No time variations yet', cls: 'storyteller-empty-message' });
            return;
        }

        this.profile.timeVariations.forEach((timeVar, index) => {
            const timeItem = container.createDiv('storyteller-time-item');

            new Setting(timeItem)
                .setName(`Time Period ${index + 1}`)
                .addDropdown(dropdown => dropdown
                    .addOption('dawn', 'Dawn')
                    .addOption('morning', 'Morning')
                    .addOption('noon', 'Noon')
                    .addOption('afternoon', 'Afternoon')
                    .addOption('evening', 'Evening')
                    .addOption('dusk', 'Dusk')
                    .addOption('night', 'Night')
                    .addOption('midnight', 'Midnight')
                    .setValue(timeVar.timeOfDay)
                    .onChange(value => {
                        if (this.profile.timeVariations) {
                            this.profile.timeVariations[index].timeOfDay = value as TimeOfDay;
                        }
                    }))
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove')
                    .onClick(() => {
                        if (this.profile.timeVariations) {
                            this.profile.timeVariations.splice(index, 1);
                            this.renderTimeList(container);
                        }
                    }));

            new Setting(timeItem)
                .setName('Mood change')
                .addText(text => text
                    .setValue(timeVar.mood || '')
                    .setPlaceholder('E.g., eerie, tranquil')
                    .onChange(value => {
                        if (this.profile.timeVariations) {
                            this.profile.timeVariations[index].mood = value;
                        }
                    }));

            new Setting(timeItem)
                .setName('Visual changes')
                .addTextArea(text => {
                    if (!timeVar.changes) timeVar.changes = {};
                    text.setValue(timeVar.changes.sight || '')
                        .setPlaceholder('How does it look different?')
                        .onChange(value => {
                            if (this.profile.timeVariations && this.profile.timeVariations[index].changes) {
                                this.profile.timeVariations[index].changes!.sight = value;
                            }
                        });
                    text.inputEl.rows = 2;
                });
        });
    }

    renderSeasonalVariations(container: HTMLElement): void {
        container.empty();
        container.createEl('h3', { text: 'Seasonal variations' });
        container.createEl('p', { text: 'How does this location change with the seasons?', cls: 'setting-item-description' });

        if (!this.profile.seasonalVariations) {
            this.profile.seasonalVariations = [];
        }

        const seasonList = container.createDiv('storyteller-season-list');
        this.renderSeasonList(seasonList);

        // Add seasonal variation button
        new Setting(container)
            .addButton(button => button
                .setButtonText('+ add seasonal variation')
                .setCta()
                .onClick(() => {
                    if (!this.profile.seasonalVariations) this.profile.seasonalVariations = [];
                    this.profile.seasonalVariations.push({
                        season: '',
                        changes: {},
                        mood: ''
                    });
                    this.renderSeasonList(seasonList);
                }));
    }

    renderSeasonList(container: HTMLElement): void {
        container.empty();

        if (!this.profile.seasonalVariations || this.profile.seasonalVariations.length === 0) {
            container.createEl('p', { text: 'No seasonal variations yet', cls: 'storyteller-empty-message' });
            return;
        }

        this.profile.seasonalVariations.forEach((seasonVar, index) => {
            const seasonItem = container.createDiv('storyteller-season-item');

            new Setting(seasonItem)
                .setName(`Season ${index + 1}`)
                .addText(text => text
                    .setValue(seasonVar.season)
                    .setPlaceholder('E.g., winter, summer, monsoon')
                    .onChange(value => {
                        if (this.profile.seasonalVariations) {
                            this.profile.seasonalVariations[index].season = value;
                        }
                    }))
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove')
                    .onClick(() => {
                        if (this.profile.seasonalVariations) {
                            this.profile.seasonalVariations.splice(index, 1);
                            this.renderSeasonList(container);
                        }
                    }));

            new Setting(seasonItem)
                .setName('Mood change')
                .addText(text => text
                    .setValue(seasonVar.mood || '')
                    .setPlaceholder('E.g., bleak, vibrant')
                    .onChange(value => {
                        if (this.profile.seasonalVariations) {
                            this.profile.seasonalVariations[index].mood = value;
                        }
                    }));

            new Setting(seasonItem)
                .setName('Changes')
                .addTextArea(text => {
                    if (!seasonVar.changes) seasonVar.changes = {};
                    const desc = [
                        seasonVar.changes.sight ? `Sight: ${seasonVar.changes.sight}` : '',
                        seasonVar.changes.sound ? `Sound: ${seasonVar.changes.sound}` : '',
                        seasonVar.changes.smell ? `Smell: ${seasonVar.changes.smell}` : ''
                    ].filter(Boolean).join('\n');

                    text.setValue(desc)
                        .setPlaceholder('Describe seasonal changes...')
                        .onChange(value => {
                            // Store as sight for simplicity
                            if (this.profile.seasonalVariations && this.profile.seasonalVariations[index].changes) {
                                this.profile.seasonalVariations[index].changes!.sight = value;
                            }
                        });
                    text.inputEl.rows = 3;
                });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
