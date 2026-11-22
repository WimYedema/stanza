---
stanza-format: 1
title: "Spike findings"
---

<!-- stanza: #f002x1qt4x -->
# Spike findings

Backlog items 1 to 4. Corpus: one real policy document (11 pages, 9 tables, 33 comments, tracked changes). The throwaway tooling was removed from the tree; it remains in Git history.

<!-- stanza: #y5956jrmr4 -->
## What worked

- A DOCX converts to Markdown plus YAML front matter and a stylesheet, and renders back to DOCX with named styles only. The rebuilt document has no direct paragraph or run formatting.
- Body text round-trips exactly: 203 of 204 paragraphs match; the other is the metadata text box, which became front matter.
- The rebuilt PDF is close to the original: headings, lists, tags, headers, footers, and page numbers are right.

<!-- stanza: #52d8dvyet6 -->
## Corpus measurements

- 15 styles used in the body. Only Heading 1 and 2. Body text is the default Normal style.
- Direct formatting is rare: 24 of 285 paragraphs (almost all spacing), 100 of 500 runs but about 3% of characters. Most of the run formatting is one status-tag look.
- The same status tag (`[proposed]`, `[confirm]`) appeared in three different manual looks. This is the inconsistency the product exists to prevent.
- Tables are formatted almost entirely by direct cell borders, widths, and shading. Only 3 of 9 use a table style.
- Metadata sits in content controls and a text box. The cover is a layout table plus custom styles.
- About 55 empty paragraphs and one empty heading act as spacing or are authoring errors.

<!-- stanza: #xy8ghan7nt -->
## Decisions taken

<!-- stanza: #x4dhgvk8fh -->
| Topic | Decision |
| --- | --- |
| Status tags | User-defined character style in the project's stylesheet, not part of the core model |
| Metadata | YAML front matter per document, shared settings in a project file |
| Tables | Named table styles; autofit column widths by default, optional relative weights; no per-cell formatting |
| Cover page | A page template filled from metadata; the body starts on a new page by template rule |
| Page breaks | A styling concern, not content |
| TOC | Entries as linked paragraphs; page numbers as page-number fields (variant D below) |
| Empty paragraphs and diagnostics | Ignored for now |
| Comments | Postponed (backlog: Word comment import) |
| Tracked changes | The accepted state is used |

<!-- stanza: #f6ntxmsy83 -->
## TOC test in Word

<!-- stanza: #4pq0pxbn8v -->
| Variant | Result |
| --- | --- |
| A: Word's TOC field, marked for update | Prompt "This document contains fields that may refer to other files. Do you want to update the fields in this document?" Page numbers show 1 before updating and are correct after. The TOC disappears if the reader declines. |
| B: same field, not marked | Empty until updated manually |
| C: linked entries, no page numbers | Visible, no prompt, no page numbers, no leaders |
| D: linked entries plus page-number fields | Prompt on open. Entries are visible; page numbers show 1 until updated and are correct after. Leaders and layout are fine. |

Variant D is the design: entries are always visible, and page numbers are correct once fields are updated. The prompt is accepted.

<!-- stanza: #8dbychm0gq -->
## `docx` library verification

`spikes/docx-verify/verify.mjs` generates a document with `docx` 9.15 and checks the XML (16 checks pass). Every capability backlog item 15 asked about is covered:

- **Table styles:** a table takes a style by ID (`style`), and `tableLook` switches on the first-row formatting. The library has no declarative API for defining a table style. The definition comes in as a `w:styles` XML string through `externalStyles`, which the adapter generates from the typed stylesheet. Paragraph and character styles given declaratively replace external styles with the same ID, so there is one definition.
- **Autofit and relative widths:** `layout: AUTOFIT`, percentage table width, percentage cell widths, and an explicit grid in twips are all written as given.
- **Repeated header rows:** `tableHeader` writes `w:tblHeader`.
- **TOC with cached entries:** `cachedEntries` writes the field with visible entries, each linked to a bookmark by name.
- **Bookmarks:** names are free text and IDs are unique. Word requires a bookmark name to start with a letter, and our IDs can start with a digit, so names are prefixed (`stanza_<id>`).

Not checked by the script: that Word opens the file without a repair prompt and shows the table style and TOC as intended. The output is in `spikes/out/docx-verify.docx` for a manual look.

<!-- stanza: #pd08v8q8bc -->
## Pandoc observations

Relevant to the Pandoc decision (ADR 0002):

