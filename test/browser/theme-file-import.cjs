// Imports a .storytl.json through the real file picker in Chromium.
//
//   CHROMIUM_PATH=/path/to/chrome node test/browser/theme-file-import.cjs
//
// Checks that choosing a theme file installs it, that closing the picker imports
// nothing, and that a file that is not a Storyteller document is refused with a notice.
const root = require('path').resolve(__dirname, '../..') + '/';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require(root + 'node_modules/playwright');
const esbuild = require(root + 'node_modules/esbuild');

const THEME = {
    kind: 'storyteller-timeline-theme',
    schemaVersion: 1,
    theme: {
        id: 'custom:test-import',
        name: 'Imported from a file',
        colors: { background: '#120f0b', text: '#f1e6cf' },
        palette: ['#8db864', '#5aa3c8'],
    },
};

(async () => {
    const bundle = await esbuild.build({
        stdin: {
            contents: "export { importPortableFile } from './src/utils/PortableImport'; export { CalendarRegistry } from './src/calendar/CalendarRegistry';",
            resolveDir: root, loader: 'ts',
        },
        bundle: true, write: false, format: 'iife', globalName: 'PI', logLevel: 'error',
        plugins: [{ name: 'host', setup(b) {
            b.onResolve({ filter: /^obsidian$/ }, a => ({ path: a.path, namespace: 'host' }));
            b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export class Notice { constructor(m) { (window.notices ||= []).push(m); } }; export function normalizePath(p) { return p; }', loader: 'js' }));
        } }],
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-import-'));
    const good = path.join(dir, 'Imported.storytl.json');
    const bad = path.join(dir, 'Not a theme.json');
    fs.writeFileSync(good, JSON.stringify(THEME));
    fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));

    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<body></body>');
    await page.evaluate(() => { window.activeDocument = document; });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
        const story = { id: 's1', name: 'Story' };
        window.plugin = {
            settings: { stories: [story], activeStoryId: 's1', timelineThemes: [], calendarSystems: [] },
            getActiveStory: () => story,
            saveSettings: async () => { window.saved = (window.saved || 0) + 1; },
        };
        window.registry = new PI.CalendarRegistry(window.plugin);
    });

    const run = async (files) => {
        const chooser = page.waitForEvent('filechooser');
        const result = page.evaluate(() => PI.importPortableFile(registry).then(doc => doc ? doc.kind : null));
        const picker = await chooser;
        assert.ok(picker.element(), 'a file input opened');
        await picker.setFiles(files);
        return result;
    };

    // 1. A theme file installs the theme.
    assert.equal(await run(good), 'storyteller-timeline-theme');
    const themes = await page.evaluate(() => plugin.settings.timelineThemes.map(t => t.name));
    assert.deepEqual(themes, ['Imported from a file']);
    assert.ok(await page.evaluate(() => window.saved >= 1), 'settings saved');
    assert.match(await page.evaluate(() => notices.at(-1)), /Timeline theme imported: Imported from a file/);

    // 2. The same file again is kept as a copy, not written over the first.
    assert.equal(await run(good), 'storyteller-timeline-theme');
    const ids = await page.evaluate(() => plugin.settings.timelineThemes.map(t => t.id));
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1], 'second import gets its own id');

    // 3. A JSON file that is not a Storyteller document is refused with a notice.
    assert.equal(await run(bad), null);
    assert.match(await page.evaluate(() => notices.at(-1)), /^Import failed: /);
    assert.equal(await page.evaluate(() => plugin.settings.timelineThemes.length), 2, 'nothing added');

    // 4. Closing the picker without a file imports nothing and shows no notice.
    const before = await page.evaluate(() => notices.length);
    assert.equal(await run([]), null);
    assert.equal(await page.evaluate(() => notices.length), before, 'no notice on cancel');

    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: theme file import installs, copies on collision, refuses bad files, and ignores cancel');
})().catch(e => { console.error(e); process.exit(1); });
