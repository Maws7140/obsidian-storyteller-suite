# Release Guide

This repository uses GitHub Actions to automate the release process. You can create releases either through the GitHub Actions workflow or manually.

## Automated Release (Recommended)

### Using GitHub Actions Workflow

1. Go to the **Actions** tab in your GitHub repository
2. Select the **Release** workflow from the left sidebar
3. Click **Run workflow**
4. Fill in the form:
   - **Version**: Enter the version number (e.g., `1.5.2`)
   - **Release notes**: (Optional) Enter release notes or leave blank to use placeholder
5. Click **Run workflow**

The workflow will:
- Update `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md`
- Run type checking
- Build the plugin
- Create a release package (ZIP file)
- Commit and tag the changes
- Create a GitHub release with the built files

### Prerequisites

- The workflow requires write permissions to the repository
- Make sure you're on the default branch (usually `main` or `master`)
- Ensure all changes are committed before running the workflow

## Manual Release

### Option 1: Using the Prepare Release Script

```bash
# Prepare the release (updates version files)
node scripts/prepare-release.js <version> [release-notes]

# Example:
node scripts/prepare-release.js 1.5.2 "Fixed bug in timeline view"
```

Then:
```bash
# Review changes
git diff

# Commit
git add package.json manifest.json versions.json CHANGELOG.md
git commit -m "chore: bump version to 1.5.2"

# Tag
git tag -a "v1.5.2" -m "Release 1.5.2"

# Push
git push origin HEAD
git push origin "v1.5.2"
```

### Option 2: Manual Steps

1. **Update version files:**
   - Update `package.json` version
   - Update `manifest.json` version and increment `minAppVersion`
   - Add entry to `versions.json`
   - Add entry to `CHANGELOG.md`

2. **Build the plugin:**
   ```bash
   npm install
   npm run build
   ```

3. **Create release package:**
   ```bash
   mkdir storyteller-suite
   cp main.js manifest.json styles.css storyteller-suite/
   zip -r storyteller-suite-<version>.zip storyteller-suite/
   ```

4. **Commit and tag:**
   ```bash
   git add package.json manifest.json versions.json CHANGELOG.md
   git commit -m "chore: bump version to <version>"
   git tag -a "v<version>" -m "Release <version>"
   git push origin HEAD
   git push origin "v<version>"
   ```

5. **Create GitHub Release:**
   - Go to Releases → Draft a new release
   - Select the tag you just created
   - Upload the ZIP file and individual files
   - Add release notes from CHANGELOG.md
   - Publish the release

## Version Numbering

Follow semantic versioning (MAJOR.MINOR.PATCH):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

## minAppVersion

The `minAppVersion` in `manifest.json` should increment with each release:
- Current: `1.0.11` (for version 1.5.1)
- Next: `1.0.12` (for version 1.5.2)

The workflow automatically calculates this by incrementing the patch version.

## Release Checklist

- [ ] All tests pass
- [ ] Version files updated
- [ ] CHANGELOG.md updated
- [ ] Plugin builds successfully
- [ ] Release package created
- [ ] Changes committed and tagged
- [ ] GitHub release created
- [ ] Release notes are clear and accurate

