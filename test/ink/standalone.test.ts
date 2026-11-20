import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const INK_DIR = path.resolve(fileURLToPath(new URL('../../src/leaflet/ink/', import.meta.url)));
const OBSIDIAN_DIR = path.join(INK_DIR, 'obsidian');

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== OBSIDIAN_DIR) out.push(...listTs(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Source with comments removed, so examples in comments do not count as code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

function specifiers(src: string): string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const found: string[] = [];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) found.push(m[1]);
  }
  return found;
}

const FILES = listTs(INK_DIR);

describe('Map Ink core is standalone', () => {
  it('finds the core files', () => {
    const names = FILES.map(f => path.basename(f));
    for (const required of ['model.ts', 'styles.ts', 'history.ts', 'geometry.ts']) {
      expect(names).toContain(required);
    }
  });

  it('imports nothing from obsidian or from outside src/leaflet/ink/', () => {
    const problems: string[] = [];
    for (const file of FILES) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      for (const spec of specifiers(src)) {
        if (spec === 'obsidian') {
          problems.push(`${file}: imports obsidian`);
          continue;
        }
        if (!spec.startsWith('.')) {
          problems.push(`${file}: imports package "${spec}"`);
          continue;
        }
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved !== INK_DIR && !resolved.startsWith(INK_DIR + path.sep)) {
          problems.push(`${file}: imports "${spec}" which resolves outside ink/`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses no Obsidian DOM helpers or global DOM access', () => {
    const banned = /\b(createDiv|createEl|createSpan|setIcon|activeDocument|activeWindow)\b|\bdocument\.|\bwindow\./;
    const problems: string[] = [];
    for (const file of FILES) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (banned.test(src)) problems.push(file);
    }
    expect(problems).toEqual([]);
  });

  it('contains no em dashes in strings or comments', () => {
    const dash = '\u2014';
    const problems = FILES.filter(f => fs.readFileSync(f, 'utf8').includes(dash));
    expect(problems).toEqual([]);
  });
});
