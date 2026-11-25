# Example projects

Each directory here is a complete Stanza project. They do two jobs:

- **Showcase.** Open one in VS Code with the Stanza extension, or build it and open the DOCX in Word, to see what a feature looks like in practice.
- **Tests.** `packages/project/src/examples.test.ts` builds every project here on each test run. A project must build without errors or warnings, to the same bytes each time. A change that breaks an example fails the tests.

Build them all with `npm run examples` (after `npm run build`), or one with:

```sh
node packages/cli/dist/main.js build examples/corporate-report
```

The DOCX files go to `build/` inside each project, which Git ignores.

| Project | Shows |
| --- | --- |
| `corporate-report` | A cover in rows (ADR 0089): a logo near the top corner with cover margins of its own, the title and subtitle in the lower part of the page, and a metadata table at the bottom. A4, numbered headings, a table of contents with page numbers, header and footer. |
| `classic-cover` | A classic centred cover in rows on Letter paper: the title a third of the way down, the authors in the middle, an emblem and the organisation at the bottom. Centring comes from the paragraph styles, not the rows. |
| `technical-note` | A cover grid (ADR 0092): the logo beside the document number and date, the title across both columns low on the page, and a metadata table beside the status and classification at the bottom. The `areas` of the stylesheet are a small picture of the page. |
| `plain-memo` | No cover, but a title block (ADR 0090): the template writes a small logo, the title and a table of from, to, date and classification at the top of the first page, and the text follows. |

## Adding an example

- Keep each project small and about one idea; give its stylesheet a comment that says what it shows.
- Use made-up names, people and logos only. The logos here are abstract shapes drawn for these examples.
- Assign IDs with `node packages/cli/dist/main.js format --assign-ids examples/<name>`.
- Add the project to the table above and to the list in `examples.test.ts`.
