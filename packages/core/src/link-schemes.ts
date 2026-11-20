import type { Diagnostic } from './diagnostic.js';

export type LinkSchemes = Readonly<Record<string, string>>;

const RESERVED = new Set([
  'http',
  'https',
  'mailto',
  'stanza',
  'file',
  'data',
  'javascript',
  'vbscript',
]);
const SCHEME = /^[a-z][a-z0-9+.-]*$/;
const UNSAFE = /[\s\p{Cc}]/u;

function templateProblem(template: string): string | undefined {
  if (UNSAFE.test(template) || template.includes('\\'))
    return 'Use an HTTP(S) URL without whitespace or backslashes.';
  if (template.split('{id}').length !== 2 || /[{}]/.test(template.replace('{id}', ''))) {
    return 'The URL template must contain exactly one {id} and no other placeholders.';
  }
  const authority = /^https?:\/\/([^/?#]+)/i.exec(template)?.[1];
  if (authority === undefined || authority.includes('{id}')) {
    return 'Use an absolute HTTP(S) URL with {id} after the authority.';
  }
  if (authority.includes('@')) return 'URL templates cannot contain credentials.';
  const host = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:.]+\])(?::(\d{1,5}))?$/i.exec(
    authority,
  );
  if (
    host === null ||
    (host[1] !== undefined && Number(host[1]) > 65535) ||
    /%(?![0-9a-f]{2})/i.test(template)
  ) {
    return 'The URL template must have a valid HTTP(S) authority, port and URI escapes.';
  }
  return undefined;
}

export function validateLinkSchemes(schemes: LinkSchemes): readonly Diagnostic[] {
  return Object.entries(schemes).flatMap(([name, template]) => {
    const problem =
      !SCHEME.test(name) || RESERVED.has(name)
        ? 'Use a lowercase, non-reserved URI scheme name.'
        : templateProblem(template);
    return problem === undefined
      ? []
      : [
          {
            severity: 'error' as const,
            code: 'invalid-link-scheme',
            message: `Link scheme "${name}": ${problem}`,
            path: `link-schemes.${name}`,
          },
        ];
  });
}

export type ResolvedLink =
  | { readonly ok: true; readonly href: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Resolve only project schemes; ordinary links and reference destinations keep their meaning. */
export function resolveLink(href: string, schemes: LinkSchemes = {}): ResolvedLink {
  const name = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (name === undefined || name === 'http' || name === 'https' || name === 'mailto') {
    return { ok: true, href };
  }
  const template = Object.hasOwn(schemes, name) ? schemes[name] : undefined;
  if (template === undefined || RESERVED.has(name)) {
    return {
      ok: false,
      code: 'unknown-link-scheme',
      message: RESERVED.has(name)
        ? `The link scheme "${name}" is reserved and cannot be configured. Use an HTTP(S) or project link.`
        : `Unknown link scheme "${name}". Declare it in stanza.yaml under link-schemes.`,
    };
  }
  const problem = templateProblem(template);
  if (problem !== undefined)
    return { ok: false, code: 'invalid-link-scheme', message: `Link scheme "${name}": ${problem}` };
  const prefix = `${name}://`;
  const raw = href.slice(prefix.length);
  if (href.slice(0, prefix.length).toLowerCase() !== prefix || raw === '') {
    return {
      ok: false,
      code: 'missing-link-id',
      message: `A "${name}" link needs a non-empty ID after ${prefix}.`,
    };
  }
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return {
      ok: false,
      code: 'invalid-link-id',
      message: `The "${name}" link has malformed URI escapes.`,
    };
  }
  if (UNSAFE.test(id)) {
    return {
      ok: false,
      code: 'invalid-link-id',
      message: `The "${name}" link ID cannot contain whitespace or control characters.`,
    };
  }
  try {
    return { ok: true, href: template.replace('{id}', () => encodeURIComponent(id)) };
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return {
      ok: false,
      code: 'invalid-link-id',
      message: `The "${name}" link ID contains invalid Unicode.`,
    };
  }
}
