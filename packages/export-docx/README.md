# @phrase/export-docx

`exportDocx(document, stylesheet, options)` writes a DOCX from a validated snapshot. The only package that imports `docx` (and `fflate` for the package); `docx` types do not leave it.

- `export.ts` entry; `content.ts` blocks and inlines; `styles.ts`, `style-ids.ts`, `run-styles.ts`, `table-styles.ts` named Word styles; `list-numbering.ts`; `header-footer.ts`, `page.ts`, `toc.ts`; `bookmark-name.ts`; `package.ts` and `docx-props.ts` finish the file (review protection, properties).
- Tests inspect the XML structurally (`export.test.ts`).

ADRs: `docs/INDEX.md` (DOCX export).
