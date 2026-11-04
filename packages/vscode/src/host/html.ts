export interface HtmlInput {
  /** Where the webview loads the script from. */
  readonly scriptUri: string;
  /** A fresh random value for each page, that the policy allows scripts and styles to carry. */
  readonly nonce: string;
  /** What the webview gives for the origin of the files of the extension. */
  readonly cspSource: string;
}

/** The policy of a page: no remote resources and only the script and styles that carry the nonce. */
export function contentPolicy(nonce: string, cspSource: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
  ].join('; ');
}

/** The page of the editor. Its policy allows no remote resources and only the script that it loads. */
export function buildHtml({ scriptUri, nonce, cspSource }: HtmlInput): string {
  const policy = contentPolicy(nonce, cspSource);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="phrase-nonce" content="${nonce}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phrase</title>
<style nonce="${nonce}">
  html, body { margin: 0; min-height: 100%; background: #555555; font-family: sans-serif; }
  #bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; gap: 12px;
    background: #3c3c3c; }
  #toolbar { flex: 1; display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 6px 12px; }
  #toolbar .group { display: flex; align-items: center; gap: 2px; padding-right: 8px;
    border-right: 1px solid #5a5a5a; }
  #toolbar select { font: 12px sans-serif; max-width: 150px; }
  #view { display: flex; gap: 4px; padding: 6px 12px; }
  #bar button { font: 12px sans-serif; padding: 2px 8px; min-width: 28px; }
  #bar button.look-bold { font-weight: 700; }
  #bar button.look-italic { font-style: italic; }
  #bar button.look-mono { font-family: monospace; }
  #bar button[aria-pressed="true"] { background: #0e639c; color: #ffffff; }
  #bar button.needs-variant { border-style: dashed; }
  #toolbar .state { flex-basis: 100%; color: #cccccc; font: 12px sans-serif; }
  #notices { min-height: 1.4em; padding: 4px 12px; color: #ffcc66; font: 13px monospace; }
  #notices button { margin-left: 8px; font: 12px sans-serif; padding: 2px 8px; }
  #desk { padding: 12px 0 48px; overflow-x: auto; }
  .sheet { box-sizing: border-box; position: relative; margin: 12px auto; background: #ffffff; }
  #desk.paper .sheet { box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); }
  #desk.plain #page { max-width: 560pt; padding: 36pt; }
  #desk.plain #cover, #desk.plain .band { display: none; }
  #desk.paper .band { position: absolute; }
  .slots { display: grid; grid-template-columns: 1fr auto 1fr; }
  .slots .slot-center { text-align: center; }
  .slots .slot-right { text-align: right; }
  .slots .field { border-bottom: 1px dotted currentColor; cursor: help; }
  #desk.zoom-50 { zoom: 0.5; }
  #desk.zoom-75 { zoom: 0.75; }
  #desk.zoom-125 { zoom: 1.25; }
  #desk.zoom-150 { zoom: 1.5; }
  #desk.zoom-200 { zoom: 2; }
  #refused { max-width: 560px; margin: 48px auto; padding: 24px; background: #ffffff; color: #1f1f1f; }
  #refused h1 { margin-top: 0; font-size: 18px; }
  #refused li { margin: 6px 0; }
  #refused button { margin-right: 8px; padding: 4px 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="editing" hidden>
  <div id="bar">
    <div id="toolbar"></div>
    <div id="view"></div>
  </div>
  <div id="notices" role="status"></div>
  <div id="desk" class="paper">
    <div id="cover" class="sheet" hidden></div>
    <div id="page" class="sheet">
      <div id="header" class="band" hidden></div>
      <div id="editor"></div>
      <div id="footer" class="band" hidden></div>
    </div>
  </div>
</div>
<div id="refused" hidden></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
