import type { ProjectStorage } from './storage.js';

export const AGENT_INSTRUCTIONS_FILE = 'AGENTS.md';

/** The instructions for coding agents that work in a project (ADR 0061). */
export const AGENT_INSTRUCTIONS = `# Working in this Stanza project

This folder is a Stanza project. Its documents are Markdown files that become Word (DOCX) files. A document holds structure and style names, never visual formatting. Follow these rules when you edit.

## Files

- \`stanza.yaml\`: the project file (title, stylesheet, defaults, metadata fields).
- \`styles/*.yaml\`: the stylesheet. Fonts, sizes, colors and spacing live here and nowhere else.
- \`documents/*.stanza.md\`: one document each.
- \`build/\`: generated DOCX files. Do not edit them.

## CLI setup

Requires Node.js 22 or later. In an existing Stanza source checkout, run \`npm install\` and \`npm run build\` once for setup. Then \`npm link --workspace @stanza/cli\` makes this checkout's \`stanza\` command available on PATH. The VS Code extension alone does not install that command.

Without a global link, run \`node "<absolute path to the checkout's packages/cli/dist/main.js>"\` in place of \`stanza\`; it works from this project folder. Verify the chosen invocation with \`--help\`. These commands use the local checkout, not a package fetched by \`npx\`. After setup, validation and formatting run offline. If no built checkout or command is available, report the blocker; do not claim a custom script is Stanza validation.

## Rules for a document

- Keep the front matter (\`stanza-format: 1\`, \`title\`, and the keys that are there) in its order.
- A block can have an annotation on the line before it: \`<!-- stanza: #k7m2q9x4zb .style-name -->\`. \`#k7m2q9x4zb\` is the ID of the block and \`.style-name\` its style.
- IDs are immutable and unique across the whole project. A moved or renamed block keeps its annotation, even across files. The same semantic block may change kind (for example a heading becomes a paragraph or table) and keep its ID; an unrelated replacement must not inherit it. Deleting a block deletes its annotation; never reuse that ID or silently remove references to it. Do not invent IDs: \`stanza format . --assign-ids\` gives missing IDs to headings and tables only, not paragraphs or lists.
- References are inline links to immutable IDs: \`[label](#k7m2q9x4zb)\` or \`[label](other.stanza.md#k7m2q9x4zb)\`. The ID is definitive across the project; a relative filename is a checked location hint. Encode path segments (for example \`other%20file.stanza.md\`). Renaming or moving a target keeps navigation and DOCX links valid but a stale filename warns; explicitly update hints with \`stanza format . --fix-references\` (supports \`--file\` and \`--check\`). A file-only \`[label](other.stanza.md)\` opens that document and has no stable block identity. Paths must stay inside the project. Missing and duplicate IDs are errors, never guesses; Markdown title fragments such as \`#my-heading\` are unsupported. Link labels stay as written.
- Choose styles by name from the stylesheet. A character style is \`<span class="style-name">text</span>\`. Do not use a style name that the stylesheet does not have; add the style to the stylesheet first.
- No direct formatting: no HTML other than those spans, no colors, sizes or fonts in a document. Change the look in the stylesheet.
- Use only: headings, paragraphs, bulleted and numbered lists, pipe tables, code fences and fences that start with \`stanza-\`. Block quotes, horizontal rules, images, raw HTML and hard line breaks are not supported.
- Heading numbers are made from the stylesheet. Do not type them.
- See the [small syntax reference](#syntax-reference) below before using a construct.

## After a coherent batch of edits

1. Select the edited files relative to this project: \`stanza format . --file documents/one.stanza.md --file documents/two.stanza.md\`. Add \`--assign-ids\` for new headings/tables; it reserves IDs from every project document but writes only selected files.
2. Check without writing: \`stanza format . --file documents/one.stanza.md --check --assign-ids\`. Repeat \`--file\` for every edited document.
3. Run \`stanza validate . --file documents/one.stanza.md --max-diagnostics 50\`, again repeating \`--file\` for every edited document. It reads all documents for ID/reference context and reports selected files plus project/stylesheet, duplicate-ID and unreadable-file problems. It is not a full-project check.
4. After changes to shared styles, project settings or IDs, also run \`stanza validate . --max-diagnostics 50\`. For whole-project canonical layout checks use \`stanza format . --check --assign-ids\`; do not format unrelated files just to pass.

Validation is read-only: it checks syntax, supported constructs, style names and allowed marks, metadata, project-wide ID uniqueness, and internal references. It does not check canonical layout (use \`format --check\`), fetch external links, or resolve Markdown heading fragments. Diagnostics give file, line when known, code, message and structured path when available; known fixes are suggested. The output cap never changes totals or exit status; increase it to inspect omitted findings. Exit codes: 0 no errors, 1 validation errors or a failed formatting check, 2 usage/read failure. Warnings are not errors.

Fix problems introduced by the edits. Record and report unrelated pre-existing failures without expanding the task, suppressing checks or claiming a clean result. The VS Code Problems panel uses the same validation rules. Say exactly which Stanza command ran and its outcome.

## Syntax reference

Examples illustrate syntax, not IDs to copy or styles to invent. Only use styles and mark variants declared in the active stylesheet.

- Inline marks: \`*emphasis*\`, \`**strong**\`, and backtick code. Underscore emphasis is also read, but the formatter writes asterisks. Strikethrough is unsupported.
- A link inside a character style: \`<span class="marker">[label](#k7m2q9x4zb)</span>\`.
- An annotation attaches to the next whole block: put \`<!-- stanza: .list-bulleted -->\` immediately before a list, not before each item. For a table nested in a list item, indent its annotation and table to the item's content column.
- Plain cells use a pipe table, with a header and separator row. Put table ID, style and optional \`widths="30 70"\` in its preceding annotation, not inside cells.
- Rich cells use \`stanza-table\`: outer bullet items are rows, inner items are cells, first row is the header. Cells hold paragraphs and lists only. An empty cell is a bare \`-\`.

\`\`\`\`markdown
<!-- stanza: .table -->
\`\`\`stanza-table
- - Control
  - Status
- - First paragraph.

    Second paragraph.
  - - met
    - partial
\`\`\`
\`\`\`\`

The other supported semantic fence is \`stanza-toc\`: an empty body or \`depth: 3\` (1 to 6), at document top level, with the corresponding \`toc-1\` through \`toc-N\` styles declared. Unknown \`stanza-*\` kinds are diagnostics, not extensibility points. Ordinary code fences are literal code and may name a language.
`;

export type AddAgentInstructionsResult =
  { readonly ok: true; readonly file: string } | { readonly ok: false; readonly reason: 'exists' };

/** Writes the instructions into the project folder, unless there is a file of that name already. */
export async function addAgentInstructions(
  storage: ProjectStorage,
): Promise<AddAgentInstructionsResult> {
  // A folder that cannot be listed has no such file yet, as for the other files of a project.
  const entries = await storage.list('').catch(() => []);
  if (entries.some((entry) => entry.name === AGENT_INSTRUCTIONS_FILE)) {
    return { ok: false, reason: 'exists' };
  }
  await storage.writeText(AGENT_INSTRUCTIONS_FILE, AGENT_INSTRUCTIONS);
  return { ok: true, file: AGENT_INSTRUCTIONS_FILE };
}
