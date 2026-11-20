import { nodeIdFromRandomBytes, type Document, type NodeId } from '@stanza/core';
import { serializeDocument } from '@stanza/format';
import { addAgentInstructions } from './agent-instructions.js';
import { DEFAULT_STYLESHEET } from './default-stylesheet.js';
import { DOCUMENT_SUFFIX, PROJECT_FILE } from './files.js';
import type { ProjectStorage } from './storage.js';

export interface NewProjectOptions {
  /** The title of the project, which is also the title of its first document. */
  readonly title: string;
  /** The ID of the first heading. The host supplies the random bytes, since `core` has none. */
  readonly randomBytes: () => Uint8Array;
}

export type NewProjectResult =
  | {
      readonly ok: true;
      readonly files: readonly string[];
      readonly document: string;
      /** `AGENTS.md` (ADR 0061) is written when the folder has none, and never over one. */
      readonly agentInstructions: 'written' | 'exists';
    }
  | { readonly ok: false; readonly reason: 'empty-title' }
  | { readonly ok: false; readonly reason: 'exists'; readonly existing: readonly string[] };

const STYLESHEET_PATH = 'styles/default.yaml';

/** A file name from a title: lower case letters and digits, joined by hyphens. */
export function slugOf(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug === '' ? 'document' : slug;
}

const yamlSingleQuoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;

export function firstDocument(title: string, id: NodeId): string {
  const document: Document = {
    meta: { title, fields: {} },
    blocks: [
      { type: 'heading', level: 1, id, content: [{ type: 'text', text: title, marks: [] }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Start writing here.', marks: [] }],
      },
    ],
  };
  return serializeDocument(document);
}

export async function names(
  storage: ProjectStorage,
  directory: string,
): Promise<readonly string[]> {
  try {
    return (await storage.list(directory)).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Writes a new project into a folder (ADR 0042): the project file, a default stylesheet and a first
 * document. It writes nothing when any of those files exists already. The instructions for agents
 * (ADR 0061) are the exception: they are written only when there is no such file.
 */
export async function createProject(
  storage: ProjectStorage,
  options: NewProjectOptions,
): Promise<NewProjectResult> {
  const title = options.title.trim().replace(/\s+/g, ' ');
  if (title === '') return { ok: false, reason: 'empty-title' };

  const document = `documents/${slugOf(title)}${DOCUMENT_SUFFIX}`;
  const files: readonly [string, string][] = [
    [
      PROJECT_FILE,
      `stanza-format: 1\ntitle: ${yamlSingleQuoted(title)}\nstylesheet: ${yamlSingleQuoted(STYLESHEET_PATH)}\n`,
    ],
    [STYLESHEET_PATH, DEFAULT_STYLESHEET],
    [document, firstDocument(title, nodeIdFromRandomBytes(options.randomBytes()))],
  ];

  const existing: string[] = [];
  for (const [path] of files) {
    const slash = path.lastIndexOf('/');
    const directory = slash < 0 ? '' : path.slice(0, slash);
    if ((await names(storage, directory)).includes(path.slice(slash + 1))) existing.push(path);
  }
  if (existing.length > 0) return { ok: false, reason: 'exists', existing };

  for (const [path, text] of files) await storage.writeText(path, text);
  const instructions = await addAgentInstructions(storage);
  return {
    ok: true,
    files: files.map(([path]) => path),
    document,
    agentInstructions: instructions.ok ? 'written' : 'exists',
  };
}
