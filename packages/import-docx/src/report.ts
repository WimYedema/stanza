/** What the import tells the person: everything that was left out, changed or put in a placeholder. */

export interface ImportDiagnostic {
  /** `warning` is content that was changed or replaced; `info` is look or structure left out. */
  readonly severity: 'info' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly count: number;
  /** Where it happened, for the first few cases, such as `paragraph 12 under "Method"`. */
  readonly places: readonly string[];
}

/** How a Word style was used and what it became. */
export interface StyleUse {
  readonly word: string;
  readonly as: string;
  readonly count: number;
}

export interface ImportReport {
  readonly diagnostics: readonly ImportDiagnostic[];
  readonly styles: readonly StyleUse[];
}

const MAX_PLACES = 10;

/** The codes, in the order they are reported, with their wording. */
const CODES = {
  'heading-level-skip': {
    severity: 'warning',
    message: 'A heading skips a level, which the editor does not allow. The level was kept.',
  },
  'heading-number': {
    severity: 'warning',
    message:
      'A heading has a typed or automatic number. The project numbers headings itself, so the number may appear twice.',
  },
  'placeholder-image': {
    severity: 'warning',
    message: 'An image was replaced by a placeholder paragraph that starts with [Image:.',
  },
  'placeholder-drawing': {
    severity: 'warning',
    message: 'A drawing was replaced by a placeholder paragraph that starts with [Drawing:.',
  },
  'placeholder-equation': {
    severity: 'warning',
    message: 'An equation was replaced by a placeholder paragraph that starts with [Equation:.',
  },
  'placeholder-object': {
    severity: 'warning',
    message:
      'An embedded object was replaced by a placeholder paragraph that starts with [Object:.',
  },
  'placeholder-table': {
    severity: 'warning',
    message: 'A table was replaced by a placeholder paragraph that starts with [Table:.',
  },
  'text-box': {
    severity: 'warning',
    message: 'The text of a text box was put at the place of the box, as paragraphs.',
  },
  footnote: {
    severity: 'info',
    message: 'A footnote or an endnote became a placeholder at its reference that holds its text.',
  },
  'internal-link': {
    severity: 'warning',
    message: 'A link inside the document was kept as its text.',
  },
  'unsafe-link': {
    severity: 'warning',
    message: 'A link to an address that is not http, https, mailto or tel was kept as its text.',
  },
  symbol: {
    severity: 'warning',
    message: 'A symbol from a symbol font could not be carried over and was left out.',
  },
  'unknown-numbering': {
    severity: 'warning',
    message:
      'The numbering of a list item is not defined in the file. It was taken as a bulleted list.',
  },
  'tracked-changes': {
    severity: 'info',
    message: 'Tracked changes were taken as accepted: insertions are in and deletions are out.',
  },
  'direct-formatting': {
    severity: 'info',
    message: 'Direct formatting (such as colour, size, alignment or spacing) was left out.',
  },
  'empty-paragraph': { severity: 'info', message: 'Empty paragraphs were left out.' },
  'page-break': { severity: 'info', message: 'Page breaks were left out.' },
  'section-break': { severity: 'info', message: 'Section breaks were left out.' },
  'header-footer': {
    severity: 'info',
    message: 'Headers and footers were left out. The page template of the project gives them.',
  },
  comment: { severity: 'info', message: 'Comments were left out.' },
  bookmark: { severity: 'info', message: 'Bookmarks were left out.' },
} as const;

export type DiagnosticCode = keyof typeof CODES;

interface Entry {
  count: number;
  places: string[];
}

export class Reporter {
  private readonly entries = new Map<DiagnosticCode, Entry>();
  private readonly styleUses = new Map<string, StyleUse>();

  add(code: DiagnosticCode, place?: string, count = 1): void {
    const entry = this.entries.get(code) ?? { count: 0, places: [] };
    entry.count += count;
    if (place !== undefined && entry.places.length < MAX_PLACES && !entry.places.includes(place)) {
      entry.places.push(place);
    }
    this.entries.set(code, entry);
  }

  useStyle(word: string, as: string): void {
    const key = `${word}\u0000${as}`;
    const known = this.styleUses.get(key);
    this.styleUses.set(key, { word, as, count: (known?.count ?? 0) + 1 });
  }

  report(): ImportReport {
    const diagnostics = (Object.keys(CODES) as DiagnosticCode[]).flatMap((code) => {
      const entry = this.entries.get(code);
      if (entry === undefined) return [];
      const { severity, message } = CODES[code];
      return [{ severity, code, message, count: entry.count, places: entry.places }];
    });
    const styles = [...this.styleUses.values()].sort(
      (a, b) => b.count - a.count || a.word.localeCompare(b.word),
    );
    return { diagnostics, styles };
  }
}
