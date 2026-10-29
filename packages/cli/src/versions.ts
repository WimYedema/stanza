import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageInfo {
  readonly name: string;
  readonly version: string;
}

function readPackage(file: string): PackageInfo | undefined {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    typeof data.name === 'string' &&
    'version' in data &&
    typeof data.version === 'string'
  ) {
    return { name: data.name, version: data.version };
  }
  return undefined;
}

export function cliVersion(): string {
  const info = readPackage(fileURLToPath(new URL('../package.json', import.meta.url)));
  return info?.version ?? 'unknown';
}

/**
 * The version of the `docx` library that the exporter uses, for the record of a build. The library
 * does not export its package file, so the file is found by walking up from its entry point.
 */
export function docxVersion(): string {
  try {
    const exporter = import.meta.resolve('@phrase/export-docx');
    let directory = dirname(createRequire(exporter).resolve('docx'));
    for (;;) {
      const file = join(directory, 'package.json');
      const info = existsSync(file) ? readPackage(file) : undefined;
      if (info?.name === 'docx') return info.version;
      const parent = dirname(directory);
      if (parent === directory) return 'unknown';
      directory = parent;
    }
  } catch {
    return 'unknown';
  }
}
