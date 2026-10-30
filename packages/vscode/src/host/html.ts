export interface HtmlInput {
  /** Where the webview loads the script from. */
  readonly scriptUri: string;
  /** A fresh random value for each page, that the policy allows scripts and styles to carry. */
  readonly nonce: string;
  /** What the webview gives for the origin of the files of the extension. */
  readonly cspSource: string;
}

/** The page of the editor. Its policy allows no remote resources and only the script that it loads. */
export function buildHtml({ scriptUri, nonce, cspSource }: HtmlInput): string {
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
  ].join('; ');
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
  #toolbar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 4px;
    padding: 6px 12px; background: #3c3c3c; }
  #toolbar button { font: 12px sans-serif; padding: 2px 8px; }
  #notices { min-height: 1.4em; padding: 4px 12px; color: #ffcc66; font: 13px monospace; }
  #page { max-width: 560pt; margin: 12px auto 48px; padding: 36pt; background: #ffffff; }
  #refused { max-width: 560px; margin: 48px auto; padding: 24px; background: #ffffff; color: #1f1f1f; }
  #refused h1 { margin-top: 0; font-size: 18px; }
  #refused li { margin: 6px 0; }
  #refused button { margin-right: 8px; padding: 4px 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="editing" hidden>
  <div id="toolbar"></div>
  <div id="notices"></div>
  <div id="page"><div id="editor"></div></div>
</div>
<div id="refused" hidden></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
