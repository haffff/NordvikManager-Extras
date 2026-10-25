# NordvikManager extras

Smaller [NordvikManager](https://nordvikmanager.pl) addons, one folder each. Every addon has its own
version and release, and installs on its own; none of them needs a game system.

| Addon | Folder | Addon key |
|---|---|---|
| Trilium: search your Trilium notes from the game, pin them to tokens and share lore with players | `trilium/` | `trilium` |
| Poll: let the table vote, in a window that pops up for everyone or with `/vote` in chat; secret ballots, hidden results, multiple choice | `poll/` | `poll` |
| Obsidian: search your Obsidian vault from the game (through the Local REST API plugin), pin notes to tokens and share lore with players | `obsidian/` | `obsidian` |

## Layout of an addon

```
<addon>/
  addon_files/           what the game installs: info.json, Actions/, Templates/, Views/, Resources/
  card_sources/<card>/   a card's page (Vite + React), built into Resources/<card>.js (.css)
  include_sources/       shared JavaScript for RunScript's Include, as ES modules
```

- **`card_sources/<card>/`:** `pnpm run pack` builds it into `Resources/<card>.js` and `Resources/<card>.css`. A template or view refers to them as `<addon key>_<card>.js`.
- **`include_sources/<name>.mjs`:** becomes the plain script `Resources/<name>.js`, with its `export` keywords dropped. An action loads it with `"Include": "<addon key>_<name>.js"`, and cards and tests import the `.mjs` itself, so all three run the same code.

## Building and testing

```
pnpm install
pnpm test                  every *.test.mjs in the repository
pnpm run pack trilium      packed/trilium.zip
```

You can install `packed/<addon>.zip` by hand in a game: **Addons → Addons → Install**. To install a new build of the same version, uninstall it first (**Installed** tab).

## Releasing

1. Bump `version` in `<addon>/addon_files/info.json` and merge it as usual.
2. Run **Actions → Release → Run workflow** and pick the addon.

The workflow packs the addon, checks that the zip's `info.json` matches, and publishes a GitHub Release
(tag `<addon>-<version>`, asset `<addon>.zip`). It refuses a version that is already released. The
registry ([NordvikManager-Addons](https://github.com/haffff/NordvikManager-Addons)) picks the new version up
in its daily sync pull request.

A new addon also needs adding to the workflow's list of addons (`.github/workflows/release.yml`).

## Licence

The code in this repository is under the [GNU Affero General Public License v3](LICENSE)
(`AGPL-3.0-only`), with an additional attribution term: see [NOTICE](NOTICE). Bundled third-party code
keeps its own licence, as noted in NOTICE.
