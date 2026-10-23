# Trilium

Your campaign notes live in [Trilium](https://github.com/TriliumNext/Trilium); this addon brings them to
the table. The GM searches Trilium from the game, pins notes to tokens and shares lore with the players
when the story gets there. Addon key `trilium`.

## Setting it up

1. In Trilium (TriliumNext), make an ETAPI token: **Options → ETAPI → Create new ETAPI token**.
2. If Trilium runs on your computer or your network (`localhost`, `192.168.x.x`), the server's admin allows
   it in **Application Settings → Server → Local network access**, e.g. `localhost:8080`.
3. In the game: **Addons → Trilium → Settings**. Enter the address (`http://localhost:8080`) and the token,
   **Save**, then **Test connection**.

The token is saved on the GM's server as a protected property. Nothing can read it back, not even the
settings window; only the addon's requests to Trilium use it.

## Using it

| Where | What |
|---|---|
| **Addons → Trilium → Search notes** | Search with Trilium's own syntax (words, `"exact phrase"`, `#label`). **Open** imports a note into a card and shows it to you; **Share with players** imports it and shares it. |
| Token right-click → **Trilium → Pin Trilium note** | Search, then **Pin to token**. |
| Token right-click → **Show lore** | Everyone: shows the note pinned to the token. A player sees it only once it's shared. |
| Cards panel right-click on a note → **Trilium** | **Refresh from Trilium**, **Share with players**, **Take back from players**. |
| In an open note (GM) | **Refresh**, **Share with players**, **Take back**. Links to other notes open in place; a note without a card yet is imported first. |

Imported notes are **Trilium Note** cards, private to the GM until shared. A card holds a snapshot of the
note: its text, and its images as game resources (`trilium_img_<id>`). **Refresh** takes the latest
version.

## What players can see

- A shared note card, through the server's normal permissions. Sharing gives Read, nothing more.
- The Trilium address (game property `trilium_url`) and which notes have cards (`trilium_cards`: Trilium
  ids to card ids). Not the token, and not unshared notes.
- **Images of unshared notes** are game resources, which any player can read who knows the key. The
  Cards panel and resource lists don't show them, and the keys are Trilium ids. Keep that in mind for
  images that give secrets away.

## How it is built

```
addon_files/
  info.json
  Actions/          create_menus (Player Load hook) and one action per thing the GM does
  Templates/        trilium_note: the Trilium Note card (hidden template)
  Views/            trilium_gm (settings and search, GM only), trilium_viewer (a note, for anyone)
  Resources/index.html
card_sources/trilium-app/   the one page behind the template and both views (React, DOMPurify)
include_sources/trilium.mjs shared by the actions' RunScript steps (Include: trilium_trilium.js) and the page
```

- **Actions do the talking:** every request to Trilium is a SendRequest or DownloadResource step on the
  GM's server; the browser never talks to Trilium. Every action that does starts with RequirePermission
  (Edit on the game), so players can't run it by name.
- **Answers:** a window registers the `addon_trilium` panel and passes its name as `replyTo`. The action
  answers with RunClientCommand `Reply` `{ kind, ok, error?, … }`. Run from a menu, there's no window, so
  the action whispers the GM in chat instead.
- **Untrusted content:** note HTML is rewritten on import (images to resources, note links to ids) and
  cleaned with DOMPurify in the page before it is shown.

`pnpm test` in the repository root runs the include's and the page's tests. `pnpm dev` in
`card_sources/trilium-app/` shows a note with a mock (add `?view=settings` or `?view=search`).
