# Architectural Direction

## 1. Architectural goals

The architecture should optimize for:

- local-first and offline operation;
- a small, understandable implementation;
- deterministic behavior;
- strict separation of semantic content from visual styling;
- Git-friendly persistence;
- reliable DOCX publication;
- independently testable domain logic;
- low coupling to editor, exporter, hosting, and AI vendors;
- efficient development with GitHub Copilot.

## 2. Recommended initial stack

- **Language:** TypeScript with strict compiler settings.
- **Host:** a command-line tool, then a VS Code extension, then a browser host (ADR 0002).
- **Native format:** a deterministic Markdown dialect with YAML front matter (ADR 0001).
- **Editing framework:** Tiptap on ProseMirror, in a VS Code webview. The UI framework around it is decided when the editor is built.
- **Validation:** a single explicit schema boundary for front matter, project files and the stylesheet, using a well-supported TypeScript validation library or generated validators.
- **DOCX output:** a dedicated adapter around the `docx` library (ADR 0002). Pandoc is not a product dependency.
- **Testing:** unit tests for domain behavior, editor integration tests for commands, and fixture/golden tests for exports.
- **Versioning:** ordinary Git repositories; optional remotes are outside the core runtime.

Technology choices beyond these should be postponed until required by a concrete backlog item.

## 3. System context

```text
                                  optional
                             +--------------+
                             | Git remote   |
                             | GitHub, etc. |
                             +------+-------+
                                    ^
                                    | git
                                    v
+------------------+       +--------+---------+
| User             |       | Local project    |
|                  |<----->| directory / repo |
+--------+---------+       +--------+---------+
         ^                          ^
         | edit                     | read/write
         v                          v
+--------+--------------------------+---------+
| Phrase: CLI, VS Code extension, browser     |
|                                             |
| editor | styles | references | history      |
| validation | preview | DOCX/PDF exporters   |
+---------------------------------------------+
```

No hosted application service is required for this interaction.

## 4. Layering and dependency direction

```text
UI and editor integration
            |
            v
Application use cases
            |
            v
Domain model and rules
       /     |      \
      v      v       v
 Storage  Export   Git adapters
```

Dependencies point inward. Specifically:

- The domain must not depend on React, Tiptap, ProseMirror, DOCX libraries, browser APIs, Node filesystem APIs, Git implementations, or hosted services.
- Tiptap/ProseMirror nodes are editor representations, not the canonical domain model.
- DOCX-specific concepts remain inside the DOCX adapter unless they represent a genuine domain concept.
- Filesystem and Git access are ports implemented by environment-specific adapters.
- There is no editing command layer. The editor edits, and the domain validates the result (ADR 0003).

## 5. Domain modules

Packages (ADR 0002):

```text
packages/
  core/          domain model, styles, references, validation; no dependencies
  format/        Markdown parser and serializer (ADR 0001)
  export-docx/   DOCX adapter
  project/       project storage port, loading, validation, formatting and building (ADR 0014, 0015)
  cli/           validate, build and format commands (Node)
  editor/        Tiptap integration and conversion to and from the domain model
  vscode/        VS Code extension: custom text editor, diagnostics, commands
```

`core`, `format`, `export-docx`, and `project` use no Node built-ins and no DOM. A PDF adapter would be a further package. A lint rule enforces the boundaries.

The modules below live inside `core`.

### Project

Owns project identity, document membership, shared style references, assets, metadata, and publication configuration.

### Document

Owns semantic nodes, ordering, immutable node identifiers, and document-local metadata. It contains semantic marks and style references but no arbitrary visual properties.

### Styles

Owns named styles, inheritance, variants, design tokens, validation, and compilation into renderer-specific forms.

### References

Owns stable targets, target lookup, display modes, numbering, backlink queries, and broken-reference diagnostics.

### Validation

Combines structural, styling, reference, and publication checks without modifying content silently.

## 6. Native project format

Illustrative layout:

```text
project-root/
  phrase.yaml
  styles/
    default.yaml
  documents/
    introduction.phrase.md
    architecture.phrase.md
    security.phrase.md
  assets/
    system-overview.svg
    logo.png
```

Documents are `.phrase.md` files in the Markdown dialect of ADR 0001: GitHub Flavored Markdown with YAML front matter, annotation comments carrying IDs, styles and options, and spans for character styles. The project file and the stylesheet format are decided in the backlog items on the metadata model and the typed stylesheet.

