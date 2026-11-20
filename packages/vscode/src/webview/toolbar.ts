import {
  BODY_STYLE,
  CODE_STYLE,
  RESERVED_PARAGRAPH_STYLES,
  defaultHeadingStyle,
  type HeadingLevel,
  type StyleName,
} from '@stanza/core';
import type { CommandResult, EditorCommand, EditorContext, StanzaEditor } from '@stanza/editor';

/**
 * The toolbar (ADR 0027, 0029): short buttons in groups, one list for the kind and the style of the
 * block, a list of character styles, and a line that tells the state at the cursor. A button shows
 * whether its command is on at the cursor, and is disabled with its reason when the command has no
 * place there.
 */
interface ButtonSpec {
  /** The short form on the button. */
  readonly text: string;
  /** The full name, for screen readers and the title. */
  readonly label: string;
  readonly command: EditorCommand;
  /** A button that opens something, in place of running its command, which is then only checked. */
  readonly action?: 'make-reference' | 'edit-link';
  /** The key, written for the title. */
  readonly key?: string;
  /** How the short form is drawn, as in a word processor. */
  readonly look?: 'bold' | 'italic' | 'mono';
  /** Whether the command is on at the cursor, for the buttons that toggle. */
  readonly pressed?: (context: EditorContext) => boolean;
}

interface GroupSpec {
  readonly name: string;
  readonly buttons: readonly ButtonSpec[];
  /** The group is shown only where this holds. */
  readonly when?: (context: EditorContext) => boolean;
}

const TEXT_GROUP: GroupSpec = {
  name: 'text',
  buttons: [
    {
      text: 'B',
      label: 'Bold',
      look: 'bold',
      command: { type: 'toggle-mark', mark: 'strong' },
      key: 'Ctrl+B',
      pressed: (context) => context.marks.strong.active,
    },
    {
      text: 'I',
      label: 'Italic',
      look: 'italic',
      command: { type: 'toggle-mark', mark: 'emphasis' },
      key: 'Ctrl+I',
      pressed: (context) => context.marks.emphasis.active,
    },
    {
      text: '</>',
      label: 'Code',
      look: 'mono',
      command: { type: 'toggle-mark', mark: 'code' },
      key: 'Ctrl+E',
      pressed: (context) => context.marks.code.active,
    },
  ],
};

const LIST_GROUP: GroupSpec = {
  name: 'lists',
  buttons: [
    {
      text: '\u22EE',
      label: 'Bulleted list',
      command: { type: 'toggle-list', kind: 'bulleted' },
      pressed: (context) => context.list === 'bulleted',
    },
    {
      text: '1.',
      label: 'Numbered list',
      command: { type: 'toggle-list', kind: 'numbered' },
      pressed: (context) => context.list === 'numbered',
    },
    {
      text: '\u2190',
      label: 'Lift list item',
      command: { type: 'lift-list-item' },
      key: 'Shift+Tab',
    },
    { text: '\u2192', label: 'Sink list item', command: { type: 'sink-list-item' }, key: 'Tab' },
  ],
};

const INSERT_GROUP: GroupSpec = {
  name: 'insert',
  buttons: [
    {
      text: '{ }',
      label: 'Code block',
      look: 'mono',
      command: { type: 'toggle-code-block' },
      pressed: (context) => context.block === 'code-block',
    },
    {
      text: 'Table',
      label: 'Insert table',
      command: { type: 'insert-table', columns: 3, rows: 2 },
    },
    {
      text: 'TOC',
      label: 'Insert table of contents',
      command: { type: 'insert-stanza-block', kind: 'toc', text: 'depth: 2' },
    },
    {
      text: 'Link',
      label: 'Link',
      // Checked as a link on the selection; a cursor in a link can always change or remove it.
      command: { type: 'set-link', href: 'https://a.b' },
      action: 'edit-link',
      pressed: (context) => context.marks.link.active,
    },
    {
      text: 'Ref',
      label: 'Make reference',
      // Checked as a reference to some block, as for the selection or the cursor that there is.
      command: { type: 'set-reference', id: 'aaaaaaaaaa', text: 'x' },
      action: 'make-reference',
      key: 'Ctrl+Shift+K',
    },
  ],
};

