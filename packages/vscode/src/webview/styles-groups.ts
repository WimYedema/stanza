import type { Family } from './styles-families.js';

/**
 * The groups of paragraph properties in the panel (ADR 0038). Every property is in one group, and
 * the family of the style decides which groups there are, their order and the hint under their title.
 */
export interface GroupSpec {
  readonly title: string;
  /** What the group is for, when the properties alone do not say. */
  readonly hint?: string;
  /** Keys of `PARAGRAPH_PROPERTIES`. */
  readonly keys: readonly string[];
}

const INDENTS = ['indent-left', 'first-line-indent'];
const FLOW = ['keep-with-next', 'keep-together', 'page-break-before'];

const NUMBERED_ELSEWHERE =
  'Only headings are numbered. A style that no heading uses gets a warning when it is numbered.';

const FLOW_GROUP: GroupSpec = { title: 'Flow', keys: FLOW };
const SPACING_GROUP: GroupSpec = {
  title: 'Spacing and alignment',
  keys: ['space-before', 'space-after', ...INDENTS, 'line-spacing', 'alignment', 'background'],
};

export function paragraphGroups(family: Family): readonly GroupSpec[] {
  switch (family) {
    case 'headings':
      return [
        SPACING_GROUP,
        { ...FLOW_GROUP, hint: 'Keep with next stops a heading from ending a page.' },
        {
          title: 'Numbering',
          hint: 'Heading numbers are computed (1, 1.1, 1.1.1) and written as text. Styles based on this one inherit the choice.',
          keys: ['numbered'],
        },
      ];
    case 'lists':
      return [
        {
          title: 'List indents',
          hint: 'A nested level is indented once more for each level: level n by (n + 1) times the left indent. A negative first-line indent hangs the marker out to the left.',
          keys: INDENTS,
        },
        {
          title: 'Spacing and alignment',
          keys: ['space-before', 'space-after', 'line-spacing', 'alignment', 'background'],
        },
        FLOW_GROUP,
        { title: 'Numbering', hint: NUMBERED_ELSEWHERE, keys: ['numbered'] },
      ];
    default:
      return [
        SPACING_GROUP,
        FLOW_GROUP,
        {
          title: 'Numbering',
          hint: 'A style that headings use can be numbered. Elsewhere it gives a warning.',
          keys: ['numbered'],
        },
      ];
  }
}
