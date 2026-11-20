---
stanza-format: 1
title: "ADR 0078: Document startup"
---

<!-- stanza: #r2bzrxzzrz -->
# ADR 0078: Document startup

Status: Accepted. Refines ADRs 0025 and 0077.

<!-- stanza: #qqm86y93va -->
## Decision

- One extension-host diagnostics service owns project snapshots shared by editors, navigation and the tree. Concurrent requests share a load. Unsaved buffer edits and file create/change/delete events invalidate affected snapshots, including configuration. A load invalidated while running is never published or returned as current; retry at the new revision. Explicit refresh remains available for commands that changed files.
- Project loading parses each document once, reusing the parsed model for ID collection and validation. Document discovery and diagnostic ordering stay deterministic. CLI and export keep full validation.
- On a cold open, read and check configuration and the active document first. Show the unchanged canonical document as a read-only preview while the full project loads. Only enable editing after the current project-wide ID set arrives. Commands and document-changing transactions cannot bypass the gate; selection and reading remain available.
- A warm open reuses the current shared snapshot. Project or stylesheet errors still refuse visual editing. Background failures are visible and never enable editing with empty or stale IDs. Opening does not rewrite files.
- Measure first painted content and editing readiness from webview startup; write durations to the local Phrase output channel only. No telemetry or persisted timing data. Regression tests assert load reuse, invalidation and readiness ordering; timings are measurements, not fixed hardware-independent promises.

<!-- stanza: #t36dj8djvy -->
## Format

No persisted format changes, migration or dependencies. The message protocol gains staged readiness and local startup timings.