const TABLE_GROUP: GroupSpec = {
  name: 'table',
  when: (context) => context.inTable,
  buttons: [
    { text: '+Row', label: 'Add row below', command: { type: 'add-row', where: 'after' } },
    { text: '+Col', label: 'Add column after', command: { type: 'add-column', where: 'after' } },
    { text: '\u2212Row', label: 'Delete row', command: { type: 'delete-row' } },
    { text: '\u2212Col', label: 'Delete column', command: { type: 'delete-column' } },
    { text: '\u2212Table', label: 'Delete table', command: { type: 'delete-table' } },
  ],
};

const LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export interface StyleChoice {
  readonly value: string;
  readonly label: string;
  readonly command: EditorCommand;
}

export interface StyleGroup {
  readonly label: string;
  readonly choices: readonly StyleChoice[];
}

/** The paragraph styles that the kinds of block already stand for, so the list does not repeat them. */
const KIND_STYLES: ReadonlySet<string> = new Set(RESERVED_PARAGRAPH_STYLES);

/**
 * What the list of the block offers: its kind (paragraph or a heading level) and the other
 * paragraph styles, or for a table cell the table styles (ADR 0029).
 */
export function styleGroups(context: EditorContext): readonly StyleGroup[] {
  if (context.block === undefined) return [];
  if (context.block === 'table-cell') {
    return [
      {
        label: 'Table style',
        choices: [
          { value: '', label: '(default)', command: { type: 'set-style', style: null } },
          ...context.available.table.map((name) => ({
            value: name,
            label: context.labels.table.get(name) ?? name,
            command: { type: 'set-style', style: name } as const,
          })),
        ],
      },
    ];
  }
  const kinds: StyleChoice[] = [
    { value: 'paragraph', label: 'Paragraph', command: { type: 'set-paragraph' } },
    ...LEVELS.map((level) => ({
      value: `heading:${String(level)}`,
      label: `Heading ${String(level)}`,
      command: { type: 'set-heading', level } as const,
    })),
  ];
  const others = context.available.paragraph
    .filter((name) => !KIND_STYLES.has(name))
    .map((name) => ({
      value: name,
      label: context.labels.paragraph.get(name) ?? name,
      command: { type: 'set-style', style: name } as const,
    }));
  return [
    { label: 'Block', choices: kinds },
    ...(others.length > 0 ? [{ label: 'Styles', choices: others }] : []),
  ];
}

/** The value of the list for the block: its own style, or else what its kind stands for. */
export function styleValue(context: EditorContext): string {
  if (context.block === 'table-cell') return context.style ?? '';
  const kindStyle =
    context.block === 'heading' && context.level !== undefined
      ? defaultHeadingStyle(context.level)
      : context.block === 'code-block'
        ? CODE_STYLE
        : BODY_STYLE;
  if (context.style !== undefined && context.style !== kindStyle) return context.style;
  if (context.block === 'heading') return `heading:${String(context.level ?? '')}`;
  return context.block === 'code-block' ? 'code-block' : 'paragraph';
}

export interface ToolbarHost {
  /** The editor, or nothing while there is none. */
  editor(): StanzaEditor | undefined;
  /** Shows what a command answered. A refusal with a fix offers it (ADR 0026). */
  answered(command: EditorCommand, result: CommandResult): void;
  /** Opens the list of headings for a reference (ADR 0069). */
  makeReference(): void;
  /** Opens the field for the address of a link (ADR 0075). */
  editLink(): void;
}

export interface Toolbar {
  /** Shows the state at the cursor now. */
  readonly refresh: () => void;
  /** Shows it after a short pause, for a call on every transaction. */
  readonly schedule: () => void;
}

/** The pause that keeps the checks of the buttons from running for each letter typed. */
const REFRESH_DELAY_MS = 80;

const BLOCK_LABELS = {
  paragraph: 'Paragraph',
  'code-block': 'Code block',
  'table-cell': 'Table cell',
} as const;