- Bold and italic are direct formatting unless mapped to character styles.
- Cell paragraphs get a forced "Compact" style unless wrapped as ordinary paragraphs.
- A table style must be given by its ID, not its name.
- The writer builds a title block from metadata unless it is cleared.
- Relative table widths in Markdown (grid-table dash counts) are not reproduced faithfully. Column widths need an explicit notation.
- List numbering definitions come from Pandoc, not the reference document.
- A table between list items cannot be indented as part of the list without nesting it in the Markdown source.

<!-- stanza: #2bz8ys1tt0 -->
## Not reproduced

Cover layout table, page breaks, merged cells, original column widths, and the metadata block (the title block must be generated from metadata).

<!-- stanza: #7w867tqhz7 -->
## Review round trip in Word

Backlog item 203, 2026-11-21. One generated document (ADR 0002: 12 bookmarks, headings on three levels, paragraphs, numbered lists and a table) was commented in Word desktop, and a copy without the protection was commented in Word for the web on SharePoint. Both used a personal Microsoft account. The web copy was shared through SharePoint to make mentions work, and some of the package changes below may come from that sharing rather than from Word for the web. In a second round, the web copy was opened in Word desktop from the synced OneDrive folder, and a reply, a resolve and a reaction were added there. In a third round, the same was done to the same file in Word for the web, and the file was read from the synced folder.

<!-- stanza: #d5tskrncnm -->
### Protection

- **Word desktop:** the protection for comments (ADR 0030) holds. Typing in the text is refused, and the protection is saved back unchanged.
- **Word for the web:** a protected document opens read-only. Existing comments are visible, but new comments and replies cannot be added, and editing the document is refused with a message that it only works in the desktop app. The copy without the protection can be commented on as usual.

The protection that is always on therefore rules out review in Word for the web.

<!-- stanza: #9kgxc4tr86 -->
### Bookmarks and anchors

- All 12 `stanza_<id>` bookmarks survive in both, with the same names and positions. Word desktop only reorders their attributes.
- A bookmark covers only the heading paragraph, or the first cell of a table. Paragraphs and list items have no ID and so no bookmark.
- A comment can therefore be mapped by where its range starts: in a heading to that heading, in a paragraph or list item to the section of the heading before it, and in a table cell to the table plus the row and column, counted in the table.
- A comment across sections is normal, not an edge case: both such comments started in one section and ended two or three headings further on.

<!-- stanza: #at3hfy096q -->
| Comment on | Word desktop | Word for the web |
| --- | --- | --- |
| The title | Inside the bookmark of the heading | Starts inside the bookmark, ends just after it |
| Several sections | From the paragraph after the title to a list item under Decision, Host, past three heading bookmarks | From the heading Context to a paragraph under Decision, Host |
| A list item | In the list item, with no bookmark of its own | The same |
| A table cell | Row 4, column 2, counting the header row; the table bookmark covers only the first cell | Row 2, column 2, the same |

<!-- stanza: #fmh9vzd4xh -->
### Identity and time of a comment

<!-- stanza: #3t18m8a6rh -->
| Field | Word desktop | Word for the web | Use for a pull |
| --- | --- | --- | --- |
| `w:id` | Small, with gaps (1, 2, 6, 9); renumbered on every save | Large and random | No |
| `durableId` in `commentsIds.xml`, keyed by the paragraph ID of the comment | Present, and kept when Word desktop saved the web copy | Present | The identity of a comment |
| `w:date` | Local time marked with `Z` | Local time without a zone | No |
| `dateUtc` in `commentsExtensible.xml` | Correct, to the minute; the milliseconds of the web copy are dropped on saving | Correct, to the millisecond | The time of a comment |
| `w15:done` in `commentsExtended.xml` | 0, and 1 once resolved | 0 | The resolved state |

<!-- stanza: #rd2bqmzvq1 -->
### Replies, resolving and reactions

Seen in the second round, in Word desktop, and the same in the third, in Word for the web:

- **A reply** is a comment of its own, with its own `durableId`, `dateUtc` and comment range around the same text as the comment it answers. It is linked to that comment by `w15:paraIdParent` in `commentsExtended.xml`, which holds the paragraph ID of the parent. A thread is therefore one comment and the replies that name it as their parent.
- **Resolving** sets `w15:done="1"` on the comment. Nothing else changes, and the comment stays in the file.
- **A reaction** (thumbs up) is stored in `commentsExtensible.xml`, in an extension of the comment it is on: `cr:reaction` with a `reactionType` (1 for thumbs up), the time in UTC, and the user by ID, account provider and display name. A reply can have a reaction of its own.

