#!/usr/bin/env node

/**
 * Cross-platform script to validate and set version in package.json
 * Usage: node scripts/set-version.js <version>
 * Example: node scripts/set-version.js v1.2.3
 */

const { execSync } = require('child_process');
const path = require('path');

const version = process.argv[2];

if (!version) {
  console.error('Error: Version argument is required');
  console.error('Usage: node scripts/set-version.js <version>');
  process.exit(1);
}

// Remove 'v' prefix if present (e.g., v1.2.3 -> 1.2.3)
const versionNoV = version.startsWith('v') ? version.substring(1) : version;

// Validate semver format
const semverRegex = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
if (!semverRegex.test(versionNoV)) {
  console.error(`Error: Invalid version format: ${versionNoV}`);
  console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
  process.exit(1);
}

console.log(`Setting version to: ${versionNoV}`);

try {
  execSync(`npm version ${versionNoV} --no-git-tag-version --allow-same-version`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log(`✓ Version set to ${versionNoV}`);
} catch (err) {
  console.error('Failed to set version:', err.message);
  process.exit(1);
}
