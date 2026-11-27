import { performance } from 'node:perf_hooks';

/**
 * When the extension bundle began to run, before its other modules (ADR 0101). The first import
 * of `extension.ts`, so that the time to load the rest of the bundle can be told apart.
 */
export const loadedAt = performance.timeOrigin + performance.now();