/** The state at the cursor as a line of text: the block, its style, and the marks that are on. */
export function describeContext(context: EditorContext): string {
  if (context.block === undefined) return 'No text block at the cursor';
  const kind =
    context.block === 'heading'
      ? `Heading ${String(context.level ?? '')}`.trim()
      : BLOCK_LABELS[context.block];
  const where = context.list === undefined ? '' : ` in a ${context.list} list`;
  const labels = context.block === 'table-cell' ? context.labels.table : context.labels.paragraph;
  const shown =
    context.style === undefined ? 'default' : (labels.get(context.style) ?? context.style);
  const style = `${context.block === 'table-cell' ? 'table style' : 'style'}: ${shown}`;
  const on = [
    ...(['strong', 'emphasis', 'code', 'link'] as const).filter(
      (mark) => context.marks[mark].active,
    ),
    ...context.characterStyles.map((name) => context.labels.character.get(name) ?? name),
  ];
  return `${kind}${where} | ${style} | ${on.length === 0 ? 'no marks' : on.join(', ')}`;
}

/** A click on the toolbar must not take the selection away from the editor. */
export const keepSelection = (element: HTMLElement): void => {
  element.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
};

function addOption(select: HTMLSelectElement, value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
  return option;
}

/** Disables an option that would be refused for good, and marks one that a declared variant fixes. */
function checked(option: HTMLOptionElement, label: string, result: CommandResult): void {
  if (result.ok) return;
  option.title = result.message;
  if (result.fix === undefined) option.disabled = true;
  else option.textContent = `${label} (needs ${result.fix.mark})`;
}

/**
 * The lists of the block and of character styles. What they offer depends on the selection, so
 * their options are checked against the stylesheet when a list is used. Between uses the first one
 * only shows what the block is. The returned function shows that, without checks, for a move of
 * the cursor.
 */
function addStyleLists(container: HTMLElement, host: ToolbarHost): () => void {
  const styles = document.createElement('select');
  styles.title = 'Kind and style of the block, or the style of the table';
  styles.setAttribute('aria-label', 'Block style');
  const characters = document.createElement('select');
  characters.title = 'Character style';
  characters.setAttribute('aria-label', 'Character style');
  addOption(characters, '', 'Character style');
  let choices = new Map<string, StyleChoice>();

  const fillStyles = (editor: StanzaEditor, withChecks = true): void => {
    const context = editor.getContext();
    const groups = styleGroups(context);
    const current = styleValue(context);
    styles.replaceChildren();
    styles.disabled = groups.length === 0;
    choices = new Map(groups.flatMap((group) => group.choices.map((c) => [c.value, c] as const)));
    if (groups.length > 0 && !choices.has(current)) {
      // What the block is has no option of its own, such as a code block.
      const option = addOption(styles, current, current === 'code-block' ? 'Code block' : current);
      option.disabled = true;
    }
    for (const group of groups) {
      const element = document.createElement('optgroup');
      element.label = group.label;
      styles.append(element);
      for (const choice of group.choices) {
        const option = addOption(styles, choice.value, choice.label);
        element.append(option);
        if (withChecks) checked(option, choice.label, editor.check(choice.command));
      }
    }
    styles.value = current;
  };

  const fillCharacters = (editor: StanzaEditor): void => {
    const context = editor.getContext();
    characters.replaceChildren();
    addOption(characters, '', 'Character style');
    for (const name of context.available.character) {
      const shown = context.labels.character.get(name) ?? name;
      const label = context.characterStyles.includes(name) ? `${shown} (on)` : shown;
      checked(
        addOption(characters, name, label),
        label,
        editor.check({ type: 'toggle-character-style', style: name }),
      );
    }
    characters.value = '';
  };

  for (const event of ['focus', 'mousedown'] as const) {
    styles.addEventListener(event, () => {
      const editor = host.editor();
      if (editor !== undefined) fillStyles(editor);
    });
    characters.addEventListener(event, () => {
      const editor = host.editor();
      if (editor !== undefined) fillCharacters(editor);
    });
  }
  styles.addEventListener('change', () => {
    const editor = host.editor();
    const choice = choices.get(styles.value);
    if (editor === undefined || choice === undefined) return;
    host.answered(choice.command, editor.run(choice.command));
    // What the list shows is what the block is, also when the command was refused.
    fillStyles(editor, false);
  });
  characters.addEventListener('change', () => {
    const editor = host.editor();
    if (editor === undefined || characters.value === '') return;
    const command: EditorCommand = {
      type: 'toggle-character-style',
      style: characters.value as StyleName,
    };
    host.answered(command, editor.run(command));
    characters.value = '';
  });
  container.append(styles, characters);
  return () => {
    const editor = host.editor();
    if (editor !== undefined) fillStyles(editor, false);
  };
}

