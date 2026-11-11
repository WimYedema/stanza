---
phrase-format: 1
title: "ADR 0064: The documentation is a Phrase project"
---

<!-- phrase: #p5bfx0fz31 -->
# ADR 0064: The documentation is a Phrase project

Status: Accepted

<!-- phrase: #sngadkz6de -->
## Context

The product is a way to write documents that become Word files, and its own documentation was plain Markdown beside it. Item 95 of the backlog asks for the documents of this repository to be a Phrase project, so that the product describes itself. ADR 0060 added adopting Markdown files.

<!-- phrase: #018b77mdwb -->
## Decision

- **A project in `docs/`.** `docs/phrase.yaml`, the stylesheet `docs/styles/default.yaml` and the documents in `docs/documents/`. The stylesheet is the default one with the headings not numbered, since the documents number their own sections where they need it.
- **Which documents.** The vision, the architecture, the spike findings and all ADRs, adopted with `phrase adopt` and then moved: the old files are gone, Git sees them as renamed. `docs/INDEX.md`, the two backlog files and the `README.md` at the root stay plain Markdown: the index and the backlog change with every item, and GitHub shows the README.
- **Nothing lost.** The adoption reported nothing, and the words of every document were compared with the original: they are the same. The changes are the front matter (the title is the first heading), an ID line before each heading and table, and `1.` for every item of a numbered list. The decisions in the accepted ADRs are unchanged.
- **Old paths.** ADR 0001, 0002 and 0043 still name `docs/SPIKE_FINDINGS.md`, which is now `docs/documents/spike-findings.phrase.md`. They are left as written.
- **Kept right.** `npm run docs:check` validates the project and checks the canonical form and the IDs (`phrase format --check --assign-ids`), and is part of `npm run check`. `npm run docs:fix` writes the canonical form and gives new headings an ID. `phrase build docs` writes the DOCX files into `docs/build`, which Git ignores.

<!-- phrase: #azv9hmcg0n -->
## Consequences

- The documentation is open in the visual editor, shows in the Phrase tree view, and builds to DOCX with the product.
- A new ADR is a new `NNNN-name.phrase.md` with front matter, then `npm run docs:fix`.
- Agents see an ID line before each heading, and must not change it (the instructions say so).
