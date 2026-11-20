import { Notice } from 'obsidian';
import type { CalendarRegistry } from '../calendar/CalendarRegistry';
import type { PortableTimelineDocument } from '../calendar/TimelineDocuments';

/** File types the import picker offers: theme and dating-system documents, or any JSON. */
export const PORTABLE_DOCUMENT_ACCEPT = '.storytl.json,.storycal.json,.json,application/json';

/**
 * Opens the system file picker and resolves with the chosen file's text, or null
 * when the picker is closed without a choice.
 */
export function pickTextFile(accept: string): Promise<string | null> {
    return new Promise(resolve => {
        const input = activeDocument.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('cancel', () => resolve(null));
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => resolve('');
            reader.readAsText(file);
        });
        input.click();
    });
}

/**
 * Lets the user choose a `.storytl.json` or `.storycal.json` file and installs it,
 * keeping anything already installed under the same id. Resolves with the
 * imported document, or null when nothing was imported.
 */
export async function importPortableFile(registry: CalendarRegistry): Promise<PortableTimelineDocument | null> {
    const text = await pickTextFile(PORTABLE_DOCUMENT_ACCEPT);
    if (text === null) return null;
    if (!text.trim()) {
        new Notice('Import failed: the file is empty or could not be read.');
        return null;
    }
    try {
        const imported = await registry.importText(text, 'copy');
        new Notice(imported.kind === 'storyteller-calendar'
            ? `Dating system imported: ${imported.calendar.name}`
            : `Timeline theme imported: ${imported.theme.name}`);
        return imported;
    } catch (error) {
        new Notice(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
