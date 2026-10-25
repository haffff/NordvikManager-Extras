# Poll

Let the table vote. A poll window pops up for everyone with a button per option, or players vote with
`/vote` in chat; the results come out in the window and in chat when the poll closes. Addon key `poll`.

## Using it

| Where | What |
|---|---|
| **Addons → Polls → New poll** | The question, up to ten options and four switches (below), then **Start poll**. The poll opens for everyone and is announced in chat. |
| **Addons → Polls → Current poll** | Opens the newest open poll again. |
| **Addons → Polls → Settings** (GM) | Who can start polls (only GMs, or everyone) and the Cards panel folder for polls (default `Polls`). |
| The poll window | Vote (click an option; tick several and **Vote** in a multiple-choice poll), see who has voted and the totals. **Close poll** for whoever started it and GMs, **Delete** for GMs. |
| Chat | `/poll Question? \| first \| second` starts a poll; add `--secret`, `--hidden`, `--multi` or `--change` for the switches. `/vote 2` (or `/vote 1,3`, or `/vote cave`) votes in the current poll. `/poll close` closes it, `/poll` alone shows it. |

The switches, per poll:

- **Secret ballot:** nobody sees who voted for what: only who has voted, and the totals once the poll
  closes. A secret poll always hides its results until then, as live totals next to the list of voters
  would show each new voter's pick. The totals can still tell on their own: with one voter, or when
  everyone picks the same.
- **Hide results until closed:** the totals appear when the poll closes, so early votes don't sway later ones.
- **Multiple choice:** each voter may pick several options.
- **Allow changing votes:** voters can change their pick until the poll closes. Without it, a vote is final.

Players get the **New poll** menu item (when everyone may start polls) the next time they load the game.
`/vote` and `/poll` are answered to you only and aren't kept in the chat history.

## What players can see

- **The poll:** its question, options, switches, who started it, who has voted and the totals while the
  poll shows them (never before it closes for a secret or hidden poll). It is the game property `poll_<card id>`, which every player can read.
- **Not the ballots.** Each poll is a card (in the folder from the settings, e.g. `Polls`) that holds one
  ballot per voter and is never shared. The GM can open it, and the ballots are on the GM's server, so a
  secret ballot is secret from the players, not from whoever runs the server.
- Your own pick, which the window asks the server for.

Only the addon's actions (running on the GM's server) write polls and ballots. They check who asks: the
GM's setting for starting polls, the starter or a GM for closing, a GM for deleting and the settings.

## How it is built

```
addon_files/
  info.json
  Actions/          create_menus (Player Load hook), chat (Chat Command hook) and one action per thing people do
  Templates/        poll_poll: a poll's card, with its ballots (hidden template)
  Views/            poll_window (vote, new poll; for anyone), poll_gm (settings, GM only)
  Resources/index.html
card_sources/poll-app/      the one page behind the template and both views (React)
include_sources/poll.mjs    the rules and the work, shared by the actions' RunScript steps (Include: poll_poll.js) and the page
```

- **Actions:** each is one RunScript step that runs a workflow of `poll.mjs` (`startPoll`, `castVote`,
  `closePoll`, ...) with the script's `game`, then answers the window that asked (RunClientCommand
  `Reply`) or whispers the player. The workflows run as the system, so they check `playerId` and
  `playerIsGm` themselves; those built-ins can't be set by the caller.
- **A poll** is a card, never shared, holding `vote_<playerId>` (a JSON list of picks) for each voter and
  `pollId` (its own id). What everyone sees is the game property `poll_<card id>`:
  `{ poll: { question, options, multi, secret, hideResults, allowChange, createdBy, createdByName }, state: { status, voted, results? } }`.
  Only actions and GMs can write game properties, so a card can't pass for a poll without it. One
  property per voter means votes cast at the same moment don't overwrite each other, and every count
  starts again from the ballots.
- **Settings:** game properties `poll_who_starts` (`gm` | `everyone`), `poll_folder`; `poll_latest` is the
  current poll.
- **Chat:** the `chat` action (hook Chat Command) has `"hookFilter": "poll, vote"`, so only those two
  commands come to it and every other unknown `/command` still gets "Wrong command". A server without
  hook filters ignores the field and gives the action every unknown command.
- **Folders** need a server whose CreateCard step takes `Folder`; an older one puts poll cards at the top
  level of the Cards panel.

`pnpm test` in the repository root runs the include's and the page's tests. `pnpm dev` in
`card_sources/poll-app/` shows a poll with a mock (add `?view=new` or `?view=settings`).
