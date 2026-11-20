import { describe, expect, it } from 'vitest';
import { resolveLink, validateLinkSchemes } from './link-schemes.js';

const schemes = { jira: 'https://example.atlassian.net/browse/{id}' };

describe('project link schemes', () => {
  it('resolves case-insensitively and encodes an ID as one URL component, once', () => {
    expect(resolveLink('JIRA://PROJ-123', schemes)).toEqual({
      ok: true,
      href: 'https://example.atlassian.net/browse/PROJ-123',
    });
    expect(resolveLink('jira://a%2Fb%3Fc%26d%23e', schemes)).toEqual({
      ok: true,
      href: 'https://example.atlassian.net/browse/a%2Fb%3Fc%26d%23e',
    });
    expect(resolveLink('jira://caf%C3%A9', schemes)).toEqual({
      ok: true,
      href: 'https://example.atlassian.net/browse/caf%C3%A9',
    });
  });

  it.each(['https://example.org/a', 'mailto:a@b.c', '#aaaaaaaaaa', 'doc.stanza.md#aaaaaaaaaa'])(
    'leaves ordinary destination %s unchanged',
    (href) => {
      expect(resolveLink(href, schemes)).toEqual({ ok: true, href });
    },
  );

  it.each([
    ['unknown://x', 'unknown-link-scheme'],
    ['jira://', 'missing-link-id'],
    ['jira:PROJ-123', 'missing-link-id'],
    ['jira://a%xx', 'invalid-link-id'],
    ['jira://a%20b', 'invalid-link-id'],
    ['jira://a%0Ab', 'invalid-link-id'],
    ['jira://\ud800', 'invalid-link-id'],
    ['javascript:alert(1)', 'unknown-link-scheme'],
  ])('diagnoses %s without substituting a fallback', (href, code) => {
    expect(resolveLink(href, schemes)).toMatchObject({ ok: false, code });
  });

  it.each([
    ['Jira', 'https://example.org/{id}'],
    ['https', 'https://example.org/{id}'],
    ['file', 'https://example.org/{id}'],
    ['jira', 'javascript:{id}'],
    ['jira', 'https://{id}.example.org/'],
    ['jira', 'https://example.org/'],
    ['jira', 'https://example.org/{id}/{id}'],
    ['jira', 'https://example.org/{id}/{other}'],
    ['jira', 'https://user:password@example.org/{id}'],
    ['jira', 'https://example.org:99999/{id}'],
    ['jira', 'https://example.org/{id} a'],
  ])('refuses invalid template %s: %s', (name, template) => {
    expect(validateLinkSchemes({ [name]: template })).toMatchObject([
      {
        code: 'invalid-link-scheme',
        path: `link-schemes.${name}`,
      },
    ]);
  });

  it('accepts query and fragment templates and rejects invalid settings during resolution too', () => {
    expect(
      validateLinkSchemes({
        search: 'https://example.org/?q={id}',
        anchor: 'http://localhost:3000/#section-{id}',
      }),
    ).toEqual([]);
    expect(resolveLink('jira://x', { jira: 'file:///{id}' })).toMatchObject({
      ok: false,
      code: 'invalid-link-scheme',
    });
  });
});
