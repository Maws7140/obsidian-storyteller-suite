import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The remove control on a group chip must be a real button with a name, so a
 * keyboard user can reach it and a screen reader can announce it. The chip is
 * built against a small element tree that keeps tag names, attributes and
 * click handlers, so the test can find the control the way a user would.
 */
vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Notice { constructor(_message: string) {} }
  class Setting {
    constructor(_el: unknown) {}
    setName() { return this; }
    setDesc() { return this; }
    addDropdown(cb: (d: any) => void) {
      cb({ addOption() {}, setValue() {}, onChange() {} });
      return this;
    }
  }
  return new Proxy(base, {
    get: (target: any, key: any) => (key === 'Notice' ? Notice : key === 'Setting' ? Setting : key in target ? target[key] : undefined),
    has: () => true,
  });
});

class FakeEl {
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  cls: string[] = [];
  text = '';
  onclick: ((ev: unknown) => void) | null = null;
  tagName: string;
  constructor(tag: string, opts: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
    this.tagName = tag.toUpperCase();
    if (opts.cls) this.cls = opts.cls.split(/\s+/).filter(Boolean);
    if (opts.text !== undefined) this.text = opts.text;
    for (const [k, v] of Object.entries(opts.attr ?? {})) this.attrs.set(k, v);
  }
  private add(tag: string, opts?: any): FakeEl {
    const child = new FakeEl(tag, opts);
    this.children.push(child);
    return child;
  }
  createEl(tag: string, opts?: any) { return this.add(tag, opts); }
  createDiv(opts?: any) { return this.add('div', typeof opts === 'string' ? { cls: opts } : opts); }
  createSpan(opts?: any) { return this.add('span', typeof opts === 'string' ? { cls: opts } : opts); }
  empty() { this.children = []; }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  hasClass(c: string) { return this.cls.includes(c); }
}

function findAll(root: FakeEl, pred: (el: FakeEl) => boolean): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (el: FakeEl) => { if (pred(el)) out.push(el); el.children.forEach(walk); };
  walk(root);
  return out;
}

describe('group chip remove control', () => {
  it('is a labelled button that removes the group when activated', async () => {
    const { EntityGroupSelector } = await import('../../src/modals/entity/EntityGroupSelector');
    const group = { id: 'g1', storyId: 's1', name: 'Ash Court', members: [], tags: [] };
    const plugin: any = {
      app: { workspace: { on: () => ({}), offref: () => {} } },
      settings: { groups: [group] },
      getGroups: () => [group],
    };
    const persistRemove = vi.fn(async () => {});
    const selector = new EntityGroupSelector({
      plugin,
      description: 'Groups',
      getSelectedGroupIds: () => ['g1'],
      setSelectedGroupIds: () => {},
      persistRemove,
    });
    const container = new FakeEl('div');
    selector.attach(container as unknown as HTMLElement);
    await new Promise(resolve => setTimeout(resolve, 0));

    const chip = findAll(container, el => el.hasClass('group-tag'))[0];
    expect(chip, 'group chip rendered').toBeDefined();
    const control = findAll(chip, el => el.hasClass('remove-group-btn'))[0];
    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('aria-label')).toContain('Ash Court');
    expect(control.getAttribute('type')).toBe('button');

    control.onclick?.(null);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(persistRemove).toHaveBeenCalledWith('g1');
  });
});

describe('group chip styles', () => {
  const css = readFileSync('styles.css', 'utf8');
  for (const cls of ['selected-groups', 'group-tag', 'remove-group-btn']) {
    it(`has a rule for .${cls}`, () => {
      const rule = css.match(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`));
      expect(rule, `rule for .${cls}`).not.toBeNull();
    });
  }
  it('colors the chip with theme variables', () => {
    for (const cls of ['group-tag', 'remove-group-btn']) {
      const rule = css.match(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`));
      expect(rule![1], `.${cls} uses theme variables`).toContain('var(--');
    }
  });
});