Requirements:

- UTF-8 text with LF line endings;
- deterministic serialization;
- stable IDs independent of filenames and titles;
- explicit format version;
- relative, portable paths;
- no transient editor state in canonical files;
- no derived numbering or rendered style values unless necessary;
- migration code for each supported format version.

Prefer several cohesive files over one very large file, but do not fragment individual documents so aggressively that common edits span many files.

## 7. Semantic editing model

The editor should support a narrow schema. A first schema might include:

- document;
- section or heading;
- paragraph;
- text;
- strong, emphasis, inline code, and link marks;
- ordered list, unordered list, and list item;
- table, row, and cell;
- figure/image and caption;
- cross-reference.

Do not include generic text-style attributes such as `fontFamily`, `fontSize`, `color`, or `fontWeight` in document nodes.

A toolbar command applies a semantic operation. The **Strong** command adds or removes a `strong` mark. Rendering looks up the strong variant of the containing style. If the variant is undefined, the application must use an explicit policy: reject the operation, explain why, and optionally open style configuration. It must not generate an anonymous style or direct formatting.

During a session the ProseMirror document is authoritative. It is converted to the domain model and serialized on each change, and the rules about what an edit may do are pure functions in `core` driven by the style definitions (ADR 0003). Page breaks are a styling concern, not part of the content schema.

## 8. Style architecture

The stylesheet is a typed domain model compiled into output-specific representations.

```text
Typed stylesheet
      |
      +--> Browser CSS
      |
      +--> DOCX named styles and run properties
      |
      +--> PDF renderer configuration
```

It should support, incrementally:

- named block styles;
- style inheritance;
- contextual inline variants such as strong and emphasis;
- typography tokens;
- color tokens;
- paragraph spacing and indentation;
- list definitions;
- border and background treatments needed by supported semantic blocks;
- publication properties such as keep-with-next where supported.

Arbitrary CSS is not canonical project data. CSS is generated output. This keeps browser and DOCX rendering tied to one validated source of truth.

## 9. Stable identities and cross-references

Every referenceable structural object receives an immutable ID when created: ten random base32 characters, unique across the project (ADR 0001). The ID is written in an annotation comment on the line before the block:

```markdown
<!-- phrase: #k7m2q9x4zb -->
## Authentication
```

A reference stores the target ID and its display intention, for example number and title. The syntax is defined with the reference index (backlog: reference index); it targets IDs, never paths or titles.

Resolved text and numbers are derived during rendering. Moving or renaming the target does not alter the reference. Deleting a target creates a validation error rather than silently replacing the reference with plain text.

The reference index should be a pure derived structure with operations such as:

```typescript
resolve(targetId)
findIncoming(targetId)
findBroken()
```

## 10. Rendering and publication

### Browser rendering

The application compiles styles to scoped CSS and uses normal browser layout for editing. Initial editing should be continuous rather than attempting to reproduce Word pagination.

A separate page preview may be introduced only when required. Exact layout parity with Word is not an initial architectural goal.

### DOCX export

The exporter is a compiler from validated project data to DOCX:

```text
Validated project
  -> resolve styles
  -> resolve numbering and references
  -> map semantic nodes
  -> generate DOCX package
```

Rules:

- Use the `docx` library (ADR 0002), isolated in the adapter. Pandoc is not used.
- Use named Word styles wherever possible.
- Centralize all DOCX library calls in the adapter.
- Keep mapping functions small and separately tested.
- Do not modify canonical source to accommodate exporter limitations silently.
- Report unsupported constructs as build diagnostics.
- Record exporter version in build metadata where practical.

Generated DOCX is not expected to preserve the original semantic model after arbitrary editing in Word.

### PDF export

PDF is a later adapter. It must consume the same validated project and stylesheet model rather than using DOCX as an intermediate canonical representation.

**Open decision: PDF strategy.** Typst is the leading candidate (Apache-2.0, local CLI or WebAssembly, real pagination, still pre-1.0). It would not be the native format, because its scripting would allow direct formatting, and it does not replace DOCX export. Record an ADR before implementation covering: the pinned Typst version; compiling the typed stylesheet to Typst rules as a third target; the fact that PDF and DOCX paginate differently, so page numbers can differ between them; and the alternative of converting the DOCX to PDF so that both share one layout, which would need this rule relaxed.

