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
  #top { position: sticky; top: 0; z-index: 2; background: #3c3c3c; }
  #bar { display: flex; align-items: flex-start; gap: 12px; }
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
  #changes { display: flex; gap: 8px; align-items: center; padding: 4px 12px; background: #264f78; border-top: 1px solid #4a4a4a; color: #ffffff; font: 12px sans-serif; }
  #changes button { font: 12px sans-serif; padding: 2px 8px; }
  #notices { padding: 4px 12px; color: #ffcc66; font: 13px monospace; }
  #notices:empty { display: none; }
  #notices button { margin-left: 8px; font: 12px sans-serif; padding: 2px 8px; }
  #references, #links { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 5;
    width: min(560px, 90vw); background: #252526; color: #cccccc; font: 13px sans-serif;
    border: 1px solid #454545; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); }
  #references input, #links input { box-sizing: border-box; width: 100%; padding: 6px 8px; font: 13px sans-serif;
    background: #3c3c3c; color: #cccccc; border: 0; border-bottom: 1px solid #454545; }
  #references .hint, #links .hint { margin: 0; padding: 4px 8px; font-size: 11px; color: #9d9d9d; }
  #references ul { margin: 0; padding: 0; list-style: none; max-height: 50vh; overflow-y: auto; }
  #references li { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  #references li[aria-selected="true"] { background: #04395e; color: #ffffff; }
  #info { position: relative; border-top: 1px solid #4a4a4a; color: #cccccc; font: 12px sans-serif; }
  #info summary { padding: 3px 12px; cursor: pointer; }
  #info .info-body { position: absolute; left: 0; right: 0; max-height: 60vh; overflow: auto;
    padding: 4px 12px; background: #2d2d2d; border-top: 1px solid #444444;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5); }
  #info .card { margin: 8px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #444444; }
  #info .card-title { display: flex; justify-content: space-between; align-items: center;
    margin: 0 0 4px; font-weight: 600; }
  #info .card-title button { font: 12px sans-serif; padding: 2px 8px; }
  #info .based { margin: 0 0 4px; color: #9d9d9d; }
  #info dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 4px 0; }
  #info dt { color: #9d9d9d; }
  #info dd { margin: 0; }
  #info .usage p { margin: 4px 0; }
  #info .usage ul { margin: 0; padding-left: 18px; }
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
  <div id="top">
    <div id="bar">
      <div id="toolbar"></div>
      <div id="view"></div>
    </div>
    <div id="info" hidden></div>
    <div id="changes" hidden></div>
  </div>
  <div id="notices" role="status"></div>
  <div id="references" hidden></div>
  <div id="links" hidden></div>
  <div id="desk" class="paper" data-vscode-context='{"webviewSection": "editor"}'>
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