<!-- stanza: #fqvfvsjcyb -->
### Mentions

- In Word desktop with a personal account, typing `@` does nothing.
- In Word for the web, after sharing the document through SharePoint, a mention works. It is stored in the text of the comment as a `HYPERLINK` field to `mailto:` and the email address of the person, with a bookmark named `_@_<guid>`. `people.xml` lists each author with the account provider and a user ID.
- With a work account the address is probably the work address; this was not checked. Either way, a pull that keeps comments as written would put email addresses and account IDs into Git.

<!-- stanza: #0z40q3cz65 -->
### Other changes on the way back

- The text is unchanged in both. Word for the web only wrote one apostrophe as a character instead of `&apos;`. There are no tracked changes; Word for the web wrote tracking as explicitly off. The fields in the header and footer are unchanged.
- The web copy gained an empty `docProps/custom.xml`, revision IDs and an explicit `Normal` style, and lost the empty footnote, endnote and web settings parts.
- When Word desktop saved the web copy, the text and all 12 bookmarks were still unchanged, and the mention kept its `mailto:` address. Word desktop removed the empty `docProps/custom.xml` again, restored the empty footnote, endnote and web settings parts, and dropped the setting for tracking.
- The author in the file properties is "Un-named": the exporter does not set it. The last author is set by Word to the display name of whoever saved the file.

<!-- stanza: #z0e00yn7tq -->
### The synced folder

While the document was open in Word desktop from the OneDrive folder, AutoSave sent the changes to the cloud, and the file in the local folder stayed as it was. It was only updated after the document was closed and the OneDrive client had synced it. A pull from the synced folder can therefore read an older version than the reviewers see, without any sign of it.

Changes made in Word for the web reached the local folder in about a minute, with nothing to close. That file looked like a save by Word desktop (small `w:id` values, `w:date` marked with `Z`, times to the minute, the empty parts present), while the copy from "Download a copy" in the first round had random `w:id` values and milliseconds. The form of the file depends on how it leaves the cloud, not on the Word that was used, so a pull must read both forms.

<!-- stanza: #4ggxk18qv1 -->
### Found on the way

`stanza build` stops with an unhandled `EBUSY` error when one of the output files is open in Word, which is the normal state during a review. It should report the file and write the others.

<!-- stanza: #58taz2p4xz -->
### Stamp and embedded source

Checked on 2026-11-22 for item 138 and ADR 0084. The same document was built with a trial stamp added by hand: four custom file properties (`stanza-document`, `stanza-commit`, `stanza-dirty`, `stanza-content-hash`) and a custom XML part in the namespace `urn:stanza:source:1` holding the source text, linked from the main document. It was commented and saved in Word desktop, then uploaded to OneDrive, commented in Word for the web and read from the synced folder.

- **Custom file properties** survive both, with the same names and values.
- **The custom XML part** survives both, with its relationship, its attributes and its text.
- **Line endings:** Word desktop wrote every line break in the text of the part as `\r\n`. Word for the web kept the part as it was. With line endings normalised to `\n`, the text is identical to the source.
- The upload got a new name in OneDrive ("0002-stamp-test 1.docx"), which again shows that the file name says nothing about the document.

<!-- stanza: #qp4dcscect -->
### Consequences

- ADR 0030 needs revising: the protection cannot be on for a document that goes to SharePoint. The pull of item 140 then has to be the guard, since it already reports changed text and tracked changes.
- Item 138: custom file properties and a custom XML part written by Stanza survive Word desktop, Word for the web and OneDrive, so the stamp and the embedded source of ADR 0084 work. The content hash is computed over the text with line endings normalised to `\n`, and the text read back is normalised the same way.
- Item 140: a comment is identified by its `durableId` and timed by `dateUtc`; it is mapped by the start of its range, with the sections it crosses reported; a table cell is given by row and column; a mention keeps the display name only, never the address. Replies are grouped under their comment by `w15:paraIdParent`, and the resolved state comes from `w15:done`. A reaction keeps at most its type and display name, never the user ID. Whether paragraphs and list items need finer anchors than their section, for example by storing the commented text, is for the ADR of item 140.
- Items 134 and 140: a file in the synced folder can be older than the copy in the cloud. The pull should at least show the time the file was last saved (from the file properties), so that the author can see when it is behind.

<!-- stanza: #931ks3q31x -->
### Not yet tested

- How long the synced folder lags behind while a document stays open in Word desktop.
- Updating the table of contents under the protection: the document had no table of contents.
- A work tenant: sharing for review only, mentions, and whether sharing changes the package.