/** Shows a button as on, and as disabled with the reason when its command has no place here. */
function showButton(button: HTMLButtonElement, spec: ButtonSpec, editor: StanzaEditor): void {
  const context = editor.getContext();
  // A cursor in a link can change or remove it, with nothing selected.
  const command: EditorCommand =
    spec.action === 'edit-link' && context.marks.link.active
      ? { type: 'remove-link' }
      : spec.command;
  const result = editor.check(command);
  const name = spec.key === undefined ? spec.label : `${spec.label} (${spec.key})`;
  if (spec.pressed !== undefined) {
    button.setAttribute('aria-pressed', String(spec.pressed(context)));
  }
  // A refusal that a declared variant would remove leaves the button enabled, to reach the offer.
  const needsVariant = !result.ok && result.fix !== undefined;
  button.disabled = !result.ok && !needsVariant;
  button.classList.toggle('needs-variant', needsVariant);
  button.title = result.ok ? name : `${name}: ${result.message}`;
}

interface BuiltGroup {
  readonly element: HTMLElement;
  readonly spec: GroupSpec;
  readonly buttons: readonly (readonly [HTMLButtonElement, ButtonSpec])[];
}

function newGroup(container: HTMLElement, name: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'group';
  element.dataset['group'] = name;
  container.append(element);
  return element;
}

function buildGroup(container: HTMLElement, spec: GroupSpec, host: ToolbarHost): BuiltGroup {
  const element = newGroup(container, spec.name);
  const buttons = spec.buttons.map((item) => {
    const button = document.createElement('button');
    button.textContent = item.text;
    button.setAttribute('aria-label', item.label);
    if (item.look !== undefined) button.classList.add(`look-${item.look}`);
    keepSelection(button);
    button.addEventListener('click', () => {
      if (item.action === 'make-reference') {
        host.makeReference();
        return;
      }
      if (item.action === 'edit-link') {
        host.editLink();
        return;
      }
      const editor = host.editor();
      if (editor !== undefined) host.answered(item.command, editor.run(item.command));
    });
    element.append(button);
    return [button, item] as const;
  });
  return { element, spec, buttons };
}

/** Fills the toolbar. */
export function buildToolbar(container: HTMLElement, host: ToolbarHost): Toolbar {
  const text = buildGroup(container, TEXT_GROUP, host);
  const refreshLists = addStyleLists(newGroup(container, 'styles'), host);
  const groups = [
    text,
    buildGroup(container, LIST_GROUP, host),
    buildGroup(container, INSERT_GROUP, host),
    buildGroup(container, TABLE_GROUP, host),
  ];

  let waiting: ReturnType<typeof setTimeout> | undefined;
  const refresh = (): void => {
    clearTimeout(waiting);
    waiting = undefined;
    const editor = host.editor();
    if (editor === undefined) return;
    const context = editor.getContext();
    for (const group of groups) {
      group.element.hidden = group.spec.when !== undefined && !group.spec.when(context);
      if (group.element.hidden) continue;
      for (const [button, spec] of group.buttons) showButton(button, spec, editor);
    }
    refreshLists();
  };
  const schedule = (): void => {
    if (waiting === undefined) waiting = setTimeout(refresh, REFRESH_DELAY_MS);
  };
  return { refresh, schedule };
}
