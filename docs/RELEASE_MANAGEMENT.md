# Release Management Guide

How to build, version, and publish SE Work Manager releases.

---

## Cutting a Release

### Option A — Push a git tag (recommended)

```bash
# Make sure everything is committed and pushed
git add .
git commit -m "chore: prepare v1.0.1"
git push origin main

# Create and push the version tag
git tag v1.0.1
git push origin v1.0.1
```

The `Build and Release` GitHub Actions workflow will trigger automatically and:
1. Install all dependencies on a Windows runner
2. Stamp the version into `package.json`
3. Build the backend + frontend + Electron installer
4. Upload the `.exe` as a workflow artifact
5. Create a GitHub Release named **SE Work Manager v1.0.1** with the `.exe` attached and auto-generated release notes

### Option B — Manual trigger via GitHub UI

Use this when you want to release without pushing a tag (e.g. testing the pipeline, hotfix):

1. Go to your repo on GitHub
2. Click **Actions** → **Build and Release**
3. Click **Run workflow**
4. Enter the version (e.g. `v1.0.1`) and select `release` or `pre-release`
5. Click **Run workflow**

---

## Versioning Convention

Follow [Semantic Versioning](https://semver.org/):

| Type | When to use | Example |
|------|-------------|---------|
| Patch `x.x.Z` | Bug fixes, small tweaks | `v1.0.1` |
| Minor `x.Y.0` | New features, backwards-compatible | `v1.1.0` |
| Major `X.0.0` | Breaking changes, major redesign | `v2.0.0` |
| Pre-release | Beta / testing | `v1.1.0-beta` |

Tags **must** start with `v` (e.g. `v1.0.0`).

---

## What Gets Built

The GitHub Actions workflow produces:

| File | Description |
|------|-------------|
| `SE Work Manager Setup x.x.x.exe` | NSIS Windows installer (recommended for distribution) |
| `latest.yml` | Auto-update manifest (for future electron-updater support) |

Output directory locally: `dist-electron/`

---

## Required GitHub Permissions

The workflow uses `GITHUB_TOKEN` (automatically provided by GitHub Actions) to create releases. No additional secrets are needed.

The `release` job requires `contents: write` permission — this is already set in the workflow file.

---

## Workflow File Location

`.github/workflows/release.yml`

---

## Local Build (test before releasing)

To verify the build works before pushing a tag:

```bash
# From the repo root
npm install
npm ci --prefix work-management/frontend
npm ci --prefix work-management/backend
npm run electron:build
```

The installer will appear in `dist-electron/SE Work Manager Setup 1.0.0.exe`.

> **Note**: Building locally requires Node.js v22+ and will create a Windows-specific installer.

---

## Checking a Release

After triggering the workflow:

1. Go to **Actions** tab on GitHub — both `build` and `release` jobs should show green ✓
2. Go to **Releases** tab — a new release should appear with the `.exe` attached
3. The README download link (`/releases/latest`) will automatically point to the new release

---

## Troubleshooting

### Build job fails at `npm ci`

- Check that `package-lock.json` is committed in the root, `work-management/frontend/`, and `work-management/backend/`
- Run `npm install` locally and commit the updated lock files

### No `.exe` in artifacts

- Check `dist-electron/` — electron-builder may have failed silently
- Look at the build job logs for electron-builder errors
- Ensure `assets/icon.ico` exists (required for Windows builds)

### Release job fails

- Usually means the `build` job didn't produce artifacts
- Check the build job first; fix that, then re-run the workflow
