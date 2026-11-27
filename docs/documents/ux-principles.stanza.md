---
stanza-format: 1
title: "UX and Design Principles"
---

<!-- stanza: #3hecnansk4 -->
# UX and Design Principles

<!-- stanza: #az0p39fedh -->
## Purpose

Stanza's interface should follow from its document model. What something is gets chosen in the content, how it looks is decided once in the stylesheet, and each has its own place on screen.

These principles guide the user interface of Stanza: the document editor and the style editor, as they first ship inside VS Code. New screens and features are judged against them. They build on the product principles in the Product Vision, especially "Meaning before appearance", "No silent direct formatting" and "Constraint is a feature".

Decisions on specific screens stay in ADRs, for example 0026, 0027 and 0086 for the document editor and 0036 to 0041 for the style editor. Where an ADR and this note differ, the ADR decides until it is revised.

<!-- stanza: #y6fwcwafrb -->
## Principles

<!-- stanza: #xbk60t2dq1 -->
### 1. The interface mirrors the document model

A Stanza node has a type, a style, an optional variant, inline marks and a stable identity. Each of these gets one clear home in the UI, so the screen teaches the model instead of hiding it.

- Type (paragraph, heading, list, table, figure, code block) is in the top bar.
- Style, variant, marks and identity are in the inspector.
- Appearance lives in the stylesheet and is edited in the style editor.

*Why:* Word blends these into one ribbon, which is a large part of why its documents drift into direct formatting. If the UI keeps the concepts apart, users keep them apart too.

<!-- stanza: #z96mzn2852 -->
### 2. Show what something is, not knobs for how it looks

The inspector shows a node's computed appearance read-only, with its inheritance chain, and offers "Edit style" as a deliberate jump to the style editor. No font, size or colour control ever appears in the writing view.

*Why:* an editable font field in the inspector would look like direct formatting even if it changed the stylesheet. Users would expect to change one paragraph and change forty documents instead. Making style edits a visible change of place keeps the consequence clear.

<!-- stanza: #3t4gtd25t9 -->
### 3. Fixed vocabulary in fixed places, project vocabulary in context

The core block types are the same in every project, so they sit in a stable top bar that users learn once. Styles, variants and character styles come from the project's stylesheet, so they appear in the inspector and change with the selection.

*Why:* stable controls build muscle memory; contextual controls stay short because they list only what applies. Putting project styles in the top bar would make it different in every project and too long in most.

<!-- stanza: #vxcb1ywv54 -->
### 4. Offer only what is valid here, and explain what is missing

The inspector lists the marks and variants the stylesheet defines for the current style. If an author asks for one that does not exist (Strong in a caption), the editor applies nothing, says why, and offers a way forward: add the variant, use another mark, or cancel.

*Why:* hiding an option silently makes the product feel broken; inventing formatting breaks the core principle. A short explanation with an explicit next step turns a constraint into guidance.

<!-- stanza: #pt48754h86 -->
### 5. Frequency decides distance

The actions people use most sit closest to the text. Strong, emphasis, code and link are on keyboard shortcuts and a small floating toolbar next to the selection. Block type is one click away in the top bar. Less frequent, deliberate edits such as variant, references and style live in the inspector.

*Why:* the inspector is far from the cursor. It is the right place for considered changes and the wrong place for something applied every few sentences.

<!-- stanza: #c4hynwn7f3 -->
### 6. Make structure visible on the page

The selected block is outlined and tagged with its style in the margin (for example ¶ body). The inspector opens with a breadcrumb such as § Vision › ¶ body › strong, and each level can be clicked to re-target the inspector.

*Why:* in a semantic editor the structure is the content. Selection is nested, so users need to see and choose which level they are acting on, without opening the source.

<!-- stanza: #5f7vpt8jsw -->
### 7. Identity and relationships are first-class properties

Every referenceable node shows its stable ID, what references it, and a way to copy a reference to it. Broken references appear under Checks and in the Problems tab.

*Why:* structural references are a core promise of the product. If IDs and links are only visible in the source file, authors will not trust or use them.

<!-- stanza: #p3858th297 -->
### 8. Review comments are data to resolve, not edits

Comments imported from Word appear in a Review tab, anchored to the content they refer to, with margin markers on the page. Comments whose anchor no longer exists are reported with a way to reattach them. Tracked changes from Word are listed but never applied automatically.

*Why:* this follows the publication model, where content flows one way and comments flow back. Treating comments as a queue the author works through keeps the source the single source of truth.

<!-- stanza: #j5mb7h5n37 -->
### 9. Fit the host before inventing

Inside VS Code, the editor uses VS Code's tabs, colours, focus styles and status bar, and puts Git actions where developers expect them. The layout is a top bar plus a right-hand panel because both fit naturally into an editor tab next to VS Code's own sidebars.

*Why:* the first users are developers who live in VS Code. The editor should feel like part of their tool, not a separate app squeezed into a tab.

<!-- stanza: #fxxcftd8tf -->
### 10. Every constraint has an exit

When the editor says no, it also says what the author can do instead, and that is usually one click away. The style editor is the place to widen the vocabulary on purpose.

