# @stanza/cli

`stanza` command: validate (`--file`, `--max-diagnostics`), build, format (`--file`, `--check`, `--assign-ids`, `--fix-stylesheet`, `--fix-references`), import, adopt (Markdown, ADR 0060), migrate (`--check`; a Phrase project to Stanza, ADR 0083). `main.ts` wires the process; `run.ts` is the testable entry with injected cwd and output; `node-storage.ts` implements `ProjectStorage` on the file system, and `nodeRemove` deletes the files that `migrate` renames.

## Local invocation

Requires Node 22 or later. From the Stanza checkout, run `npm install` and `npm run build` for setup, then `node packages/cli/dist/main.js --help`. Optionally run `npm link --workspace @stanza/cli` to put this checkout's `stanza` executable on PATH. Installing the VS Code extension does not install the CLI.

From another folder, invoke Node with the absolute path to this checkout's `packages/cli/dist/main.js`, or use the linked `stanza` command. No registry download or network is needed for validation or formatting after setup.

`import` and `adopt` append the new document to an existing `documents` outline in `stanza.yaml`, preserving comments and unrelated settings. They do not create an outline when it is absent. A failed outline write explicitly reports that the new file may already exist; inspect it before retrying. Validation suggests explicit list repairs for unlisted or missing documents (ADR 0079).

## Surgical edits

From the project directory (replace `stanza` with the Node invocation if needed):

```text
stanza format . --file documents/one.stanza.md --file documents/two.stanza.md --assign-ids
stanza format . --file documents/one.stanza.md --file documents/two.stanza.md --check --assign-ids
stanza validate . --file documents/one.stanza.md --file documents/two.stanza.md --max-diagnostics 50
```

Paths are relative to the project, accept either separator, and cannot escape it. Repeat `--file` for each changed document; duplicates are checked only once. Files must exist within project discovery (hidden folders and `node_modules` are excluded). Omit `--file` for the whole project. After changing shared styles, project settings or IDs, run whole-project validation too.

Selected formatting writes only selected documents. ID assignment reads all project documents to avoid collisions, including unselected/refused documents; an unreadable document prevents assignment. `--check` never writes. `--fix-stylesheet` cannot be combined with `--file`, because it changes shared state.

`validate` is comprehensive and read-only: project configuration, stylesheet, supported syntax, style/mark resolution, metadata, project-wide ID uniqueness, ID references (with optional relative `.stanza.md` filename hints), and file-only Stanza links. IDs are definitive: a stale filename warns but still resolves by ID; absent or ambiguous IDs never fall back to a filename or title. It does not check canonical layout (`format --check` does), fetch external links, or accept Markdown title fragments. Selected validation reads the full project for context but reports only selected documents plus shared configuration, duplicate-ID and unreadable-file diagnostics; it is not full-project certification.

Explicitly fix stale filename hints with `stanza format . --fix-references`, optionally with `--file` selections or `--check` for a dry run. This performs normal canonical formatting too; labels, IDs and ID-only links are preserved. No source is repaired by validation, navigation or export. Fixing paths refuses unreadable, lossy or ambiguous project snapshots. DOCX links use the actual target's output and bookmark; file-only links use its output without a bookmark.

Diagnostics give file, line when known, code, message, structured path when available and available fix suggestions. `--max-diagnostics` is a positive integer limiting displayed diagnostics only: omitted findings are counted, summaries include every finding in scope, and failure exit codes are unchanged. Exit codes: 0 no errors, 1 validation errors or a failed formatting check/refusal, 2 wrong usage or unreadable files. Warnings do not fail validation.

Check after a coherent batch, not each keystroke. Fix introduced failures and report unrelated pre-existing failures without expanding scope or claiming success.

ADRs 0014, 0015, 0020, 0047, 0076, 0077, 0079.
