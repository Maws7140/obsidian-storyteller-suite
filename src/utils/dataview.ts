// Optional DataView integration helpers (scaffold)
import type { App } from 'obsidian';

export function hasDataview(app: App): boolean {
  return !!(app as any).plugins?.plugins?.['dataview'];
}

export function getDataviewApi(app: App): any | null {
  const plugin = (app as any).plugins?.plugins?.['dataview'];
  return plugin?.api ?? null;
}

// Example: query pages with a tag
export async function queryByTag(app: App, tag: string): Promise<any[]> {
  const api = getDataviewApi(app);
  if (!api) return [];
  try {
    const pages = api.pages(`tag:${tag}`);
    return pages?.array() ?? [];
  } catch {
    return [];
  }
}
