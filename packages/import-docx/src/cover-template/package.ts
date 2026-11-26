import { strFromU8 } from 'fflate';
import { elementsOf, parseXml } from '../xml.js';
import { type Part, resolveTarget } from './shared.js';

/** The parts of a Word template, read from its ZIP package by their relationships. */

export class TemplatePackage {
  constructor(private readonly files: Readonly<Record<string, Uint8Array>>) {}

  bytes(path: string): Uint8Array | undefined {
    return this.files[path];
  }

  part(path: string): Part | undefined {
    const data = this.files[path];
    if (data === undefined) return undefined;
    const slash = path.lastIndexOf('/');
    const relsPath = `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`;
    const relationships = new Map<string, { type: string; path: string }>();
    const rels = this.files[relsPath];
    if (rels !== undefined) {
      for (const entry of elementsOf(parseXml(strFromU8(rels)), 'Relationship')) {
        const id = entry.attrs['Id'];
        const target = entry.attrs['Target'];
        if (id === undefined || target === undefined || entry.attrs['TargetMode'] === 'External') {
          continue;
        }
        relationships.set(id, {
          type: entry.attrs['Type'] ?? '',
          path: resolveTarget(path, target),
        });
      }
    }
    return { xml: parseXml(strFromU8(data)), relationships };
  }
}

// ---------------------------------------------------------------------------------------------
// The look of a paragraph
