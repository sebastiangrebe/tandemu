#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('usage: bump-plugin-versions.mjs <version>');
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pluginPath = resolve(repoRoot, 'apps/claude-plugins/.claude-plugin/plugin.json');
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
plugin.version = version;
writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');

const marketplacePath = resolve(repoRoot, '.claude-plugin/marketplace.json');
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
marketplace.metadata = { ...(marketplace.metadata ?? {}), version };
if (Array.isArray(marketplace.plugins)) {
  marketplace.plugins = marketplace.plugins.map((p) =>
    p?.name === 'tandemu' ? { ...p, version } : p,
  );
}
writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');

console.log(`Bumped plugin manifests to ${version}`);
