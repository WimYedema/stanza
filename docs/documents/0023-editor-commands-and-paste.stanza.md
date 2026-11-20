---
stanza-format: 1
title: "ADR 0023: Editor commands and paste"
---

<!-- stanza: #hafy1k8mjt -->
# ADR 0023: Editor commands and paste

Status: Accepted. Refusals carry a fix, and commands can be checked without running: ADR 0026.

<!-- stanza: #ghmh2wa7eq -->
## Context

The editor of ADR 0022 shows a document but has no way to change it except by typing. Editing must stay semantic (the architecture says commands express operations, not looks), the stylesheet decides which marks a style offers (ADR 0006), and a paste from Word or Google Docs must not bring formatting into a document that has none. This record covers the commands, the keys, and the handling of pasted content.

<!-- stanza: #gjdzgvzddw -->
## Decision

<!-- stanza: #qz9g2qrj3z -->
### Commands are data

`editor.run(command)` takes a discriminated union with no library types, so a toolbar, a command palette and the keys all give the same commands, and a webview can send them as messages. It returns `{ ok: true }`, or `{ ok: false, reason, message }` and changes nothing. The reasons are `mark-not-allowed`, `marks-not-allowed`, `unknown-style`, `header-row`, `invalid-argument` and `not-applicable`. The options of the editor gain `onNotice(notice)` for what the person editing should hear and is not the answer to a command.

The commands are:

- Marks: `toggle-mark` (`strong`, `emphasis`, `code`), `set-link { href }`, `remove-link`, `toggle-character-style { style }`.
- Blocks: `set-heading { level }`, `set-paragraph`, `set-style { style or null }`, `toggle-list { kind }`, `sink-list-item`, `lift-list-item`, `toggle-code-block { language? }`, `insert-phrase-block { kind, text }`.
- Tables: `insert-table { columns, rows }`, `add-row` and `add-column` (`before` or `after`), `delete-row`, `delete-column`, `delete-table`.

Each is planned against the state as a list of transactions, checked, and only then applied. The pure ProseMirror commands underneath need no DOM, so the tests run on an `EditorState`.

<!-- stanza: #3ddh86egtr -->
### Marks follow the style

The style of a block of text is its own, or the style of its list for an item, or the `cell-style` of its table for a cell, or the default of its kind. A code block takes no marks. After planning a command, the result is compared with the document before: a block that now carries a mark (`strong`, `emphasis`, `code` or `link`) that its style does not allow is a new violation, and the command is refused as a whole. Violations that were already in the document do not count, so an unrelated change is not blocked, and nothing is ever stripped silently. Taking a mark off is always possible.

The same check covers every command that can change the style of text: `set-style`, `set-heading`, `set-paragraph`, `toggle-list` (a list of another kind has another style) and `toggle-code-block`. The reason is `mark-not-allowed` for the commands that add a mark and `marks-not-allowed` for those that change the style, and the message names the style and the marks. Character styles are allowed in every paragraph style and need only to be declared. A paragraph that changes kind keeps its ID and loses its style name, since a name belongs to a kind of block.

<!-- stanza: #22281467jc -->
### Blocks

`set-style` sets the style of the text blocks that the selection touches, or of the table when the selection is in a cell. `toggle-list` makes a list of the selection, changes the kind of the list it is in, or, for the same kind, takes the item out through every level. `toggle-code-block` turns paragraphs into code blocks, or back, and refuses a paragraph that has marks. `insert-phrase-block` and `insert-table` put the block after the top-level block of the selection, or in place of an empty paragraph, and a table is a header row and the rows asked for, with the cursor in its first cell. A table has from 1 to 20 columns and from 1 to 200 rows besides the header.

The first row of a table is its header row and stays one: nothing is added above it (`header-row`) and it cannot be deleted. Merging and splitting cells and column resizing are not offered.

<!-- stanza: #z2fthngxry -->
### Keys

`Mod-b`, `Mod-i` and `Mod-e` give the mark commands. In lists, `Enter` makes a new item, and at an empty last item leaves the list. `Backspace` at the start of the first paragraph of an item lifts it, and `Tab` and `Shift-Tab` sink and lift. A refused command is swallowed and reported as a notice, so the key does nothing else, except `Tab` where there is nothing to sink, which does nothing and says nothing. There is no key for links, since a link needs a prompt from the host.

<!-- stanza: #5jr36wm3kc -->
### Paste

The HTML is cleaned before the editor reads it. Only paragraphs, headings, lists, code, tables, links, bold, italic and code are kept, and without attributes: no `style`, `class` or `id`, and nothing of fonts, sizes or colors. Scripts, styles, images, frames and form controls go with their content, other elements are unwrapped, and a line break becomes a space since the model has no hard breaks. A division of text is a paragraph. Links keep only `http`, `https`, `mailto` and `#` targets. Bold and italic that Word or Google Docs write as `font-weight` and `font-style` become strong and emphasis, and the bold wrapper that Google Docs puts around a whole paste is not bold.

The names of styles, and the kind and body of phrase blocks, travel in the HTML of the clipboard as data attributes (`data-phrase-style`, `data-phrase-kind`, `data-phrase-text`), so a block copied inside an editor keeps them. A name is kept only if the stylesheet declares it for that kind of block. IDs are never written to the HTML and so never pasted, which also settles the copy-before-original case of ADR 0022. Dragging a copy of a block still duplicates its ID, and the unique-ID plugin clears the later one.

After the paste, marks that the style where the text landed does not allow are taken off the pasted text, never off what was there, and a notice says which. Plain text is handled as before: lines become paragraphs.

<!-- stanza: #vf0mbwgpzn -->
### Dependencies

None added. Lists and tables use the ProseMirror modules that `@tiptap/pm` already brings, and the cleaning of HTML is a small allow-list over the browser's inert parser.

<!-- stanza: #j8x1sctzwg -->
### Test timeout

The default timeout of 5 s made a long existing test fail when the files ran in parallel, since the files that need a DOM start slowly. The timeout is 30 s for all tests.

<!-- stanza: #w0zfas7gae -->
## Consequences

- Every way to change the document goes through one place that knows the rules of the stylesheet.
- A command that cannot be done tells why in words that the style picker (item 37) can show and offer to resolve.
- A list pasted from Word as paragraphs with bullet characters is not recognised as a list.
- Marks on text that a style does not allow, and that were already in the document, are not removed by any command. Validation reports them.
- Typing and the marks remembered at a cursor are checked when the mark is chosen, not later.

<!-- stanza: #g7qw49r3y4 -->
## Alternatives considered

- **A check inside each command.** More precise messages, but every new command would need its own, and a command that forgot would let a mark through.
- **Stripping disallowed marks when the style changes.** It changes the text without being asked, which the architecture forbids.
- **A sanitiser library.** Safer defaults, but the model already drops everything it cannot hold, and the rest is a short allow-list.
- **Keeping IDs when copying.** A copy would then fight the original for the ID.

<!-- stanza: #d48cnpfab0 -->
## Not covered

A prompt for links, a way to configure a missing variant (item 37), heading numbers and inline diagnostics (item 51), assigning IDs (item 35), and paragraphs with bullet characters.