## 11. Storage and local-first operation

Define a project-storage interface independent of the host:

```typescript
interface ProjectStorage {
  openProject(): Promise<ProjectSnapshot>;
  readFile(path: ProjectPath): Promise<Uint8Array>;
  writeFile(path: ProjectPath, content: Uint8Array): Promise<void>;
  listFiles(path: ProjectPath): Promise<ProjectPath[]>;
}
```

The first implementation uses the Node filesystem, in the CLI and the VS Code extension host. A VS Code virtual-filesystem implementation can follow for the browser host. The architectural requirement is that core authoring remains operable with local files and without a backend.

Saving should be explicit and robust. Use atomic-write behavior where the host environment permits it, and warn about external changes rather than overwriting them silently.

## 12. Git integration

Git remains an external, standard version-control system. The application should not reimplement it.

Initial integration may be intentionally minimal:

- store deterministic text files suitable for command-line or IDE Git workflows;
- rely on the VS Code Git integration for status, diff, and commit; the CLI and a browser host have no Git integration;
- expose whether files contain unsaved changes;
- avoid generated artifacts in source control by default;
- document recommended `.gitignore` entries.

Later UI integration may expose status, commit, history, diff, branches, and tags through a Git adapter. Domain-level diffing should compare semantic structures by stable ID, even if Git remains responsible for storage and merging.

Merge conflicts must remain visible. The application must never guess through unresolved conflicts and silently save a synthesized result.

## 13. Testing strategy

### Domain tests

Use focused unit tests for:

- style inheritance and variant resolution;
- prohibition of direct formatting;
- stable ID behavior;
- reference resolution and broken references;
- numbering;
- validation;
- migrations;
- deterministic serialization.

### Editor contract tests

Verify that editor commands produce documents that convert to valid domain content rather than framework-specific formatting leakage.

Examples:

- Strong toggles the semantic mark.
- Strong is rejected when the active style has no applicable variant, according to policy.
- Paste removes unsupported direct formatting while preserving supported semantics.
- Switching paragraph style does not copy visual properties into content.

### Export tests

Maintain small fixtures covering one concern each:

```text
fixtures/
  basic-paragraphs/
  headings-and-styles/
  contextual-variants/
  lists/
  tables/
  images/
  cross-references/
```

Test the generated package structurally. Add a limited number of reviewed golden DOCX artifacts for end-to-end regression checks. Avoid fragile binary snapshots as the only assertion.

## 14. Security and privacy

Because documents may be confidential:

- core editing and conversion remain local;
- no document content is sent to telemetry or AI services by default;
- remote synchronization is an explicit user action through Git tooling;
- dependencies that process document content are reviewed and pinned through the lockfile;
- unsafe HTML and pasted content are sanitized at the editor boundary;
- exported filenames and asset paths are treated as untrusted input.

## 15. Delivery order

The delivery order is `docs/BACKLOG.md`. The earlier vertical-slice plan is superseded by it: pipeline and CLI first, then collections and references, then the editor and review. Advanced history UI and paginated preview follow only after those validate the core proposition.

## 16. Decisions to capture as ADRs

Architecture decision records live in `docs/adr/`.

Accepted:

- ADR 0001: Markdown dialect. Also covers Git-native text storage and stable IDs.
- ADR 0002: host environment and dependency policy. Also covers local-first operation with no required backend and DOCX as output.
- ADR 0003: editor state and the domain model. Also covers the canonical domain model independent of ProseMirror.
- ADR 0004: domain document model.
- ADR 0005: Markdown dialect and normal form, implementation details.
- ADR 0006: typed stylesheet.
- ADR 0007: project file and metadata declarations.
- ADR 0008: DOCX export mapping.
- ADR 0009: DOCX bookmarks.
- ADR 0010: DOCX lists.
- ADR 0011: heading numbering.
- ADR 0012: DOCX tables and page breaks in styles.
- ADR 0013: code blocks and tables in list items.
- ADR 0014: project package and command line.
- ADR 0015: the format command.
- ADR 0016: page templates.

Still to capture:

1. Tiptap on ProseMirror as editor framework.
2. No direct formatting.
3. Typed stylesheet as the single styling source.
4. Continuous editing before paginated preview.
5. AI-independent core behavior.
6. PDF strategy (see section 10).
