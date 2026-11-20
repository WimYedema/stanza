import type { StyleUsage, StyleUse } from '@stanza/project';
import type { UsageCount, UsageSummary } from '../shared/protocol.js';

/** The blocks of each document that use a style, counted once for each way of using it. */
function countsOf(uses: readonly StyleUse[]): readonly UsageCount[] {
  const byFile = new Map<string, Record<StyleUse['kind'], Set<string>>>();
  for (const use of uses) {
    const kinds = byFile.get(use.file) ?? {
      direct: new Set<string>(),
      default: new Set<string>(),
      inherited: new Set<string>(),
    };
    kinds[use.kind].add(use.path);
    byFile.set(use.file, kinds);
  }
  return [...byFile].map(([file, kinds]) => ({
    file,
    direct: kinds.direct.size,
    default: kinds.default.size,
    inherited: kinds.inherited.size,
  }));
}

function summaryOf(
  styles: ReadonlyMap<string, readonly StyleUse[]>,
): Record<string, readonly UsageCount[]> {
  const summary: Record<string, readonly UsageCount[]> = {};
  for (const [name, uses] of styles) {
    if (uses.length > 0) summary[name] = countsOf(uses);
  }
  return summary;
}

/** The usage of the styles as the editor shows it (ADR 0054): counts for each document. */
export function summarizeUsage(usage: StyleUsage, current: string): UsageSummary {
  return {
    current,
    paragraph: summaryOf(usage.paragraphStyles),
    character: summaryOf(usage.characterStyles),
    table: summaryOf(usage.tableStyles),
  };
}
