#!/usr/bin/env node
// `pnpm test`: runs every *.test.mjs of every addon (cards' pure code, include sources)
// and of scripts/ with Node's own test runner.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', 'packed', '.git']);

function find(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) find(full, out);
    else if (entry.name.endsWith('.test.mjs')) out.push(full);
  }
  return out;
}

const files = find(repoRoot);
if (!files.length) { console.log('No tests.'); process.exit(0); }
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