*Why:* "Constraint is a feature" only holds if users can see the reasoning and the way forward. A dead end teaches people to work around the tool.

<!-- stanza: #kyd044fjpn -->
### 11. Render what is being edited

In the document editor the page is the content, so it is the editing surface. In the style editor the subject is the stylesheet, so the centre shows a specimen generated from it: every style once, labelled with its name and what it is based on, and read-only. Clicking a sample selects its style, and the inspector edits it.

*Why:* this is how browser devtools work. You select on the rendered page and edit the rule, never the element. A real document in the centre would look editable and would show only the styles it happens to use.

<!-- stanza: #jjwwa2qn2t -->
### 12. Show the whole vocabulary and its gaps

The specimen includes a grid of styles against marks. Each cell renders the mark inside that style. Combinations the stylesheet does not define are marked, and selecting one offers the choices: the same as the base style, a new variant, or deliberately unavailable.

*Why:* otherwise a missing variant only shows up when an author runs into it. The person who owns the stylesheet can fix every gap in one place.

<!-- stanza: #52tng2hdk5 -->
### 13. Show what a style sets, then what it inherits

The inspector lists the properties a style sets itself, each with a reset. Inherited values follow, each with its source. Properties nobody sets are hidden behind one link. Colours and fonts appear as theme tokens, not raw values.

*Why:* a form with every property, most of them "(not set)", hides the few decisions that matter and makes inheritance hard to follow.

<!-- stanza: #y408gmwdhn -->
### 14. Context travels between modes

"Edit style" in the document editor opens the style editor on real content near where the author was. "Uses in project" shows every use of a style before a change is committed. "Back to document" returns to the same place.

*Why:* styling is usually prompted by something seen in a document, and checking a change needs real content, not only the specimen.

<!-- stanza: #g7yv7rch1z -->
## Layout

Both editors share one shape: a top bar, a rendered surface in the centre and an inspector on the right. Each region holds one kind of decision, so a new control's home follows from what it changes.

<!-- stanza: #bn3epwkhpg -->
### Document editor

The writing view has five regions.

<!-- stanza: #sxdfsb32x4 -->
| Region | Holds | Changes with selection | Principles |
| --- | --- | --- | --- |
| Top bar | Block types (Paragraph, Heading, List, Table, Figure, Code block, More), Reference, Contents; Commit, Export DOCX, Style editor | Only which block type is highlighted | 1, 3, 9 |
| Floating toolbar | Strong, Emphasis, Code, Link, more marks, for the current text selection | Yes; shows only marks valid here | 4, 5 |
| Page | The rendered document, selected-block outline, style tag in the margin, comment markers | Yes | 6, 8 |
| Inspector: Object tab | Breadcrumb; style and variant; text marks defined for this style; ID; read-only appearance with Edit style; references; checks | Yes, fully | 2, 3, 4, 6, 7 |
| Inspector: Review and Problems tabs | Imported Word comments, orphaned anchors, ignored tracked changes; validation issues | Follows the selection, but lists the whole document | 7, 8 |

The status bar uses VS Code's own: branch, active stylesheet, problem count and the current selection path.

<!-- stanza: #yyhay36hdt -->
### Style editor

<!-- stanza: #r0zwhdska4 -->
| Region | Holds | Changes with selection | Principles |
| --- | --- | --- | --- |
| Top bar | Views: Specimen, Page layout, Theme tokens, Uses in project; find a style; count of undefined marks; unsaved changes and Diff; Back to document | No | 3, 12, 14 |
| Specimen | Every style once, grouped by kind, read-only; the grid of styles against marks | Highlights the selection | 11, 12 |
| Inspector | Breadcrumb; what the style sets; what it inherits and from where; marks in this style. For a grid cell: the choice of what that mark means there, with a preview | Yes, fully | 2, 4, 13 |

Page layout and theme tokens get specimens of their own: a page with its margins, header, footer and cover areas, and a sheet of tokens with where each is used.

<!-- stanza: #snm8hg3y5m -->
## Open questions

These are the trade-offs to test before the layout settles.

- **Block style in the top bar?** Switching body to note or warning may be frequent enough to deserve a quick picker beside the block type, rather than only in the inspector.
- **Inspector width and collapse.** VS Code windows are often split. Decide the minimum useful width, and whether a collapsed inspector still shows the breadcrumb.
- **Where the missing-variant message lives.** A popover at the button is immediate; a line in the inspector's mark list is calmer and consistent. Possibly both: the inspector as the record, a brief toast at the cursor.
- **Keyboard shortcuts for block types and styles.** Developers will expect them, and possibly a command palette entry for every style in the stylesheet.
- **Light theme and high contrast.** The page is always rendered from the stylesheet, but the chrome must follow VS Code's theme, including high-contrast modes.
- **Lists and tables.** Their nested selection (list item in list, cell in row in table) needs the breadcrumb to work at more levels.
- **The specimen at scale.** With 25 paragraph styles or many character styles, the marks grid may need a filter by group or a view of only the gaps.
- **Table styles in the specimen.** Each table style needs a sample table, with the header row, borders and cells selectable as parts.
- **Beyond VS Code.** If Stanza later runs as its own app, check which of these choices come from the host and which come from the model.
