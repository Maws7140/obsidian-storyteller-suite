import { App, FuzzySuggestModal, FuzzyMatch, prepareFuzzySearch } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Group } from '../types';

export class GroupSuggestModal extends FuzzySuggestModal<Group> {
  private readonly plugin: StorytellerSuitePlugin;
  private readonly onChoose: (group: Group) => void;
  private groups: Group[] = [];

  constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (group: Group) => void) {
    super(app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder('Select a group…');
  }

  // Load groups when opened to ensure freshness
  onOpen(): void {
    super.onOpen();
    try {
      this.groups = this.plugin.getGroups();
    } catch (e) {
      this.groups = [];
    }
    // Force initial render of suggestions
    setTimeout(() => {
      try { (this as any).setQuery?.(''); } catch {}
      try { this.inputEl?.dispatchEvent(new window.Event('input')); } catch {}
      try { (this as any).onInputChanged?.(); } catch {}
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
        return match ? ({ item: g, match } as FuzzyMatch<Group>) : null;
      })
      .filter((fm): fm is FuzzyMatch<Group> => !!fm);
  }

  onChooseItem(item: Group, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(item);
  }
}


