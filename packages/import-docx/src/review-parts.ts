import { SOURCE_PART_NAMESPACE, SOURCE_STAMP_PROPERTIES, normalizeLineEndings } from '@stanza/core';
import type { DocxParts } from './docx-package.js';
import { descendantsOf, elementsOf, type XmlElement } from './xml.js';

/**
 * What Word keeps about a comment outside `comments.xml` (`spike-findings`, ADR 0084), keyed by
 * the paragraph ID of the comment's last paragraph: its durable ID (`commentsIds.xml`), the
 * comment it answers and whether it is resolved (`commentsExtended.xml`), and its time in UTC and
 * its reactions (`commentsExtensible.xml`, by durable ID).
 */
export interface CommentDetails {
  readonly durableId?: string;
  /** The paragraph ID of the comment this one answers. */
  readonly parentParagraph?: string;
  readonly resolved: boolean;
  readonly dateUtc?: string;
  readonly reactions: readonly Reaction[];
}

/** A reaction to a comment, with the display name of the person only (ADR 0084, "Privacy"). */
export interface Reaction {
  /** As Word numbers it; 1 is a thumbs up. */
  readonly type: number;
  readonly name: string;
}

/** The revision stamp of a DOCX that Stanza exported (ADR 0084, "The stamp"). */
export interface ReviewStamp {
  readonly document?: string;
  readonly commit?: string;
  readonly dirty?: boolean;
  readonly contentHash?: string;
}

/** The source that was embedded in the DOCX, with line endings normalised. */
export interface EmbeddedSource {
  readonly path?: string;
  readonly hash?: string;
  readonly text: string;
}

/** The paragraph ID of the last paragraph of a comment, which the other parts refer to. */
export function paragraphIdOf(comment: XmlElement): string | undefined {
  return descendantsOf(comment, 'p').at(-1)?.attrs['paraId'];
}

/** The details of every comment that has any, by the paragraph ID of the comment. */
export function commentDetails(parts: DocxParts): Map<string, CommentDetails> {
  const durable = new Map<string, string>();
  for (const entry of descendantsOf(parts.commentsIds, 'commentId')) {
    const paragraph = entry.attrs['paraId'];
    const id = entry.attrs['durableId'];
    if (paragraph !== undefined && id !== undefined) durable.set(paragraph, id);
  }
  const extensible = new Map<string, { dateUtc?: string; reactions: Reaction[] }>();
  for (const entry of descendantsOf(parts.commentsExtensible, 'commentExtensible')) {
    const id = entry.attrs['durableId'];
    if (id === undefined) continue;
    const reactions = descendantsOf(entry, 'reaction').flatMap((reaction): Reaction[] => {
      const type = Number(reaction.attrs['reactionType']);
      return descendantsOf(reaction, 'user').map((user) => ({
        type: Number.isInteger(type) ? type : 0,
        name: user.attrs['userName'] ?? '',
      }));
    });
    const dateUtc = entry.attrs['dateUtc'];
    extensible.set(id, { ...(dateUtc !== undefined ? { dateUtc } : {}), reactions });
  }
  const details = new Map<string, CommentDetails>();
  const paragraphs = new Set([
    ...durable.keys(),
    ...descendantsOf(parts.commentsExtended, 'commentEx').flatMap((e) => e.attrs['paraId'] ?? []),
  ]);
  const extended = new Map(
    descendantsOf(parts.commentsExtended, 'commentEx').map((e) => [e.attrs['paraId'] ?? '', e]),
  );
  for (const paragraph of paragraphs) {
    const durableId = durable.get(paragraph);
    const ex = extended.get(paragraph);
    const more = durableId === undefined ? undefined : extensible.get(durableId);
    const parent = ex?.attrs['paraIdParent'];
    details.set(paragraph, {
      ...(durableId !== undefined ? { durableId } : {}),
      ...(parent !== undefined ? { parentParagraph: parent } : {}),
      resolved: ex?.attrs['done'] === '1',
      ...(more?.dateUtc !== undefined ? { dateUtc: more.dateUtc } : {}),
      reactions: more?.reactions ?? [],
    });
  }
  return details;
}

/** The custom file properties that are text, by name. */
export function textProperties(custom: XmlElement | undefined): Map<string, string> {
  const found = new Map<string, string>();
  for (const property of elementsOf(custom, 'property')) {
    const name = property.attrs['name'];
    const value = elementsOf(property)[0]?.children.find((c) => typeof c === 'string');
    if (name !== undefined) found.set(name, typeof value === 'string' ? value : '');
  }
  return found;
}

/** The stamp, or undefined when the file has none of its properties. */
export function stampOf(parts: DocxParts): ReviewStamp | undefined {
  const properties = textProperties(parts.customProperties);
  const names = SOURCE_STAMP_PROPERTIES;
  const document = properties.get(names.document);
  const commit = properties.get(names.commit);
  const dirty = properties.get(names.dirty);
  const contentHash = properties.get(names.contentHash);
  if ([document, commit, dirty, contentHash].every((value) => value === undefined))
    return undefined;
  return {
    ...(document !== undefined ? { document } : {}),
    ...(commit !== undefined ? { commit } : {}),
    ...(dirty === 'true' || dirty === 'false' ? { dirty: dirty === 'true' } : {}),
    ...(contentHash !== undefined ? { contentHash } : {}),
  };
}

/** The source that the exporter embedded, or undefined when the file has none. */
export function embeddedSourceOf(parts: DocxParts): EmbeddedSource | undefined {
  // The parser keeps local names only, so the namespace is told by the attribute it declares.
  const part = parts.customXml.find(
    (element) => element.name === 'source' && element.attrs['xmlns'] === SOURCE_PART_NAMESPACE,
  );
  if (part === undefined) return undefined;
  const text = part.children.filter((child): child is string => typeof child === 'string').join('');
  const path = part.attrs['path'];
  const hash = part.attrs['hash'];
  return {
    ...(path !== undefined ? { path } : {}),
    ...(hash !== undefined ? { hash } : {}),
    text: normalizeLineEndings(text),
  };
}

/** When the file was last saved (`dcterms:modified`), as Word wrote it, in UTC. */
export function savedAtOf(parts: DocxParts): string | undefined {
  const modified = descendantsOf(parts.properties, 'modified')[0];
  const value = modified?.children.find((child) => typeof child === 'string');
  return typeof value === 'string' ? value.trim() : undefined;
}
