---
phrase-format: 1
title: "ADR 0020: Assigning missing IDs"
---

<!-- phrase: #qks9a50d8s -->
# ADR 0020: Assigning missing IDs

Status: Accepted

<!-- phrase: #bypfh9gfyt -->
## Context

Referenceable blocks need immutable IDs (ADR 0001). The editor will assign them when blocks are created, but a hand-written document has headings and tables without one, and `validate` warns about each. ADR 0015 left open whether assigning IDs becomes an option of `format` or a command of its own. The pure parts exist already: `assignMissingIds` in `core` and `assignMissingIdsInText` in `format`. What is missing is uniqueness across the project, the option on the command, and a random source.

<!-- phrase: #kh1mf14tme -->
## Decision

<!-- phrase: #05enwdytr4 -->
### Command

An option of `format`: `phrase format [project] --assign-ids [--check]`. A command of its own would repeat the file discovery, the refusal rules and the exit codes of `format`.

<!-- phrase: #h5r7mhvj7t -->
### Per document

A document is parsed, serialized into canonical form, given its missing IDs, and written once if the result differs from the file. The blocks that get an ID are those that `validate` warns about (`missing-id`): headings and tables. Existing IDs are never changed. A document that is refused under ADR 0015 is left as it is and gets no IDs.

<!-- phrase: #h5j33m7vh4 -->
### Uniqueness

New IDs avoid every ID of every document of the project, including refused documents and documents that are not written because of `--check`. The IDs assigned during the run are added to that set as it goes. The option needs a project directory: with a single file the other documents are unknown, so it is a usage error.

If a document cannot be read, nothing is assigned anywhere, since the taken IDs cannot be known. The other documents are still formatted, and the failure is reported (`file-unreadable`, `ids-not-assigned`) with exit code 2.

<!-- phrase: #d68m4gewnf -->
### Duplicates and failures

Duplicate IDs are reported as errors (`duplicate-id`, exit code 1) and not repaired; new IDs avoid them, so assigning stays safe. A document for which no unused ID is found after the attempts of `assignMissingIds` is left as it is (`id-generation-failed`).

<!-- phrase: #pwca2a0jw1 -->
### Random source

The `project` package takes `generateId: () => string` in its format options, because it has no Node built-ins and `core` has no random source. The CLI supplies it from `node:crypto` with `nodeIdFromRandomBytes`. Tests inject a fixed sequence.

<!-- phrase: #t8vw6tjz3s -->
### Check mode and output

With `--check`, a missing ID counts as not canonical: the document is listed, nothing is written, and the exit code is 1. Each changed document is listed with its count, such as `reformatted documents/a.phrase.md (3 IDs assigned)`, or `(3 IDs missing)` when checking. The summary adds the total. A second run changes nothing. The other exit codes of ADR 0015 stay.

<!-- phrase: #0p6nn4ff5f -->
## Consequences

- A hand-written project can be made free of `missing-id` warnings with one command.
- The result of `--assign-ids` differs from run to run, because IDs are random. `--check` stays deterministic: it reports counts and never writes IDs.
- Documents that are refused keep their missing IDs until the unsupported construct is dealt with.

<!-- phrase: #96dwe8dp3k -->
## Alternatives considered

- **A separate `ids` command.** The same discovery and refusal rules again, for one option's worth of behaviour.
- **Assigning IDs to a single file.** It could clash with IDs in other documents.
- **Giving IDs to lists and other blocks.** They are not warned about today, and an ID that nothing can refer to is noise in the file.

<!-- phrase: #nsv2m6r88c -->
## Not covered

Repairing duplicate IDs, assigning IDs when saving in the editor, and IDs for blocks other than headings and tables.
