import { contentPolicy, type HtmlInput } from './html.js';

/** The page of the style editor (ADR 0036), with the same policy as the page of the document editor. */
export function buildStylesHtml({ scriptUri, nonce, cspSource }: HtmlInput): string {
  const policy = contentPolicy(nonce, cspSource);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="phrase-nonce" content="${nonce}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phrase styles</title>
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
  #panel { border-top: 1px solid #3c3c3c; padding: 0 0 16px; }
  #panel summary { margin: 0; padding: 8px 12px 2px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; color: #9d9d9d; cursor: pointer; }
  #panel .subgroup, #panel .variant { margin-left: 12px; border-left: 2px solid #3c3c3c; }
  #panel .subgroup > summary, #panel .variant > summary { font-weight: 400; text-transform: none; }
  #panel .row { display: grid; grid-template-columns: 110px 1fr 20px; gap: 2px 6px;
    align-items: center; padding: 2px 12px; }
  #panel .title { font-size: 12px; }
  #panel .hint { margin: 0 12px 4px; font-size: 11px; color: #9d9d9d; }
  #panel .control { display: flex; gap: 4px; align-items: center; }
  #panel input, #panel select { box-sizing: border-box; width: 100%; min-width: 0; padding: 2px 4px;
    font: 12px sans-serif; background: #3c3c3c; color: #cccccc; border: 1px solid #555555; }
  #panel .unit { font-size: 11px; color: #9d9d9d; }
  #panel .reset { padding: 0; border: 0; background: none; color: #9d9d9d; cursor: pointer; }
  #panel .note { grid-column: 2 / 4; font-size: 11px; color: #9d9d9d; }
  #panel .note:empty { display: none; }
  #panel .status { margin: 0; padding: 6px 12px; background: #5a1d1d; color: #ffb4b4;
    font-size: 12px; }
  #panel .status:empty { display: none; }
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
      <dl id="detail"></dl>
      <div id="panel" hidden></div>
    </div>
    <div id="desk">
      <div id="page"><div id="sample"></div></div>
    </div>
  </div>
</div>
<div id="refused" hidden></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
