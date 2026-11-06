import type { Relationship } from './docx-package.js';
import type { DocxNumbering } from './numbering.js';
import type { Reporter } from './report.js';
import type { DocxStyles } from './styles.js';

/** A complex field (`fldChar`), which may begin in one paragraph and end in another. */
interface OpenField {
  instruction: string;
  /** False while the instruction is read, true while the text that the field shows is read. */
  showing: boolean;
  link: string | undefined;
}

export class ImportContext {
  readonly fields: OpenField[] = [];
  /** The number of the paragraph being read, counted over the whole document. */
  paragraphNumber = 0;
  /** The text of the last heading, for the places in the report. */
  heading: string | undefined;

  constructor(
    readonly styles: DocxStyles,
    readonly numbering: DocxNumbering,
    readonly relationships: ReadonlyMap<string, Relationship>,
    readonly footnotes: ReadonlyMap<string, string>,
    readonly endnotes: ReadonlyMap<string, string>,
    readonly report: Reporter,
  ) {}

  /** Where the import is, in the words of the report. */
  place(): string {
    const here = `paragraph ${String(this.paragraphNumber)}`;
    return this.heading === undefined ? here : `${here} under "${this.heading}"`;
  }
}
