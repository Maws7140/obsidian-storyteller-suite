import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  // Any member of a node returns another node, so the modal's builder chains run.
  function makeNode(): any {
    const fn: any = function () { return makeNode(); };
    return new Proxy(fn, {
      apply: () => makeNode(),
      get: (_t, key) => (key === 'then' ? undefined : makeNode()),
      set: () => true,
    });
  }
  // Any builder call on a setting returns the setting; its builder callbacks are
  // not run, so only the modal's own logic executes.
  class Setting {
    settingEl: any = makeNode();
    controlEl: any = makeNode();
    descEl: any = makeNode();
    constructor(_parent: unknown) {
      return new Proxy(this, {
        get: (target: any, key: any, receiver: unknown) => {
          if (key in target) return target[key];
          if (key === 'then') return (cb?: (s: unknown) => void) => { cb?.(receiver); return receiver; };
          return () => receiver;
        },
      });
    }
  }
  class Notice { static messages: string[] = []; constructor(message: string) { Notice.messages.push(message); } }
  class Modal {
    app: unknown;
    modalEl: any = makeNode();
    contentEl: any = makeNode();
    constructor(app: unknown) { this.app = app; }
    open() {}
    close() {}
    onOpen() {}
  }
  const overrides: Record<string, unknown> = { Notice, Modal, Setting, setIcon: () => {}, ButtonComponent: class { constructor(_el: unknown) { return makeNode(); } } };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : class Stub { constructor(..._args: unknown[]) {} })),
    has: () => true,
  });
});

/**
 * A save that throws must say the event was not saved. The message used to
 * name the workspace reveal error, which told the user nothing about the save.
 */
describe('EventModal save failure', () => {
  it('shows "Failed to save Event" when onSubmit throws', async () => {
    const { EventModal } = await import('../../src/modals/EventModal');
    const { ResponsiveModal } = await import('../../src/modals/ResponsiveModal');
    const { Notice } = await import('obsidian');
    (Notice as any).messages.length = 0;

    // Every list the modal loads is empty; every other plugin call is a no-op.
    const plugin: any = new Proxy({ settings: { customFieldsMode: 'flatten', sectionFieldsInFrontmatter: {}, groups: [] } }, {
      get: (target: any, key: any) => {
        if (key in target) return target[key];
        if (typeof key === 'string' && key.startsWith('list')) return async () => [];
        if (typeof key === 'string' && key.startsWith('get')) return () => [];
        if (key === 'app') return { workspace: { on: () => ({}), offref: () => {} }, vault: {}, metadataCache: {} };
        return () => undefined;
      },
    });

    const captured: Array<() => Promise<void>> = [];
    const spy = vi.spyOn(ResponsiveModal.prototype as any, 'createFooterButton').mockImplementation(((...args: unknown[]) => {
      if (typeof args[2] === 'function') captured.push(args[2] as () => Promise<void>);
      return {} as any;
    }) as any);

    try {
      const onSubmit = vi.fn(async () => { throw new Error('disk full'); });
      const modal: any = new EventModal({} as any, plugin, null, onSubmit as any);
      modal.event.name = 'Duel at the bridge';
      await modal.onOpen();
      await new Promise(resolve => setTimeout(resolve, 0));
      const save = captured[captured.length - 1];
      expect(save, 'save action registered').toBeTypeOf('function');
      await save();

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect((Notice as any).messages).toContain('Failed to save Event.');
    } finally {
      spy.mockRestore();
    }
  });
});
