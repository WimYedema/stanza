# Benchmarks

Measurements of the budgets of ADR 0101, on the reference setup: Intel Core Ultra 7 155H, 32 GB, Windows 11. Each table names the VS Code version, the commit, the project or document and the number of runs. Times are milliseconds. The corpus is `node scripts/bench/make-corpus.mjs <folder> --seed 1`: 500 documents and one of 3,000 blocks.

## Budgets in the editor

`node scripts/bench/responsiveness.mjs <document>`: 20 cold and 20 warm opens of each document, and each action 20 times. Over budget in bold. An action can take no less than two frames, about 17 ms on this screen (120 Hz).

### 2026-11-27, VS Code 1.148.0, after 561d740, `docs/`

| Document (blocks) | Cold visible p95 (500) | Cold editable p95 (2000) | Warm editable p95 (300) | Actions p95 (100) |
| --- | ---: | ---: | ---: | ---: |
| short (6) | 482 | 483 | 250 | 17–18 |
| typical (15) | 480 | 486 | 294 | 17 |
| long (100) | 467 | 486 | **328** | 17–18 |

### 2026-11-27, VS Code 1.148.0, after 561d740, corpus seed 1

| Document (blocks) | Cold visible p95 (500) | Cold editable p95 (2000) | Warm editable p95 (300) | Type | Enter | Style | Strong |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| short (8) | **3263** | **3263** | **555** | 28 | 18 | 19 | 17 |
| typical (25) | **3295** | **3296** | **615** | 36 | 29 | 37 | 28 |
| long (3,000) | **3547** | **5424** | **3864** | **800** | **853** | **876** | **649** |

Notes:

- `docs/` meets every budget but the warm open of its longest document.
- On the corpus a cold open takes about 3 s whatever the length of the document. A first open of a short document of it, split by `first-open.mjs` (3 runs): the host sends the document 447 ms after the webview is ready and the webview paints it 1563 ms later. The webview part is about the same as on `docs/` (item 238).
- A warm open costs about 500 ms on the corpus against about 220 ms on `docs/`, also for a document of 8 blocks: something on a warm open grows with the project.
- In the document of 3,000 blocks every change takes about 700 ms to paint.

## Parts without the editor

`npm run bench`: 30 runs after 3 to warm up, in Node against the built packages.

### 2026-11-27, after 561d740

| Part | p50 | p95 |
| --- | ---: | ---: |
| `docs/`: configuration | 4.8 | 7.1 |
| `docs/`: whole project | 121.3 | 135.4 |
| Corpus: configuration | 5.2 | 8.3 |
| Corpus: whole project | 755.6 | 829.7 |
| Long document: parse | 49.5 | 60.3 |
| Long document: serialize | 52.4 | 66.5 |
| Long document: to the editor | 7.8 | 10.4 |
| Long document: from the editor | 10.6 | 21.8 |
| Stylesheet: parse | 3.6 | 4.6 |
| Stylesheet: browser CSS | 0.6 | 1.3 |

## First open in a new window

`node scripts/bench/first-open.mjs <document> --runs 20`. From starting `code` to the document painted, in a new profile with no other extensions installed.

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
