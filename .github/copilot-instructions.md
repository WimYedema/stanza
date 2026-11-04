# GitHub Copilot Engineering Constraints

This file is intended as the source for concise repository-level Copilot instructions. Keep the active instruction file short to reduce repeated context and token/credit use. Put explanations in the product and architecture documents and reference them only when needed.

## Product invariants

- The product is local-first. Core authoring, validation, rendering, and export must not require a backend, account, network connection, or cloud service.
- DOCX and PDF are generated publication formats, not canonical editable formats.
- Arbitrary DOCX import and DOCX round-tripping are outside the initial scope. The only import is the one-time, content-only import of ADR 0043, which never applies formatting from the DOCX.
- The product deliberately supports less formatting power than Word.
- Document content contains semantic structure, style identifiers, and semantic marks. It does not contain arbitrary visual formatting.
- Formatting commands must never silently create direct formatting or anonymous styles.
- Styling has one typed source of truth that compiles to browser CSS and publication-specific properties.
- Projects may contain multiple documents, shared styles, shared assets, and cross-references.
- All referenceable objects have immutable IDs. References target IDs, never titles, filenames, or rendered numbers.
- Git is the versioning mechanism. GitHub and other remotes are optional.
- AI is not required by the product runtime.

## Architecture constraints

- Keep the domain independent of React, Tiptap, ProseMirror, browser APIs, filesystem APIs, Git libraries, and DOCX/PDF libraries.
- Treat editor, storage, Git, and exporters as adapters around the domain and application layers.
- Do not use ProseMirror JSON as the canonical domain model merely because the editor uses ProseMirror.
- Do not expose DOCX-library types outside the DOCX adapter.
- Do not introduce a server, database, authentication system, cloud storage SDK, telemetry service, or realtime collaboration framework unless explicitly requested.
- Do not add a dependency when a small, well-tested implementation using existing dependencies is sufficient.
- Do not build a custom rich-text engine, browser layout engine, DOCX package writer, or version-control system when a maintained component satisfies the constrained requirement.
- Prefer pure functions for validation, style resolution, reference resolution, numbering, migrations, and serialization.
- Keep persistence deterministic and format-versioned.
- Surface invalid or unsupported states as diagnostics. Do not repair or discard document content silently.

## Scope discipline

- Work only on items in `docs/BACKLOG.md`, from the top down. Do not skip ahead.
- Do not reorder backlog items; ask the user.
- Suggest missing items instead of doing unlisted work; the user decides their placement.
- If an item turns out larger than its size estimate, stop and escalate so the user can reprioritize.
- Implement only the requested vertical slice.
- Do not add speculative extensibility, plugin systems, generic abstractions, feature flags, compatibility layers, or service boundaries.
- Prefer the smallest change that preserves the architectural constraints.
- Before adding a new concept, check whether it belongs in the domain, an application use case, or an adapter.
- Keep modules cohesive. Split files when they mix responsibilities, not solely to meet a line-count target.
- Avoid broad refactors while implementing a focused feature unless the current structure prevents a correct implementation.

## TypeScript rules

- Use strict TypeScript. Avoid `any`; use `unknown` at input boundaries and validate it.
- Model identifiers with branded or opaque types where useful.
- Prefer discriminated unions for document nodes, commands, diagnostics, and build results.
- Make invalid states difficult to represent, but do not create deeply generic type machinery.
- Validate external JSON, editor state, filesystem data, clipboard input, and exporter configuration at their boundaries.
- Keep serialization schemas explicit and versioned.
- Avoid classes unless identity, encapsulated mutable state, or framework integration clearly benefits from them.

## Editing rules

- Editor commands express semantic operations, not visual properties.
- Do not implement font-family, font-size, arbitrary color, arbitrary weight, or free-form spacing attributes on document nodes.
- Strong, emphasis, code, and similar actions are semantic marks resolved through the active style.
- If an applicable declared variant is missing, return a diagnostic or invoke explicit style configuration. Never invent direct formatting.
- Paste handling may preserve supported semantic structure but must remove unsupported direct-formatting attributes.
- Transform editor state to domain commands through an adapter; do not let editor transactions become application persistence APIs.

## Style rules

- The typed stylesheet is canonical. CSS is generated output.
- DOCX style and run properties are generated output.
- Style inheritance and contextual variants must have deterministic resolution rules.
- Detect inheritance cycles and missing base styles.
- Do not duplicate resolved style values into document content.
- A visual result that cannot be represented by a declared style or variant is unsupported until the model is extended explicitly.

## Reference rules

- Assign immutable IDs when referenceable nodes are created.
- Moving, renaming, or renumbering a target must not change its ID.
- Deleting a referenced target produces a broken-reference diagnostic.
- Derive display text and numbering during rendering or publication.
- Never replace a broken reference silently with its last rendered text.

## Export rules

- Export only validated project snapshots.
- Keep semantic-to-DOCX mappings small, explicit, and testable.
- Prefer named Word styles over repeated direct properties.
- Centralize workaround code for exporter/library limitations and document why it exists.
- An exporter limitation must not leak DOCX-specific fields into the domain model without an explicit architectural decision.
- Do not promise exact pagination parity between browser rendering and Word.
- Generated artifacts should not be committed unless a fixture or release process explicitly requires them.

## Testing rules

- Add or update tests with every behavior change.
- Prefer small fixtures that each demonstrate one feature or regression.
- Test domain behavior independently of React and Tiptap.
- Test editor adapters for semantic command behavior and paste normalization.
- Test deterministic serialization by serializing the same model more than once.
- Test DOCX packages structurally; use reviewed golden artifacts sparingly.
- Every bug fix should include a regression test when practical.
- Do not weaken, delete, or broadly rewrite tests merely to make a change pass.

## Git and migration rules

- Preserve deterministic file ordering and formatting to keep diffs small.
- Do not rewrite unrelated project files during save or migration.
- Every persisted-format change requires a format-version decision and migration test.
- Never auto-resolve Git conflict markers as document content.
- Keep generated outputs, caches, previews, and temporary files out of source control by default.
- Accepted ADRs are not rewritten. Record a change in a new ADR that refers to the old one; the old one's status line may point to it.

## Efficient Copilot usage

- Request and implement one well-defined change at a time.
- Read the nearest relevant module and test first; do not load the entire repository by default.
- Reuse established domain types, adapters, fixtures, and patterns.
- Prefer precise patches over generating complete replacement files.
- Run the narrowest relevant tests first, then the full required checks.
- Use inexpensive models for mechanical code, tests, types, and local refactors. Reserve stronger models for architecture, difficult ProseMirror behavior, exporter defects, and cross-module debugging.
- Keep prompts self-contained but short: state the goal, relevant invariant, acceptance criteria, and files likely involved.
- Do not ask Copilot to rediscover documented architectural decisions. Point it to the relevant section or ADR.
- Avoid repeatedly generating large sample documents. Maintain small reusable fixtures instead.
- Stop and report a conflict when a request contradicts a product invariant rather than working around the invariant silently.

## Definition of done

A change is complete when:

- behavior satisfies explicit acceptance criteria;
- product and architecture invariants remain intact;
- relevant tests pass;
- persisted output remains deterministic;
- no unrelated files changed;
- new diagnostics are actionable;
- documentation or an ADR is updated when the change introduces a durable decision;
- the feature works without a network connection unless it is explicitly a remote-Git feature.
