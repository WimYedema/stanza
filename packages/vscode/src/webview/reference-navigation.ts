import { parseReferenceLink } from '@stanza/core';

function targetOf(link: Element): string | undefined {
  const href = link.getAttribute('data-stanza-href') ?? link.getAttribute('href');
  if (href === null) return undefined;
  if (parseReferenceLink(href) !== undefined) return href;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(https?|mailto):/i.test(href) ? href : undefined;
}

/** Keeps links in the editor in place, and follows a reference on Ctrl-click or Cmd-click. */
export function installReferenceNavigation(
  root: HTMLElement,
  follow: (href: string) => void,
  status: (message: string) => void = () => undefined,
): { finish(): void; dispose(): void } {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let hovered: Element | undefined;
  const modifier = (event: MouseEvent | KeyboardEvent): boolean =>
    (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  const reset = (): void => {
    root.classList.remove('reference-mode');
  };
  root.addEventListener(
    'mouseover',
    (event) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      hovered?.classList.remove('reference-hover');
      hovered = undefined;
      if (link === null) return;
      const href = targetOf(link);
      if (href === undefined) return;
      hovered = link;
      link.classList.add('reference-hover');
      link.setAttribute(
        'title',
        `Ctrl+click (Cmd+click on macOS) to follow ${link.getAttribute('href') ?? href}`,
      );
      root.classList.toggle('reference-mode', modifier(event));
    },
    options,
  );
  root.ownerDocument.addEventListener(
    'keydown',
    (event) => {
      root.classList.toggle('reference-mode', modifier(event));
    },
    options,
  );
  root.ownerDocument.addEventListener(
    'keyup',
    (event) => {
      root.classList.toggle('reference-mode', modifier(event));
    },
    options,
  );
  root.ownerDocument.defaultView?.addEventListener('blur', reset, options);
  root.addEventListener(
    'click',
    (event) => {
      const clicked = event.target;
      if (!(clicked instanceof Element)) return;
      const link = clicked.closest('a');
      if (link === null) return;
      event.preventDefault();
      if (!modifier(event)) return;
      const href = targetOf(link);
      if (href === undefined) return;
      if (root.getAttribute('aria-busy') === 'true') return;
      root.setAttribute('aria-busy', 'true');
      root.classList.add('reference-opening');
      status(`Opening ${href}...`);
      follow(href);
    },
    options,
  );
  const finish = (): void => {
    root.removeAttribute('aria-busy');
    root.classList.remove('reference-opening');
    status('');
  };
  return {
    finish,
    dispose: () => {
      abort.abort();
      hovered?.classList.remove('reference-hover');
      reset();
      finish();
    },
  };
}
