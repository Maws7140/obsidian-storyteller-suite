// Optional DataView integration helpers (scaffold)
import type { App } from 'obsidian';

interface DataviewPlugin {
  api?: DataviewApi;
}

interface DataviewApi {
  pages(query: string): { array?: () => unknown[] } | undefined;
}

interface DataviewEnabledApp extends App {
  plugins?: {
    plugins?: Record<string, DataviewPlugin | undefined>;
  };
}

export function hasDataview(app: App): boolean {
  return !!(app as DataviewEnabledApp).plugins?.plugins?.['dataview'];
}

export function getDataviewApi(app: App): DataviewApi | null {
  const plugin = (app as DataviewEnabledApp).plugins?.plugins?.['dataview'];
  return plugin?.api ?? null;
}

// Example: query pages with a tag
export async function queryByTag(app: App, tag: string): Promise<unknown[]> {
  const api = getDataviewApi(app);
  if (!api) return [];
  try {
    const pages = api.pages(`tag:${tag}`);
    return pages?.array?.() ?? [];
  } catch {
    return [];
  }
}
