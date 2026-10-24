# Obsidian

Your campaign notes live in an [Obsidian](https://obsidian.md) vault; this addon brings them to the
table. The GM searches the vault from the game, pins notes to tokens and shares lore with the players
when the story gets there. It talks to Obsidian through the community plugin
[Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api), so Obsidian has to be open
while you play. Addon key `obsidian`.

## Setting it up

1. In Obsidian: **Settings → Community plugins**, install and enable **Local REST API**. In its settings,
   turn on the **HTTP server** (port 27123; the HTTPS one uses a certificate the game server won't trust)
   and copy the **API key**.
2. The server's admin allows it in **Application Settings → Server → Local network access**:
   `localhost:27123`. `127.0.0.1` is the computer the game server runs on, so Obsidian must run there
   too, unless you set the plugin to listen on your network and use that address.
3. In the game: **Addons → Obsidian → Settings**. The address (`http://127.0.0.1:27123`) and the key,
   **Save**, then **Test connection**.
4. Optional, in the same window:
   - a **folder for imported notes**, e.g. `Lore/Obsidian` (`/` between folders): new note cards go into
     that folder of the Cards panel, made if it doesn't exist yet (needs a server with CreateCard's
     `Folder`; older ones use the top level);
   - the vault's **attachments folder**, as in Obsidian's **Files and links → Default location for new
     attachments**: e.g. `Attachments`, or `./assets` for a folder under each note's folder.

The key is saved on the GM's server as a protected property. Nothing can read it back, not even the
settings window; only the addon's requests to Obsidian use it.

## Using it

| Where | What |
|---|---|
| **Addons → Obsidian → Search notes** | Obsidian's simple search: words in note names and text, best first. **Open** imports a note into a card and shows it to you; **Share with players** imports it and shares it. |
| Token right-click → **Obsidian → Pin Obsidian note** | Search, then **Pin to token**. |
| Token right-click → **Show lore** | Everyone: shows the note pinned to the token. A player sees it only once it's shared. |
| Cards panel right-click on a note → **Obsidian** | **Refresh from Obsidian**, **Share with players**, **Take back from players**. |
| In an open note (GM) | **Refresh**, **Share with players**, **Take back**. `[[Links]]` open the note they name in place; a note without a card yet is imported first. |

Imported notes are **Obsidian Note** cards, private to the GM until shared. A card holds a snapshot of
the note, its markdown and its images (as game resources, `obsidian_img_<id>`); **Refresh** takes the
latest version. A note that was moved or renamed in Obsidian has to be searched for again.

### What a card shows

- **Left out:** the frontmatter (the `---` block at the top) and `%% comments %%`, where GMs often keep
  secrets. Nothing else is: anything else in the note can end up in front of players once it's shared.
- **Links:** `[[Note]]`, `[[Note|alias]]`, `[[Folder/Note#heading]]` and markdown links to `.md` files.
  A link opens the note with that name: in the same folder as the linking note if there is one there,
  else the one with the shortest path. Embedded notes (`![[Note]]`) are shown as links.
- **Images:** `![[picture.png]]` is looked for next to the note, in the attachments folder, then at the
  top of the vault; `![](relative/path.png)` from the note's folder. Web images aren't shown (the card
  can't load them). Other embeds (PDFs, audio) are shown as their file name.
- **Formatting:** markdown with Obsidian's line breaks. Callouts show as quotes, tags as text.

## What players can see

- A shared note card, through the server's normal permissions. Sharing gives Read, nothing more.
- The plugin address (game property `obsidian_url`), the folders for notes and attachments, and the
  index of imported notes (`obsidian_cards`). The index holds hashes of note paths and names, not the
  names, but a player can test whether a name they guess has a card. Not the key, and not unshared notes.
- **Images of unshared notes** are game resources, which any player can read who knows the key. The
  Cards panel and resource lists don't show them, and the keys are hashes. Keep that in mind for images
  that give secrets away.

## How it is built

```
addon_files/
  info.json
  Actions/          create_menus (Player Load hook) and one action per thing the GM does
  Templates/        obsidian_note: the Obsidian Note card (hidden template)
  Views/            obsidian_gm (settings and search, GM only), obsidian_viewer (a note, for anyone)
  Resources/index.html
card_sources/obsidian-app/   the one page behind the template and both views (React, markdown-it, DOMPurify)
include_sources/obsidian.mjs shared by the actions' RunScript steps (Include: obsidian_obsidian.js) and the page
```

- **Actions do the talking:** every request to Obsidian is a SendRequest or DownloadResource step on
  the GM's server; the browser never talks to Obsidian. Every action that does starts with
  RequirePermission (Edit on the game), so players can't run it by name. The plugin's endpoints used:
  `GET /` (status), `POST /search/simple/` and `GET /vault/<path>` (a note's markdown, an image).
- **Paths:** encoded part by part; `..`, backslashes and Obsidian's `.obsidian` folder are refused, so a
  crafted name can't reach another route of the plugin.
- **Answers:** each window registers its own panel (`addon_w<random>_obsidian`, as two windows of one
  view are the same card) and passes its name as `replyTo`. The action answers with RunClientCommand
  `Reply` `{ kind, ok, error?, … }`. Run from a menu, there's no window, so the action whispers the GM in
  chat instead.
- **Untrusted content:** the markdown is rewritten on import (images to resources, links to markers) and
  rendered and cleaned with DOMPurify in the page before it is shown.

`pnpm test` in the repository root runs the include's and the page's tests. `pnpm dev` in
`card_sources/obsidian-app/` shows a note with a mock (add `?view=settings` or `?view=search`).
