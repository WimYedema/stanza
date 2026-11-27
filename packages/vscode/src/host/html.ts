export interface HtmlInput {
  /** Where the webview loads the script from. */
  readonly scriptUri: string;
  /** A fresh random value for each page, that the policy allows scripts and styles to carry. */
  readonly nonce: string;
  /** What the webview gives for the origin of the files of the extension. */
  readonly cspSource: string;
  /**
   * The shared chunks that the script imports. Named in the head, the webview fetches them with the
   * script instead of after it (ADR 0101, item 243).
   */
  readonly preloadUris?: readonly string[];
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

/** The head links that fetch the shared chunks together with the script (item 243). */
export const preloadLinks = (uris: readonly string[], nonce: string): string =>
  uris.map((uri) => `<link rel="modulepreload" nonce="${nonce}" href="${uri}">\n`).join('');

/** The page of the editor. Its policy allows no remote resources and only the script that it loads. */
export function buildHtml({ scriptUri, nonce, cspSource, preloadUris = [] }: HtmlInput): string {
  const policy = contentPolicy(nonce, cspSource);
  const preloads = preloadLinks(preloadUris, nonce);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
${preloads}
<meta name="stanza-nonce" content="${nonce}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stanza</title>
<style nonce="${nonce}">
  html, body { margin: 0; min-height: 100%; background: #555555; font-family: sans-serif; }
  /*
   * VS Code gives code, pre, kbd and blockquote the colours of its theme in every webview. The page
   * is the document, in the colours of its stylesheet whatever the theme, so inside it they inherit;
   * a style that sets one of these is more specific and wins.
   */
  .stanza-document code, .stanza-document pre, .stanza-document kbd,
  .stanza-document blockquote { color: inherit; background-color: transparent;
    font-family: inherit; font-size: inherit; padding: 0; border: 0; border-radius: 0; }
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
  /* The review buttons (ADR 0088): the one that is due is drawn as the primary action. */
  .review-round-push { position: relative; display: inline-flex; gap: 1px; }
  .review-round-push > button:nth-child(2) { min-width: 18px; padding: 2px 4px; }
  #bar .review-round button.due { background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff); }
  .review-round-status { font: 12px sans-serif; padding-left: 6px; white-space: nowrap; }
  .review-round-status.due { font-weight: 600; }
  .review-round-menu { position: absolute; top: 100%; left: 0; z-index: 20; display: flex;
    flex-direction: column; min-width: 200px; padding: 4px 0; margin-top: 2px;
    background: var(--vscode-menu-background, #252526); color: var(--vscode-menu-foreground, #cccccc);
    border: 1px solid var(--vscode-menu-border, #454545); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36); }
  .review-round-menu[hidden] { display: none; }
  #bar .review-round-menu button { text-align: left; border: 0; background: transparent;
    color: inherit; padding: 4px 12px; }
  #bar .review-round-menu button:hover, #bar .review-round-menu button:focus {
    background: var(--vscode-menu-selectionBackground, #04395e); }
  #changes { display: flex; gap: 8px; align-items: center; padding: 4px 12px; background: #264f78; border-top: 1px solid #4a4a4a; color: #ffffff; font: 12px sans-serif; }
  #changes button { font: 12px sans-serif; padding: 2px 8px; }
  #notices { padding: 4px 12px; color: #ffcc66; font: 13px monospace; }
  #notices:empty { display: none; }
  #navigation-status { padding: 4px 12px; font: 13px sans-serif; }
  #navigation-status:empty { display: none; }
  #startup-status { padding: 8px 12px; font: 13px sans-serif; }
  #startup-status:empty { display: none; }
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
  #metadata { box-sizing: border-box; width: min(850px, calc(100% - 24px)); margin: 12px auto 0;
    scroll-margin-top: 120px; background: #252526; color: #cccccc; border: 1px solid #454545; font: 13px sans-serif; }
  #metadata summary { padding: 6px 10px; cursor: pointer; }
  #metadata .metadata-body { padding: 0 10px 8px; max-height: 65vh; overflow-y: auto; }
  #metadata fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  #metadata section { border-top: 1px solid #454545; padding: 4px 0; }
  #metadata h3 { margin: 3px 0 4px; font-size: 13px; }
  #metadata h4 { margin: 0; font-size: 13px; }
  #metadata .metadata-property { display: grid; grid-template-columns: minmax(100px, 160px) minmax(0, 1fr) 24px;
    align-items: start; gap: 8px; padding: 3px 0; overflow-wrap: anywhere; }
  #metadata .metadata-label { min-width: 0; padding-top: 4px; }
  #metadata .metadata-value { grid-column: 2; min-width: 0; }
  #metadata .metadata-property > .metadata-icon { grid-column: 3; grid-row: 1; }
  #metadata .metadata-item { display: flex; align-items: flex-start; gap: 4px; }
  #metadata .metadata-item textarea { flex: 1; min-width: 0; }
  #metadata .metadata-value ol { margin: 0; padding-left: 22px; }
  #metadata .metadata-value li { margin-bottom: 3px; }
  #metadata textarea { display: block; box-sizing: border-box; width: 100%; resize: vertical;
    font: 13px/18px monospace; }
  #metadata input, #metadata textarea, #metadata select { background: #3c3c3c; color: #eeeeee;
    border: 1px solid #777777; padding: 2px 4px; max-width: 100%; }
  #metadata button { margin: 4px 6px 0 0; padding: 3px 8px; font: 12px sans-serif; }
  #metadata .metadata-icon { box-sizing: border-box; width: 24px; min-width: 24px; height: 24px;
    flex: none; margin: 0; padding: 0; font: 16px/20px sans-serif; }
  #metadata .metadata-custom-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 24px; gap: 6px; margin-bottom: 4px; }
  #metadata .metadata-custom-row input { min-width: 0; }
  #metadata small { display: block; opacity: 0.8; }
  #metadata .metadata-origin { margin-bottom: 4px; }
  #metadata p { margin: 4px 0; }
  #metadata pre, #metadata li { white-space: pre-wrap; overflow-wrap: anywhere; }
  #metadata pre { margin: 0; }
  #metadata .metadata-value > pre, #metadata .metadata-value > p { padding: 4px 0; }
  #metadata .error { color: #ff9999; }
  #metadata .warning, #metadata .metadata-status { color: #ffcc66; }
  #metadata :focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  #metadata .metadata-actions { position: sticky; bottom: -8px; background: #252526; padding: 4px 0 8px; }
  @media (max-width: 540px) {
    #metadata .metadata-property { grid-template-columns: minmax(80px, 28%) minmax(0, 1fr) 24px; gap: 6px; }
  }
  #desk { padding: 12px 0 48px; overflow-x: auto; }
  #editor .reference-hover { text-decoration: underline dotted; text-underline-offset: 3px; }
  /* The text a review comment is about (ADR 0086). */
  #editor .stanza-review-highlight { background: rgba(255, 196, 0, 0.28); border-bottom: 2px solid rgba(214, 150, 0, 0.9); cursor: help; }
  #editor .stanza-review-highlight-selected { background: rgba(255, 196, 0, 0.55); }
  #desk.with-reviews { display: flex; justify-content: center; align-items: flex-start; gap: 16px; }
  #desk.with-reviews #sheets { flex: none; }
  #comments { position: relative; flex: none; width: 260px; margin: 12px 0; }
  #comments .review-card { position: absolute; left: 0; }
  .review-card { box-sizing: border-box; width: 260px; padding: 6px 8px; background: #252526; color: #cccccc;
    border: 1px solid #454545; border-left: 3px solid #d69600; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    font: 12px/1.4 sans-serif; text-align: left; cursor: default; }
  .review-card.hovered { border-color: #8a8a8a; border-left-color: #ffc400; }
  .review-card.selected { border-color: #75beff; border-left-color: #ffc400; }
  .review-card.resolved { border-left-color: #6a9955; }
  .review-card.resolved .first, .review-card.resolved .reply { opacity: 0.7; }
  .review-card:focus-visible { outline: 2px solid #75beff; outline-offset: 1px; }
  .review-card header { display: flex; gap: 6px; align-items: baseline; }
  .review-card .number { color: #1f1f1f; background: #d69600; border-radius: 8px; padding: 0 5px; font-size: 11px; font-weight: 600; }
  .review-card .author { font-weight: 600; color: #ffffff; overflow-wrap: anywhere; }
  .review-card time { color: #9d9d9d; font-size: 11px; white-space: nowrap; }
  .review-card .text { margin: 2px 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .review-card .reply { margin-top: 4px; padding-top: 4px; border-top: 1px solid #3a3a3a; }
  .review-card .reactions, .review-card .note { margin: 2px 0; color: #9d9d9d; font-size: 11px; overflow-wrap: anywhere; }
  .review-card .changed { margin: 2px 0; color: #ffcc66; font-size: 11px; overflow-wrap: anywhere; }
  .review-card .more { padding: 0; border: 0; background: none; color: #75beff; font: 11px sans-serif; cursor: pointer; }
  .review-card footer { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 6px; color: #9d9d9d; font-size: 11px; }
  .review-card footer .source { flex: 1 1 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .review-card footer .status { margin-right: auto; }
  .review-card footer button { font: 11px sans-serif; padding: 1px 6px; }
  .review-leader { position: absolute; border: 0 dashed rgba(214, 150, 0, 0.9); pointer-events: none; }
  #markers { position: absolute; top: 0; right: 0; bottom: 0; width: 0; z-index: 3; }
  .review-marker { position: absolute; right: 6px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 10px;
    background: #d69600; color: #1f1f1f; font: 600 11px/20px sans-serif; cursor: pointer; }
  .review-marker.selected { background: #ffc400; outline: 2px solid #0e639c; }
  .review-popover { position: absolute; right: 6px; z-index: 4; }
  #review-orphans { box-sizing: border-box; width: min(850px, calc(100% - 24px)); margin: 12px auto 0; color: #cccccc; font: 13px sans-serif; }
  #review-orphans h2 { margin: 0 0 6px; font-size: 13px; color: #ffcc66; }
  #review-orphans .review-card { width: auto; margin-bottom: 6px; }
  #editor.reference-mode .reference-hover { cursor: pointer; text-decoration: underline; }
  #editor.reference-opening, #editor.reference-opening a { cursor: progress; }
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
<div id="startup-status" role="status">Opening Stanza document...</div>
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
  <div id="navigation-status" role="status"></div>
  <div id="references" hidden></div>
  <div id="links" hidden></div>
  <section id="metadata"></section>
  <section id="review-orphans" aria-label="Review comments not on the text" hidden></section>
  <div id="desk" class="paper" data-vscode-context='{"webviewSection": "editor"}'>
    <div id="sheets">
      <div id="cover" class="sheet" hidden></div>
      <div id="page" class="sheet">
        <div id="header" class="band" hidden></div>
        <div id="title-block" hidden></div>
        <div id="editor"></div>
        <div id="footer" class="band" hidden></div>
        <div id="markers" hidden></div>
      </div>
    </div>
    <aside id="comments" aria-label="Review comments" hidden></aside>
  </div>
</div>
<div id="refused" hidden></div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
