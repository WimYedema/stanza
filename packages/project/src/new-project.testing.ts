import { createProject } from './new-project.js';
import { memoryStorage, type MemoryStorage } from './memory-storage.testing.js';

/** Random bytes that are the same at each call, ending in the given byte. */
export const bytes = (last: number) => (): Uint8Array =>
  Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, last]);

/** Random bytes that differ at each call, starting with the given last byte. */
export const counting = (first: number) => {
  let next = first;
  return (): Uint8Array => bytes(next++)();
};

/** The files of a new project. */
export async function projectFiles(): Promise<Record<string, string>> {
  const created = memoryStorage({});
  await createProject(created, { title: 'My Report', randomBytes: bytes(10) });
  return Object.fromEntries(created.texts);
}

/** A storage that holds the files of a new project. */
export async function project(): Promise<MemoryStorage> {
  return memoryStorage(await projectFiles());
}
