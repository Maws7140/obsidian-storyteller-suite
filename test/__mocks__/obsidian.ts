// Mock for Obsidian API used in tests
import * as yaml from 'js-yaml';

export function normalizePath(path: string): string {
  // Simple implementation matching Obsidian's behavior
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function stringifyYaml(obj: any): string {
  return yaml.dump(obj, { lineWidth: -1 });
}

export function parseYaml(yamlString: string): any {
  return yaml.load(yamlString, { schema: yaml.JSON_SCHEMA });
}

export class TFolder {
  path: string;
  name: string;
  children: any[] = [];
  parent: TFolder | null = null;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    const dotIndex = this.name.lastIndexOf('.');
    if (dotIndex > 0) {
      this.basename = this.name.slice(0, dotIndex);
      this.extension = this.name.slice(dotIndex + 1);
    } else {
      this.basename = this.name;
      this.extension = '';
    }
  }
}

export class Notice {
  constructor(message: string) {
    // No-op in tests
  }
}

export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addButton() { return this; }
  addDropdown() { return this; }
  addSlider() { return this; }
  addExtraButton() { return this; }
  setHeading() { return this; }
  setClass() { return this; }
}
