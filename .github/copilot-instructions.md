# Copilot constraints

Rationale lives in `docs/ARCHITECTURE.md`, `docs/PRODUCT_VISION.md` and the ADRs. Find the right ADR through `docs/INDEX.md`. Do not rediscover decisions; do not load whole directories.

## Product invariants

- Local-first: authoring, validation, rendering and export need no backend, account, network or cloud service. AI is not required at runtime.
- DOCX and PDF are generated outputs, not editable formats. The only import is the content-only Word import of ADR 0043.
- Content holds semantic structure, style IDs and semantic marks, never visual formatting. Formatting commands never create direct formatting or anonymous styles.
- One typed stylesheet is the source of truth; CSS and DOCX properties are generated from it.
- Referenceable objects have immutable IDs. References target IDs, never titles, filenames or rendered numbers. A deleted target is a broken-reference diagnostic, never last rendered text.
- Git is the versioning mechanism; remotes are optional.

## Architecture

- `core` and the domain import no React, Tiptap, ProseMirror, browser, filesystem, Git or DOCX/PDF libraries. Editor, storage, Git and exporters are adapters. Do not expose `docx` types outside the DOCX adapter.
- ProseMirror JSON is not the domain model; convert at the adapter.
- No server, database, auth, cloud SDK, telemetry or realtime collaboration. No new dependency when a small implementation with existing ones will do. Do not build a rich-text engine, layout engine, DOCX writer or VCS.
- Prefer pure functions for validation, style and reference resolution, numbering, migrations, serialization. Persistence is deterministic and format-versioned; a persisted-format change needs a version decision and a migration test.
- Invalid or unsupported state is a diagnostic. Never repair or discard content silently.

## Scope

- Work only on items in `docs/BACKLOG.md`, top down. Never reorder (ask); suggest missing items instead of doing them; stop and escalate when an item outgrows its size.
- Smallest change that keeps the invariants: no speculative extensibility, plugin systems, feature flags or compatibility layers. Check whether a concept belongs in the domain, a use case or an adapter first.
- Stop and report when a request contradicts an invariant.

## TypeScript

- Strict; no `any` (use `unknown` and validate at boundaries: JSON, editor state, files, clipboard, exporter config). Branded IDs where useful, discriminated unions for nodes, commands, diagnostics, results. Avoid classes.

## Editing, style, export

- Editor commands are semantic operations. No font, size, color, weight or spacing attributes on nodes. Marks resolve through the active style. A missing variant is a diagnostic or an explicit style configuration, never invented formatting. Paste keeps supported structure and strips direct formatting.
- Style inheritance and variants resolve deterministically; detect cycles and missing bases. Do not copy resolved values into content. What no declared style or variant can express is unsupported.
- Export only validated snapshots. Keep semantic-to-DOCX mappings small, explicit, testable; prefer named Word styles; centralise library workarounds with a reason. No pagination-parity promises. Do not commit generated artifacts.

## Tests

- Every behavior change or bug fix gets a test (regression test for fixes). Small fixtures, one feature each; reuse shared builders. Test domain without React/Tiptap, adapters for commands and paste, serialization twice for determinism, DOCX structurally. Never weaken or delete tests just to pass.

## Git and docs

- Deterministic file order and formatting; do not rewrite unrelated files on save or migration. Never auto-resolve conflict markers. Keep generated outputs out of Git.
- Accepted ADRs are not rewritten: add a new ADR that refers to the old one. New ADRs stay under about 2 KB and get a line in `docs/INDEX.md`. When an item is done, move it to `docs/BACKLOG_DONE.md` as one line.

## Working efficiently

- Read the nearest module and its test first, plus the package README; reuse existing types, adapters and fixtures. Prefer patches over full rewrites. Run the narrowest tests first, then `npm run check`.

## Done means

Acceptance criteria met; invariants intact; tests pass; persisted output deterministic; no unrelated files changed; diagnostics actionable; docs or an ADR updated for durable decisions; works offline.
