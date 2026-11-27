import { contentPolicy, type HtmlInput } from './html.js';

/** The page of the style editor (ADR 0036), with the same policy as the page of the document editor. */
export function buildStylesHtml({ scriptUri, nonce, cspSource }: HtmlInput): string {
  const policy = contentPolicy(nonce, cspSource);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="stanza-nonce" content="${nonce}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stanza styles</title>
<style nonce="${nonce}">
  html, body { margin: 0; min-height: 100%; background: #555555; font-family: sans-serif; }
  #tabs { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 2px;
    padding: 6px 12px 0; background: #3c3c3c; }
  #tabs button { font: 12px sans-serif; padding: 4px 12px; border: 0; border-radius: 3px 3px 0 0;
    background: #4a4a4a; color: #dddddd; cursor: pointer; }
  #tabs button[aria-selected="true"] { background: #1f1f1f; color: #ffffff; }
  #problems { padding: 6px 12px; background: #5a3b00; color: #ffcc66; font: 12px monospace; }
  #layout { display: grid; grid-template-columns: 340px 1fr; align-items: start; }
  #side { position: sticky; top: 34px; max-height: calc(100vh - 34px); overflow-y: auto;
    background: #252526; color: #cccccc; font: 13px sans-serif; }
  #list { list-style: none; margin: 0; padding: 4px 0; }
  #list button { display: block; width: 100%; padding: 4px 12px; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer; }
  #list button[aria-current="true"] { background: #094771; color: #ffffff; }
  #list .name { display: block; font-size: 11px; color: #9d9d9d; }
  #detail { margin: 0; padding: 8px 12px 16px; border-top: 1px solid #3c3c3c; }
  #detail dt { margin-top: 6px; color: #9d9d9d; font-size: 11px; }
  #detail dd { margin: 0; }
  .side-panel { border-top: 1px solid #3c3c3c; padding: 0 0 16px; }
  .side-panel summary { margin: 0; padding: 8px 12px 2px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; color: #9d9d9d; cursor: pointer; }
  .side-panel .subgroup, .side-panel .variant { margin-left: 12px; border-left: 2px solid #3c3c3c; }
  .side-panel .subgroup > summary, .side-panel .variant > summary { font-weight: 400;
    text-transform: none; }
  .side-panel .row { display: grid; grid-template-columns: 110px 1fr 20px; gap: 2px 6px;
    align-items: center; padding: 2px 12px; }
  .side-panel .title { font-size: 12px; }
  .side-panel .hint { margin: 0 12px 4px; font-size: 11px; color: #9d9d9d; }
  .side-panel .control { display: flex; gap: 4px; align-items: center; }
  #theme .control { flex-wrap: wrap; }
  .side-panel .tokens { flex-wrap: wrap; }
  .side-panel .tokens select { flex: 1 1 0; width: auto; }
  .side-panel .swatch { flex: none; width: 18px; height: 18px; border: 1px solid #555555; }
  .side-panel .sample { flex: none; min-width: 24px; text-align: center; font-size: 14px; }
  .side-panel .warning { flex: 1 0 100%; font-size: 11px; color: #cca700; }
  .side-panel input, .side-panel select { box-sizing: border-box; width: 100%; min-width: 0;
    padding: 2px 4px; font: 12px sans-serif; background: #3c3c3c; color: #cccccc;
    border: 1px solid #555555; }
  #theme input[type="color"] { flex: none; width: 32px; padding: 0; }
  .side-panel button:not(.reset) { padding: 2px 10px; font: 12px sans-serif; }
  .side-panel .unit { font-size: 11px; color: #9d9d9d; }
  .side-panel .reset { padding: 0; border: 0; background: none; color: #9d9d9d; cursor: pointer; }
  .side-panel button.token-link { flex: none; padding: 0 4px; border: 0; background: none;
    color: #3794ff; cursor: pointer; }
  .side-panel .note { grid-column: 2 / 4; font-size: 11px; color: #9d9d9d; }
  .side-panel .note:empty { display: none; }
  .side-panel .status { margin: 0; padding: 6px 12px; background: #5a1d1d; color: #ffb4b4;
    font-size: 12px; }
  .side-panel .status:empty { display: none; }
  .preview-sheet { margin: 16px auto; background: #ffffff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); }
  .preview-note { margin: 12pt 0 0; font: italic 11px sans-serif; color: #9d9d9d; }
  #preview-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px;
    align-items: center; padding: 6px 12px; background: #252526; border-bottom: 1px solid #3c3c3c;
    font-size: 12px; }
  .cover-grid.editing { position: relative; user-select: none; }
  .cover-grid.editing .grid-cell { position: relative; z-index: 2; cursor: crosshair;
    outline: 1px dashed rgba(0, 120, 212, 0.35); outline-offset: -1px; }
  .cover-grid.editing .grid-cell:hover { background: rgba(0, 120, 212, 0.1); }
  .cover-grid.editing .grid-cell.picked { background: rgba(0, 120, 212, 0.2); }
  .cover-grid.editing .grid-frame.hover { border: 1px solid #0078d4; }
  .cover-grid.editing .grid-frame { position: relative; z-index: 1; pointer-events: none;
    border: 1px solid rgba(0, 120, 212, 0.6); }
  .cover-grid.editing .grid-frame.selected { border: 2px solid #0078d4;
    background: rgba(0, 120, 212, 0.06); }
  .cover-grid.editing .grid-label { position: absolute; top: 0; left: 0; padding: 0 3px;
    font: 9px sans-serif; color: #ffffff; background: rgba(0, 120, 212, 0.75); }
  .cover-editor .grid-area.selected { border-left-color: #0078d4; }
  #preview-bar .hint { color: #9d9d9d; }
  .measure { position: absolute; z-index: 6; pointer-events: none; color: #d13438; }
  .measure.horizontal { height: 0; border-top: 1px solid currentColor; }
  .measure.vertical { width: 0; border-left: 1px solid currentColor; }
  .measure::before, .measure::after { content: ''; position: absolute; border: 4px solid transparent; }
  .measure.horizontal::before { left: 0; top: -5px; border-left-width: 0;
    border-right: 6px solid currentColor; }
  .measure.horizontal::after { right: 0; top: -5px; border-right-width: 0;
    border-left: 6px solid currentColor; }
  .measure.vertical::before { top: 0; left: -5px; border-top-width: 0;
    border-bottom: 6px solid currentColor; }
  .measure.vertical::after { bottom: 0; left: -5px; border-bottom-width: 0;
    border-top: 6px solid currentColor; }
  .measure-label { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    padding: 0 3px; background: #ffffff; font: 10px sans-serif; white-space: nowrap; }
  .side-panel .confirm { margin: 4px 12px 8px; padding: 6px 8px; border-left: 3px solid #cca700;
    background: rgba(204, 167, 0, 0.12); font-size: 12px; }
  .side-panel .confirm p { margin: 0 0 6px; }
  .side-panel .confirm button { margin-right: 6px; }
  .layout-box { padding: 4px 0 8px; border-bottom: 1px solid #3c3c3c; }
  .layout-box .layout-name { font-weight: 600; }
  #preview-header .slots, #preview-footer .slots { display: grid;
    grid-template-columns: 1fr auto 1fr; }
  #preview-header .slot-center, #preview-footer .slot-center { text-align: center; }
  #preview-header .slot-right, #preview-footer .slot-right { text-align: right; }
  .cover-editor .grid-area-name { font-weight: 600; }
  .cover-editor .cover-row-box, .cover-editor .cover-entry { margin: 4px 12px 8px;
    padding: 4px 0 4px 6px; border-left: 2px solid #3c3c3c; }
  .cover-editor .cover-entry { margin: 4px 0 6px 8px; }
  .cover-editor .cover-head { display: flex; justify-content: space-between; align-items: center;
    padding-right: 8px; }
  .cover-editor .cover-kind { font-size: 11px; font-weight: 600; text-transform: uppercase;
    color: #9d9d9d; }
  .cover-editor .cover-buttons { display: flex; gap: 2px; }
  .cover-editor .cover-buttons button { padding: 0 6px; }
  .cover-editor .cover-adds { display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
    margin: 4px 0 0 8px; }
  .cover-editor .cover-table-row { display: grid; grid-template-columns: 1fr 1.4fr auto auto;
    gap: 2px 4px; margin: 2px 8px 2px 0; }
  .cover-editor .cover-margins { margin: 0 0 4px; }
  .cover-editor > section > details > div > button, .cover-editor .cover-row-box > button { margin: 4px 12px; }
  #desk { padding: 12px 0 48px; overflow-x: auto; }
  #page { box-sizing: border-box; max-width: 560pt; margin: 12px auto; padding: 36pt;
    background: #ffffff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); }
  .sample-focus { outline: 2px solid #0e639c; outline-offset: 2px; }
  #refused { max-width: 560px; margin: 48px auto; padding: 24px; background: #ffffff; color: #1f1f1f; }
  #refused h1 { margin-top: 0; font-size: 18px; }
  #refused li { margin: 6px 0; }
  #refused button { margin-right: 8px; padding: 4px 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="studio" hidden>
  <div id="tabs" role="tablist"></div>
  <div id="problems" role="status" hidden></div>
  <div id="layout">
    <div id="side">
      <ul id="list"></ul>
      <div id="add" class="side-panel" hidden></div>
      <dl id="detail"></dl>
      <div id="panel" class="side-panel" hidden></div>
      <div id="theme" class="side-panel" hidden></div>
      <div id="pages" class="side-panel" hidden></div>
    </div>
    <div id="desk">
      <div id="cover-preview" hidden>
        <div id="preview-bar" hidden></div>
        <div id="preview-cover" class="preview-sheet" hidden></div>
        <div id="preview-first" class="preview-sheet" hidden>
          <div id="preview-header" hidden></div>
          <div id="preview-title"></div>
          <p class="preview-note">The text of the document follows here.</p>
          <div id="preview-footer" hidden></div>
        </div>
      </div>
      <div id="page"><div id="sample"></div></div>
    </div>
  </div>
</div>
<div id="refused" hidden></div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
