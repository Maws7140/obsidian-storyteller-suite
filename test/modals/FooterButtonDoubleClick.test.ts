import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  // A button that keeps its click handler and disabled state, as Obsidian's does.
  class ButtonComponent {
    static created: ButtonComponent[] = [];
    buttonEl: any = { addClass() {}, setAttr() {}, setAttribute() {} };
    disabled = false;
    handler: (() => void) | null = null;
    constructor(_parent: unknown) { ButtonComponent.created.push(this); }
    setButtonText() { return this; }
    setCta() { return this; }
    setWarning() { return this; }
    setIcon() { return this; }
    setDisabled(value: boolean) { this.disabled = value; return this; }
    onClick(handler: () => void) { this.handler = handler; return this; }
  }
  class Modal {
    modalEl: any = { addClass() {} };
    contentEl: any = {};
    constructor(_app: unknown) {}
  }
  const overrides: Record<string, unknown> = { ButtonComponent, Modal };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * Save and Create buttons are footer buttons. A double click used to run the
 * save twice, and the second write reported a false failure.
 */
describe('footer buttons ignore a second click while the action runs', () => {
  it('a double click runs the save once and disables the button meanwhile', async () => {
    const { ResponsiveModal } = await import('../../src/modals/ResponsiveModal');
    const { ButtonComponent } = await import('obsidian');
    class Harness extends (ResponsiveModal as any) {
      addButton(action: () => Promise<void>) {
        return (this as any).createFooterButton({} as HTMLElement, 'Create', action, { cta: true });
      }
    }
    const modal: any = new Harness({} as any);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const save = vi.fn(() => gate);
    modal.addButton(save);
    const button = (ButtonComponent as any).created.at(-1);

    button.handler();
    button.handler();
    expect(save).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);

    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(button.disabled).toBe(false);
    button.handler();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
