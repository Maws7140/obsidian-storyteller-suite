/**
 * The Obsidian side of Map Ink: the InkHost that Storyteller gives the editor.
 * Notices, menus, icons, the location picker, the confirm dialog and saved presets.
 *
 * Load and save come from the caller, because each map view owns its own note.
 * This folder is the one part of ink/ that may import obsidian.
 */
import { App, Menu, Notice, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../../../main';
import type { Location } from '../../../types';
import { LocationSuggestModal } from '../../../modals/LocationSuggestModal';
import { confirmWithModal } from '../../../modals/ui/ConfirmModal';
import type { InkHost, InkMenuItem } from '../host';
import type { InkDoc, InkPoint } from '../model';
import type { InkPreset } from '../styles';

export interface ObsidianInkHostOptions {
	plugin: StorytellerSuitePlugin;
	/** The document of the open note. */
	load(): InkDoc;
	/** Write the document to the open note. A rejection keeps the drawing in memory. */
	save(doc: InkDoc): Promise<void>;
	/** Optional grid snapping, such as the placement grid's snap. */
	snapPoint?(latlng: InkPoint): InkPoint;
}

/** Find a Storyteller location by id. Resolves undefined when there is none. */
export async function findLocation(plugin: StorytellerSuitePlugin, id: string): Promise<Location | undefined> {
	const locations = await plugin.listLocations();
	return locations.find(location => location.id === id);
}

/** Open a location's note, the way map pins do. */
export function openLocationNote(app: App, location: Location): void {
	if (location.filePath) void app.workspace.openLinkText(location.filePath, '', true);
}

export class ObsidianInkHost implements InkHost {
	private readonly app: App;

	constructor(private readonly opts: ObsidianInkHostOptions) {
		this.app = opts.plugin.app;
	}

	notify(msg: string): void {
		new Notice(msg);
	}

	confirm(msg: string): Promise<boolean> {
		return confirmWithModal(this.app, { title: 'Map Ink', body: msg, confirmText: 'Continue' });
	}

	showMenu(items: InkMenuItem[], event: MouseEvent): void {
		const menu = new Menu();
		for (const item of items) {
			if (item.separatorBefore) menu.addSeparator();
			menu.addItem(entry => {
				entry.setTitle(item.title);
				if (item.icon) entry.setIcon(item.icon);
				entry.setDisabled(item.disabled === true);
				entry.onClick(() => item.onClick());
			});
		}
		menu.showAtMouseEvent(event);
	}

	icon(el: HTMLElement, lucideName: string): void {
		setIcon(el, lucideName);
	}

	pickLocation(): Promise<{ id: string; name: string } | null> {
		return new Promise(resolve => {
			let settled = false;
			const finish = (value: { id: string; name: string } | null): void => {
				if (settled) return;
				settled = true;
				resolve(value);
			};
			const modal = new LocationSuggestModal(this.app, this.opts.plugin, location => {
				finish(location?.id ? { id: location.id, name: location.name } : null);
			});
			// Closing the picker without a choice cancels it.
			const close = modal.onClose.bind(modal);
			modal.onClose = () => {
				close();
				finish(null);
			};
			modal.open();
		});
	}

	openLocation(id: string): void {
		void findLocation(this.opts.plugin, id).then(location => {
			if (location) openLocationNote(this.app, location);
		});
	}

	load(): InkDoc {
		return this.opts.load();
	}

	save(doc: InkDoc): Promise<void> {
		return this.opts.save(doc);
	}

	snapPoint(latlng: InkPoint): InkPoint {
		return this.opts.snapPoint ? this.opts.snapPoint(latlng) : latlng;
	}

	presets(): InkPreset[] {
		return this.opts.plugin.settings.inkPresets ?? [];
	}

	/** Adds the preset, or replaces the one with the same id, then saves the settings. */
	savePreset(preset: InkPreset): void {
		const settings = this.opts.plugin.settings;
		if (!Array.isArray(settings.inkPresets)) settings.inkPresets = [];
		const list = settings.inkPresets;
		const index = list.findIndex(existing => existing.id === preset.id);
		if (index >= 0) list[index] = preset;
		else list.push(preset);
		this.opts.plugin.saveSettings().catch(() => new Notice('Map Ink could not save the preset.'));
	}
}
