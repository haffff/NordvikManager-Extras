#!/usr/bin/env node
// Builds one addon of this repository into packed/<addon>.zip.
//
//   pnpm run pack <addon>          e.g. pnpm run pack trilium
//
//   1. copies <addon>/addon_files/ to packed/<addon>/
//   2. builds each <addon>/card_sources/<card> (pnpm install + pnpm run build) and copies
//      its dist/assets/*.js (and *.css) to Resources/<card>.js (.css). A template refers to
//      them as "<addon key>_<card>.js".
//   3. turns each <addon>/include_sources/<name>.mjs into Resources/<name>.js, a plain
//      script for RunScript's Include (the `export` keywords are dropped). Tests and cards
//      import the .mjs itself, so actions and cards share the same code.
//   4. zips packed/<addon>/ into packed/<addon>.zip
import archiver from 'archiver';
import { execSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toIncludeScript } from './includeScript.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addon = process.argv[2];
if (!addon || !existsSync(path.join(repoRoot, addon, 'addon_files'))) {
  console.error('Usage: pnpm run pack <addon folder>, e.g. pnpm run pack trilium');
  process.exit(1);
}

const addonDir = path.join(repoRoot, addon);
const packedRoot = path.join(repoRoot, 'packed');
const packedDir = path.join(packedRoot, addon);
const resourcesDir = path.join(packedDir, 'Resources');
const run = (command, cwd) => execSync(command, { cwd, stdio: 'inherit' });
const subfolders = (dir) => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

// 1. a clean copy of addon_files, so no stale build output gets zipped
rmSync(packedDir, { recursive: true, force: true });
mkdirSync(packedRoot, { recursive: true });
cpSync(path.join(addonDir, 'addon_files'), packedDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

// 2. cards
const cardsRoot = path.join(addonDir, 'card_sources');
const cards = subfolders(cardsRoot).filter((card) => existsSync(path.join(cardsRoot, card, 'package.json')));
for (const card of cards) {
  console.log(`Building ${addon}/${card}...`);
  const dir = path.join(cardsRoot, card);
  run('pnpm install', dir);
  run('pnpm run build', dir);

  const assetsDir = path.join(dir, 'dist', 'assets');
  const files = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
  const js = files.filter((f) => f.endsWith('.js'));
  const css = files.filter((f) => f.endsWith('.css'));
  if (js.length !== 1) {
    throw new Error(`${card}: expected one .js file in dist/assets, found ${js.length}. The card must build to a single file (see vite.config.js).`);
  }
  cpSync(path.join(assetsDir, js[0]), path.join(resourcesDir, `${card}.js`));
  if (css.length) cpSync(path.join(assetsDir, css[0]), path.join(resourcesDir, `${card}.css`));
}

// 3. RunScript includes
const includesDir = path.join(addonDir, 'include_sources');
const includes = existsSync(includesDir)
  ? readdirSync(includesDir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
  : [];
for (const file of includes) {
  const source = readFileSync(path.join(includesDir, file), 'utf8');
  writeFileSync(path.join(resourcesDir, file.replace(/\.mjs$/, '.js')), toIncludeScript(source, file));
}

// 4. zip
const zipPath = path.join(packedRoot, `${addon}.zip`);
rmSync(zipPath, { force: true });
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(packedDir, false);
  archive.finalize();
});

console.log(`Packed ${addon}: ${cards.length} card(s), ${includes.length} include(s) -> ${path.relative(repoRoot, zipPath)}`);
