#!/usr/bin/env node

/**
 * Script to prepare a new release locally
 * This updates version files and prepares for a release
 * Usage: node scripts/prepare-release.js <version> [release-notes]
 */

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const releaseNotes = process.argv[3] || '_Release notes to be added_';

if (!version) {
  console.error('Usage: node scripts/prepare-release.js <version> [release-notes]');
  console.error('Example: node scripts/prepare-release.js 1.5.2 "Fixed bug in timeline view"');
  process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Error: Version must be in format X.Y.Z (e.g., 1.5.2)');
  process.exit(1);
}

console.log(`Preparing release ${version}...`);

// Read current files
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));

// Calculate new minAppVersion (increment patch version)
const currentMinApp = manifest.minAppVersion || '1.0.0';
const minAppParts = currentMinApp.split('.');
minAppParts[2] = String(parseInt(minAppParts[2]) + 1);
const newMinApp = minAppParts.join('.');

// Update package.json
packageJson.version = version;
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, '\t') + '\n');
console.log(`✓ Updated package.json to version ${version}`);

// Update manifest.json
manifest.version = version;
manifest.minAppVersion = newMinApp;
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
console.log(`✓ Updated manifest.json to version ${version} with minAppVersion ${newMinApp}`);

// Update versions.json
versions[version] = newMinApp;
fs.writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
console.log(`✓ Updated versions.json with ${version}: ${newMinApp}`);

// Update CHANGELOG.md
const changelogPath = 'CHANGELOG.md';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const newEntry = `## ${version}\n\n${releaseNotes}\n\n`;
changelog = changelog.replace(/^# Changelog\n\n/, `# Changelog\n\n${newEntry}`);
fs.writeFileSync(changelogPath, changelog);
console.log(`✓ Updated CHANGELOG.md with release notes`);

console.log('\n✓ Release preparation complete!');
console.log('\nNext steps:');
console.log('1. Review the changes: git diff');
console.log('2. Commit the changes: git add package.json manifest.json versions.json CHANGELOG.md');
console.log(`3. Commit: git commit -m "chore: bump version to ${version}"`);
console.log(`4. Tag: git tag -a "v${version}" -m "Release ${version}"`);
console.log('5. Push: git push origin HEAD && git push origin "v' + version + '"');
console.log('\nOr use the GitHub Actions workflow:');
console.log('1. Go to Actions > Release workflow');
console.log('2. Click "Run workflow"');
console.log(`3. Enter version: ${version}`);
console.log(`4. Enter release notes: ${releaseNotes}`);
console.log('5. Click "Run workflow"');

