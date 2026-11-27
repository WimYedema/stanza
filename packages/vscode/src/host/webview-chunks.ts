import { readdirSync } from 'node:fs';
import * as vscode from 'vscode';

let chunks: readonly string[] | undefined;

/** The shared chunks of the webview bundles in `dist`, read once; none when it cannot be read. */
function sharedChunks(dist: vscode.Uri): readonly string[] {
  if (chunks === undefined) {
    try {
      chunks = readdirSync(dist.fsPath)
        .filter((name) => name.startsWith('chunk-') && name.endsWith('.js'))
        .sort();
    } catch {
      chunks = [];
    }
  }
  return chunks;
}

/**
 * The addresses of the shared chunks, for the head of a page, so that the webview fetches them with
 * its script instead of after it. That took the files of a first open from 203 to 74 ms (ADR 0101,
 * item 243).
 */
export const chunkUris = (webview: vscode.Webview, dist: vscode.Uri): readonly string[] =>
  sharedChunks(dist).map((name) =>
    webview.asWebviewUri(vscode.Uri.joinPath(dist, name)).toString(),
  );
