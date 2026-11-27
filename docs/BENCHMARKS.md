# Benchmarks

Measurements of the budgets of ADR 0101, on the reference setup: Intel Core Ultra 7 155H, 32 GB, Windows 11. Each table names the VS Code version, the commit, the document and the number of runs. Times are milliseconds.

## First open in a new window

`node scripts/measure-first-open.mjs <document> --runs 20`. From starting `code` to the document painted, in a new profile with no other extensions installed.

### 2026-11-27, VS Code 1.148.0, after 122b0b9, `docs/documents/0078-document-startup.stanza.md`, 20 runs

| Step | p50 | p95 |
| --- | ---: | ---: |
| VS Code until the extension host | 2348 | 2508 |
| Extension host until Stanza runs | 814 | 834 |
| Loading Stanza | 61 | 69 |
| Activation | 14 | 18 |
| Until the open request | 37 | 207 |
| Webview loading | 1143 | 1228 |
| Until visible | 1811 | 2322 |
| Until editable | 1 | 4 |
| **Total: visible** | **6253** | **6500** |
| **Total: editable** | **6254** | **6501** |

A run of 8 with one more mark split "until visible": the host sends the document 157 ms (p50) after the webview is ready, and the webview paints it 1697 ms (p50) after that. The project has loaded by then, so editable follows within a few milliseconds.

Notes:

- About 3.2 s is VS Code and its built-in extensions, before Stanza runs. Loading and activating Stanza take under 80 ms.
- About 2.9 s is Stanza's part from the open request: 1.1 s until the webview runs its script, and 1.7 s in the webview until the document is painted. This is where to look first.
- In a new profile, VS Code 1.148.0 opens a `.stanza.md` file as text unless `workbench.editorAssociations` names `stanza.editor`; the script sets it.
