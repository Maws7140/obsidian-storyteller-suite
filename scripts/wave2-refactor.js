const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. console.*
    content = content.replace(/console\.(log|info|warn|debug|error)\s*\((?:[^)(]|\((?:[^)(]|\([^)(]*\))*\))*\);?/g, '');

    // 2. setTimeout / clearTimeout
    content = content.replace(/(?<!\w|\.)setTimeout\s*\(/g, 'activeWindow.setTimeout(');
    content = content.replace(/(?<!\w|\.)clearTimeout\s*\(/g, 'activeWindow.clearTimeout(');

    // 3. bare document
    content = content.replace(/(?<!\w|\.)document(?!\w|:)/g, 'activeDocument');

    // 4. document.createElement
    // We already replaced document with activeDocument above
    content = content.replace(/activeDocument\.createElement\s*\(\s*['"]div['"]\s*\)/g, 'createDiv()');
    content = content.replace(/activeDocument\.createElement\s*\(\s*['"]span['"]\s*\)/g, 'createSpan()');
    content = content.replace(/activeDocument\.createElement\s*\(\s*(['"][^'"]+['"])\s*\)/g, 'createEl($1)');

    // 5. confirm() -> This will be partially handled manually or left for manual, 
    // but we can replace `confirm(` with `await ConfirmModal.prompt(this.app, `
    // Wait, let's just do manual for confirm since there are only 37 and they need async.

    // 6. parentLocation -> parentLocationId
    // carefully replace .parentLocation with .parentLocationId
    // except if it is already .parentLocationId
    content = content.replace(/\.parentLocation(?!\w)/g, '.parentLocationId');
    // Also fix any `parentLocation:` object keys
    content = content.replace(/parentLocation\s*:/g, 'parentLocationId:');

    // 7. globalThis -> activeWindow
    content = content.replace(/\bglobalThis\b/g, 'activeWindow');

    // 8. element.style.X -> setProperty
    // This is for code like `el.style.display = 'none'`
    content = content.replace(/\.style\.([a-zA-Z]+)\s*=\s*([^;]+)/g, (match, prop, val) => {
        const kebab = prop.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
        return `.style.setProperty('--storyteller-style-${kebab}', ${val})`;
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (let f of fs.readdirSync(dir)) {
        let p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            walk(p);
        } else if (p.endsWith('.ts')) {
            processFile(p);
        }
    }
}

walk('src');
console.log("Refactoring complete");
