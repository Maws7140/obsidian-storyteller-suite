import { App, FuzzySuggestModal, FuzzyMatch, prepareFuzzySearch } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Group } from '../types';
import { t } from '../i18n/strings';

interface QueryRefreshableSuggestModal {
  setQuery?: (query: string) => void;
  onInputChanged?: () => void;
}

export class GroupSuggestModal extends FuzzySuggestModal<Group> {
  private readonly plugin: StorytellerSuitePlugin;
  private readonly onChoose: (group: Group) => void;
  private groups: Group[] = [];

  constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (group: Group) => void) {
    super(app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder(t('selectGroupPh'));
  }

  // Load groups when opened to ensure freshness
  onOpen(): void {
    void super.onOpen();
    try {
      this.groups = this.plugin.getGroups();
    } catch {
      this.groups = [];
    }
    // Force initial render of suggestions
    window.setTimeout(() => {
      const modal = this as unknown as QueryRefreshableSuggestModal;
      try { modal.setQuery?.(''); } catch { /* Ignore best-effort refresh errors. */ }
      try { this.inputEl?.dispatchEvent(new window.Event('input')); } catch { /* Ignore best-effort refresh errors. */ }
      try { modal.onInputChanged?.(); } catch { /* Ignore best-effort refresh errors. */ }
    }, 0);
  }

  getItems(): Group[] { return this.groups; }

  getItemText(item: Group): string { return item.name || 'Unnamed group'; }

  getSuggestions(query: string): FuzzyMatch<Group>[] {
    const items = this.getItems();
    if (!query) return items.map(g => ({ item: g, match: { score: 0, matches: [] } }));
    const fuzzy = prepareFuzzySearch(query);
    return items
      .map(g => {
        const match = fuzzy(this.getItemText(g));
        return match ? ({ item: g, match }) : null;
      })
      .filter((fm): fm is FuzzyMatch<Group> => !!fm);
  }

  onChooseItem(item: Group, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(item);
  }
}


