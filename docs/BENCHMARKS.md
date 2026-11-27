# Benchmarks

Measurements of the budgets of ADR 0101, on the reference setup: Intel Core Ultra 7 155H, 32 GB, Windows 11, VS Code 1.148.0. Each table names the commit, the project or document and the number of runs. Times are milliseconds. The corpus is `node scripts/bench/make-corpus.mjs <folder> --seed 1`: 500 documents and one of 3,000 blocks.

The first tables of 2026-11-27 took the time of a paint when the host received the message. The host loads the project right after sending the document and reads no message meanwhile, so those times included up to 2 s of waiting in the host. They were replaced by the tables below, which take the time of the paint from the webview (ADR 0101, "Painted").

Runs differ: a warm open can move by 100 ms (p95) between two runs of the same build.

## Budgets in the editor

`node scripts/bench/responsiveness.mjs <document>`: 20 cold and 20 warm opens of each document in a window that is already open, and each action 20 times. Over budget in bold. An action can take no less than two frames, about 17 ms on this screen (120 Hz).

### 2026-11-27, after 8dbc653 with the files of the project read through Node (item 238)

| Project, document (blocks) | Cold visible p95 (500) | Cold editable p95 (2000) | Warm editable p95 (300) | Actions p95 (100) |
| --- | ---: | ---: | ---: | ---: |
| `docs/`, short (6) | 181 | 446 | 169 | 17–18 |
| `docs/`, typical (15) | 193 | 236 | 189 | 18–19 |
| `docs/`, long (100) | 295 | 348 | **337** | 17–25 |
| Corpus, short (8) | 242 | 943 | 278 | 17–20 |
| Corpus, typical (25) | 306 | 1015 | **305** | 17–19 |
| Corpus, long (3,000) | **1702** | **2877** | **2432** | **1437–1892** |

The actions of the long document of the corpus, p50 and p95: type 1296 and 1437, Enter 1441 and 1671, style 1186 and 1892, Strong 191 and 1692.

### 2026-11-27, after 8dbc653, before item 238

| Project, document (blocks) | Cold visible p95 (500) | Cold editable p95 (2000) | Warm editable p95 (300) | Actions p95 (100) |
| --- | ---: | ---: | ---: | ---: |
| `docs/`, short (6) | 174 | 311 | 180 | 17–19 |
| `docs/`, typical (15) | 195 | 320 | 198 | 17–18 |
| `docs/`, long (100) | 244 | 351 | 219 | 17–22 |
| Corpus, short (8) | 186 | 1101 | 192 | 17–18 |
| Corpus, typical (25) | 280 | 1456 | **331** | 17–19 |
| Corpus, long (3,000) | **2402** | **3656** | **2744** | **896–1620** |

Notes:

- Documents of an ordinary length meet the budgets in both projects, apart from warm opens near 300 ms.
- Reading the files with Node instead of `vscode.workspace.fs` shortens the cold open until editable on the corpus by about 30 % (p95 1456 to 1015 for the typical document).
- The document of 3,000 blocks misses every budget; each change takes more than a second to paint (item 242).

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

`node scripts/bench/first-open.mjs <document> --runs 5`. From starting `code` to the document painted, in a new profile with no other extensions installed. Runs here are 5, so p95 is the slowest run.

### 2026-11-27, `docs/documents/0078-document-startup.stanza.md`, before and after items 238 and 243

5 runs before and after item 238, 10 after item 243.

| Step | Before p50 | After 238 p50 | After 243 p50 |
| --- | ---: | ---: | ---: |
| VS Code until the extension host | 1426 | 1436 | 1448 |
| Extension host until Stanza runs | 524 | 555 | 556 |
| Loading Stanza | 41 | 45 | 43 |
| Activation | 7 | 7 | 6 |
| Until the open request | 24 | 27 | 27 |
| Webview loading | 536 | 493 | 382 |
| Host until the document is sent | 274 | 29 | 48 |
| Webview until visible | 138 | 189 | 160 |
| Until editable | 860 | 227 | 313 |
| **Total: visible** | **2979** | **2886** | **2718** |
| **Total: editable** | **3909** | **3027** | **3088** |

The host before sending the document, before item 238: finding the project 147 ms and the configuration 110 ms, both through `vscode.workspace.fs`; after: under 30 ms each. In the webview, after item 243, from its start: the page and its two script files 87 ms (203 ms before, when the chunk was fetched only after `webview.js` had arrived), running the script 18 ms, then waiting for the document, then about 130 ms to parse, build the editor (85 ms) and paint. The script is not worth making smaller: running it takes 18 ms.

On the corpus, a short document: host until the document is sent 272 to 42 ms, until editable 2134 to 845 ms.

Notes:

- About 2 s is VS Code and its built-in extensions, before Stanza runs.
- From the open request to visible now takes about 0.6 s on a first open (about 1 s before items 238 and 243): 0.4 s until the webview has run its script, and 0.2 s for Stanza. A cold open in a window that is already open takes 0.15 to 0.3 s (above).
- In a new profile, VS Code 1.148.0 opens a `.stanza.md` file as text unless `workbench.editorAssociations` names `stanza.editor`; the script sets it (item 239).
