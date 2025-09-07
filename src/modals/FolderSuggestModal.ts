import { App, SuggestModal, TAbstractFile, TFolder } from 'obsidian';
import { t } from '../i18n/strings';

/**
 * Modal that suggests vault folders and returns the chosen folder path
 */
export class FolderSuggestModal extends SuggestModal<string> {
  private readonly appRef: App;
  private readonly onChoose: (folderPath: string) => void;
  private readonly onCloseCb?: () => void;
  private allFolderPaths: string[] = [];

  constructor(app: App, onChoose: (folderPath: string) => void, onCloseCb?: () => void) {
    super(app);
    this.appRef = app;
    this.onChoose = onChoose;
    this.onCloseCb = onCloseCb;
    this.setPlaceholder(t('filterFoldersPh'));
    this.allFolderPaths = this.collectAllFolderPaths();
  }

  private collectAllFolderPaths(): string[] {
    const results: string[] = [];
    const root = this.appRef.vault.getRoot();

    const walk = (folder: TFolder) => {
      // Skip pushing empty path (root) to the suggestions
      if (folder.path && !results.includes(folder.path)) {
        results.push(folder.path);
      }
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          walk(child);
        }
      }
    };

    walk(root);
    // Sort for stable, user-friendly ordering
    results.sort((a, b) => a.localeCompare(b));
    return results;
  }

  // SuggestModal API
  getSuggestions(query: string): string[] {
    const q = (query || '').toLowerCase();
    if (!q) return this.allFolderPaths.slice(0, 200); // limit
    // Simple contains match; could be enhanced with fuzzy scoring later
    return this.allFolderPaths
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 200);
  }

  renderSuggestion(value: string, el: HTMLElement) {
    el.createEl('div', { text: value });
  }

  onChooseSuggestion(item: string) {
    this.onChoose(item);
  }

  onClose(): void {
    if (this.onCloseCb) {
      try { this.onCloseCb(); } catch {}
    }
    super.onClose();
  }
}


