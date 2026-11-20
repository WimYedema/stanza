import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Node,
  type YAMLSeq,
} from 'yaml';
import { findPair } from './edit-stylesheet.js';
import { parseProject } from './project.js';

export type DocumentListChange =
  | { readonly kind: 'initialize'; readonly paths: readonly string[] }
  | { readonly kind: 'append'; readonly path: string }
  | { readonly kind: 'remove'; readonly path: string }
  | { readonly kind: 'move'; readonly path: string; readonly direction: 'up' | 'down' }
  | { readonly kind: 'regroup'; readonly path: string; readonly group: readonly number[] };

export type DocumentListEdit =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

const refused = (message: string): DocumentListEdit => ({ ok: false, message });

function hasSharedNodes(root: Node): boolean {
  let shared = false;
  visit(root, (_key, node) => {
    if (
      isAlias(node) ||
      ((isScalar(node) || isMap(node) || isSeq(node)) && node.anchor !== undefined)
    ) {
      shared = true;
    }
  });
  return shared;
}

function findDocument(
  sequence: YAMLSeq,
  path: string,
): { sequence: YAMLSeq; index: number } | undefined {
  for (const [index, item] of sequence.items.entries()) {
    if (isScalar(item) && item.value === path) return { sequence, index };
    if (isMap(item)) {
      const children = item.get('items', true);
      if (isSeq(children)) {
        const found = findDocument(children, path);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

/** Edits only the documents pair; existing YAML nodes carry their comments through moves. */
export function editDocumentList(source: string, change: DocumentListChange): DocumentListEdit {
  const parsed = parseProject(source);
  if (parsed.diagnostics.some((d) => d.severity === 'error')) {
    return refused('Fix the errors in stanza.yaml before editing its document list.');
  }
  const yaml = parseDocument(source);
  const root = yaml.contents;
  if (!isMap(root) || root.flow === true || hasSharedNodes(root)) {
    return refused('Edit the document list as block YAML without anchors or aliases first.');
  }
  const pair = findPair(root, 'documents');
  const start = isScalar(pair?.key) ? pair.key.range?.[0] : undefined;
  const end = isSeq(pair?.value) ? pair.value.range?.[2] : undefined;
  if (change.kind === 'initialize') {
    if (pair !== undefined) return refused('The project already has a document list.');
    yaml.set('documents', [...change.paths]);
  } else {
    const sequence = pair?.value;
    if (!isSeq(sequence)) {
      return refused('Initialize the document list before editing it.');
    }
    const found = findDocument(sequence, change.path);
    if (change.kind === 'append') {
      if (found !== undefined) return refused('The document is already listed.');
      sequence.add(change.path);
    } else {
      if (found === undefined) return refused('The document is no longer listed.');
      const item = found.sequence.items[found.index];
      if (change.kind === 'remove') {
        if (isScalar(item)) {
          const comments = [sequence.comment, item.commentBefore, item.comment].filter(
            (comment) => comment !== undefined && comment !== null,
          );
          if (comments.length > 0) sequence.comment = comments.join('\n');
        }
        found.sequence.items.splice(found.index, 1);
      } else if (change.kind === 'move') {
        const other = found.index + (change.direction === 'up' ? -1 : 1);
        if (other < 0 || other >= found.sequence.items.length) {
          return refused(`The document cannot move ${change.direction} within this group.`);
        }
        found.sequence.items[found.index] = found.sequence.items[other];
        found.sequence.items[other] = item;
      } else {
        let destination = sequence;
        for (const index of change.group) {
          const group = destination.items[index];
          if (!Number.isInteger(index) || index < 0 || !isMap(group)) {
            return refused('The destination group no longer exists.');
          }
          let items = group.get('items', true);
          if (items === undefined) {
            group.set('items', yaml.createNode([]));
            items = group.get('items', true);
          }
          if (!isSeq(items)) return refused('The destination is not a document group.');
          destination = items;
        }
        if (destination === found.sequence) {
          return refused('The document is already in this group.');
        }
        found.sequence.items.splice(found.index, 1);
        destination.items.push(item);
      }
    }
  }

  const serialized = yaml.toString({ lineWidth: 0, flowCollectionPadding: false });
  const written = parseDocument(serialized);
  const next = isMap(written.contents) ? findPair(written.contents, 'documents') : undefined;
  const nextStart = isScalar(next?.key) ? next.key.range?.[0] : undefined;
  const nextEnd = isSeq(next?.value) ? next.value.range?.[2] : undefined;
  if (nextStart === undefined || nextEnd === undefined) {
    return refused('The document list could not be written without changing other settings.');
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const replacement = serialized.slice(nextStart, nextEnd).replaceAll('\n', eol);
  const text =
    pair === undefined
      ? `${source}${source.endsWith('\n') ? '' : eol}${replacement}`
      : start !== undefined && end !== undefined
        ? source.slice(0, start) + replacement + source.slice(end)
        : undefined;
  if (text === undefined || parseProject(text).diagnostics.some((d) => d.severity === 'error')) {
    return refused('The document list cannot be edited in this YAML layout. Edit it in text.');
  }
  return { ok: true, text };
}
