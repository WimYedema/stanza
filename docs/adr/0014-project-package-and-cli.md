# ADR 0014: Project package and command line

Status: Accepted. The storage port gains `writeText` and the CLI gains `format`: ADR 0015.

## Context

ADR 0002 planned a `cli` package and said that file access goes through the `ProjectStorage` port, with the extension and a later browser host sharing the core. Loading a project, checking it as a whole, and building it are application logic that every host needs, and none of it should depend on Node. The vision asks for reproducible publication, with dates that never come from the build time.

## Decision

### Packages

A new isomorphic package, `project`, holds the application logic. It may import `core`, `format`, and `export-docx`, and no Node built-ins. The `cli` package is a thin Node adapter: the Node filesystem implementation of the storage port, argument parsing, printing, and exit codes. It may import `core` and `project`. Both rules are enforced by lint, like the others. The later project model (the document list and order) grows inside `project`.

### Storage port

`ProjectStorage` has three operations: read the text of a file, list one directory, and write a file. Paths are relative to the project root and use `/`. Listing is one directory at a time, so the loader decides what to skip and the adapters stay simple. The Node adapter refuses paths that are not safe relative paths, leaves out links and special files, and creates directories when writing.

### Loading and validation

A project is a directory with `phrase.yaml`. Its documents are all `*.phrase.md` files below it, found by walking the directories and sorted by path. Hidden directories and `node_modules` are skipped. Loading checks in stages, and a stage runs only when the earlier one has no errors: the project file, the stylesheet (at the path in the project file), then the documents. Each document gets its parse and validation diagnostics, and its metadata is checked against the project's declared fields with the defaults applied. IDs must be unique across the project (ADR 0001), so an ID that two documents share is an error in the later document. Every diagnostic carries the file it belongs to.

### Building

A build loads the project and exports every document with the project defaults applied to its metadata. Nothing is written when anything has an error, so an output directory never holds half a build. The files are written to `<out>/<path without .phrase.md>.docx`, which keeps the folder structure and cannot collide. The output directory is relative to the project root and is checked like other paths. The exporter checks documents again, so a diagnostic that repeats an earlier one is dropped.

### Commands

`phrase validate [project]` and `phrase build [project] [--out dir] [--date date]`, with `--help` and `--version`. The project defaults to the current directory and the output directory to `build`. Arguments are parsed with Node's `util.parseArgs`. Diagnostics print as `file:line: severity code: message [path]`, followed by a summary. Exit code 0 means no errors, 1 means errors in the project, and 2 means wrong usage or a file that cannot be read.

### Dates

The date written into a package comes only from `--date`, as a date or as a date and time with a zone, between 1980 and 2099. Without it the date is 1980-01-01, the earliest that the zip format holds, so output is always the same. The build prints the versions of the tool and of the `docx` library and the date it used. The item on build information from Git later replaces the default with the date of the release or commit. Embedding the versions in the DOCX is part of that item.

## Consequences

- The VS Code extension and a browser host reuse loading, validation, and building, and need only their own storage.
- Tests of loading and building run on an in-memory storage, with no files.
- A single error in any document stops the whole build. Warnings do not.
- The default date is a placeholder. Files built without `--date` all say 1980.

## Alternatives considered

- **Everything in the CLI with direct file access.** Smaller now, but the extension would have to move or copy it.
- **Recursive listing in the storage port.** It would make every adapter apply the skip rules and risk walking `node_modules`.
- **The build time as the default date.** Ruled out by the vision, and it would make every build different.
- **Writing output for the documents that are fine.** A partial output directory is easy to mistake for a complete build.
