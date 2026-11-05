# PDF Viewer

Read PDFs in the game, share them with your players and present them: players can follow your
scrolling, and everyone can highlight, draw, pin notes and reply. Addon key `pdf`.

## Using it

| Where | What |
|---|---|
| **Addons → PDF → New PDF** (GM) | Pick a PDF from the Materials panel, or upload one. That makes a PDF Document card named after the file (Cards panel, folder `PDF`) and opens it. |
| The document (GM) | **Share with players** lets every player open it, and opens it for them. **Open for everyone** opens it again for players who closed it. **Present** makes everyone who follows scroll with you (any GM can present, co-GMs too). |
| The player window | **Follow presenter** keeps you where the presenting GM is; untick it to read on your own. It's on for players and off for GMs, who can tick it to follow another GM. Players also find the shared PDF in their Cards panel. |
| Search (everyone) | Type in **Search the PDF** and press Enter: matches are marked on the pages and listed on the right with the words around them. Enter / Shift+Enter (or ↑ ↓) go to the next / previous one, **Highlight it** turns the current one into a highlight everyone sees, Escape clears. The search starts from your page; it stops after 500 matches. |
| Tools (everyone) | **Highlight** (select text), **Marker** (drag over an area), **Box**, **Pin** (click), **Draw**, and a colour. **Select** a note to add text, reply, or delete it. |

- Sharing a PDF shares all of it: players can read any page, not only the ones you present.
- Only the note's author or a GM can change or delete it; anyone who can read the PDF can reply.

## Big files

Only the parts of a PDF that are on screen are downloaded, in 256 KB pieces, and the app keeps them in
its cache. A 300-page book opens with about 1 MB read. PDFs uploaded in the card are kept in the
server's file storage, where those pieces are read without loading the whole file.

PDFs whose pages all hang directly off the document's root (some generated or very old files) are
read whole when they're opened: pdf.js checks the last page, and finding it in such a file takes
every page. Books from publishing tools don't have this problem.

Searching reads the text of every page, so the first search of a book downloads most of it (a few
seconds for a 9 MB book on a fast link). The text is kept while the PDF is open: later searches are
instant.

## Limits

Up to 2000 notes per PDF. A note's text can be up to 2000 characters, and a drawing up to 1500 points.
