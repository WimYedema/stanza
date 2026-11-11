import type { ProjectStorage } from './storage.js';

export const AGENT_INSTRUCTIONS_FILE = 'AGENTS.md';

/** The instructions for coding agents that work in a project (ADR 0061). */
export const AGENT_INSTRUCTIONS = `# Working in this Phrase project

This folder is a Phrase project. Its documents are Markdown files that become Word (DOCX) files. A document holds structure and style names, never visual formatting. Follow these rules when you edit.

## Files

- \`phrase.yaml\`: the project file (title, stylesheet, defaults, metadata fields).
- \`styles/*.yaml\`: the stylesheet. Fonts, sizes, colors and spacing live here and nowhere else.
- \`documents/*.phrase.md\`: one document each.
- \`build/\`: generated DOCX files. Do not edit them.

## Rules for a document

- Keep the front matter (\`phrase-format: 1\`, \`title\`, and the keys that are there) in its order.
- A block can have an annotation on the line before it: \`<!-- phrase: #k7m2q9x4zb .style-name -->\`. \`#k7m2q9x4zb\` is the ID of the block and \`.style-name\` its style.
- Never change, copy, reuse, remove or invent an ID. A block that moves takes its annotation with it. A new heading or table may have no ID; \`phrase format --assign-ids\` gives it one.
- Choose styles by name from the stylesheet. A character style is \`<span class="style-name">text</span>\`. Do not use a style name that the stylesheet does not have; add the style to the stylesheet first.
- No direct formatting: no HTML other than those spans, no colors, sizes or fonts in a document. Change the look in the stylesheet.
- Use only: headings, paragraphs, bulleted and numbered lists, pipe tables, code fences and fences that start with \`phrase-\`. Block quotes, horizontal rules, images, raw HTML and hard line breaks are not supported.
- Heading numbers are made from the stylesheet. Do not type them.

## After every change

1. Run \`phrase format .\` in this folder to write the canonical layout.
2. Run \`phrase validate .\`. It must report no errors; fix what it reports, do not work around it. The Problems panel of VS Code shows the same findings.

If the \`phrase\` command is not available, say so and do not guess.
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
