---
stanza-format: 1
title: "ADR 0101: Responsiveness budgets"
---

<!-- stanza: #cp4jfdppt3 -->
# ADR 0101: Responsiveness budgets

Status: Accepted. Backlog item 191, refining ADR 0078. Decided with the product owner on 2026-11-27. The budgets are goals to check and calibrate, not a claim that they are met.

<!-- stanza: #w2jazjjgj4 -->
## Context

ADR 0078 made startup staged: a read-only preview first, editing once the project-wide IDs arrive. It writes two durations to the Stanza output channel, measured in the webview from webview startup. That leaves out the time before the webview exists, says nothing about how quickly the editor answers a key or a button, and has no corpus, machine or method to compare one change with another. "Fast enough" is therefore a feeling, and a slow change is found by chance.

A first measurement, on the machine named below: loading the 103 documents of `docs/` (450 KB) with `loadProject` takes 161 ms the first time and 100 ms (p50) or 120 ms (p95) after that. Reading and checking the configuration alone takes 4 ms (p50). Nothing has been measured inside VS Code yet.

<!-- stanza: #mgerc19bqe -->
## Decision

<!-- stanza: #b3aqctrakk -->
### Budgets

Each budget is a p95 on the reference setup below, over at least 20 runs.

<!-- stanza: #kr6dqnpadq -->
| What | From | To | p95 budget |
| --- | --- | --- | --- |
| Action feedback | the input event: a key, a toolbar button, a style choice | the next paint that shows the result | 100 ms |
| Warm open | the open request, with a current project snapshot | the document painted and editable | 300 ms |
| Cold open, content | the open request, with no snapshot of the project | the document painted, read-only | 500 ms |
| Cold open, editing | the open request, with no snapshot of the project | editing enabled | 2 s |

- **The open request** is the moment the host's `resolveCustomTextEditor` is called, since VS Code gives no earlier hook for every way of opening. Where Stanza itself opens a document (the tree, a reference, a command), the time from that command to the call is reported as well.
- **Painted** means two animation frames after the content is in the DOM, as now. The webview sends a message at that moment and the host takes the time when it arrives. Both ends of a duration are then on the host's clock, and the message delay counts against the budget rather than being hidden.
- **Extension activation** is reported apart, from the start of `activate` to its end, and is not part of any budget. A cold open in a new window also pays activation and the start of the webview; the report names each part, so a slow open can be traced to one of them.
- **First open in a new window** is measured too: from starting VS Code with a Stanza file to that document painted and editable. It has no budget yet; the first measurements set one. It is reported in parts: VS Code until Stanza activates, activation, the webview loading, and the staged startup of ADR 0078.
- **Action feedback** must not wait for the host. Saving to the buffer, validation and diagnostics can follow the paint, as they do now.

<!-- stanza: #4gqv13mrwj -->
### Reference setup

- **Machine:** Intel Core Ultra 7 155H, 32 GB, Windows 11, on mains power. A faster or slower machine gives other numbers; the budgets are checked on this one.
- **VS Code:** one stated stable version, now 1.148.0, started with a new user data folder and an empty extensions folder, so that only Stanza and the built-in extensions run. The version is updated on purpose and the new baseline is recorded when it is.
- **Corpus:** two projects.
  - `docs/` of this repository, as a real project of about 100 documents.
  - A generated project of made-up text, written from a fixed seed by a script, so the same seed gives the same files. It has 500 documents of mixed length, with references between them, tables and lists, a stylesheet with a cover, and one long document of 3,000 blocks. The script is committed; its output is not.
- **Documents measured:** a short one, a typical one and the long one, from each corpus.

<!-- stanza: #p7n25qx968 -->
### Measurements

- **Separate from the unit tests.** `npm run check` keeps asserting order and reuse (ADR 0078), never durations. Benchmarks run with their own command and are not part of CI, since shared CI machines are too noisy to fail a build on.
- **Three levels.**
  - *Node benchmarks* (`npm run bench`, with `vitest bench`, which is already a dependency) time the parts that need no editor: configuration, `loadProject`, parsing and writing a long document, conversion to and from the editor model, browser CSS. They are fast to run and show which part a regression is in.
  - *Editor measurement* in VS Code: a command for development, "Stanza: Measure responsiveness", hidden unless a development setting is on. It opens the corpus documents cold (after dropping the project snapshot) and warm, runs a fixed set of actions in the webview (typing, Enter, a style choice, Strong), and writes p50, p95 and the parts of each duration to the output channel and to a JSON file the person names.
  - *First-open measurement* from outside: a script starts the installed `code` with a new user data folder, Stanza loaded from the repository and one corpus file, and closes it again, 20 times or more. An environment variable that only the script sets makes Stanza write a time stamp at each step to a JSON file; the script takes the times from the moment it started VS Code. No new dependency.
- **Results** are kept in `docs/BENCHMARKS.md`, plain Markdown, as one table row per measured release, with the machine, VS Code version, commit and corpus seed. Timings stay local, as in ADR 0078: no telemetry, nothing sent anywhere.

<!-- stanza: #x9w5vv724s -->
### What a budget may not cost

A budget is never met by skipping work that keeps documents safe. Editing still waits for the current project-wide IDs. Validation, diagnostics and the refusal of visual editing on a project or stylesheet error stay as in ADR 0078. Opening still never rewrites a file. If a budget cannot be met without one of these, the budget changes, not the rule.

<!-- stanza: #szphvscp2k -->
### When a budget is missed

A missed budget is a finding, not a failure of the build. It goes into the backlog with the measurement. A budget is changed only by the product owner, with the measurement that shows why.

<!-- stanza: #be7ahb73tq -->
## Consequences

- A change that makes Stanza slower can be found by running the benchmarks before and after it.
- The first measurement may show that a budget is not met. That is expected; the backlog then gets an item per budget missed.
- The startup timing message of ADR 0078 changes: it reports the parts of a duration on the host's clock instead of totals from webview startup.

<!-- stanza: #pq37hhm24z -->
## Format

No change to any project file, stylesheet or document. The message protocol between webview and host gains paint and action timings. A script that writes the generated corpus, a script for the first open and a `bench` command are added to the repository.
